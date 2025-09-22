
"use client";
// Mark as client component

// Import necessary modules and components
import * as React from "react";
import { useRouter } from "next/navigation";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import type { AppView, Topic, User } from "@/components/AppShell";

// Define props for the WithAppSidebar component
type Props = {
  currentView: AppView;
  topics: Topic[];
  user: User;
  children: React.ReactNode;
  onNavigate?: (v: AppView) => void;
};

// Component that wraps content with an application sidebar
export function WithAppSidebar({
  currentView,
  topics,
  user,
  children,
  onNavigate,
}: Props) {
  const router = useRouter();

  // Navigation function to handle view changes
  const navigate = React.useCallback(
    (v: AppView) => {
      if (onNavigate) return onNavigate(v);
      if (typeof v === "string") {
        if (v === "dashboard") router.push("/dashboard");
        if (v === "archive") router.push("/dashboard");
        return;
      }
      // Navigate to topic-specific pages
      router.push(`/topics/${v.topicId}/${v.page}`);
    },
    [onNavigate, router]
  );

  // Render the sidebar and main content area
  return (
    <div className={user.isDarkMode ? "dark" : ""}>
      <SidebarProvider>
        <AppSidebar
          user={user}
          topics={topics}
          currentView={currentView}
          onNavigate={navigate}
        />
        <div className="flex-1 flex flex-col min-h-screen bg-background">
          <SidebarInset className="px-6 py-1">
            
            <div className="p-1">{children}</div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
}
