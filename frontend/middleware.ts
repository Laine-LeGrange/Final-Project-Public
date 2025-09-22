// Import necessary modules
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Middleware to protect certain routes and manage supabase auth state
export async function middleware(req: NextRequest) {

  // start with default response
  let response = NextResponse.next({
    request: {
      headers: req.headers,
    },
  });

  // Create Supabase client with request cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Update cookies on the request
          cookiesToSet.forEach(({ name, value }) => {
            req.cookies.set(name, value);
          });
          response = NextResponse.next({
            request: req,
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Get the authenticated user
  const { data: { user } } = await supabase.auth.getUser();

  // Protect routes: if user is not authenticated, redirect to login
  const isProtected = req.nextUrl.pathname.startsWith("/dashboard") || 
                     req.nextUrl.pathname.startsWith("/topic");

  // If user is trying to access a protected route without being authenticated
  if (isProtected && !user) {
    const url = req.nextUrl.clone();

    // Store the original path to redirect back after login
    url.pathname = "/login";
    url.searchParams.set("redirectedFrom", req.nextUrl.pathname);

    // Redirect to login page
    return NextResponse.redirect(url);
  }

  return response;
}

// Apply middleware to specific routes
export const config = {
  matcher: ["/dashboard/:path*", "/topic/:path*"],
}