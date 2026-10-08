// 기간 조회 응답 — 프로젝트별 묶음, 묶음 안은 시간순.
import { describe, expect, it } from "vitest";
import type { Memory } from "@navis/validation";
import { formatByProject } from "./format";
import { projectKey } from "./projects";

const m = (content: string, project: string | null, createdAt: string): Memory => ({
  id: content,
  content,
  category: null,
  project,
  tags: [],
  done: null,
  createdAt,
});

describe("formatByProject()", () => {
  const out = formatByProject([
    m("C", "navis", "2026-10-07T05:00:00.000Z"),
    m("개인", null, "2026-10-07T01:00:00.000Z"),
    m("A", "navis", "2026-10-07T01:00:00.000Z"),
    m("S", "soop-sns", "2026-10-07T03:00:00.000Z"),
  ]);

  it("많은 프로젝트부터, 개인은 맨 뒤", () => {
    const heads = out.split("\n").filter((l) => l.startsWith("## "));
    expect(heads).toEqual(["## navis (2건)", "## soop-sns (1건)", "## (개인) (1건)"]);
  });

  it("묶음 안은 오래된 것 먼저, 시각은 KST", () => {
    expect(out).toContain("- [10-07 10:00] A\n- [10-07 14:00] C");
  });
});

describe("projectKey()", () => {
  it("표기만 다른 이름을 같은 키로 접는다", () => {
    expect(projectKey("soopsns")).toBe(projectKey("soop-sns"));
    expect(projectKey("Soop_SNS")).toBe(projectKey("soop sns"));
  });

  it("다른 이름은 접지 않는다", () => {
    expect(projectKey("navis")).not.toBe(projectKey("nevis"));
  });

  it("한글도 남긴다", () => {
    expect(projectKey("구미 공모전")).toBe("구미공모전");
  });
});
