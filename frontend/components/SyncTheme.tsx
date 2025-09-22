// Mark as client component
"use client";

// Import necessary modules and components
import * as React from "react";
import { useTheme } from "next-themes";
import { useProfileUser } from "@/hooks/useProfileUser";
import { usePathname } from "next/navigation";

// Component to synchronize theme with user profile settings
export default function SyncThemeWithProfile() {

  // Determine if the current path is the landing page
  const pathname = usePathname();
  const isLanding = (pathname ?? "/") === "/"; 

  // Fetch user profile data if not on the landing page
  const { user, loading } = useProfileUser({ enabled: !isLanding });
  const { setTheme } = useTheme();

  // Effect to update theme based on user profile settings
  React.useEffect(() => {
    if (isLanding || loading) return; 

    // Set theme based on user's dark mode preference
    const value = user?.isDarkMode ? "dark" : "light";
    setTheme(value);
    // Check for localStorage data and set theme preference
    try { localStorage.setItem("centry-theme", value); } catch {}
  }, [isLanding, loading, user?.isDarkMode, setTheme]);

  return null;
}
