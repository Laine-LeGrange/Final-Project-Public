// Footer component for the landing page
// This component includes a call-to-action section and a bottom area with links and branding.

import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Footer() {
  return (
    <footer className="w-full">
      {/* CTA section still adapts to theme */}
      <section className="w-full py-20 px-6 mt-24 mb-24">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="font-sans font-medium tracking-tight text-6xl mb-10 md:text-6xl leading-tighter">
            Study smarter. Learn faster.<br />
            Stress less.
          </h2>
          <Button size="lg" className="font-sans">
            Start Now
          </Button>
        </div>
      </section>

      {/* Bottom area is ALWAYS black */}
      <div className="bg-[#171717] text-white py-12 px-6">
        <div className="container mx-auto max-w-6xl">
          <div className="grid md:grid-cols-4 gap-8">
            <div className="md:col-span-1">
              <Link href="/" className="flex items-center gap-2 mb-6" aria-label="Centry home">
                <img
                  src="/svg/fullLogo.svg"
                  alt="Centry"
                  className="h-10 w-auto brightness-0 invert"
                />
              </Link>
            </div>

            <div>
              <h4 className="mb-4">Product</h4>
              <nav aria-label="Product">
                <ul className="font-sans text-white/70 space-y-2">
                  <li>
                    <Link href="#how-it-works" className="block hover:text-white transition-colors">
                      How It Works
                    </Link>
                  </li>
                  <li>
                    <Link href="#features" className="block hover:text-white transition-colors">
                      Features
                    </Link>
                  </li>
                  <li>
                    <Link href="#faq" className="block hover:text-white transition-colors">
                      FAQ
                    </Link>
                  </li>
                </ul>
              </nav>
            </div>
          </div>

          <div className="font-sans border-t border-white/20 mt-40 pt-8 text-left text-white/70">
            <p>&copy; 2025 Centry. All rights reserved.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
