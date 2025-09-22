// Features Section Component
// This component highlights the key features of the Centry appin a card layout.

import {
  Files,
  MessagesSquare,
  ScrollText,
  ListChecks,
  AudioLines,
  FolderTree,
} from "lucide-react";
import { Card } from "@/components/ui/card";

export function FeaturesSection() {
  const features = [
    { icon: Files, title: "Multimodal Uploads", description: "Text, images, audio, and video resources." },
    { icon: MessagesSquare, title: "Smart Q&A Chat", description: "Conversational interface offers intuitive interactions with your materials" },
    { icon: ScrollText, title: "Summarisation", description: "Quick concept overviews with 3 different summary options to save revision time." },
    { icon: ListChecks, title: "Dynamic Quizzing", description: "Instant practice questions tailored to your content and level." },
    { icon: AudioLines, title: "Accessible by Design", description: "Voice input/output and customisable learning preferences." },
    { icon: FolderTree, title: "Greater Organisation", description: "Archive old topics and filter topics by category, name and last activity." },
  ];

  return (
    <section className="w-full py-20 px-6">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-16">
          <h2 className="font-sans text-4xl mb-4 font-semibold tracking-tight">Features</h2>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map(({ icon: Icon, title, description }, i) => (
            <Card
              key={i}
              className="h-full rounded-xl bg-card p-6 shadow-none border border-border flex flex-col"
            >
              <Icon className="w-10 h-10 text-primary" />

              <div className="mt-auto pt-6">
                <h3 className="font-sans font-semibold text-xl mb-2">{title}</h3>
                <p className="font-sans text-muted-foreground leading-relaxed min-h-[3.25rem] line-clamp-2">
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
