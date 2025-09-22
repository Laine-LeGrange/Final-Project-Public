"use client";
// Mark as client component

// Import necessary modules and components
import React, { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/app/lib/supabase-browser";
import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Archive as ArchiveIcon,
  FileText,
  MoreVertical,
  RotateCcw,
  Trash2,
  Calendar,
  Search,
} from "lucide-react";
import { ArchiveSkeleton } from "@/components/skeletons";
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
  short_summary?: string | null;
};

// Define type for topic card display
type TopicCard = {
  id: string;
  name: string;
  category: string;
  fileCount: number;
  lastActivity: string;
  lastActivityTs: number;
};

// Define props for the ArchiveView component
type ArchiveViewProps = {
  onTopicSelect?: (topicId: string) => void;
};

// Component that renders the archive view for managing archived topics
export function ArchiveView({ onTopicSelect = () => {} }: ArchiveViewProps) {
  // Initialize Supabase client and state variables
  const supabase = React.useMemo(() => supabaseBrowser(), []);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<TopicOverviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Function to fetch archived topics from the database
  async function refresh() {
    setLoading(true);
    setErr(null);

    try {
      // Get the authenticated user
      const { data: auth } = await supabase.auth.getUser();
      const authed = auth?.user;
      if (!authed) {
        setRows([]);
        setLoading(false);
        return;
      }

      // Fetch archived topics for the authenticated user
      const { data, error } = await supabase
        .from("topic_overview")
        .select(
          "topic_id,user_id,topic_name,status,category_id,category_name,last_used_at,file_count,quiz_count,short_summary"
        )
        .eq("status", "archived")
        .eq("user_id", authed.id)
        .order("last_used_at", { ascending: false });

      if (error) throw error;
      // Update state with fetched data
      setRows((data ?? []) as TopicOverviewRow[]);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load archived topics");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  // Fetch archived topics on component mount
  useEffect(() => {
    void refresh();
  }, []);

  // Memoize the list of topics for display
  const topics: TopicCard[] = useMemo(
    () =>
      rows.map((r) => {
        const ts = r.last_used_at ? Date.parse(r.last_used_at) : 0;
        return {
          id: r.topic_id,
          name: r.topic_name,
          category: r.category_name ?? "General",
          fileCount: r.file_count ?? 0,
          lastActivity: ts ? ago(ts) : "—",
          lastActivityTs: ts,
        };
      }),
    [rows]
  );

  // Filter and sort topics based on search query
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = !q
      ? topics
      : topics.filter((t) => t.name.toLowerCase().includes(q));
    return [...base].sort((a, b) => b.lastActivityTs - a.lastActivityTs);
  }, [query, topics]);

  // Handlers for restoring and permanently deleting topics
  const onRestore = async (id: string) => {
    // Restore the topic by updating its status to active
    const { error } = await supabase
      .from("topics")
      .update({ status: "active" })
      .eq("id", id);
    if (!error) void refresh();
  };

  // Permanently delete the topic from the database
  const onDeleteForever = async (id: string) => {
    // Delete the topic permanently
    const { error } = await supabase.from("topics").delete().eq("id", id);
    if (!error) void refresh();
  };

  // Render the archive view with header, search, and topic cards
  return (
    // Sidebar inset for layout
    <SidebarInset className="px-6">
      <header className="flex h-16 items-center gap-2">
        <div className="flex items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Archived</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>

      {/* Main content area */}
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0 mt-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ArchiveIcon className="h-6 w-6" />
              Archived Topics
            </h1>
            <p className="text-muted-foreground mt-2">
              Manage your archived topics – restore or permanently delete them
            </p>
          </div>
        </div>

        {/* Search input */}
        <div className="flex items-center gap-4 mb-2 mt-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search archived topics..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-10 shadow-none"
            />
          </div>
        </div>

        {/* Loading state */}
        {loading ? (
          <ArchiveSkeleton />
        ) : err ? (
          <div className="text-sm text-destructive">{err}</div>
        ) : items.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {items.map((topic) => (
              // Topic card
              <Card key={topic.id} className="select-none shadow-none bg-muted/50">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-2xl max-w-55 font-normal leading-snug line-clamp-2 min-h-[3rem]">
                        {topic.name}
                      </CardTitle>

                    </div>

                    {/* Dropdown menu for topic actions */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Actions"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onRestore(topic.id)}>
                          <RotateCcw className="w-4 h-4 mr-2" />
                          Restore
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => onDeleteForever(topic.id)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete Forever
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>

                {/* Card content */}
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        {topic.fileCount} Files
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Calendar className="w-4 h-4" />
                        <span title={fmtDateTime(topic.lastActivityTs)}>
                         {topic.lastActivity}
                        </span>
                      </div>
                    </div>
                                          <Badge variant="secondary" className="mt-2">
                        {topic.category}
                      </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          // Empty state when no archived topics
          <Card className="shadow-none">
            <CardContent className="p-12 text-center">
              <ArchiveIcon className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No archived topics</h3>
              <p className="text-muted-foreground">
                When you archive topics, they’ll appear here
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </SidebarInset>
  );
}
