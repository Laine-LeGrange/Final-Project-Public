-- Extensions
create extension if not exists pgcrypto;
create extension if not exists vector;

-- Enums
do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace
                 where t.typname='theme_pref' and n.nspname='public') then
    create type theme_pref as enum ('light','dark');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace
                 where t.typname='topic_status' and n.nspname='public') then
    create type topic_status as enum ('active','archived');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace
                 where t.typname='summary_type' and n.nspname='public') then
    create type summary_type as enum ('short','long','key_concepts');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace
                 where t.typname='processing_status' and n.nspname='public') then
    create type processing_status as enum ('pending','processing','ready','failed');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace
                 where t.typname='file_media_type' and n.nspname='public') then
    create type file_media_type as enum ('document','image','video','audio','presentation','other');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace
                 where t.typname='difficulty' and n.nspname='public') then
    create type difficulty as enum ('easy','medium','hard');
  end if;
end $$;

-- Functions
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create or replace function public.bump_topic_last_used_from_topic()
returns trigger language plpgsql as $$
begin update public.topics set last_used_at = now() where id = new.topic_id; return new; end $$;

-- Tables
create table if not exists public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  first_name text not null,
  last_name  text not null,
  avatar_url text,
  theme      public.theme_pref not null default 'light',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_preferences (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  education_level       text,
  education_level_other text,
  learning_style        text,
  explanation_format    text,
  study_goals           text[] default '{}',
  tone                  text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  unique(user_id, name)
);

create table if not exists public.topics (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  category_id  uuid references public.categories(id) on delete set null,
  name         text not null,
  status       public.topic_status not null default 'active',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

create table if not exists public.topic_summaries (
  id         uuid primary key default gen_random_uuid(),
  topic_id   uuid not null references public.topics(id) on delete cascade,
  type       public.summary_type not null,
  status     public.processing_status not null default 'pending',
  content    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(topic_id, type)
);

create table if not exists public.topic_files (
  id             uuid primary key default gen_random_uuid(),
  topic_id       uuid not null references public.topics(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  storage_path   text not null,
  file_name      text not null,
  mime_type      text,
  media_type     public.file_media_type,
  size_bytes     bigint,
  uploaded_at    timestamptz not null default now(),
  include_in_rag boolean not null default true,
  vector_status  text not null default 'not_ingested' check (vector_status in ('not_ingested','ingesting','ingested','excluded','deleted')),
  deleted_at     timestamptz,
  unique(topic_id, storage_path)
);

create table if not exists public.documents (
  id            uuid primary key default gen_random_uuid(),
  topic_id      uuid not null references public.topics(id) on delete cascade,
  topic_file_id uuid not null references public.topic_files(id) on delete cascade,
  title         text,
  metadata      jsonb,
  created_at    timestamptz not null default now()
);

create table if not exists public.chunks (
  id          bigserial primary key,
  document_id uuid not null references public.documents(id) on delete cascade,
  topic_id    uuid not null references public.topics(id) on delete cascade,
  content     text not null,
  embedding   vector(1536),
  token_count int,
  is_active   boolean not null default true,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists public.quizzes (
  id           uuid primary key default gen_random_uuid(),
  topic_id     uuid not null references public.topics(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null default 'Untitled quiz',
  difficulty   public.difficulty not null default 'medium',
  length       int not null check (length in (5,10,20)),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.quiz_questions (
  id          uuid primary key default gen_random_uuid(),
  quiz_id     uuid not null references public.quizzes(id) on delete cascade,
  question    text not null,
  order_index int not null default 0
);

create table if not exists public.quiz_options (
  id           uuid primary key default gen_random_uuid(),
  question_id  uuid not null references public.quiz_questions(id) on delete cascade,
  option_text  text not null,
  is_correct   boolean not null default false
);

create table if not exists public.quiz_attempts (
  id            uuid primary key default gen_random_uuid(),
  quiz_id       uuid not null references public.quizzes(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  started_at    timestamptz not null default now(),
  submitted_at  timestamptz,
  score_percent numeric(5,2) check (score_percent between 0 and 100),
  duration_sec  int
);

create table if not exists public.attempt_answers (
  attempt_id         uuid not null references public.quiz_attempts(id) on delete cascade,
  question_id        uuid not null references public.quiz_questions(id) on delete cascade,
  selected_option_id uuid not null references public.quiz_options(id) on delete restrict,
  is_correct         boolean not null,
  primary key (attempt_id, question_id)
);

-- Triggers
drop trigger if exists t_profiles_updated_at on public.profiles;
create trigger t_profiles_updated_at before update on public.profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists t_user_preferences_updated_at on public.user_preferences;
create trigger t_user_preferences_updated_at before update on public.user_preferences
for each row execute procedure public.set_updated_at();

drop trigger if exists t_topics_updated_at on public.topics;
create trigger t_topics_updated_at before update on public.topics
for each row execute procedure public.set_updated_at();

drop trigger if exists t_topic_summaries_updated_at on public.topic_summaries;
create trigger t_topic_summaries_updated_at before update on public.topic_summaries
for each row execute procedure public.set_updated_at();

drop trigger if exists t_topic_summaries_bump on public.topic_summaries;
create trigger t_topic_summaries_bump after insert or update on public.topic_summaries
for each row execute procedure public.bump_topic_last_used_from_topic();

drop trigger if exists t_topic_files_bump on public.topic_files;
create trigger t_topic_files_bump after insert or update on public.topic_files
for each row execute procedure public.bump_topic_last_used_from_topic();

drop trigger if exists t_quizzes_updated_at on public.quizzes;
create trigger t_quizzes_updated_at before update on public.quizzes
for each row execute procedure public.set_updated_at();

drop trigger if exists t_quizzes_bump on public.quizzes;
create trigger t_quizzes_bump after insert on public.quizzes
for each row execute procedure public.bump_topic_last_used_from_topic();

-- Chunk syncing
create or replace function public.sync_chunks_active_from_file()
returns trigger language plpgsql as $$
begin
  update public.chunks c
     set is_active = (new.include_in_rag and new.vector_status = 'ingested')
   where c.document_id in (select d.id from public.documents d where d.topic_file_id = new.id);
  return new;
end $$;

drop trigger if exists t_file_sync_chunks on public.topic_files;
create trigger t_file_sync_chunks
  after update of include_in_rag, vector_status on public.topic_files
  for each row execute procedure public.sync_chunks_active_from_file();

-- Indexes
create index if not exists idx_topics_user_last_used on public.topics(user_id, last_used_at desc);
create index if not exists idx_topics_user_status_lastused on public.topics (user_id, status, last_used_at desc);
create index if not exists idx_topic_files_topic on public.topic_files(topic_id);
create index if not exists idx_topic_files_topic_id_not_deleted on public.topic_files (topic_id) where deleted_at is null;
create index if not exists idx_documents_topic on public.documents(topic_id);
create index if not exists idx_chunks_topic_active on public.chunks(topic_id) where is_active;
create index if not exists idx_chunks_embedding on public.chunks using ivfflat (embedding vector_cosine_ops) with (lists=100);
create index if not exists idx_quizzes_topic on public.quizzes(topic_id);
create index if not exists idx_quizzes_user_topic_created_at on public.quizzes (user_id, topic_id, created_at desc);
create index if not exists idx_questions_quiz on public.quiz_questions(quiz_id, order_index);
create index if not exists idx_options_question on public.quiz_options(question_id);
create unique index if not exists uq_correct_option_per_question on public.quiz_options(question_id) where is_correct;
create index if not exists idx_attempts_quiz on public.quiz_attempts(quiz_id, submitted_at desc);
create index if not exists idx_attempt_answers_question_id on public.attempt_answers(question_id);
create index if not exists idx_quiz_attempts_quiz_id on public.quiz_attempts(quiz_id);
create index if not exists idx_categories_user_id_name on public.categories (user_id, name);

-- Views
create or replace view public.quiz_latest_stats as
select distinct on (q.id)
  q.id as quiz_id,
  a.submitted_at as last_taken_at,
  a.score_percent as last_score_percent
from public.quizzes q
left join public.quiz_attempts a on a.quiz_id = q.id and a.submitted_at is not null
order by q.id, a.submitted_at desc;

create or replace view public.topic_overview as
select
  t.id            as topic_id,
  t.user_id       as user_id,
  t.name          as topic_name,
  t.status,
  t.category_id,
  c.name          as category_name,
  t.last_used_at,
  tf.file_count,
  qz.quiz_count,
  ts.summaries_ready,
  ss.short_summary
from public.topics t
left join public.categories c on c.id = t.category_id
left join lateral (
  select count(*)::int as file_count
  from public.topic_files f
  where f.topic_id = t.id and f.deleted_at is null
) tf on true
left join lateral (
  select count(*)::int as quiz_count
  from public.quizzes q where q.topic_id = t.id
) qz on true
left join lateral (
  select bool_or(s.status = 'ready') as summaries_ready
  from public.topic_summaries s where s.topic_id = t.id
) ts on true
left join lateral (
  select ts2.content as short_summary
  from public.topic_summaries ts2
  where ts2.topic_id = t.id and ts2.type = 'short' and ts2.status = 'ready'
  order by ts2.updated_at desc nulls last, ts2.created_at desc
  limit 1
) ss on true;

-- RLS enable
alter table public.profiles          enable row level security;
alter table public.user_preferences  enable row level security;
alter table public.categories        enable row level security;
alter table public.topics            enable row level security;
alter table public.topic_summaries   enable row level security;
alter table public.topic_files       enable row level security;
alter table public.documents         enable row level security;
alter table public.chunks            enable row level security;
alter table public.quizzes           enable row level security;
alter table public.quiz_questions    enable row level security;
alter table public.quiz_options      enable row level security;
alter table public.quiz_attempts     enable row level security;
alter table public.attempt_answers   enable row level security;

-- Policies 
drop policy if exists "profiles owner rw" on public.profiles;
create policy "profiles owner rw" on public.profiles
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "prefs owner rw" on public.user_preferences;
create policy "prefs owner rw" on public.user_preferences
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "categories owner rw" on public.categories;
create policy "categories owner rw" on public.categories
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "topics owner rw" on public.topics;
create policy "topics owner rw" on public.topics
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "topic_summaries via topic" on public.topic_summaries;
create policy "topic_summaries via topic" on public.topic_summaries
  using (exists (select 1 from public.topics t where t.id = topic_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.topics t where t.id = topic_id and t.user_id = auth.uid()));

drop policy if exists "files via topic" on public.topic_files;
create policy "files via topic" on public.topic_files
  using (exists (select 1 from public.topics t where t.id = topic_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.topics t where t.id = topic_id and t.user_id = auth.uid()));

drop policy if exists "documents via topic" on public.documents;
create policy "documents via topic" on public.documents
  using (exists (select 1 from public.topics t where t.id = topic_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.topics t where t.id = topic_id and t.user_id = auth.uid()));

drop policy if exists "chunks via topic" on public.chunks;
create policy "chunks via topic" on public.chunks
  using (exists (select 1 from public.topics t where t.id = topic_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.topics t where t.id = topic_id and t.user_id = auth.uid()));

drop policy if exists "quizzes via topic" on public.quizzes;
create policy "quizzes via topic" on public.quizzes
  using (exists (select 1 from public.topics t where t.id = topic_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.topics t where t.id = topic_id and t.user_id = auth.uid()));

drop policy if exists "questions via quiz->topic" on public.quiz_questions;
create policy "questions via quiz->topic" on public.quiz_questions
  using (exists (select 1 from public.quizzes q join public.topics t on t.id=q.topic_id
                 where q.id = quiz_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.quizzes q join public.topics t on t.id=q.topic_id
                      where q.id = quiz_id and t.user_id = auth.uid()));

drop policy if exists "options via question->quiz->topic" on public.quiz_options;
create policy "options via question->quiz->topic" on public.quiz_options
  using (exists (select 1 from public.quiz_questions qq
                 join public.quizzes q on q.id=qq.quiz_id
                 join public.topics t on t.id=q.topic_id
                 where qq.id = question_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.quiz_questions qq
                      join public.quizzes q on q.id=qq.quiz_id
                      join public.topics t on t.id=q.topic_id
                      where qq.id = question_id and t.user_id = auth.uid()));

drop policy if exists "attempts via quiz->topic" on public.quiz_attempts;
create policy "attempts via quiz->topic" on public.quiz_attempts
  using (exists (select 1 from public.quizzes q join public.topics t on t.id=q.topic_id
                 where q.id = quiz_id and t.user_id = auth.uid()))
  with check (user_id = auth.uid() and exists (
               select 1 from public.quizzes q join public.topics t on t.id=q.topic_id
               where q.id = quiz_id and t.user_id = auth.uid()));

drop policy if exists "attempt answers via attempt" on public.attempt_answers;
create policy "attempt answers via attempt" on public.attempt_answers
  using (exists (select 1 from public.quiz_attempts a
                 join public.quizzes q on q.id = a.quiz_id
                 join public.topics t on t.id = q.topic_id
                 where a.id = attempt_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.quiz_attempts a
                      join public.quizzes q on q.id = a.quiz_id
                      join public.topics t on t.id = q.topic_id
                      where a.id = attempt_id and t.user_id = auth.uid()));

-- user_preferences defaults/grants
alter table public.user_preferences alter column user_id set default auth.uid();
grant select, insert, update on table public.user_preferences to authenticated;

-- create profile on new user
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_first text; v_last text;
begin
  v_first := coalesce(new.raw_user_meta_data->>'first_name',
                      split_part(coalesce(new.raw_user_meta_data->>'full_name', new.email),' ',1),'');
  v_last  := coalesce(new.raw_user_meta_data->>'last_name',
                      nullif(split_part(coalesce(new.raw_user_meta_data->>'full_name', new.email),' ',2),''),'');
  insert into public.profiles (user_id, first_name, last_name, avatar_url, theme)
  values (new.id, v_first, v_last, null, 'light')
  on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Backfill profiles
insert into public.profiles (user_id, first_name, last_name, avatar_url, theme)
select
  u.id,
  coalesce(u.raw_user_meta_data->>'first_name',
           split_part(coalesce(u.raw_user_meta_data->>'full_name', u.email),' ',1),''),
  coalesce(u.raw_user_meta_data->>'last_name',
           nullif(split_part(coalesce(u.raw_user_meta_data->>'full_name', u.email),' ',2),''),''),
  null,
  'light'::public.theme_pref
from auth.users u
left join public.profiles p on p.user_id = u.id
where p.user_id is null;

-- Category pruning
create or replace function public.prune_orphan_category()
returns trigger language plpgsql as $$
begin
  if old.category_id is null then return old; end if;
  if not exists (select 1 from public.topics t where t.category_id = old.category_id) then
    delete from public.categories c where c.id = old.category_id and c.user_id = old.user_id;
  end if;
  return old;
end $$;

drop trigger if exists t_topics_prune_category_after_delete on public.topics;
create trigger t_topics_prune_category_after_delete
after delete on public.topics for each row execute function public.prune_orphan_category();

drop trigger if exists t_topics_prune_category_after_update on public.topics;
create trigger t_topics_prune_category_after_update
after update of category_id on public.topics
for each row when (old.category_id is distinct from new.category_id)
execute function public.prune_orphan_category();

-- Cleanup stray categories
delete from public.categories c
where not exists (select 1 from public.topics t where t.category_id = c.id);

-- Vector search function
create or replace function public.match_documents(
  query_embedding vector(1536),
  match_count int,
  p_topic_id uuid default null,
  p_only_active boolean default true
)
returns table(document_id uuid, content text, metadata jsonb, similarity float)
language sql stable as $$
  select d.id,
         c.content,
         c.metadata,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.chunks c
  join public.documents d on d.id = c.document_id
  where (p_topic_id is null or c.topic_id = p_topic_id)
    and (not p_only_active or c.is_active)
  order by c.embedding <=> query_embedding
  limit match_count
$$;

-- Quiz schema evolution: scope/status
begin;
  alter table public.quizzes
    add column if not exists scope text,
    add column if not exists status public.processing_status not null default 'pending',
    add column if not exists generated_at timestamptz;
  update public.quizzes q
  set scope = coalesce(q.scope, tt.name)
  from public.topic_themes tt
  where q.theme_id = tt.id and (q.scope is null or length(q.scope)=0);
  alter table public.quizzes drop constraint if exists quizzes_theme_id_fkey;
  alter table public.quizzes drop column if exists theme_id;
  drop policy if exists "themes via topic" on public.topic_themes;
  drop index  if exists public.idx_themes_topic;
  drop table  if exists public.topic_themes;
commit;

-- Helper: delete quiz content
create or replace function public.delete_quiz_content(p_quiz_id uuid)
returns void language plpgsql as $$
begin
  delete from public.attempt_answers aa
  using public.quiz_questions qq
  where aa.question_id = qq.id and qq.quiz_id = p_quiz_id;
  delete from public.quiz_attempts qa where qa.quiz_id = p_quiz_id;
  delete from public.quiz_options qo
  using public.quiz_questions qq2
  where qo.question_id = qq2.id and qq2.quiz_id = p_quiz_id;
  delete from public.quiz_questions qq3 where qq3.quiz_id = p_quiz_id;
end $$;
