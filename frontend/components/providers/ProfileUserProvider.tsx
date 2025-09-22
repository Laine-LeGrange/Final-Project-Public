"use client";
// Mark as client component

// Import React and custom hook for profile user data
import * as React from "react";
import { useProfileUser, ProfileUser } from "@/hooks/useProfileUser";

// Define context type
type Ctx = {
  user: ProfileUser | null;
  loading: boolean;
  error?: string | null;
  refresh: () => Promise<void>;
};

// Create context for profile user data
const ProfileUserContext = React.createContext<Ctx | undefined>(undefined);

// Provider component to supply profile user data to its children
export function ProfileUserProvider({
  children,
  // fetch options
  refetchInterval = 5000, 
  refetchOnWindowFocus = true
}: {
  children: React.ReactNode;
  refetchInterval?: number;
  refetchOnWindowFocus?: boolean;
}) {
  // Use custom hook to fetch profile user data from backend
  const { user, loading, error, refresh } = useProfileUser({
    refetchInterval,
    refetchOnWindowFocus,
    enabled: true,
  });

  // Memoize the context value to make it faster
  const value = React.useMemo(() => ({ user, loading, error, refresh }), [user, loading, error, refresh]);

  // Provide context to children components
  return <ProfileUserContext.Provider value={value}>{children}</ProfileUserContext.Provider>;
}

// Custom hook to access profile user context
export function useProfileUserCtx() {
  const ctx = React.useContext(ProfileUserContext);
  if (!ctx) throw new Error("useProfileUserCtx must be used inside <ProfileUserProvider>");
  return ctx;
}
