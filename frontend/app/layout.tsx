// ROOT LAYOUT for entire app

// Import necessary modules and components
import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { ProfileUserProvider } from "@/components/providers/ProfileUserProvider";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "katex/dist/katex.min.css";

// Configure fonts
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Metadata for the app
export const metadata: Metadata = {
  title: "Centry App",
  description: "Multimodal RAG app",
  icons: { icon: [{ url: "../../icon.png", type: "image/svg+xml" }] },
};

// Root layout component
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <ProfileUserProvider>
            {children}
          </ProfileUserProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
