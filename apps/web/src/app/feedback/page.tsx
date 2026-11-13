import type { Metadata } from "next";
import { AppFrame } from "@/components/layout/app-frame";
import { FeedbackScreen } from "@/features/feedback/feedback-screen";

export const metadata: Metadata = { title: "피드백 · 나비스" };

export default async function Page() {
  return (
    <AppFrame>
      <FeedbackScreen />
    </AppFrame>
  );
}
