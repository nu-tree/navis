import type { Metadata } from "next";
import { MemoryScreen } from "@/features/memory/memory-screen";

export const metadata: Metadata = { title: "기억 · 나비스" };

export default async function Page() {
  return <MemoryScreen />;
}
