// Import AppShell component
import AppShell from "@/components/AppShell";

// Topic quizzes page component
export default async function TopicQuizzesPage({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;
  // Render AppShell, initializing it to the topic quizzes view for this topic
  return <AppShell initialView={{ type: "topic", topicId, page: "quizzes" }} />;
}