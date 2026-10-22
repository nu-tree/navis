import type { Metadata } from "next";
import { SETTINGS_TABS, SettingsScreen, type SettingsTab } from "@/features/settings/settings-screen";

export const metadata: Metadata = { title: "설정 · 나비스" };

export default async function Page(props: PageProps<"/settings">) {
  // ?tab= 으로 탭을 고른다(새로고침 · 다른 화면의 링크). 모르는 값이면 첫 탭.
  const { tab } = await props.searchParams;
  const initialTab = SETTINGS_TABS.find((t) => t === tab) as SettingsTab | undefined;
  return <SettingsScreen initialTab={initialTab} />;
}
