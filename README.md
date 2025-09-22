# Centry — Multimodal RAG Learning Platform

Centry is a multimodal learning assistant built with Next.js (frontend), FastAPI (backend), and a modular RAG pipeline. It supports uploads of documents, audio, and images, and enables Q&A, summarisation, and quiz generation grounded in your own study materials.

## Setup

### 1. Environment

First, create your environment from the provided `centry_environment.yml`:

```bash
conda env create -f centry_environment.yml
conda activate centry
```

### 2. Frontend (Next.js)

Install dependencies and run the dev server:

```bash
cd frontend
pnpm install
pnpm run dev
```

Configure environment variables in `frontend/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

The frontend runs at http://localhost:3000.

### 3. Backend (FastAPI)

From the project root, run the backend with dev-mode auth bypass:

```bash
cd backend
export AUTH_BYPASS=true  # only for local dev
PYTHONPATH=. uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Configure backend variables in `backend/.env`:

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=

COHERE_API_KEY=
GOOGLE_API_KEY=
ANTHROPIC_API_KEY=
MISTRAL_API_KEY=

LANGCHAIN_TRACING_V2=true
LANGCHAIN_ENDPOINT=https://api.smith.langchain.com
LANGCHAIN_API_KEY=
LANGCHAIN_PROJECT=

ELEVENLABS_API_KEY=
```

The backend runs at http://localhost:8000.

## Project Structure

- **`frontend/`** - Next.js app with onboarding, dashboard, topic views (chat, quizzes, summaries, upload).
- **`backend/`** - FastAPI server, Supabase integration, ASR/TTS endpoints, RAG orchestration.
- **`rag_pipeline/`** - Modular RAG pipeline (retrievers, rerankers, embeddings, summarisation, quiz generation).

## Features

- **Multimodal uploads**: PDF, DOCX, PPTX, images (OCR), audio/video (ASR).
- **Chat Q&A**: Context-grounded responses using retrieval + LLMs.
- **Summaries**: Short, long, and key-concepts modes.
- **Dynamic Quizzing**: Auto-generated multiple-choice questions with difficulty levels.
- **Accessibility**: Voice input/output, personalised study preferences.