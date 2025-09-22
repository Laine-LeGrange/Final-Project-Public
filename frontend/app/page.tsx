// Import LANDING PAGE components
import { Header } from "@/components/landing-page/Header";
import { HeroSection } from "@/components/landing-page/HeroSection";
import { HowItWorksSection } from "@/components/landing-page/HowItWorksSection";
import { FeaturesSection } from "@/components/landing-page/FeaturesSection";
import { FAQSection } from "@/components/landing-page/FAQSection";
import { Footer } from "@/components/landing-page/Footer";

// Main App component for the landing page
export default function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />

      <div id="hero" className="scroll-mt-28">
        <HeroSection />
      </div>

      <div id="how-it-works" className="scroll-mt-28">
        <HowItWorksSection />
      </div>

      <div id="features" className="scroll-mt-28">
        <FeaturesSection />
      </div>

      <div id="faq" className="scroll-mt-28">
        <FAQSection />
      </div>

      <Footer />
    </div>
  );
}
