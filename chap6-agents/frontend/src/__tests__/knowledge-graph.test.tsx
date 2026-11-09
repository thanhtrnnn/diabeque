import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { KnowledgeGraph } from "@/components/product/knowledge-graph";
import type { GraphView } from "@/lib/graph";
import { json } from "@/test/survey-fixtures";

afterEach(() => vi.unstubAllGlobals());

const disease: GraphView = {
  center: { id: "dtd_type2", label: "Disease", name: "Đái tháo đường type 2" },
  neighbors: [
    { rel: "HAS_SYMPTOM", direction: "out", node: { id: "s1", label: "Symptom", name: "khát và khô miệng" } },
    { rel: "HAS_RECOMMENDATION", direction: "out", node: { id: "rec1", label: "Recommendation", name: "Tập thể dục đều đặn" } },
  ],
};
const recommendation: GraphView = {
  center: { id: "rec1", label: "Recommendation", name: "Tập thể dục đều đặn" },
  neighbors: [
    { rel: "SUPPORTED_BY", direction: "out", node: { id: "ndss#001", label: "Chunk", name: "Regular physical activity helps" } },
    { rel: "HAS_RECOMMENDATION", direction: "in", node: { id: "dtd_type2", label: "Disease", name: "Đái tháo đường type 2" } },
  ],
};
const chunk: GraphView = {
  center: { id: "ndss#001", label: "Chunk", name: "Regular physical activity helps" },
  neighbors: [{ rel: "PART_OF", direction: "out", node: { id: "ndss", label: "Document", name: "Be active with diabetes" } }],
};
const views: Record<string, GraphView> = { dtd_type2: disease, rec1: recommendation, "ndss%23001": chunk };

function stubBackend() {
  const fetchMock = vi.fn(async (url: string) => {
    const graph = /^\/api\/graph\/([^?]+)\?limit=2000$/.exec(url);
    if (graph && views[graph[1]]) return json(views[graph[1]]);
    if (url === "/api/sources/ndss%23001") {
      return json({ chunk_id: "ndss#001", document_id: "ndss", document_title: "Be active with diabetes", publisher: "NDSS", lang: "en", excerpt: "Regular physical activity helps manage blood glucose.", source_url: "https://www.ndss.com.au/active" });
    }
    return json({ detail: "Không có nút này" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("KnowledgeGraph", () => {
  it("walks Disease, Recommendation, Chunk and back, keeping a breadcrumb and showing the source", async () => {
    const fetchMock = stubBackend();
    const user = userEvent.setup();
    const { container } = render(<KnowledgeGraph initialNode="dtd_type2" />);

    expect(await screen.findByRole("heading", { name: "Lân cận của Đái tháo đường type 2" })).toBeVisible();
    expect(Array.from(container.querySelectorAll("[data-node-id]")).map((node) => node.getAttribute("data-node-id"))).toEqual(["s1", "rec1"]);
    expect(screen.getByRole("button", { name: "Quay lại" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Tập thể dục đều đặn" }));
    expect(await screen.findByRole("heading", { name: "Lân cận của Tập thể dục đều đặn" })).toBeVisible();
    const trail = screen.getByRole("navigation", { name: "Đường đi trên đồ thị" });
    expect(within(trail).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Type 2", "Tập thể dục đều đặn"]);

    await user.click(screen.getByRole("button", { name: "Regular physical activity helps" }));
    expect(await screen.findByText("Regular physical activity helps manage blood glucose.")).toBeVisible();
    expect(screen.getByRole("link", { name: /Mở nguồn gốc/ })).toHaveAttribute("href", "https://www.ndss.com.au/active");
    expect(screen.getByText("NDSS")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Quay lại" }));
    expect(await screen.findByRole("heading", { name: "Lân cận của Tập thể dục đều đặn" })).toBeVisible();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/graph/dtd_type2?limit=2000",
      "/api/graph/rec1?limit=2000",
      "/api/graph/ndss%23001?limit=2000",
      "/api/sources/ndss%23001",
    ]);
  });

  it("hides a label when its filter chip is toggled off", async () => {
    stubBackend();
    const user = userEvent.setup();
    const { container } = render(<KnowledgeGraph initialNode="dtd_type2" />);
    await user.click(await screen.findByRole("button", { name: /Triệu chứng/ }));
    expect(Array.from(container.querySelectorAll("[data-node-id]")).map((node) => node.getAttribute("data-node-id"))).toEqual(["rec1"]);
    expect(screen.queryByRole("button", { name: "khát và khô miệng" })).toBeNull();
  });

  it("shows the backend error with a retry button", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ detail: "Không có nút này" }, 404)));
    render(<KnowledgeGraph initialNode="zz" />);
    expect(await screen.findByText("Không có nút này")).toBeVisible();
    expect(screen.getByRole("button", { name: "Thử lại" })).toBeVisible();
  });
});
