// Import necessary modules
import { NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase-server";

// POST endpoint to sign out the user and redirect to login
export async function POST(req: Request) {
  const supabase = await supabaseServer();

  // Sign out the user
  await supabase.auth.signOut();

  // Redirect to login page after sign out
  return NextResponse.redirect(new URL("/login", req.url));
}