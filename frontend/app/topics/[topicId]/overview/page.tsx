// Import AppShell component
import AppShell from "@/components/AppShell";

// Topic overview page component
export default async function TopicOverviewPage({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;

  // Render AppShell, initializing it to the topic overview view for this topic
  return <AppShell initialView={{ type: "topic", topicId, page: "overview" }} />;
}