import { describe, expect, it } from "vitest";

import type { AgentStep } from "@/lib/chat-stream-contract";
import { SWITCH_TRACKS, castCues, fieldsCount, isEmergency, moodFor, riskShare, switchTarget } from "@/lib/factory/cues";
import { initialRunState, reduce, type RunEvent, type RunState } from "@/lib/factory/run-state";

const step = (agent: string, summary: string, extra: Partial<AgentStep> = {}): AgentStep => ({
  agent, label: agent, summary, tools: [], ms: 5, ...extra,
});
const play = (events: RunEvent[], from: RunState = initialRunState()) => events.reduce(reduce, from);
const start: RunEvent = { type: "start", turn: 1 };
const s = (agent: string, summary: string, extra: Partial<AgentStep> = {}): RunEvent => ({ type: "step", step: step(agent, summary, extra) });

describe("switchTarget", () => {
  it("throws the switch on the orchestrator step, before the branch belt is lit", () => {
    const state = play([start, s("safety_in", "Không có dấu hiệu khẩn cấp"), s("orchestrator", "Ý định: knowledge (LLM: hỏi định nghĩa)")]);
    expect(state.litTracks).not.toContain("toKnowledge");
    expect(switchTarget(state)).toBe("toKnowledge");
  });

  it("maps each backend intent to its exit", () => {
    const at = (summary: string) => switchTarget(play([start, s("safety_in", "ok"), s("orchestrator", summary)]));
    expect(at("Ý định: assess_risk (luật dự phòng (ConnectError))")).toBe("toIntake");
    expect(at("Ý định: greeting (LLM: chào)")).toBe("direct");
    expect(at("Ý định: out_of_scope (LLM: thời tiết)")).toBe("direct");
    expect(at("Ý định: đánh giá nguy cơ.")).toBe("toIntake");
  });

  it("trusts a lit branch belt over the summary", () => {
    const state = play([start, s("safety_in", "ok"), s("orchestrator", "không rõ"), s("intake", "Có 4/7 trường")]);
    expect(switchTarget(state)).toBe("toIntake");
  });

  it("parks before the orchestrator runs and at the start of a new turn", () => {
    const done = play([start, s("safety_in", "ok"), s("orchestrator", "Ý định: knowledge (LLM)")]);
    expect(switchTarget(play([start]))).toBeNull();
    expect(switchTarget(reduce(done, { type: "start", turn: 2 }))).toBeNull();
    expect(castCues(play([start])).switchIndex).toBe(-1);
    expect(castCues(done).switchIndex).toBe(SWITCH_TRACKS.indexOf("toKnowledge"));
  });
});

describe("moods", () => {
  it("works while active, idles otherwise, hops only when idle and hovered", () => {
    const state = play([start, s("safety_in", "ok")]);
    expect(moodFor("safety_in", state, null)).toBe("work");
    expect(moodFor("orchestrator", state, null)).toBe("idle");
    expect(moodFor("orchestrator", state, "orchestrator")).toBe("hover");
    expect(moodFor("safety_in", state, "safety_in")).toBe("work");
  });

  it("raises the gatekeeper's alarm on an emergency, for the whole turn", () => {
    const caught = play([start, s("safety_in", "Phát hiện dấu hiệu khẩn cấp, dừng luồng tư vấn")]);
    expect(isEmergency(caught)).toBe(true);
    expect(moodFor("safety_in", caught, null)).toBe("alarm");
    const finished = play([s("safety_out", "Gửi hướng dẫn 115"), { type: "finish", awaitingIntake: false }], caught);
    expect(finished.litTracks).toContain("emergency");
    expect(moodFor("safety_in", finished, null)).toBe("alarm");
    expect(isEmergency(play([start, s("safety_in", "Không có dấu hiệu khẩn cấp")]))).toBe(false);
  });

  it("alarms the worker whose agent errored", () => {
    const state = play([start, s("safety_in", "ok"), s("orchestrator", "Ý định: knowledge"), { type: "agentError", node: "knowledge", errorType: "X" }]);
    expect(moodFor("knowledge", state, null)).toBe("alarm");
  });

  it("opens the rule book when the orchestrator fell back to rules", () => {
    const state = play([start, s("safety_in", "ok"), s("orchestrator", "Ý định: assess_risk (luật dự phòng)", { fallback: "rules" })]);
    expect(castCues(state).ruleBook).toBe(true);
    expect(castCues(state).moods.orchestrator).toBe("work");
  });
});

describe("props", () => {
  it("reads the field count from the intake summary or the validated profile", () => {
    expect(fieldsCount(step("intake", "Có 4/7 trường, hỏi thêm 3 câu."))).toBe(4);
    expect(fieldsCount(step("intake", "Ghi nhận 5 trường; còn thiếu HighChol, PhysActivity"))).toBe(5);
    expect(fieldsCount(step("intake", "Hồ sơ đủ 7 trường bắt buộc (9 trường đã có)"))).toBe(7);
    expect(fieldsCount(step("intake", "xong", { tools: [{ name: "validate_profile", args: {}, result: { profile: { Age: 9, Sex: 1 } } }] }))).toBe(2);
    expect(fieldsCount(undefined)).toBeNull();
  });

  it("weighs the diabetes groups from the risk tool, else the summary percentage", () => {
    const tool = { name: "predict_diabetes_risk", args: {}, result: { probs: { "0": 0.2, "1": 0.5, "2": 0.3 }, probs_population: { "0": 0.7, "1": 0.2, "2": 0.1 } } };
    expect(riskShare(step("risk", "x", { tools: [tool] }))).toBeCloseTo(0.3);
    expect(riskShare(step("risk", "Tiền tiểu đường 35%."))).toBeCloseTo(0.35);
    expect(riskShare(step("risk", "không có số"))).toBeNull();
  });

  it("levels the balance and blanks the clipboard until their agents run this turn", () => {
    const first = play([start, s("safety_in", "ok"), s("orchestrator", "Ý định: assess_risk"), s("intake", "Có 4/7 trường"), s("risk", "35%")]);
    expect(castCues(first).fields).toBe(4);
    expect(castCues(first).tilt).toBeCloseTo(0.35);
    const next = reduce(first, { type: "start", turn: 2 });
    expect(castCues(next).fields).toBe(0);
    expect(castCues(next).tilt).toBeNull();
  });

  it("keeps the miner below from the knowledge step until the turn ends", () => {
    const below = play([start, s("safety_in", "ok"), s("orchestrator", "Ý định: knowledge"), s("knowledge", "5 đoạn")]);
    expect(castCues(below).minerBelow).toBe(true);
    expect(castCues(play([s("safety_out", "ok")], below)).minerBelow).toBe(true);
    expect(castCues(play([s("safety_out", "ok"), { type: "finish", awaitingIntake: false }], below)).minerBelow).toBe(false);
  });

  it("stamps red when the exit check removed a dosage sentence", () => {
    const base = play([start, s("safety_in", "ok"), s("orchestrator", "Ý định: greeting")]);
    expect(castCues(base).stamp).toBeNull();
    expect(castCues(play([s("safety_out", "Đã kiểm 2 phần do LLM viết")], base)).stamp).toBe("ok");
    expect(castCues(play([s("safety_out", "Đã kiểm 2 phần do LLM viết; cờ: dosage_removed")], base)).stamp).toBe("removed");
  });
});
