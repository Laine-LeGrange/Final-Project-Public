// How It Works Section Component
// Explains the three main steps of using the Centry app with icons and descriptions.

import { Upload, MessageSquare, Trophy } from "lucide-react";
import { Card } from "@/components/ui/card";

export function HowItWorksSection() {
  const steps = [
    { icon: Upload, title: "Step 1", description: "Upload your study materials (PDFs, handwritten notes, lecture audio)." },
    { icon: MessageSquare, title: "Step 2", description: "Ask questions in text or voice." },
    { icon: Trophy, title: "Step 3", description: "Get grounded answers, personalised summaries, or on-the-fly quizzes." },
  ];

  return (
    <section className="w-full py-20 px-6 bg-muted">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-16">
          <h2 className="font-sans text-4xl mb-4 font-semibold tracking-tight">How It Works</h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {steps.map(({ icon: Icon, title, description }, i) => (
            <Card
              key={i}
              className="relative border border-border rounded-xl bg-card p-8 shadow-none flex flex-col"
            >
              <Icon className="w-12 h-12 text-primary" />

              <div className="mt-auto pt-16">
                <h3 className="font-sans font-semibold text-2xl mb-2">{title}</h3>
                <p className="font-sans text-muted-foreground leading-relaxed min-h-[3.25rem]">
                  {description}
                </p>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
