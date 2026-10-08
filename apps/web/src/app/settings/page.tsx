import type { Metadata } from "next";
import { SettingsScreen } from "@/features/settings/settings-screen";

export const metadata: Metadata = { title: "설정 · 나비스" };

export default async function Page() {
  return <SettingsScreen />;
}
