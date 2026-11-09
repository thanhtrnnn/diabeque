import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatWorkspace } from "@/components/product/chat-workspace";
import { STORAGE_KEY } from "@/lib/conversation-store";
import { DISCLAIMER_TEXT, answeredEvents, errorEvents, refusalEvents, source, sse } from "@/test/stream-fixtures";

type Handler = (init: RequestInit) => Response | Promise<Response>;

function stubChat(...handlers: Handler[]) {
  const bodies: Array<Record<string, unknown>> = [];
  let call = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input) !== "/api/chat/stream") throw new Error(`unexpected request ${String(input)}`);
    bodies.push(JSON.parse(String(init?.body)));
    return handlers[Math.min(call++, handlers.length - 1)](init ?? {});
  }));
  return bodies;
}

function ask(question: string) {
  fireEvent.change(screen.getByLabelText("Đặt câu hỏi"), { target: { value: question } });
  fireEvent.click(screen.getByRole("button", { name: "Gửi câu hỏi" }));
}

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(window.history.state, "", "/");
});

describe("ChatWorkspace", () => {
  it("streams an answered turn with inline citations, source chips and the disclaimer", async () => {
    const bodies = stubChat(() => sse(answeredEvents()));
    render(<ChatWorkspace />);
    ask("Người bị tiền đái tháo đường nên ăn gì?");

    expect(await screen.findByRole("heading", { name: "Trả lời" })).toBeVisible();
    expect(bodies).toHaveLength(1);
    expect(Object.keys(bodies[0]).sort()).toEqual(["conversation_id", "message"]);
    expect(bodies[0].message).toBe("Người bị tiền đái tháo đường nên ăn gì?");
    expect(String(bodies[0].conversation_id)).toMatch(/^[0-9a-f-]{36}$/);

    const answer = await screen.findByRole("article", { name: "Câu trả lời" });
    expect(screen.getByText(DISCLAIMER_TEXT)).toBeVisible();
    expect(within(answer).getAllByRole("button", { name: "Mở trích dẫn số 1" }).length).toBeGreaterThan(0);

    const [group] = within(answer).getAllByRole("list", { name: "Danh sách nguồn" });
    expect(within(group).getByText("NIDDK")).toBeVisible();
    expect(within(group).getByText("EN")).toBeVisible();
    expect(within(group).getByText("Eating well with prediabetes")).toBeVisible();
    expect(within(group).getByRole("link", { name: /Mở nguồn gốc Eating well/ })).toHaveAttribute("href", expect.stringContaining("niddk.nih.gov"));
  });

  it("opens the cited passage when a citation chip is pressed", async () => {
    stubChat(() => sse(answeredEvents()));
    render(<ChatWorkspace />);
    ask("Người bị tiền đái tháo đường nên ăn gì?");
    const [chip] = await screen.findAllByRole("button", { name: "Mở trích dẫn số 1" });
    fireEvent.click(chip);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Eating well with prediabetes")).toBeVisible();
    expect(within(dialog).getByText(/Choose whole grains/)).toBeVisible();
    expect(within(dialog).getByRole("link", { name: "Mở nguồn gốc" })).toHaveAttribute("target", "_blank");
  });

  it("sends the selected topic and keeps the conversation id across turns", async () => {
    const bodies = stubChat(() => sse(answeredEvents()));
    render(<ChatWorkspace initialTopic="type2" />);
    expect(screen.getByLabelText("Lọc truy xuất theo chủ đề")).toHaveValue("type2");
    ask("Metformin dùng khi nào?");
    await screen.findByRole("heading", { name: "Trả lời" });
    ask("Còn tác dụng phụ?");
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[0]).toMatchObject({ topic: "type2" });
    expect(bodies[1].conversation_id).toBe(bodies[0].conversation_id);
  });

  it.each([
    ["out_of_scope", "Câu hỏi không thuộc lĩnh vực đái tháo đường"],
    ["insufficient_evidence", "Chưa đủ căn cứ trong nguồn đã tra"],
  ] as const)("shows a %s refusal without citations and with the disclaimer", async (state, heading) => {
    stubChat(() => sse(refusalEvents(state)));
    render(<ChatWorkspace />);
    ask("Giá vàng hôm nay bao nhiêu?");

    expect(await screen.findByRole("heading", { name: heading })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Mở trích dẫn/ })).toBeNull();
    expect(screen.queryByText("Căn cứ đã dùng")).toBeNull();
    expect(screen.getByText(DISCLAIMER_TEXT, { exact: false })).toBeVisible();
  });

  it("lists no sources for an out-of-scope refusal even when the backend retrieved some", async () => {
    stubChat(() => sse(refusalEvents("out_of_scope", [source()])));
    render(<ChatWorkspace />);
    ask("Giá vàng hôm nay bao nhiêu?");

    expect(await screen.findByRole("heading", { name: "Câu hỏi không thuộc lĩnh vực đái tháo đường" })).toBeVisible();
    expect(screen.queryByText("Nguồn đã rà soát")).toBeNull();
    expect(screen.queryByText(/đã rà nhưng không dùng làm căn cứ/)).toBeNull();
  });

  it("keeps the reviewed sources visible for an insufficient-evidence refusal", async () => {
    stubChat(() => sse(refusalEvents("insufficient_evidence")));
    render(<ChatWorkspace />);
    ask("Metformin dùng khi nào?");

    expect(await screen.findByText("Nguồn đã rà soát")).toBeVisible();
  });

  it("offers a retry after a retryable stream error and recovers", async () => {
    const bodies = stubChat(() => sse(errorEvents(true)), () => sse(answeredEvents()));
    render(<ChatWorkspace />);
    ask("Triệu chứng đái tháo đường?");

    expect(await screen.findByText("Lỗi xử lý, vui lòng thử lại.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByRole("heading", { name: "Trả lời" })).toBeVisible();
    expect(bodies[1].message).toBe(bodies[0].message);
  });

  it("withholds the retry button when the backend says another attempt cannot help", async () => {
    stubChat(() => sse(errorEvents(false)));
    render(<ChatWorkspace />);
    ask("Triệu chứng đái tháo đường?");
    expect(await screen.findByText(/Hỏi lại nguyên văn sẽ cho kết quả y hệt/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Thử lại" })).toBeNull();
  });

  it("reports a pre-stream HTTP failure with the BFF's message", async () => {
    stubChat(() => Response.json({ error: { code: "DEPENDENCY_UNAVAILABLE", message: "Không kết nối được dịch vụ tra cứu." } }, { status: 503 }));
    render(<ChatWorkspace />);
    ask("Triệu chứng đái tháo đường?");
    expect(await screen.findByText("Không kết nối được dịch vụ tra cứu.")).toBeVisible();
  });

  it("saves finished turns to localStorage and reopens them from history", async () => {
    stubChat(() => sse(answeredEvents()));
    const first = render(<ChatWorkspace />);
    ask("Người bị tiền đái tháo đường nên ăn gì?");
    await screen.findByRole("heading", { name: "Trả lời" });
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    expect(stored).toHaveLength(1);
    expect(stored[0].turns[0].question).toBe("Người bị tiền đái tháo đường nên ăn gì?");
    first.unmount();

    render(<ChatWorkspace initialConversationId={stored[0].id} />);
    expect(await screen.findByRole("heading", { name: "Trả lời" })).toBeVisible();
    expect(screen.getByText("Người bị tiền đái tháo đường nên ăn gì?", { selector: "p" })).toBeVisible();
  });

  it("still works when localStorage throws", async () => {
    stubChat(() => sse(answeredEvents()));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    render(<ChatWorkspace />);
    ask("Người bị tiền đái tháo đường nên ăn gì?");
    expect(await screen.findByRole("heading", { name: "Trả lời" })).toBeVisible();
    vi.restoreAllMocks();
  });
});
