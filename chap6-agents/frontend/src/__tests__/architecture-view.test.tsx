import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ArchitectureView } from "@/components/product/architecture-view";
import { AGENT_BRANCHES, AGENT_IDS, AGENT_LABELS } from "@/lib/agents";
import { json } from "@/test/survey-fixtures";

afterEach(() => vi.unstubAllGlobals());

const MERMAID = "graph TD;\n\t__start__ --> safety_in;\n\tsafety_in -.-> orchestrator;";
const agentsResponse = { agents: AGENT_IDS.map((id) => ({ id, label: AGENT_LABELS[id] })), mermaid: MERMAID };

describe("ArchitectureView", () => {
  it("lists the agents from the backend, draws the graph and keeps the raw Mermaid in a collapsed block", async () => {
    const fetchMock = vi.fn(async () => json(agentsResponse));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ArchitectureView />);

    const mermaid = await screen.findByText("Xem văn bản Mermaid do LangGraph sinh ra");
    expect(fetchMock).toHaveBeenCalledWith("/api/agents", undefined);
    const details = mermaid.closest("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    await user.click(mermaid);
    expect(details.open).toBe(true);
    expect(within(details).getByText(/safety_in -\.-> orchestrator/)).toBeVisible();

    const list = screen.getByRole("heading", { name: "Các agent" }).closest("section") as HTMLElement;
    const items = within(list).getAllByRole("listitem").filter((item) => item.hasAttribute("data-agent"));
    expect(items.map((item) => item.getAttribute("data-agent"))).toEqual([...AGENT_IDS]);
    expect(within(items[2]).getByRole("heading", { name: /Thu thập thông tin/ })).toBeVisible();
    expect(within(items[2]).getByText("compute_bmi")).toBeVisible();

    const diagram = screen.getByRole("img", { name: "Sơ đồ kiến trúc giám sát nhiều agent" });
    for (const id of AGENT_IDS) expect(diagram.querySelector(`[data-agent="${id}"]`)).not.toBeNull();
    expect(within(screen.getByRole("list", { name: "Các nhánh có điều kiện" })).getAllByRole("listitem")).toHaveLength(AGENT_BRANCHES.length);
  });

  it("still draws the graph and the static agent list when the backend is down, and offers a retry", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: { code: "DEPENDENCY_UNAVAILABLE", message: "Không kết nối được dịch vụ tra cứu." } }, 503)));
    render(<ArchitectureView />);

    expect(await screen.findByText("Không tải được sơ đồ từ máy chủ")).toBeVisible();
    expect(screen.getByText("Không kết nối được dịch vụ tra cứu.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Thử lại" })).toBeVisible();
    expect(screen.getByRole("img", { name: "Sơ đồ kiến trúc giám sát nhiều agent" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(AGENT_IDS.length);
  });
});
