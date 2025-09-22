"use client";
// Mark as client component

// Import necessary modules and components
import React, { useEffect, useMemo, useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { DashboardView } from "@/components/DashboardView";
import { ArchiveView } from "@/components/ArchiveView";
import { TopicView } from "@/components/TopicView";
import SyncThemeWithProfile from "@/components/SyncTheme";
import { supabaseBrowser } from "@/app/lib/supabase-browser";
import { useProfileUser } from "@/hooks/useProfileUser";
import { DashboardSkeleton, TopicPageSkeleton } from "@/components/skeletons";
import { usePathname } from "next/navigation";

// Define types for Topic
export type Topic = {
  id: string;
  name: string;
  category: string;
  fileCount: number;
  quizCount: number;
  lastActivity: string;
  isArchived: boolean;
  summaryReady: boolean;
  shortSummary?: string;
};

// Define types for User
export type User = {
  id: string;
  name: string;
  surname: string;
  email: string;
  profileImage?: string;
  isDarkMode: boolean;
};

// Define the type for topic pages
type TopicPage =
  | "overview"
  | "chat"
  | "summaries"
  | "quizzes"
  | "upload"
  | "settings";

// Define the type for application views
export type AppView =
  | "dashboard"
  | "archive"
  | { type: "topic"; topicId: string; page: TopicPage };


  // Define props for the AppShell component
type AppShellProps = {
  initialView?: AppView;
};

// Utility function to format time ago
function ago(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return "Just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

// Define the structure of a topic overview row from the database
type TopicOverviewRow = {
  topic_id: string;
  user_id: string;
  topic_name: string;
  status: "active" | "archived";
  category_name: string | null;
  last_used_at: string | null;
  file_count: number | null;
  quiz_count: number | null;
  summaries_ready: boolean | null;
  short_summary: string | null;
};

// Utility function to replace the current URL without reloading
function replaceUrl(href: string) {
  if (typeof window === "undefined") return;
  const url = new URL(href, window.location.origin);
  window.history.replaceState(window.history.state, "", url);
}

// Topic view loader component
function TopicViewLoader({
  topicId,
  page,
  onResolved,
  onBackToDashboard,
  onNavigate,
}: {
  // Props for TopicViewLoader
  topicId: string;
  page: TopicPage;
  onResolved: (t: Topic) => void;
  onBackToDashboard: () => void;
  onNavigate: (page: TopicPage) => void;
}) {
  // State and effect hooks to load topic data
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [topic, setTopic] = useState<Topic | null>(null);

  // Fetch topic data when component mounts or topicId changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        // Fetch authenticated user
        const { data: auth } = await supabase.auth.getUser();
        const authed = auth?.user;
        if (!authed) throw new Error("You must be signed in.");

        // Fetch topic overview data from the database
        const { data, error } = await supabase
          .from("topic_overview")
          .select(
            "topic_id,user_id,topic_name,status,category_name,last_used_at,file_count,quiz_count,summaries_ready,short_summary"
          )
          .eq("topic_id", topicId)
          .eq("user_id", authed.id)
          .maybeSingle();

        // Handle errors or missing data
        if (error || !data) throw error ?? new Error("Topic not found");

        // Adapt database row to Topic type
        const r = data as TopicOverviewRow;
        const adapted: Topic = {
          id: r.topic_id,
          name: r.topic_name,
          category: r.category_name ?? "General",
          fileCount: r.file_count ?? 0,
          quizCount: r.quiz_count ?? 0,
          lastActivity: ago(r.last_used_at),
          isArchived: r.status === "archived",
          summaryReady: Boolean(r.summaries_ready),
          shortSummary: r.short_summary ?? undefined,
        };
        if (!cancelled) {

          // Update state and notify parent component
          setTopic(adapted);
          onResolved(adapted);
        }

      // Handle any error
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "Failed to load topic");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, topicId, onResolved]);

  // Render loading skeleton if loading
  if (loading) return <TopicPageSkeleton />;

  // Render error message if there was an error or topic not found
  if (err || !topic)
    return (
      <div className="p-8">
        <h2 className="text-2xl font-semibold mb-2">Topic not found</h2>
        <p className="mb-4">We couldn’t find a topic with ID “{topicId}”.</p>
        <button
          className="px-4 py-2 rounded-md border"
          onClick={onBackToDashboard}
        >
          Back to Dashboard
        </button>
      </div>
    );

    // Render the TopicView component with loaded topic data
  return (
    <TopicView
      topic={topic}
      currentPage={page}
      onNavigate={onNavigate}
      onUpdateTopic={() => {}}
    />
  );
}

// Main application shell component
export default function AppShell({ initialView = "dashboard" }: AppShellProps) {

  // State and hooks for managing application view and user data
  const [currentView, setCurrentView] = useState<AppView>(initialView);

  // Fetch user profile using custom hook
  const { user: profile } = useProfileUser({
    refetchOnWindowFocus: false,
    refetchInterval: 0,
  });

  // Effect hook to initialize Supabase client
  const supabase = useMemo(() => supabaseBrowser(), []);

  // State and effect hooks to load topics
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);

  // Function to refresh the list of topics from the database
  const refreshTopics = async () => {
    try {
      setTopicsLoading(true);
      // Fetch authenticated user
      const { data: auth } = await supabase.auth.getUser();
      const authed = auth?.user;
      if (!authed) {
        setTopics([]);
        return;
      }

      // Fetch topic overview data from the database
      const { data, error } = await supabase
        .from("topic_overview")
        .select(
          "topic_id,user_id,topic_name,status,category_name,last_used_at,file_count,quiz_count,summaries_ready,short_summary"
        )
        .eq("user_id", authed.id)
        .order("last_used_at", { ascending: false });

      if (error) throw error;

      // Adapt database rows to Topic type
      const adapted: Topic[] = (data ?? []).map((row: any) => {
        const r = row as TopicOverviewRow;
        return {
          id: r.topic_id,
          name: r.topic_name,
          category: r.category_name ?? "General",
          fileCount: r.file_count ?? 0,
          quizCount: r.quiz_count ?? 0,
          lastActivity: ago(r.last_used_at),
          isArchived: r.status === "archived",
          summaryReady: Boolean(r.summaries_ready),
          shortSummary: r.short_summary ?? undefined,
        };
      });

      // Update state with fetched topics
      setTopics(adapted);
    } catch {
      setTopics([]);
    } finally {
      setTopicsLoading(false);
    }
  };

  // Initial load of topics when component mounts
  useEffect(() => {
    void refreshTopics();
  }, []);

  // Function to handle adding a new topic
  const handleTopicAdded = (t: Topic) =>
    setTopics((prev) =>
      prev.some((p) => p.id === t.id) ? prev : [t, ...prev]
    );

  // Function to navigate to upload page for a specific topic
  const navigateToUploadFor = (topicId: string) =>
    setCurrentView({ type: "topic", topicId, page: "upload" });

  // Adapt profile data to User type
  const user: User | null = profile
    ? {
        id: profile.id,
        name: profile.name,
        surname: profile.surname,
        email: profile.email,
        profileImage: profile.profileImage,
        isDarkMode: profile.isDarkMode,
      }
    : null;

  // Sync application view with URL path
  const pathname = usePathname();

  // Effect to set current view based on URL path
  useEffect(() => {
    const m = pathname.match(
      /^\/topics\/([^/]+)\/(overview|chat|summaries|quizzes|upload|settings)$/
    );
    if (m) {
      setCurrentView({ type: "topic", topicId: m[1], page: m[2] as TopicPage });
      return;
    }
    if (pathname === "/archive") {
      setCurrentView("archive");
      return;
    }
    if (pathname === "/dashboard" || pathname === "/") {
      setCurrentView("dashboard");
      return;
    }
  }, []);

  // Effect to update URL when current view changes
  useEffect(() => {
    if (currentView === "dashboard") {
      replaceUrl("/dashboard");
      return;
    }
    if (currentView === "archive") {
      replaceUrl("/archive");
      return;
    }
    if (typeof currentView === "object" && currentView.type === "topic") {
      replaceUrl(`/topics/${currentView.topicId}/${currentView.page}`);
    }
  }, [currentView]);

  // Render the application shell with sidebar and main content
  return (
    <>
      {/* Sync theme with user profile */}
      <SyncThemeWithProfile />

      <SidebarProvider>
        <AppSidebar
          user={user ?? undefined}
          topics={topics}
          topicsLoading={topicsLoading}
          currentView={currentView}
          onNavigate={setCurrentView}
        />

        {/* Main content area */}
        <div className="flex-1 flex flex-col min-h-screen">

          {/* Dashboard view */}
          {currentView === "dashboard" && (
            <DashboardView
              onTopicSelect={(topicId) =>
                setCurrentView({ type: "topic", topicId, page: "overview" })
              }
              onCreateTopicNavigate={navigateToUploadFor}
              onTopicAdded={handleTopicAdded}
              onTopicSettingsNavigate={(topicId) =>
                setCurrentView({ type: "topic", topicId, page: "settings" })
              }
            />
          )}

          {/* Archive view */}
          {currentView === "archive" && (
            <ArchiveView
              onTopicSelect={(topicId) =>
                setCurrentView({ type: "topic", topicId, page: "overview" })
              }
            />
          )}

          {/* Topic view */}
          {typeof currentView === "object" && currentView.type === "topic" && (
            <TopicViewLoader
              topicId={currentView.topicId}
              page={currentView.page}
              onResolved={(loaded) => {
                setTopics((prev) =>
                  prev.some((x) => x.id === loaded.id)
                    ? prev
                    : [loaded, ...prev]
                );
              }}

              // Handlers for navigation and updates
              onBackToDashboard={() => setCurrentView("dashboard")}
              onNavigate={(page) =>
                setCurrentView({
                  type: "topic",
                  topicId: currentView.topicId,
                  page,
                })
              }
            />
          )}
        </div>
      </SidebarProvider>
    </>
  );
}
