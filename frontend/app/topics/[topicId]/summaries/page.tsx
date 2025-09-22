// Import app shell component
import AppShell from "@/components/AppShell";

// Topic summaries page component
export default async function TopicSummariesPage({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;
  // Render AppShell, initializing it to the topic summaries view for this topic
  return <AppShell initialView={{ type: "topic", topicId, page: "summaries" }} />;
}