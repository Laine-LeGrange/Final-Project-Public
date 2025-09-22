// Mark as client component
"use client";

// Import necessary modules and components
import React from "react";
import { Skeleton } from "@/components/ui/skeleton";


// Skeleton components for loading states in various pages

// Dashboard skeleton with multiple cards
export function DashboardSkeleton() {
  return (
    <div className="pt-0 mt-2">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col space-y-4 border border-muted rounded-lg p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-2 w-full">
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-8 w-2/5" />
              </div>
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
            </div>
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-4 w-28" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/// Topic page skeleton with header and content area
export function TopicPageSkeleton() {
  return (
    <div className="mt-20 flex min-h-[calc(100vh-12rem)] flex-col gap-4 mr-4">
      <Skeleton className="h-25 w-full rounded-md" />
      <Skeleton className="h-15 w-full rounded-md" />

      <Skeleton className="w-full flex-1 rounded-lg" />
    </div>
  );
}

// Archive page skeleton with multiple cards
export function ArchiveSkeleton() {
  return (
    <div className="pt-0 mt-2">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col space-y-4 border border-muted rounded-lg p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-2 w-full">
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-8 w-2/5" />
              </div>
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
            </div>
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-4 w-28" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Summary page skeleton with header and content area
export function SummarySkeleton() {
  return (
    <div className="space-y-6">
  <div>
    <div className="grid grid-cols-3 gap-2">
      <Skeleton className="h-9 w-full rounded-md" />
      <Skeleton className="h-9 w-full rounded-md" />
      <Skeleton className="h-9 w-full rounded-md" />
    </div>
  </div>

      <div className="rounded-lg bg-muted p-4">

        <div className="space-y-3">
          <Skeleton className="h-80 w-full" />
        </div>
      </div>
    </div>
  );
}

// Quizzes page skeleton with multiple quiz items skeletons
export function QuizzesSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="border rounded-lg px-3 py-8">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 w-full">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <Skeleton className="h-3 w-36" />
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-5 w-12 rounded" />
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Skeleton className="h-8 w-20 rounded-md" />
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}


// Quiz runner skeleton with question and options skeletons to simulate loading state
export function QuizRunnerSkeleton() {
  return (
    <div className="mx-auto max-w-4xl mt-20">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-36 rounded-md" />
      </div>

      <div className="mt-8 h-1.5 w-full bg-muted rounded-full overflow-hidden">
        <Skeleton className="h-full w-2/5" />
      </div>

      <div className="mt-10">
        <div className="p-2">
          <Skeleton className="h-4 w-40 mb-3" /> 
          <Skeleton className="h-7 w-3/4 mb-6" />

          {/* Options */}
          <div className="mt-6 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-md border p-3"
              >
                <Skeleton className="h-4 w-4 rounded-full" /> 
                <Skeleton className="h-5 w-3/4" />
              </div>
            ))}
          </div>
          <div className="mt-10 flex justify-between">
            <Skeleton className="h-9 w-28 rounded-md" />
            <Skeleton className="h-9 w-24 rounded-md" />
          </div>
        </div>
      </div>
    </div>
  );
}
