"use client";
// Mark as client component

// Import Supabase client for browser environment
import { createBrowserClient } from "@supabase/ssr";

// Function to create and return a Supabase client for browser use
export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)! 
  );
}