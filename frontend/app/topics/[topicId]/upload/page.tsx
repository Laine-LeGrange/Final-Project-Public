// Import app shell component
import AppShell from "@/components/AppShell";

// Topic upload page component
export default async function TopicUploadPage({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params; 
  // Render AppShell, initializing it to the topic upload view for this topic
  return <AppShell initialView={{ type: "topic", topicId, page: "upload" }} />;
}