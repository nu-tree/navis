import type { Metadata } from "next";
import { RelayScreen } from "@/features/relay/relay-screen";

export const metadata: Metadata = { title: "말 걸기 · 나비스" };

export default async function Page() {
  return <RelayScreen />;
}
