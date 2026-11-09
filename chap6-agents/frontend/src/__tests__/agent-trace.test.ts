import { describe, expect, it } from "vitest";

import { fieldLabel, formatDuration, riskRows, totalMs, traceJson } from "@/lib/agent-trace";
import type { AgentRisk } from "@/lib/chat-stream-contract";

const risk: AgentRisk = {
  task: "status3", label: 2, label_name: "Báo cáo mắc đái tháo đường", topic: "diabetes_general", model: "mlp", defaulted: [],
  probs: { "2": 0.35, "0": 0.45, "1": 0.2 }, probs_population: { "2": 0.13, "0": 0.84, "1": 0.03 },
};

describe("formatDuration", () => {
  it("uses milliseconds below a second and Vietnamese-formatted seconds above", () => {
    expect(formatDuration(0)).toBe("0 ms");
    expect(formatDuration(516)).toBe("516 ms");
    expect(formatDuration(11562)).toBe("11,6 s");
  });

  it("sums the steps", () => {
    expect(totalMs([{ ms: 10 }, { ms: 5 }].map((step) => ({ ...step, agent: "a", label: "A", summary: "", tools: [] })))).toBe(15);
  });
});

describe("traceJson", () => {
  it("pretty-prints small values untouched", () => {
    expect(traceJson({ bmi: 29.4 })).toEqual({ text: '{\n  "bmi": 29.4\n}', truncated: false });
  });

  it("cuts a long payload and says so", () => {
    const { text, truncated } = traceJson({ hits: Array.from({ length: 200 }, (_, i) => `chunk-${i}`) }, 100);
    expect(truncated).toBe(true);
    expect(text.length).toBeLessThanOrEqual(101);
    expect(text.endsWith("…")).toBe(true);
  });

  it("survives values JSON cannot encode", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(traceJson(circular).text).toBe("[object Object]");
    expect(traceJson(undefined).text).toBe("undefined");
  });
});

describe("riskRows", () => {
  it("prefers the population probabilities and orders classes by code", () => {
    const { rows, population } = riskRows(risk);
    expect(population).toBe(true);
    expect(rows.map((row) => [row.name, row.probability, row.predicted])).toEqual([
      ["Không báo cáo mắc bệnh", 0.84, false],
      ["Tiền đái tháo đường", 0.03, false],
      ["Báo cáo mắc đái tháo đường", 0.13, true],
    ]);
  });

  it("falls back to the calibrated probabilities when the backend has no population view", () => {
    const { rows, population } = riskRows({ ...risk, probs_population: null });
    expect(population).toBe(false);
    expect(rows.map((row) => row.probability)).toEqual([0.45, 0.2, 0.35]);
  });

  it("names the two diabetes types for the diabtype task", () => {
    const { rows } = riskRows({ ...risk, task: "diabtype", label: 2, probs: { "1": 0.3, "2": 0.7 }, probs_population: null });
    expect(rows.map((row) => row.name)).toEqual(["Type 1", "Type 2"]);
  });
});

describe("fieldLabel", () => {
  it("translates the required fields and leaves others as they are", () => {
    expect(fieldLabel("HighChol")).toBe("Mỡ máu cao");
    expect(fieldLabel("Income")).toBe("Income");
  });
});
