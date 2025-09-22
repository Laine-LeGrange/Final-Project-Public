"use client";
// Mark as client component

// Import necessary modules and components
import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Progress } from "../ui/progress";
import {
  FileText,
  Brain,
  MessageSquare,
  Upload,
  CheckCircle,
  Clock,
} from "lucide-react";
import type { Topic } from "../AppShell";

// Define props for the TopicOverview component
interface TopicOverviewProps {
  topic: Topic;
  onNavigate: (
    page: "overview" | "chat" | "summaries" | "quizzes" | "settings" | "upload"
  ) => void;
}

// Component that displays an overview of a topic
export function TopicOverview({ topic }: TopicOverviewProps) {

  // Define statistics and quick actions for the topic
  const stats = [
    {
      title: "Documents",
      value: topic.fileCount,
      subtitle: "Files uploaded",
      icon: FileText,
    },
    {
      title: "Quizzes",
      value: topic.quizCount,
      subtitle: "Available to take",
      icon: Brain,
    },
    {
      title: "Summary",
      value: topic.summaryReady ? "Ready" : "Processing",
      subtitle: topic.summaryReady
        ? `Last refreshed ${topic.lastActivity}`
        : "Please wait...",
      icon: CheckCircle,
    },
  ];

  // Define quick actions to guide the user
  const quickActions = [
    {
      title: "Upload Documents",
      description: "Add documents to your knowledge base",
      icon: Upload,
    },
    {
      title: "Chat with Your Documents",
      description: "Ask questions on your content",
      icon: MessageSquare,
    },
    {
      title: "Generate Summaries",
      description: "Auto summaries for quick review",
      icon: FileText,
    },
    {
      title: "Take Quizzes",
      description: "Test your understanding",
      icon: Brain,
    },
  ];

  // Render the topic overview UI
  return (
    <div className="py-4 space-y-6">

         {/* Topic header */}
    <div>
      <h1 className="text-3xl font-semibold mt-1">{topic.name}</h1>
      <p className="text-muted-foreground mt-2">Last activity {topic.lastActivity}</p>
    </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          let iconClasses = "h-4 w-4 text-gray-500 dark:text-gray-400";

          // Special handling for Summary icon color based on readiness
          if (stat.title === "Summary") {
            if (!topic.summaryReady) {
              iconClasses = "h-4 w-4 text-orange-600"; 
            } else {
              iconClasses = "h-4 w-4 text-green-600"; 
            }
          }

          // Render each statistic card
          return (
            <Card className="shadow-none" key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <Icon className={iconClasses} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">{stat.subtitle}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
          {/* Topic summary card */}
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Topic Overview</CardTitle>
            <CardDescription>
              Summary and key information about this topic
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {topic.shortSummary ? (
              <div>
                <h4 className="font-medium mb-2">Short Summary</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {topic.shortSummary}
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="w-4 h-4" />
                <span className="text-sm">
                  Summary will be available once documents are processed
                </span>
              </div>
            )}

            <div className="pt-4 border-t">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Processing Progress</span>
                <span className="text-sm text-muted-foreground">
                  {topic.summaryReady ? "100%" : "75%"}
                </span>
              </div>
              <Progress value={topic.summaryReady ? 100 : 75} className="h-2" />
            </div>
          </CardContent>
        </Card>

        {/* Getting started card */}
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Getting started</CardTitle>
            <CardDescription>
              Helpful steps to make the most of your topic
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {quickActions.map((action, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 p-3 rounded-lg border-none bg-muted/30"
                >              
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 mt-0.5">
                    <span className="text-sm font-medium text-primary">
                      {index + 1}
                    </span>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <h5 className="font-medium text-sm">{action.title}</h5>
                    <p className="text-xs text-muted-foreground mt-1">
                      {action.description}
                    </p>
                  </div>
                  
                  <action.icon className="w-4 h-4 text-gray-500 dark:text-gray-400 mt-1" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
