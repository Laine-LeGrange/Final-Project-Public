"use client";
// Mark as client component

// Import necessary modules and components
import React from "react";
import Image from "next/image";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
} from "@/components/ui/sidebar";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Home,
  ChevronLeft,
  BookOpen,
  MessageSquare,
  FileText,
  Brain,
  Upload,
  Settings,
  Archive,
} from "lucide-react";
import type { User, Topic, AppView } from "@/components/AppShell";
import SettingsModal from "@/components/SettingsModal";

// Define the type for topic pages
type TopicPage = "overview" | "chat" | "summaries" | "quizzes" | "upload" | "settings";

// Define props for the AppSidebar component
interface Props {
  user?: User;
  topics: Topic[];
  topicsLoading?: boolean; 
  currentView: AppView;
  onNavigate: (v: AppView) => void;
}

// Component that renders the application sidebar
export function AppSidebar({
  user,
  topics,
  topicsLoading,
  currentView,
  onNavigate,
}: Props) {

  // State to manage the settings modal visibility
  const [settingsOpen, setSettingsOpen] = React.useState(false);

  // Determine if the current view is within a topic
  const inTopic = typeof currentView === "object" && currentView.type === "topic";
  const page: TopicPage | null = inTopic ? currentView.page : null;
  const topicId = inTopic ? currentView.topicId : null;

  // Function to handle navigation to different topic pages
  const goto = (p: TopicPage) => {
    if (!inTopic || !topicId) return;
    onNavigate({ type: "topic", topicId, page: p });
  };

  // Function to navigate to dashboard or archive
  const goDashboard = () => onNavigate("dashboard");
  const goArchive = () => onNavigate("archive");

  // Compute user initials for avatar fallback
  const initials =
    (user?.name?.[0] ?? "").toUpperCase() + (user?.surname?.[0] ?? "").toUpperCase();

    // Render the sidebar with navigation items and user info
  return (
    <>
      {/* Sidebar for navigation */}
      <Sidebar variant="inset">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-2">
            <div className="flex items-center justify-center w-8 h-8 bg-black dark:bg-white rounded-sm">
              <Image
                src="/svg/app-logo.svg"
                alt="Centry App Logo"
                width={25}
                height={25}
                className="object-contain dark:invert"
                priority
              />
            </div>
            {/* App name and subscription info */}
            <div>
              <p className="font-semibold">Centry App</p>
              <p className="text-xs text-muted-foreground">Free Trial</p>
            </div>
          </div>
        </SidebarHeader>

          {/* Sidebar content with navigation groups */}
        <SidebarContent>
          {!inTopic && (
            <SidebarGroup>
              <SidebarGroupLabel>Platform</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={currentView === "dashboard"}
                      onClick={goDashboard}
                    >
                      <Home className="w-4 h-4" />
                      <span>Dashboard</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>

                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={currentView === "archive"}
                      onClick={goArchive}
                    >
                      <Archive className="w-4 h-4" />
                      <span>Archived</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          {/* Sidebar for topic navigation */}
          {inTopic && (
            <>
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton onClick={goDashboard}>
                        <ChevronLeft className="w-4 h-4" />
                        <span>Dashboard</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              <SidebarGroup>
                <SidebarGroupLabel>Topic</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        isActive={page === "overview"}
                        onClick={() => goto("overview")}
                      >
                        <BookOpen className="w-4 h-4" />
                        <span>Overview</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        isActive={page === "chat"}
                        onClick={() => goto("chat")}
                      >
                        <MessageSquare className="w-4 h-4" />
                        <span>Chat</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        isActive={page === "summaries"}
                        onClick={() => goto("summaries")}
                      >
                        <FileText className="w-4 h-4" />
                        <span>Summaries</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        isActive={page === "quizzes"}
                        onClick={() => goto("quizzes")}
                      >
                        <Brain className="w-4 h-4" />
                        <span>Quiz</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              <SidebarGroup>
                <SidebarGroupLabel>Manage Knowledge</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        isActive={page === "upload"}
                        onClick={() => goto("upload")}
                      >
                        <Upload className="w-4 h-4" />
                        <span>Upload Files</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              <SidebarGroup>
                <SidebarGroupLabel>Topic Settings</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        isActive={page === "settings"}
                        onClick={() => goto("settings")}
                      >
                        <Settings className="w-4 h-4" />
                        <span>Settings</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </>
          )}
        </SidebarContent>

        {/* Sidebar footer with user info and settings */}
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="h-12"
                onClick={() => user && setSettingsOpen(true)}
                disabled={!user}
                title={user ? `${user.name} ${user.surname}` : "Loading…"}
              >
                <Avatar className="h-8 w-8 overflow-hidden">
                  <AvatarImage
                    src={user?.profileImage}
                    alt={user ? `${user.name} ${user.surname}` : "User"}
                    className="object-cover"
                  />
                <AvatarFallback className="text-xs">
                  {initials || "U"}
                </AvatarFallback>
                </Avatar>
                <div className="flex flex-col items-start text-left">
                  <span className="text-sm font-medium">
                    {user ? `${user.name} ${user.surname}` : "Loading…"}
                  </span>
                  <span className="truncate max-w-[170px] text-xs text-muted-foreground">
                    {user?.email ?? "—"}
                  </span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      {/* Settings modal for user preferences */}
      {user ? (
        <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} user={user} />
      ) : null}
    </>
  );
}

export default AppSidebar;
