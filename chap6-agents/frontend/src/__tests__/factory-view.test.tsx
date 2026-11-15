import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentsResponse } from "@/lib/agents";
import type { AgentStep } from "@/lib/chat-stream-contract";
import type { FactorySceneProps } from "@/components/factory/scene";
import type { Scenario } from "@/lib/factory/scenarios";

/** `fake` swaps the WebGL scene for plain buttons; off, the real scene runs and jsdom has no WebGL. */
const sceneMode = vi.hoisted(() => ({ fake: true }));

vi.mock("@/components/factory/scene", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/components/factory/scene")>();
  function FakeScene(props: FactorySceneProps) {
    return (
      <div data-testid="fake-scene">
        {Object.keys(props.state.stations).map((id) => (
          <button key={id} type="button" data-station={id} onClick={() => props.onSelect(id)}>{`trạm ${id}`}</button>
        ))}
      </div>
    );
  }
  return { ...real, FactoryScene: (props: FactorySceneProps) => (sceneMode.fake ? <FakeScene {...props} /> : <real.FactoryScene {...props} />) };
});

import { FactoryView } from "@/components/factory/factory-view";

const NODES = "chap6-agents/backend/app/agents/nodes.py";
const step = (agent: string, label: string, summary: string, extra: Partial<AgentStep> = {}): AgentStep => ({
  agent, label, summary, tools: [], ms: 4, fallback: null, ...extra,
});

const SCENARIOS: Scenario[] = [
  {
    id: "khan-cap", label: "Khẩn cấp",
    turns: [{
      message: "Tôi đau ngực dữ dội",
      steps: [
        step("safety_in", "An toàn (vào)", "Phát hiện dấu hiệu khẩn cấp, dừng luồng tư vấn", { ms: 0, code: { path: NODES, line: 68 } }),
        step("safety_out", "An toàn (ra)", "Đã kiểm 0 phần do LLM viết; cờ: emergency", { ms: 0, code: { path: NODES, line: 494 } }),
      ],
      sections: [{ kind: "emergency", title: "Cần đi khám ngay", text: "Gọi 115." }],
    }],
  },
  {
    id: "llm-sap", label: "LLM sập",
    turns: [{
      message: "HbA1c là gì?",
      steps: [
        step("safety_in", "An toàn (vào)", "Không có dấu hiệu khẩn cấp"),
        step("orchestrator", "Điều phối", "Ý định: knowledge (luật dự phòng (LLMUnavailable))", { fallback: "rules" }),
        step("knowledge", "Tra cứu tri thức", "Dự phòng: 5 đoạn tài liệu, không dùng LLM", { fallback: "passages" }),
        step("safety_out", "An toàn (ra)", "Đã kiểm 1 phần do LLM viết", { fallback: "flag_moi" }),
      ],
      sections: [{ kind: "conclusion", title: "Đoạn tài liệu liên quan", text: "..." }],
    }],
  },
  {
    id: "kien-thuc", label: "Hỏi kiến thức",
    turns: [{
      message: "HbA1c là gì?",
      steps: [
        step("safety_in", "An toàn (vào)", "Không có dấu hiệu khẩn cấp", { code: { path: NODES, line: 68 } }),
        step("orchestrator", "Điều phối", "Ý định: knowledge (LLM)", { ms: 812, code: { path: NODES, line: 127 } }),
        step("knowledge", "Tra cứu tri thức", "RAG: answered, 3 trích dẫn", {
          ms: 2100,
          code: { path: NODES, line: 375 },
          tools: [{ name: "search_knowledge", args: { question: "HbA1c là gì?" }, result: { state: "answered", used: ["c1", "c2", "c3"] }, code: { path: "chap6-agents/backend/app/agents/tools.py", line: 98 } }],
        }),
        // A step without a code ref must never break the sheet.
        step("safety_out", "An toàn (ra)", "Đã kiểm 1 phần do LLM viết"),
      ],
      sections: [{ kind: "conclusion", title: "Trả lời", text: "..." }],
    }],
  },
];

function stubAgents(extra: Partial<AgentsResponse>) {
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    if (String(input) !== "/api/agents") throw new Error(`unexpected request ${String(input)}`);
    return new Response(JSON.stringify({ agents: [], mermaid: "", ...extra }), { headers: { "Content-Type": "application/json" } });
  }));
}

const logTexts = () => within(screen.getByRole("region", { name: "Vết chạy" })).queryAllByRole("listitem").map((item) => item.textContent ?? "");

beforeEach(() => {
  sceneMode.fake = true;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FactoryView", () => {
  it("logs the emergency run: the entry check, then straight to the exit check", async () => {
    stubAgents({ repo_root: "/Users/demo/diabeque", commit: "abc123", allow_simulation: true });
    render(<FactoryView scenarios={SCENARIOS} />);
    await screen.findByTestId("fake-scene");

    await userEvent.click(screen.getByRole("button", { name: "Khẩn cấp" }));

    await waitFor(() => {
      const texts = logTexts();
      const entry = texts.findIndex((t) => t.includes("An toàn (vào)"));
      const exit = texts.findIndex((t) => t.includes("An toàn (ra)"));
      expect(entry).toBeGreaterThanOrEqual(0);
      expect(exit).toBeGreaterThan(entry);
    }, { timeout: 4000 });
    await waitFor(() => expect(screen.getByRole("status", { name: "Chú thích bước" })).toHaveTextContent("Lượt 1 hoàn tất."), { timeout: 4000 });
  });

  it("opens the switch-operator's sheet with her name and a GitHub link to the node's line", async () => {
    stubAgents({ repo_root: "/Users/demo/diabeque", commit: "abc123", allow_simulation: true });
    render(<FactoryView scenarios={SCENARIOS} />);
    await screen.findByTestId("fake-scene");
    await userEvent.click(screen.getByRole("button", { name: "Hỏi kiến thức" }));
    await waitFor(() => expect(logTexts().some((t) => t.includes("Ý định: knowledge"))).toBe(true), { timeout: 4000 });

    await userEvent.click(screen.getByRole("button", { name: "trạm orchestrator" }));

    const sheet = await screen.findByRole("dialog", { name: /Cô Bẻ Ghi/ });
    const github = within(sheet).getByRole("link", { name: /GitHub/ });
    expect(github.getAttribute("href")).toContain("nodes.py#L127");
    expect(github.getAttribute("href")).toContain("/blob/abc123/");
    expect(within(sheet).getByRole("link", { name: /VS Code/ }).getAttribute("href")).toBe(
      "vscode://file/Users/demo/diabeque/chap6-agents/backend/app/agents/nodes.py:127",
    );
    expect(within(sheet).getByText(/Gọi LLM/)).toBeInTheDocument();
    expect(within(sheet).getByText(/lật sổ luật/)).toBeInTheDocument();
  });

  it("reaches every tool machine from the sheet by keyboard and shows its last call", async () => {
    stubAgents({ repo_root: "/Users/demo/diabeque", commit: "abc123" });
    render(<FactoryView scenarios={SCENARIOS} />);
    await screen.findByTestId("fake-scene");
    await userEvent.click(screen.getByRole("button", { name: "Hỏi kiến thức" }));
    await waitFor(() => expect(logTexts().some((t) => t.includes("Đã kiểm 1 phần"))).toBe(true), { timeout: 6000 });

    await userEvent.click(screen.getByRole("button", { name: "trạm knowledge" }));
    const sheet = await screen.findByRole("dialog", { name: /Bé Đèn Pin/ });
    const tool = within(sheet).getByRole("button", { name: /^search_knowledge/ });
    tool.focus();
    await userEvent.keyboard("{Enter}");
    expect(tool).toHaveAttribute("aria-pressed", "true");
    expect(within(sheet).getByText(/"answered"/)).toBeInTheDocument();
    expect(within(sheet).getByRole("link", { name: /GitHub.*search_knowledge/ }).getAttribute("href")).toContain("tools.py#L98");

    // The exit check's step has no code ref: its sheet opens without links and without throwing.
    await userEvent.click(screen.getByRole("button", { name: "trạm safety_out" }));
    const exitSheet = await screen.findByRole("dialog", { name: /Ông Soát Vé/ });
    expect(within(exitSheet).queryByRole("link", { name: /GitHub/ })).toBeNull();
  });

  it("hides the VS Code link without a repo root and the LLM switch without simulation", async () => {
    stubAgents({ commit: null, allow_simulation: false });
    render(<FactoryView scenarios={SCENARIOS} />);
    await screen.findByTestId("fake-scene");
    await userEvent.click(screen.getByRole("button", { name: "Hỏi kiến thức" }));
    await waitFor(() => expect(logTexts().some((t) => t.includes("Ý định: knowledge"))).toBe(true), { timeout: 4000 });
    await userEvent.click(screen.getByRole("button", { name: "trạm orchestrator" }));

    const sheet = await screen.findByRole("dialog", { name: /Cô Bẻ Ghi/ });
    expect(within(sheet).getByRole("link", { name: /GitHub/ }).getAttribute("href")).toContain("/blob/main/");
    expect(within(sheet).queryByRole("link", { name: /VS Code/ })).toBeNull();
    expect(screen.queryByRole("switch", { name: /Cắt mây LLM/ })).toBeNull();
  });

  it("offers the LLM cut-off switch when the backend allows simulation", async () => {
    stubAgents({ allow_simulation: true });
    render(<FactoryView scenarios={SCENARIOS} />);
    const toggle = await screen.findByRole("switch", { name: /Cắt mây LLM/ });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("says how to record scenarios when none are recorded, and shows no chips", async () => {
    stubAgents({});
    render(<FactoryView scenarios={[]} />);
    expect(await screen.findByText(/Chưa có kịch bản ghi sẵn/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Khẩn cấp" })).toBeNull();
    expect(screen.getByRole("textbox", { name: /Câu hỏi/ })).toBeInTheDocument();
  });

  it("shows the step button under reduced motion", async () => {
    stubAgents({});
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("prefers-reduced-motion"), media: query, onchange: null,
      addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }));
    render(<FactoryView scenarios={SCENARIOS} />);
    await screen.findByTestId("fake-scene");
    expect(screen.getByRole("button", { name: /Bước tiếp/ })).toBeInTheDocument();
  });

  it("hands focus back to the control that opened the sheet when Esc closes it", async () => {
    stubAgents({});
    render(<FactoryView scenarios={SCENARIOS} />);
    await screen.findByTestId("fake-scene");
    const opener = screen.getByRole("button", { name: "trạm risk" });
    await userEvent.click(opener);
    await screen.findByRole("dialog", { name: /Cụ Cân Đong/ });

    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(opener).toHaveFocus();
  });

  it("names fallback flags in Vietnamese in the log, caption and sheet, never the raw flag", async () => {
    stubAgents({});
    render(<FactoryView scenarios={SCENARIOS} />);
    await screen.findByTestId("fake-scene");
    await userEvent.click(screen.getByRole("button", { name: "LLM sập" }));
    const caption = screen.getByRole("status", { name: "Chú thích bước" });
    await waitFor(() => expect(caption).toHaveTextContent("(dự phòng: luật thay LLM)"), { timeout: 4000 });
    await waitFor(() => expect(caption).toHaveTextContent("(dự phòng: đoạn tài liệu)"), { timeout: 4000 });
    await waitFor(() => expect(logTexts().some((t) => t.includes("Đã kiểm 1 phần"))).toBe(true), { timeout: 6000 });

    const log = screen.getByRole("region", { name: "Vết chạy" });
    expect(within(log).getByText("Dự phòng: luật thay LLM")).toBeInTheDocument();
    expect(within(log).getByText("Dự phòng: đoạn tài liệu")).toBeInTheDocument();
    // A flag this build does not know reads as a plain "Dự phòng".
    expect(within(log).getByText("Dự phòng")).toBeInTheDocument();
    expect(log.textContent).not.toMatch(/rules|passages|flag_moi/);

    await userEvent.click(screen.getByRole("button", { name: "trạm orchestrator" }));
    const sheet = await screen.findByRole("dialog", { name: /Cô Bẻ Ghi/ });
    expect(within(sheet).getAllByText(/dự phòng: luật thay LLM/).length).toBeGreaterThan(0);
    expect(sheet.textContent).not.toMatch(/"rules"|"passages"|"graph_facts"/);
  });

  it("takes the covered log out of the tab order and keeps its column open while the sheet is docked", async () => {
    stubAgents({});
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("min-width"), media: query, onchange: null,
      addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }));
    const { container } = render(<FactoryView scenarios={SCENARIOS} />);
    await screen.findByTestId("fake-scene");
    const root = container.firstElementChild as HTMLElement;
    await userEvent.click(screen.getByRole("button", { name: "Thu gọn vết chạy" }));
    expect(root).toHaveAttribute("data-log", "closed");

    await userEvent.click(screen.getByRole("button", { name: "trạm risk" }));
    await screen.findByRole("dialog", { name: /Cụ Cân Đong/ });
    expect(root).toHaveAttribute("data-log", "open");
    expect(screen.getByRole("region", { name: "Vết chạy", hidden: true })).toHaveAttribute("inert");

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(root).toHaveAttribute("data-log", "closed");
    expect(screen.getByRole("region", { name: "Vết chạy" })).not.toHaveAttribute("inert");
  });

  it("falls back to a link to the architecture page when the browser has no WebGL", async () => {
    sceneMode.fake = false;
    stubAgents({});
    render(<FactoryView scenarios={SCENARIOS} />);
    // The real scene module (three.js) loads through next/dynamic; give a cold import room on a busy runner.
    expect(await screen.findByText(/Trình duyệt không hỗ trợ WebGL/, undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Kiến trúc/ })).toHaveAttribute("href", "/app/kien-truc");
    // The HUD stays usable around the fallback panel.
    expect(screen.getByRole("textbox", { name: /Câu hỏi/ })).toBeInTheDocument();
  });
});
