// Import redirect function from Next.js
import { redirect } from "next/navigation";

// Redirect to the overview page of the topic
export default function TopicIndex({
  params: { topicId },
}: {
  params: { topicId: string };
}) {
  // Redirect to the overview page for the given topicId
  redirect(`/topics/${topicId}/overview`);
}