"use client";
// mark as component so that we can use hooks inside

import React from "react";
import AppShell from "@/components/AppShell";

// Page component for the archive view
export default function ArchivePage() {
  // Render the AppShell with the initial view set to "archive"
  return <AppShell initialView="archive" />;
}