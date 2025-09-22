// Import necessary modules
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabase-server";

// Force dynamic rendering to handle auth state correctly
export const dynamic = "force-dynamic";

// GET endpoint to handle OAuth callback
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code"); // auth code
  const oauthError = url.searchParams.get("error");

  // Debugging logs
  console.log("Auth callback started", { 
    code: !!code, 
    oauthError, 
    fullUrl: req.url 
  });

  // Handle OAuth error
  if (oauthError) {
    console.log("OAuth error:", oauthError);
    return NextResponse.redirect(
      new URL(`/login?oauth_error=${oauthError}`, req.url)
    );
  }

  // Initialize Supabase client
  const supabase = await supabaseServer();

  // Exchange code for session
  if (code) {
    console.log("Exchanging code for session");
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.log("Code exchange error:", error);
      return NextResponse.redirect(
        new URL(`/login?oauth_error=${error.message}`, req.url)
      );
    }
  }

  // Check user authentication
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  console.log("User check:", { 
    userId: user?.id, 
    email: user?.email, 
    userError: userError?.message 
  });

  // If no user is found, redirect to login
  if (!user) {
    console.log("No user found, redirecting to login");
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Check if the user has completed onboarding (user preferences)
  const { data: prefs, error: prefsError } = await supabase
    .from("user_preferences")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  console.log("Preferences check:", { 
    prefs: !!prefs, 
    prefsError: prefsError?.message 
  });

  // Decide final redirect destination based on preferences
  let destination = "/onboarding";
  if (prefsError) {
    console.error("Error checking user preferences:", prefsError);
    destination = "/onboarding"; // fallback to onboarding if error
  } else {
    destination = prefs ? "/dashboard" : "/onboarding"; // dashboard if prefs exist
  }

  // Redirect user to onboarding or dashboard
  return NextResponse.redirect(new URL(destination, req.url));
}
