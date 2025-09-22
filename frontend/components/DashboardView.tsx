"use client";
// Mark as client component

// Import necessary modules and components
import React, { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/app/lib/supabase-browser";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Input } from "./ui/input";
import {
  FileText,
  Plus,
  Filter,
  Search,
  MoreVertical,
  Calendar,
  Archive,
  Settings,
} from "lucide-react";
import { SidebarInset, SidebarTrigger } from "./ui/sidebar";
import { Separator } from "./ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "./ui/breadcrumb";
import { CreateTopicDialog } from "./topic/CreateTopicDialog";
import { useProfileUser } from "@/hooks/useProfileUser";
import { DashboardSkeleton } from "@/components/skeletons";
import { ago, fmtDateTime } from "@/lib/datetime";

// Define types for topic data
type TopicOverviewRow = {
  topic_id: string;
  user_id: string;
  topic_name: string;
  status: "active" | "archived";
  category_id: string | null;
  category_name: string | null;
  last_used_at: string | null;
  file_count: number | null;
  quiz_count: number | null;
  summaries_ready: boolean | null;
  short_summary?: string | null;
};

// Define type for topic card used in the dashboard
type TopicCard = {
  id: string;
  name: string;
  category: string;
  fileCount: number;
  quizCount: number;
  lastActivity: string;
  lastActivityTs: number;
  isArchived: boolean;
  summaryReady: boolean;
};

// Define props for the DashboardView component
type DashboardViewProps = {
  onTopicSelect?: (topicId: string) => void;
  onCreateTopicNavigate?: (topicId: string) => void;
  onTopicAdded?: (t: TopicCard) => void;
  onTopicSettingsNavigate?: (topicId: string) => void;
};

// ------------------ Dashboard view component ------------------
export function DashboardView({
  // Callback props for topic actions
  onTopicSelect = () => {},
  onCreateTopicNavigate = () => {},
  onTopicAdded = () => {},
  onTopicSettingsNavigate,
}: DashboardViewProps) {
  // Initialize Supabase client and fetch user profile
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { user: profile } = useProfileUser();

  // State variables for loading, topics, error handling, and UI controls
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<TopicOverviewRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"lastActivity" | "name" | "category">(
    "lastActivity"
  );
  const [filterCategory, setFilterCategory] = useState("all");
  const [openCreate, setOpenCreate] = useState(false);

  // Function to convert a TopicOverviewRow to a TopicCard
  const toCard = (r: TopicOverviewRow): TopicCard => {
    const ts = r.last_used_at ? Date.parse(r.last_used_at) : 0;
    return {
      id: r.topic_id,
      name: r.topic_name,
      category: r.category_name ?? "General",
      fileCount: r.file_count ?? 0,
      quizCount: r.quiz_count ?? 0,
      lastActivity: ts ? ago(ts) : "—",
      lastActivityTs: ts,
      isArchived: r.status === "archived",
      summaryReady: Boolean(r.summaries_ready),
    };
  };

  // Function to fetch topic rows from the database
  const fetchRows = async () => {
    setLoading(true);
    setError(null);
    try {
      // Get the authenticated user
      const { data: auth } = await supabase.auth.getUser();
      const authed = auth?.user;
      if (!authed) {
        setRows([]);
        setLoading(false);
        return;
      }

      // Fetch active topics for the user
      const { data, error } = await supabase
        .from("topic_overview")
        .select(
          "topic_id,user_id,topic_name,status,category_id,category_name,last_used_at,file_count,quiz_count,summaries_ready,short_summary"
        )
        .eq("status", "active")
        .eq("user_id", authed.id)
        .order("last_used_at", { ascending: false });

      if (error) throw error;
      // Update state with fetched topics
      setRows((data ?? []) as TopicOverviewRow[]);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load topics");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  // Fetch topics on component mount
  useEffect(() => {
    void fetchRows();
  }, []);

  // Memoized list of topic cards
  const topics: TopicCard[] = useMemo(() => rows.map(toCard), [rows]);

  // Memoized list of unique categories for filtering
  const categories = useMemo(
    () => ["all", ...Array.from(new Set(topics.map((t) => t.category)))],
    [topics]
  );

  // Memoized filtered and sorted topics based on search, filter, and sort criteria
  const filteredTopics = useMemo(() => {
    const nameFilter = (t: TopicCard) =>
      searchQuery === "" ||
      t.name.toLowerCase().includes(searchQuery.toLowerCase());
    const catFilter = (t: TopicCard) =>
      filterCategory === "all" || t.category === filterCategory;

    // Apply filters and sorting
    const sorted = [...topics]
      .filter((t) => nameFilter(t) && catFilter(t))
      .sort((a, b) => {
        // Sort based on selected criteria
        switch (sortBy) {
          case "name":
            return a.name.localeCompare(b.name);
          case "category":
            return a.category.localeCompare(b.category);
          case "lastActivity":
          default:
            return b.lastActivityTs - a.lastActivityTs;
        }
      });

    // Return the sorted topics
    return sorted;
  }, [topics, searchQuery, filterCategory, sortBy]);

  // Render the dashboard view
  return (
    // Sidebar inset for consistent layout
    <SidebarInset className="px-6">
      <header className="flex h-16 shrink-0 items-center gap-2">
        <div className="flex items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Dashboard</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>

      {/* Dialog for creating a new topic */}
      <CreateTopicDialog
        open={openCreate}
        onOpenChange={setOpenCreate}
        onCreated={({ topicId, topicName, categoryName }) => {
          const now = Date.now();
          const card: TopicCard = {
            id: topicId,
            name: topicName,
            category: categoryName ?? "General",
            fileCount: 0,
            quizCount: 0,
            lastActivity: ago(now),
            lastActivityTs: now,
            isArchived: false,
            summaryReady: false,
          };

          // Invoke callbacks and update state with the new topic
          onTopicAdded(card);
          onCreateTopicNavigate(topicId);

          // add the new topic to the list
          setRows((prev) => [
            {
              topic_id: topicId,
              user_id: "",
              topic_name: topicName,
              status: "active",
              category_id: null,
              category_name: categoryName ?? "General",
              last_used_at: new Date(now).toISOString(),
              file_count: 0,
              quiz_count: 0,
              summaries_ready: false,
              short_summary: null,
            },
            ...prev,
          ]);
        }}
      />

      {/* Main content area */}
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="flex items-center justify-between">
          {/* Dashboard header */}
          <div>
            <h1 className="text-3xl font-bold mt-7">
              {`Hi${profile?.name ? ` ${profile.name}` : ""} 👋`}
            </h1>
            <p className="text-muted-foreground mt-2">
              Welcome back to your learning dashboard
            </p>
          </div>
        </div>

        {/* Controls: New Topic button, Search, Filter, Sort */}
        <div className="flex items-center gap-4 mt-2 mb-4">
          <Button onClick={() => setOpenCreate(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            New Topic
          </Button>

          {/* Search input */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search topics..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 shadow-none"
            />
          </div>

          {/* Filter by category */}
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[180px] shadow-none">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Filter by category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category} value={category}>
                  {category === "all" ? "All Categories" : category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Sort by options */}
          <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
            <SelectTrigger className="w-[160px] shadow-none">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="lastActivity">Last Activity</SelectItem>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="category">Category</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Loading state with skeleton */}
        {loading ? (
          <DashboardSkeleton />
        ) : error ? (
          <div className="text-sm text-destructive">{error}</div>
        ) : filteredTopics.length === 0 ? (
          // Empty state when no topics match the criteria
          <Card className="shadow-none">
            <CardContent className="p-12 text-center">
              <h3 className="text-lg font-semibold mb-2">
                No active topics yet
              </h3>
              <p className="text-muted-foreground mb-4">
                Create a topic to get started.
              </p>
              <Button onClick={() => setOpenCreate(true)}>Create Topic</Button>
            </CardContent>
          </Card>
        ) : (
          // Grid of topic cards
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredTopics.map((topic) => (
              <Card
                key={topic.id}
                className="cursor-pointer shadow-none hover:shadow-sm transition-shadow flex flex-col"
                onClick={() => {
                  onTopicSelect(topic.id);
                }}
              >
                {/* Topic card header */}
                <CardHeader className="pb-2 min-h-[64px]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <CardTitle className="text-2xl max-w-55 font-normal leading-snug line-clamp-2 min-h-[3rem]">
                        {topic.name}
                      </CardTitle>
                    </div>

                    {/* Dropdown menu for topic actions */}
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        asChild
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 self-start"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            onTopicSettingsNavigate?.(topic.id);
                          }}
                        >
                          <Settings className="w-4 h-4 mr-2" />
                          Settings
                        </DropdownMenuItem>

                        <DropdownMenuItem
                          onClick={async (e) => {
                            e.stopPropagation();
                            const { error } = await supabase
                              .from("topics")
                              .update({ status: "archived" })
                              .eq("id", topic.id);
                            if (!error) {
                              void fetchRows();
                            }
                          }}
                        >
                          <Archive className="w-4 h-4 mr-2" />
                          Archive
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>

                {/* Topic card content */}
                <CardContent className="flex flex-col gap-6">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {topic.fileCount} Files
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="w-4 h-4" />
                        <span title={fmtDateTime(topic.lastActivityTs)}>
                          {topic.lastActivity}
                        </span>
                      </div>
                    </div>
                    <Badge variant="secondary">{topic.category}</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </SidebarInset>
  );
}

export default DashboardView;
