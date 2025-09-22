// Mark as client component
"use client";

// Import necessary modules and components
import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

// ThemeProvider component to manage application themes
export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    // Wrap children with NextThemesProvider for theme management
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      storageKey="centry-theme"
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}