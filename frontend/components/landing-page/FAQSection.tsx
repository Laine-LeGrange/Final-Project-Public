// FAQ Section Component
// This component displays a list of frequently asked questions in an accordion format.
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export function FAQSection() {
  const faqs = [
    { question: "What is Centry?", answer: "Centry is an AI-powered study assistant that helps you organize, understand, and learn from your study materials more effectively." },
    { question: "How does this work exactly?", answer: "Simply upload your study materials (PDFs, notes, videos) and start asking questions, generate summaries and quizzes. Our AI will provide intelligent responses based on your content." },
    { question: "Why choose this over other study apps?", answer: "Unlike generic tools, this platform adapts to your notes, your level, and your learning style. That means more effective studying, less wasted time, and a stress-free path to better results." },
    { question: "What makes it different from ChatGPT?", answer: "Generic AI tools often “hallucinate” or fail to personalise responses. Our RAG-powered system grounds answers in your own study materials and adds features like adaptive quizzing, multimodal input, and accessibility support." },
    { question: "What types of materials can I upload?", answer: "You can upload lecture notes, textbooks PDFs, research papers, slides, videos, images, and any other study-related materials." },
    { question: "is it accessible for students with disabilities?", answer: "Absolutely. The platform includes voice input, text-to-speech, and onboarding personalisation to support diverse learning needs." }
  ];

  return (
    <section className="w-full py-20 px-6 bg-muted">
      <div className="container mx-auto max-w-2xl">
        <div className="text-center mb-16">
          <h2 className="font-sans text-4xl mb-4 font-semibold tracking-tight">
            Frequently Asked Questions
          </h2>
        </div>

        <Accordion type="single" collapsible className="w-full">
          {faqs.map((faq, index) => (
            <AccordionItem key={index} value={`item-${index}`}>
              <AccordionTrigger className="font-sans pt-5 pb-5 text-md text-left">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="font-sans text-md text-muted-foreground">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
