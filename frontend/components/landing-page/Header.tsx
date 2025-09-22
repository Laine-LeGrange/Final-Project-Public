// Header Component
// Renders the navigation header with logo, links, and authentication buttons.

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";

export function Header() {
  return (
    <header className="w-full">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="my-2 md:my-4 rounded-sm bg-black text-white border dark:border-white/30 border-white/10 shadow-sm dark:shadow-2xl dark:shadow-white/8 dark:shadow-gray">
          <div className="flex items-center justify-between px-4 sm:px-6 py-3">
            <Link href="/" className="flex items-center gap-2" aria-label="Centry home">
              <img
                src="/svg/fullLogo.svg"
                alt="Centry"
                className="h-8 w-auto brightness-0 invert"
              />
            </Link>

            <nav className="hidden md:flex items-center gap-8">
              <a href="#how-it-works" className="font-sans text-white/90 hover:text-white">
                How It Works
              </a>
              <a href="#features" className="font-sans text-white/90 hover:text-white">
                Features
              </a>
              <a href="#faq" className="font-sans text-white/90 hover:text-white">
                FAQ
              </a>
            </nav>

            <div className="flex items-center gap-3">
              <ModeToggle />
              <Link href="/login" passHref>
                <Button
                  asChild
                  variant="outline"
                  className="font-sans bg-black hover:bg-black text-white/70 hover:text-white border border-white/70 hover:border-white"
                >
                  <span>Login</span>
                </Button>
              </Link>
              <Link href="/signup" passHref>
                <Button asChild className="font-sans bg-white text-black hover:bg-white/90">
                  <span>Sign up</span>
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
