// Import AppShell component
import AppShell from "@/components/AppShell";

// Topic chat page component
export default async function TopicChatPage({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;
  // Render AppShell, initializing it to the topic chat view for this topic
  return <AppShell initialView={{ type: "topic", topicId, page: "chat" }} />;
}
