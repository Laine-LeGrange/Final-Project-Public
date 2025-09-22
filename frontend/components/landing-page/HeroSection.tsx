// Hero Section Component
// Displays the main hero section of the landing page with a headline, description, call-to-action button, and an image.

import { Button } from "@/components/ui/button";
import dashboardImage from "@/public/images/app-light-landing.png";
import dashboardDarkImage from "@/public/images/app-dark-landing.png";

export function HeroSection() {
  return (
    <section className="w-full py-20 px-6">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-6">
          <p className="font-sans text-lg font-medium text-muted-foreground mb-4">
            Made for students
          </p>

          <h1 className="font-sans text-7xl font-primary font-medium tracking-tight md:text-7xl mb-10 max-w-4xl mx-auto leading-tight md:leading-[1.02]">
            All your study materials.<br />
            One intelligent assistant.
          </h1>

          <p className="font-sans text-xl text-muted-foreground mb-12 max-w-3xl mx-auto">
            A multimodal learning platform powered by RAG. Upload your notes, recordings, and articles - get instant answers, summaries, and quizzes tailored to you.
          </p>

          <Button size="lg" className="font-sans">
            Get Started
          </Button>
        </div>

        <div className="relative max-w-8xl mx-auto">
          <img
            src={dashboardImage.src}
            alt="Centry Dashboard Light"
            className="w-full h-auto dark:hidden"
          />
          <img
            src={dashboardDarkImage.src}
            alt="Centry Dashboard Dark"
            className="w-full h-auto hidden dark:block"
          />
        </div>
      </div>
    </section>
  );
}
