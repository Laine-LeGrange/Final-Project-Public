// Import appshell component
import AppShell from "@/components/AppShell";

// Topic settings page component
export default async function TopicSettingsPage({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;

  // Render AppShell, initializing it to the topic settings view for this topic
  return <AppShell initialView={{ type: "topic", topicId, page: "settings" }} />;
}