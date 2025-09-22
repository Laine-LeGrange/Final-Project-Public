"use client";
// Mark as client component

// import necessary modules
import * as React from "react";
import { supabaseBrowser } from "@/app/lib/supabase-browser";

// Define the ProfileUser type
export type ProfileUser = {
  id: string;
  email: string;
  name: string;
  surname: string;
  profileImage?: string;
  isDarkMode: boolean;
};

// Options for the hook
type Options = {
  enabled?: boolean;
  refetchInterval?: number;
  refetchOnWindowFocus?: boolean;
  cacheMaxAgeMs?: number; 
};

// Define the state structure
type State = {
  user: ProfileUser | null;
  loading: boolean;
  error?: string | null;
  hasLoadedOnce: boolean;
};

// Cache versioning
const CACHE_VERSION = 1;
const cacheKey = (uid: string) => `centry:profile:${uid}`;

// Custom hook to manage and fetch the profile user
export function useProfileUser(opts: Options = {}) {
  const {
    enabled = true,
    refetchInterval = 5000,
    refetchOnWindowFocus = true,
    cacheMaxAgeMs = 60_000,
  } = opts;

  // Initialize supabase borwser
  const supabase = React.useMemo(() => supabaseBrowser(), []);
  const [state, setState] = React.useState<State>({
    user: null,
    loading: true,
    error: null,
    hasLoadedOnce: false,
  });

  // Function to map database row to ProfileUser
  const mapRow = React.useCallback(
    (
      authUser: NonNullable<Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"]>,
      prof: any
    ): ProfileUser => ({
      id: authUser.id,
      email: authUser.email ?? "",
      name: prof?.first_name ?? "",
      surname: prof?.last_name ?? "",
      profileImage: prof?.avatar_url ?? undefined,
      isDarkMode: (prof?.theme ?? "light") === "dark",
    }),
    []
  );

  // Functions to handle caching
  const writeCache = (uid: string, data: ProfileUser) => {
    try {
      // Write to local storage
      localStorage.setItem(
        cacheKey(uid),
        JSON.stringify({ v: CACHE_VERSION, at: Date.now(), data })
      );
    } catch {
    }
  };

  // Read from local storage cache
  const readCache = (uid: string): { data: ProfileUser; at: number } | null => {
    try {
      // Read and validate cache
      const raw = localStorage.getItem(cacheKey(uid));
      if (!raw) return null;

      // Parse and validate version
      const parsed = JSON.parse(raw);
      if (parsed?.v !== CACHE_VERSION) return null;
      return { data: parsed.data as ProfileUser, at: parsed.at as number };
    } catch {
      return null;
    }
  };

  // Clear cache for a specific user ( or all users from testing and dev stage)
  const clearCache = (uid?: string) => {
    try {
      if (uid) localStorage.removeItem(cacheKey(uid));
      else {
        Object.keys(localStorage)
          .filter((k) => k.startsWith("centry:profile:"))
          .forEach((k) => localStorage.removeItem(k));
      }
    } catch {
    }
  };

  // Load user profile data
  const load = React.useCallback(async () => {
    if (!enabled) return;

    try {
      // Set loading state
      setState((s) => ({ ...s, loading: s.hasLoadedOnce ? s.loading : true, error: null }));

      // Fetch authenticated user
      const { data: auth } = await supabase.auth.getUser();
      const authed = auth?.user;
      if (!authed) {
        // No authenticated user
        setState({ user: null, loading: false, error: null, hasLoadedOnce: true });
        return;
      }

      // Fetch profile from database
      const { data: prof, error: pErr } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", authed.id)
        .maybeSingle();
      if (pErr) throw pErr;

      // Map and set state
      const mapped = mapRow(authed, prof);
      setState({ user: mapped, loading: false, error: null, hasLoadedOnce: true });

      // Update cache
      writeCache(authed.id, mapped);

      // Handle errors
    } catch (e: any) {
      setState((s) => ({
        ...s,
        loading: false,
        error: e?.message ?? "Failed to load profile",
        hasLoadedOnce: true,
      }));
    }
  }, [enabled, supabase, mapRow]);

  // Initial load and cache check
  React.useEffect(() => {
    if (!enabled) return;

    (async () => {
      // Get authenticated user
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) {
        // Set state if no user
        setState({ user: null, loading: false, error: null, hasLoadedOnce: true });
        return;
      }

      // Check cache
      const cached = readCache(uid);
      const now = Date.now();

      // If cache is valid, use it
      if (cached) {
        setState({
          user: cached.data,
          loading: false, 
          error: null,
          hasLoadedOnce: true,
        });
      }

      // If no valid cache, or cache is stale, load fresh data
      if (cached && now - cached.at < cacheMaxAgeMs) return;
      void load();
    })();

  }, [enabled]);

// Listen to auth changes
  React.useEffect(() => {
    // Subscribe to supabase auth changes
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {

      // Handle different auth events
      if (event === "SIGNED_OUT") {

        // Clear cache and reset state on sign out
        clearCache(session?.user?.id);
        setState({ user: null, loading: false, error: null, hasLoadedOnce: true });

      // If signed in or user updated, reload profile
      } else if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        const uid = session?.user?.id;
        if (uid) {
          const cached = readCache(uid);
          if (cached) {

            // Use cached data if available
            setState({ user: cached.data, loading: false, error: null, hasLoadedOnce: true });
          }
        }
        void load();
      }
    });
    // Cleanup subscription on unmount
    return () => sub?.subscription.unsubscribe();
  }, [supabase, load]);

  // Set up periodic refetching
  React.useEffect(() => {
    if (!enabled || !refetchInterval || refetchInterval <= 0) return;

    // Set up interval for refetching
    const id = setInterval(() => {
      if (document.hidden) return;
      void load();
    }, refetchInterval);

    // Cleanup on unmount
    return () => clearInterval(id);
  }, [enabled, refetchInterval, load]);

  return { user: state.user, loading: state.loading, error: state.error, refresh: load };
}
