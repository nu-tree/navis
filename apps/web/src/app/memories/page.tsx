import type { Metadata } from "next";
import { AppFrame } from "@/components/layout/app-frame";
import { MemoryScreen } from "@/features/memory/memory-screen";

export const metadata: Metadata = { title: "기억 · 나비스" };

export default async function Page() {
  return (
    <AppFrame>
      <MemoryScreen />
    </AppFrame>
  );
}
