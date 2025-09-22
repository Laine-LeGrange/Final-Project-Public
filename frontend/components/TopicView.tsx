"use client";
// Mark as client component

// Import necessary modules and components
import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Topic } from "@/components/AppShell";
import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { TopicOverview } from "@/components/topic/TopicOverview";
import { TopicChat } from "@/components/topic/TopicChat";
import { TopicSummaries } from "@/components/topic/TopicSummaries";
import { TopicQuizzes } from "@/components/topic/TopicQuizzes";
import { TopicSettings } from "@/components/topic/TopicSettings";
import { TopicUpload } from "@/components/topic/TopicUpload";

// Define props for the TopicView component
interface Props {
  topic: Topic;
  currentPage: "overview" | "chat" | "summaries" | "quizzes" | "settings" | "upload";
  onNavigate: (p: Props["currentPage"]) => void;
  onUpdateTopic: (t: Topic) => void;
}

// Component that renders the view for a specific topic
export function TopicView({ topic, currentPage, onNavigate, onUpdateTopic }: Props) {
  const router = useRouter();

  // Function to handle navigation to different topic pages
  const go = (page: Props["currentPage"]) => {
    onNavigate(page);
    router.push(`/topics/${topic.id}/${page}`);
  };

  // Determine the title based on the current page
  const title =
    currentPage === "overview"
      ? "Overview"
      : currentPage === "chat"
      ? "Chat"
      : currentPage === "summaries"
      ? "Summaries"
      : currentPage === "quizzes"
      ? "Quiz"
      : currentPage === "settings"
      ? "Settings"
      : "Upload Files";

  // Render the topic view with header and appropriate page component
  return (
    <SidebarInset className="px-6">
      <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
        <div className="flex items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href="/dashboard">Dashboard</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href={`/topics/${topic.id}/overview`}>{topic.name}</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{title}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>

      {/* Main content area */}
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">

        {/* Overview */}
        {currentPage === "overview" && (
          <TopicOverview topic={topic} onNavigate={go} />
        )}

        {/* Chat */}
        {currentPage === "chat" && (
          <TopicChat topic={topic} />
        )}

        {/* Summaries */}
        {currentPage === "summaries" && (
          <TopicSummaries topic={topic} onUpdateTopic={onUpdateTopic} />
        )}

        {/* Quizzes */}
        {currentPage === "quizzes" && (
          <TopicQuizzes topic={topic} />
        )}

        {/* Settings */}
        {currentPage === "settings" && (
          <TopicSettings topic={topic} onUpdateTopic={onUpdateTopic} />
        )}

        {/* Upload */}
        {currentPage === "upload" && (
          <TopicUpload topic={topic} onUpdateTopic={onUpdateTopic} />
        )}
      </div>
    </SidebarInset>
  );
}