// 나비스 기능 안내. 지키는 것: 회원에게 관리자 전용 기능이 보이지 않는다 · 주제로 좁힌다 · 한도가 코드와 같다.
import { describe, expect, it } from "vitest";
import { PROMISE_ACTIVE_LIMIT } from "@navis/validation";
import { FEATURES, renderGuide } from "../../src/guide/index";

describe("renderGuide", () => {
  it("회원에게는 전하기가 없다 — 있다는 것도", () => {
    const text = renderGuide({ owner: false });
    expect(text).not.toContain("전하기");
    expect(text).not.toContain("관리자 전용");
  });

  it("관리자에게는 전하기까지 보인다", () => {
    expect(renderGuide({ owner: true })).toContain("전하기");
  });

  it("주제로 좁힌다 — MCP 를 물으면 AI 앱 연결만", () => {
    const text = renderGuide({ owner: false, topic: "MCP" });
    expect(text).toContain("AI 앱 연결");
    expect(text).not.toContain("약속");
  });

  it("화면 이름으로 물어도 찾는다 — 설정에 무엇이 있는지", () => {
    const text = renderGuide({ owner: false, topic: "설정" });
    expect(text).toContain("화면 지도");
    expect(text).toContain("AI 앱 연결");
    expect(text).toContain("알림");
  });

  it("사용량을 물으면 한도 · 어디서 보는지를 준다", () => {
    const text = renderGuide({ owner: false, topic: "사용량" });
    expect(text).toContain("5시간 한도");
    expect(text).toContain("'Claude' 탭");
  });

  it("맞는 주제가 없으면 전체를 준다", () => {
    expect(renderGuide({ owner: false, topic: "없는기능" })).toBe(renderGuide({ owner: false }));
  });

  it("회원 주제로 관리자 기능을 찾아도 나오지 않는다", () => {
    expect(renderGuide({ owner: false, topic: "relay" })).not.toContain("전하기");
  });

  it("약속 상한은 validation 의 값과 같다", () => {
    expect(renderGuide({ owner: false, topic: "약속" })).toContain(`${PROMISE_ACTIVE_LIMIT}개까지`);
  });

  it("id 가 겹치지 않는다", () => {
    expect(new Set(FEATURES.map((f) => f.id)).size).toBe(FEATURES.length);
  });
});
