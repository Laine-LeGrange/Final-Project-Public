// Import necessary modules for server-side Supabase client
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// Function to create and return a Supabase client for server use
export async function supabaseServer() {
  const cookieStore = await cookies(); // get cookies

  // 
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          // Return all cookies from current request
          return cookieStore.getAll();
        },
        // Set cookies
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
          }
        },
      },
    }
  );
}