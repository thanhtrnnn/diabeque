import { describe, expect, it } from "vitest";

import { countByLabel, type GraphNeighbor, groupNeighbors, layoutRadial, limitGroup } from "@/lib/graph";

const neighbor = (rel: string, direction: "out" | "in", label: string, id: string, name = id): GraphNeighbor => ({ rel, direction, node: { id, label, name } });

const neighbors = [
  neighbor("HAS_RECOMMENDATION", "out", "Recommendation", "r1", "Ăn nhiều rau"),
  neighbor("HAS_SYMPTOM", "out", "Symptom", "s1", "khát nước"),
  neighbor("HAS_SYMPTOM", "out", "Symptom", "s2", "mệt mỏi"),
  neighbor("SUPPORTED_BY", "in", "Chunk", "c1"),
];

describe("groupNeighbors", () => {
  it("groups by relation, direction and label in legend order", () => {
    const groups = groupNeighbors(neighbors, { hidden: new Set(), query: "" });
    expect(groups.map((g) => [g.key, g.items.map((i) => i.node.id)])).toEqual([
      ["HAS_SYMPTOM|out|Symptom", ["s1", "s2"]],
      ["HAS_RECOMMENDATION|out|Recommendation", ["r1"]],
      ["SUPPORTED_BY|in|Chunk", ["c1"]],
    ]);
  });

  it("drops hidden labels and applies a case-insensitive name query", () => {
    expect(groupNeighbors(neighbors, { hidden: new Set(["Symptom", "Chunk"]), query: "" }).map((g) => g.key)).toEqual(["HAS_RECOMMENDATION|out|Recommendation"]);
    expect(groupNeighbors(neighbors, { hidden: new Set(), query: "MỆT" }).flatMap((g) => g.items.map((i) => i.node.id))).toEqual(["s2"]);
  });

  it("counts neighbors per label in legend order and trims a group to its quota", () => {
    expect(countByLabel(neighbors)).toEqual([["Symptom", 2], ["Recommendation", 1], ["Chunk", 1]]);
    const [symptoms] = groupNeighbors(neighbors, { hidden: new Set(), query: "" });
    expect(limitGroup(symptoms, 1).items.map((i) => i.node.id)).toEqual(["s1"]);
  });
});

describe("layoutRadial", () => {
  it("spaces four nodes a quarter turn apart on one ring, starting at twelve o'clock", () => {
    const [{ placed }] = layoutRadial([{ key: "k", rel: "HAS_SYMPTOM", direction: "out", label: "Symptom", items: ["a", "b", "c", "d"].map((id) => neighbor("HAS_SYMPTOM", "out", "Symptom", id)) }]);
    const points = placed.map(({ x, y }) => [Math.round(x), Math.round(y)]);
    expect(points).toEqual([[480, 85], [715, 320], [480, 555], [245, 320]]);
  });

  it("alternates between two rings once more than twelve nodes are shown", () => {
    const items = Array.from({ length: 14 }, (_, i) => neighbor("HAS_SYMPTOM", "out", "Symptom", `n${i}`));
    const [{ placed }] = layoutRadial([{ key: "k", rel: "HAS_SYMPTOM", direction: "out", label: "Symptom", items }]);
    const radii = placed.slice(0, 4).map(({ x, y }) => Math.round(Math.hypot(x - 480, y - 320)));
    expect(radii).toEqual([235, 170, 235, 170]);
  });
});
