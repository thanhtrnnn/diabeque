import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentStep } from "@/lib/chat-stream-contract";
import { SCENARIO_FILE, parseScenarioFile, type Scenario } from "@/lib/factory/scenarios";
import { STEP_MS, useFactoryRun } from "@/lib/factory/use-factory-run";
import {
  agentErrorEvents,
  answeredEvents,
  frames,
  needsInfoEvents,
  sse,
  step,
  type StreamEvent,
} from "@/test/stream-fixtures";

const encoder = new TextEncoder();

interface Call { body: Record<string, unknown>; signal: AbortSignal }

/** Each handler answers one POST in turn; the last one repeats. */
function stubFetch(...handlers: Array<() => Response | Promise<Response>>): Call[] {
  const calls: Call[] = [];
  let n = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: string, init: RequestInit) => {
    if (String(input) !== "/api/chat/stream") throw new Error(`unexpected request ${String(input)}`);
    calls.push({ body: JSON.parse(String(init.body)), signal: init.signal as AbortSignal });
    return handlers[Math.min(n++, handlers.length - 1)]();
  }));
  return calls;
}

/** A body the test feeds by hand; it never closes on its own. */
function openStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start: (c) => { controller = c; } });
  const response = new Response(body, { headers: { "Content-Type": "text/event-stream" } });
  return {
    response,
    push: (events: StreamEvent[], from = 0) => {
      // Re-number so the frames continue the sequence the earlier pushes started.
      const text = frames(events).replace(/^id: (\d+)$/gm, (_, id) => `id: ${Number(id) + from}`).replace(/"seq":(\d+)/g, (_, seq) => `"seq":${Number(seq) + from}`);
      controller.enqueue(encoder.encode(text));
    },
    fail: (error: Error) => controller.error(error),
    close: () => controller.close(),
  };
}

const flush = (ms = 0) => act(() => vi.advanceTimersByTimeAsync(ms));

const stepped = (log: { text: string; station: string | null }[], since = 0) =>
  log.slice(since).filter((entry) => entry.station && entry.station !== "gate" && entry.station !== "exit").map((entry) => entry.station);

const s = (agent: string, summary = `tóm tắt ${agent}`): AgentStep => step(agent, agent, summary, 5);

const SCENARIOS: Scenario[] = [
  {
    id: "khan-cap", label: "Khẩn cấp",
    turns: [{ message: "Tôi đau ngực dữ dội", steps: [s("safety_in"), s("safety_out")], sections: [{ kind: "emergency", title: "Cần đi khám ngay", text: "Gọi 115." }] }],
  },
  {
    id: "nguy-co", label: "Nguy cơ hai lượt",
    turns: [
      { message: "Tôi 52 tuổi", steps: [s("safety_in"), s("orchestrator"), s("intake"), s("safety_out")], sections: [{ kind: "question", title: "Cần thêm thông tin", text: "Cholesterol?" }] },
      { message: "Không mỡ máu", steps: [s("safety_in"), s("orchestrator"), s("intake"), s("risk"), s("advisor"), s("safety_out")], sections: [{ kind: "risk", title: "Ước lượng nguy cơ", text: "13%" }] },
    ],
  },
];

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useFactoryRun: live turns", () => {
  it("posts the question and reveals the steps in order, one per beat", async () => {
    const calls = stubFetch(() => sse(answeredEvents()));
    const { result } = renderHook(() => useFactoryRun({ reducedMotion: false, scenarios: SCENARIOS }));

    act(() => result.current.ask("Người tiền đái tháo đường nên ăn gì?", false));
    expect(result.current.busy).toBe(true);
    expect(result.current.state.turn).toBe(1);
    expect(result.current.state.stations.gate).toBe("active");
    await flush();

    expect(calls).toHaveLength(1);
    expect(Object.keys(calls[0].body).sort()).toEqual(["conversation_id", "message"]);
    expect(String(calls[0].body.conversation_id)).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.current.state.current).toBe("safety_in");
    expect(result.current.pendingSteps).toBe(3);

    await flush(STEP_MS - 1);
    expect(result.current.state.current).toBe("safety_in");
    await flush(1);
    expect(result.current.state.current).toBe("orchestrator");
    expect(result.current.pendingSteps).toBe(2);

    await flush(STEP_MS * 4);
    const { state } = result.current;
    expect(stepped(state.log)).toEqual(["safety_in", "orchestrator", "knowledge", "safety_out"]);
    expect(state.stations.exit).toBe("done");
    expect(state.litTracks).toEqual(["in", "main1", "toKnowledge", "knowledgeOut", "out"]);
    expect(result.current.busy).toBe(false);
    expect(result.current.pendingSteps).toBe(0);
  });

  it("keeps one conversation id across turns, asks for the outage only when switched on, and starts a new one on reset", async () => {
    const calls = stubFetch(() => sse(needsInfoEvents()));
    const { result } = renderHook(() => useFactoryRun({ reducedMotion: false, scenarios: SCENARIOS }));

    act(() => result.current.ask("một", false));
    await flush(STEP_MS * 10);
    act(() => result.current.ask("hai", true));
    await flush(STEP_MS * 10);
    expect(calls[1].body.conversation_id).toBe(calls[0].body.conversation_id);
    expect(calls[1].body.simulate).toBe("llm_down");
    expect(calls[0].body).not.toHaveProperty("simulate");
    expect(result.current.state.turn).toBe(2);

    act(() => result.current.reset());
    expect(result.current.state.turn).toBe(0);
    expect(result.current.state.log).toEqual([]);
    act(() => result.current.ask("ba", false));
    await flush(STEP_MS * 10);
    expect(calls[2].body.conversation_id).not.toBe(calls[0].body.conversation_id);
    expect(result.current.state.turn).toBe(1);
  });

  it("marks the node an agent.error names, frees the input and lights no exit", async () => {
    const [started, agentError, streamError] = agentErrorEvents("knowledge");
    const events: StreamEvent[] = [started, ...answeredEvents().slice(1, 3), agentError, streamError];
    stubFetch(() => sse(events));
    const { result } = renderHook(() => useFactoryRun({ reducedMotion: false, scenarios: SCENARIOS }));

    act(() => result.current.ask("hỏi", false));
    await flush(STEP_MS * 5);
    const { state } = result.current;
    expect(state.stations.knowledge).toBe("error");
    expect(state.stations.orchestrator).toBe("done");
    expect(state.stations.exit).not.toBe("done");
    expect(state.litTracks).not.toContain("out");
    expect(Object.values(state.stations)).not.toContain("active");
    expect(state.log.some((entry) => entry.level === "error" && entry.text.includes("RuntimeError"))).toBe(true);
    expect(result.current.busy).toBe(false);
  });
});

describe("useFactoryRun: stream breaks mid-turn", () => {
  it("marks the gate failed and frees the input when the network is down", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const { result } = renderHook(() => useFactoryRun({ reducedMotion: false, scenarios: SCENARIOS }));
    act(() => result.current.ask("hỏi", false));
    await flush();
    expect(result.current.state.stations.gate).toBe("error");
    expect(result.current.state.caption).toContain("Không kết nối được");
    expect(result.current.busy).toBe(false);
    expect(Object.values(result.current.state.stations)).not.toContain("active");
  });

  it("marks the station it was waiting on failed when the reader throws", async () => {
    const stream = openStream();
    stubFetch(() => stream.response);
    const { result } = renderHook(() => useFactoryRun({ reducedMotion: false, scenarios: SCENARIOS }));
    act(() => result.current.ask("hỏi", false));
    await flush();
    stream.push(answeredEvents().slice(0, 3));
    await flush(STEP_MS * 2);
    expect(result.current.state.current).toBe("orchestrator");
    expect(result.current.busy).toBe(true);

    stream.fail(new TypeError("network error"));
    await flush(STEP_MS);
    expect(result.current.state.stations.orchestrator).toBe("error");
    expect(Object.values(result.current.state.stations)).not.toContain("active");
    expect(result.current.busy).toBe(false);
  });

  it("marks the last station failed when the body ends without a final answer", async () => {
    stubFetch(() => sse(answeredEvents().slice(0, 4)), () => sse(answeredEvents()));
    const { result } = renderHook(() => useFactoryRun({ reducedMotion: false, scenarios: SCENARIOS }));
    act(() => result.current.ask("hỏi", false));
    await flush(STEP_MS * 5);
    expect(result.current.state.stations.knowledge).toBe("error");
    expect(result.current.state.caption).toContain("kết thúc trước");
    expect(result.current.busy).toBe(false);

    act(() => result.current.ask("hỏi lại", false));
    await flush(STEP_MS * 6);
    expect(result.current.state.stations.exit).toBe("done");
    expect(result.current.busy).toBe(false);
  });

  it("reports an HTTP failure from the BFF on the gate", async () => {
    stubFetch(() => Response.json({ error: { message: "Dịch vụ tạm thời không khả dụng." } }, { status: 502 }));
    const { result } = renderHook(() => useFactoryRun({ reducedMotion: false, scenarios: SCENARIOS }));
    act(() => result.current.ask("hỏi", false));
    await flush();
    expect(result.current.state.stations.gate).toBe("error");
    expect(result.current.state.caption).toContain("Dịch vụ tạm thời không khả dụng.");
    expect(result.current.busy).toBe(false);
  });
});

describe("useFactoryRun: a new run cancels the old one", () => {
  it("aborts the fetch when a scenario starts and lets no stale step land", async () => {
    const stream = openStream();
    const calls = stubFetch(() => stream.response);
    const { result } = renderHook(() => useFactoryRun({ reducedMotion: false, scenarios: SCENARIOS }));
    act(() => result.current.ask("hỏi", false));
    await flush();
    // Every step arrives at once: one is shown, three wait in the queue.
    stream.push(answeredEvents().slice(0, 5));
    await flush();
    expect(result.current.pendingSteps).toBe(3);

    const since = result.current.state.log.length;
    act(() => result.current.play("khan-cap"));
    expect(calls[0].signal.aborted).toBe(true);
    stream.push(answeredEvents().slice(5), 5);
    await flush(STEP_MS * 10);

    const { state } = result.current;
    expect(stepped(state.log, since)).toEqual(["safety_in", "safety_out"]);
    expect(state.stations.orchestrator).toBe("skipped");
    expect(state.stations.knowledge).toBe("skipped");
    expect(state.litTracks).toEqual(["in", "emergency", "out"]);
    expect(state.log.slice(since).some((entry) => entry.text.includes("Tra cứu"))).toBe(false);
    expect(result.current.busy).toBe(false);
  });

  it("aborts the previous question when a new one is asked", async () => {
    const stream = openStream();
    const calls = stubFetch(() => stream.response, () => sse(needsInfoEvents()));
    const { result } = renderHook(() => useFactoryRun({ reducedMotion: false, scenarios: SCENARIOS }));
    act(() => result.current.ask("một", false));
    await flush();
    stream.push(answeredEvents().slice(0, 4));
    await flush();
    const since = result.current.state.log.length;
    act(() => result.current.ask("hai", false));
    expect(calls[0].signal.aborted).toBe(true);
    stream.push(answeredEvents().slice(4), 4);
    await flush(STEP_MS * 10);
    expect(stepped(result.current.state.log, since)).toEqual(["safety_in", "orchestrator", "intake", "safety_out"]);
    expect(result.current.state.stations.knowledge).toBe("skipped");
  });

  it("stops on cancel without leaving an active station", async () => {
    const stream = openStream();
    const calls = stubFetch(() => stream.response);
    const { result } = renderHook(() => useFactoryRun({ reducedMotion: false, scenarios: SCENARIOS }));
    act(() => result.current.ask("hỏi", false));
    await flush();
    stream.push(answeredEvents().slice(0, 3));
    await flush();
    act(() => result.current.cancel());
    expect(calls[0].signal.aborted).toBe(true);
    expect(result.current.busy).toBe(false);
    expect(result.current.pendingSteps).toBe(0);
    await flush(STEP_MS * 5);
    expect(Object.values(result.current.state.stations)).not.toContain("active");
    expect(Object.values(result.current.state.stations)).not.toContain("error");
  });

  it("ignores an unknown scenario", async () => {
    stubFetch(() => sse(answeredEvents()));
    const { result } = renderHook(() => useFactoryRun({ reducedMotion: false, scenarios: SCENARIOS }));
    const before = result.current.state;
    act(() => result.current.play("khong-co"));
    expect(result.current.state).toBe(before);
    expect(result.current.busy).toBe(false);
  });
});

describe("useFactoryRun: backend restarted between turns", () => {
  it("runs a turn whose trace restarts intake on the old conversation id without errors", async () => {
    const calls = stubFetch(() => sse(needsInfoEvents()));
    const { result } = renderHook(() => useFactoryRun({ reducedMotion: false, scenarios: SCENARIOS }));
    act(() => result.current.ask("Tôi 52 tuổi, cao huyết áp", false));
    await flush(STEP_MS * 10);
    expect(result.current.state.litTracks).toContain("loop");

    // The backend lost its memory: the second turn asks again from scratch.
    act(() => result.current.ask("Không mỡ máu", false));
    await flush(STEP_MS * 10);
    const { state } = result.current;
    expect(calls[1].body.conversation_id).toBe(calls[0].body.conversation_id);
    expect(state.turn).toBe(2);
    expect(state.log.filter((entry) => entry.level === "error")).toEqual([]);
    expect(state.stations.intake).toBe("done");
    expect(state.stations.memory).toBe("done");
    expect(state.litTracks).toEqual(["in", "main1", "toIntake", "missing", "out", "loop"]);
    expect(result.current.busy).toBe(false);
  });
});

describe("useFactoryRun: recorded scenarios", () => {
  it("plays every turn, counts turns and waits on intake after a question", async () => {
    const calls = stubFetch(() => sse(answeredEvents()));
    const { result } = renderHook(() => useFactoryRun({ reducedMotion: false, scenarios: SCENARIOS }));
    act(() => result.current.play("nguy-co"));
    expect(result.current.state.turn).toBe(1);
    await flush(STEP_MS * 4);
    expect(result.current.state.litTracks).toContain("loop");
    expect(result.current.state.stations.memory).toBe("done");
    expect(result.current.busy).toBe(true);

    await flush(STEP_MS);
    expect(result.current.state.turn).toBe(2);
    await flush(STEP_MS * 10);
    const { state } = result.current;
    expect(state.litTracks).toEqual(["in", "main1", "toIntake", "toRisk", "toAdvisor", "toSafeOut", "out"]);
    expect(state.stations.memory).toBe("skipped");
    expect(result.current.busy).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe("useFactoryRun: reduced motion", () => {
  it("shows the first step at once and holds each next one until next()", async () => {
    stubFetch(() => sse(answeredEvents()));
    const { result } = renderHook(() => useFactoryRun({ reducedMotion: true, scenarios: SCENARIOS }));
    act(() => result.current.ask("hỏi", false));
    await flush();
    expect(result.current.state.current).toBe("safety_in");
    await flush(STEP_MS * 20);
    expect(result.current.state.current).toBe("safety_in");
    expect(result.current.pendingSteps).toBe(3);
    expect(result.current.busy).toBe(true);

    act(() => result.current.next());
    expect(result.current.state.current).toBe("orchestrator");
    act(() => result.current.next());
    act(() => result.current.next());
    expect(result.current.state.current).toBe("safety_out");
    expect(result.current.pendingSteps).toBe(0);
    // Nothing else to hold for: the finish lands without another press.
    await flush();
    expect(result.current.state.stations.exit).toBe("done");
    expect(result.current.busy).toBe(false);
  });

  it("holds between scenario turns too", async () => {
    const { result } = renderHook(() => useFactoryRun({ reducedMotion: true, scenarios: SCENARIOS }));
    act(() => result.current.play("nguy-co"));
    for (let i = 0; i < 3; i++) act(() => result.current.next());
    await flush();
    expect(result.current.state.litTracks).toContain("loop");
    await flush(STEP_MS * 20);
    expect(result.current.state.turn).toBe(1);
    act(() => result.current.next());
    expect(result.current.state.turn).toBe(2);
  });
});

describe("scenarios file", () => {
  it("loads the committed file, which may hold no scenario yet", () => {
    expect(Array.isArray(SCENARIO_FILE.scenarios)).toBe(true);
  });

  it("drops malformed steps, sections and scenarios without throwing", () => {
    const parsed = parseScenarioFile({
      recorded_at: "2026-11-10T08:00:00Z", commit: "abc1234",
      scenarios: [
        { id: "a", label: "A", turns: [{ message: "m", steps: [{ agent: "safety_in", label: "x", summary: "", tools: [], ms: 1 }, { agent: 3 }, null], sections: [{ kind: "question", title: "t", text: "q" }, { kind: 1 }] }] },
        { id: "", label: "rỗng", turns: [] },
        "rác",
      ],
    });
    expect(parsed.recorded_at).toBe("2026-11-10T08:00:00Z");
    expect(parsed.scenarios).toHaveLength(1);
    expect(parsed.scenarios[0].turns[0].steps.map((x) => x.agent)).toEqual(["safety_in"]);
    expect(parsed.scenarios[0].turns[0].sections).toHaveLength(1);
    expect(parseScenarioFile(null)).toEqual({ recorded_at: null, commit: null, scenarios: [] });
  });
});
