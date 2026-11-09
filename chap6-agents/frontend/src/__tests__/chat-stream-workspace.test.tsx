import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatWorkspace } from "@/components/product/chat-workspace";
import { STORAGE_KEY } from "@/lib/conversation-store";
import {
  DISCLAIMER_TEXT,
  EMERGENCY_TEXT,
  QUESTION_TEXT,
  answeredEvents,
  emergencyEvents,
  errorEvents,
  frames,
  needsInfoEvents,
  refusalEvents,
  riskEvents,
  source,
  sse,
} from "@/test/stream-fixtures";

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

const originalMatchMedia = window.matchMedia;

/** The agent panel is a side column from 64rem up and folds into each turn below that. */
function viewport(wide: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: wide && query.includes("64rem"), media: query, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  window.matchMedia = originalMatchMedia;
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

  it("sends the same conversation id for every turn, which is how the backend remembers the profile", async () => {
    const bodies = stubChat(() => sse(needsInfoEvents()), () => sse(riskEvents()));
    render(<ChatWorkspace />);
    ask("Tôi 52 tuổi, nam, cao 1m65, nặng 80kg, bị huyết áp cao. Tôi có nguy cơ tiểu đường không?");
    await screen.findByText(/Để ước lượng nguy cơ, tôi cần thêm vài thông tin/);
    ask("Mỡ máu bình thường, tôi ít vận động, sức khỏe trung bình.");
    await screen.findByRole("heading", { name: "Ước lượng nguy cơ" });
    expect(bodies).toHaveLength(2);
    expect(bodies[1].conversation_id).toBe(bodies[0].conversation_id);
    expect(Object.keys(bodies[1]).sort()).toEqual(["conversation_id", "message"]);
  });

  it("offers the three starter prompts: knowledge, risk and dosage", async () => {
    const bodies = stubChat(() => sse(answeredEvents()));
    render(<ChatWorkspace />);
    const empty = screen.getByRole("region", { name: "Diabeque" });
    expect(within(empty).getByText("Trợ lý đa agent sàng lọc và tư vấn đái tháo đường")).toBeVisible();
    expect(empty.querySelector("img[src*='diabeque-mark']")).toHaveAttribute("alt", "");
    const prompts = within(empty).getAllByRole("button");
    expect(prompts.map((button) => button.textContent)).toEqual([
      "Triệu chứng của đái tháo đường type 2 là gì?",
      "Tôi 52 tuổi, nam, cao 1m65, nặng 80kg, bị huyết áp cao. Tôi có nguy cơ tiểu đường không?",
      "Tôi nên tiêm insulin liều bao nhiêu?",
    ]);
    fireEvent.click(prompts[2]);
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0].message).toBe("Tôi nên tiêm insulin liều bao nhiêu?");
  });

  it("fills the agent trace panel from agent.step events and expands the tool calls", async () => {
    viewport(true);
    stubChat(() => sse(answeredEvents()));
    render(<ChatWorkspace />);
    const panel = screen.getByRole("complementary", { name: "Hoạt động của các agent" });
    expect(within(panel).getByText(/Chưa có lượt xử lý nào/)).toBeVisible();
    expect(within(panel).getByText(/Chưa có thông tin sức khỏe nào/)).toBeVisible();

    ask("Người bị tiền đái tháo đường nên ăn gì?");
    await screen.findByRole("heading", { name: "Trả lời" });

    const rows = Array.from(within(panel).getByRole("list", { name: "Các agent đã chạy trong lượt này" }).children) as HTMLElement[];
    expect(rows.map((row) => row.querySelector("strong")?.textContent)).toEqual(["An toàn (vào)", "Điều phối", "Tra cứu tri thức", "An toàn (ra)"]);
    expect(within(rows[2]).getByText("5,4 s")).toBeVisible();
    expect(within(rows[2]).getByText("RAG: answered, 1 trích dẫn")).toBeVisible();
    expect(within(rows[1]).getByText("640 ms")).toBeVisible();
    expect(within(panel).getByText("4 bước · 6,0 s")).toBeVisible();

    fireEvent.click(within(rows[2]).getByText("1 lệnh gọi công cụ"));
    expect(within(rows[2]).getByText("search_knowledge")).toBeVisible();
    expect(within(rows[2]).getByText(/"question": "Người bị tiền đái tháo đường nên ăn gì\?"/)).toBeVisible();
    expect(within(rows[2]).getByText(/"top_score": 0.88/)).toBeVisible();
    expect(within(panel).queryByRole("status")).toBeNull();
  });

  it("shows each agent as soon as it finishes, while the answer is still on its way", async () => {
    viewport(true);
    const blocks = frames(answeredEvents()).split("\n\n").filter(Boolean).map((block) => `${block}\n\n`);
    const cut = blocks.findIndex((block) => block.includes("event: sources.snapshot"));
    const encoder = new TextEncoder();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({ start: (c) => { controller = c; } });
    stubChat(() => new Response(body, { headers: { "Content-Type": "text/event-stream" } }));
    render(<ChatWorkspace />);
    ask("Người bị tiền đái tháo đường nên ăn gì?");
    controller.enqueue(encoder.encode(blocks.slice(0, cut).join("")));

    const panel = screen.getByRole("complementary", { name: "Hoạt động của các agent" });
    expect(await within(panel).findByText("Tra cứu tri thức")).toBeVisible();
    expect(within(panel).getByText("Đang chờ agent tiếp theo…")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Trả lời" })).toBeNull();

    controller.enqueue(encoder.encode(blocks.slice(cut).join("")));
    controller.close();
    expect(await screen.findByRole("heading", { name: "Trả lời" })).toBeVisible();
    await waitFor(() => expect(within(panel).queryByText("Đang chờ agent tiếp theo…")).toBeNull());
  });

  it("folds the trace into the turn on a narrow screen", async () => {
    viewport(false);
    stubChat(() => sse(answeredEvents()));
    render(<ChatWorkspace />);
    expect(screen.queryByRole("complementary", { name: "Hoạt động của các agent" })).toBeNull();
    ask("Người bị tiền đái tháo đường nên ăn gì?");
    await screen.findByRole("heading", { name: "Trả lời" });
    const summary = screen.getByText("Quá trình các agent · 4 bước · 6,0 s");
    const details = summary.closest("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    fireEvent.click(summary);
    expect(details.open).toBe(true);
    expect(within(details).getByText("Tra cứu tri thức")).toBeVisible();
  });

  it("asks the intake question as a highlighted prompt and lists what is collected and missing", async () => {
    viewport(true);
    stubChat(() => sse(needsInfoEvents()));
    render(<ChatWorkspace />);
    ask("Tôi 52 tuổi, nam, cao 1m65, nặng 80kg, bị huyết áp cao. Tôi có nguy cơ tiểu đường không?");

    const heading = await screen.findByRole("heading", { name: "Cần thêm thông tin" });
    const question = heading.closest("section") as HTMLElement;
    expect(question).toHaveClass("response-domain-section--question");
    expect(within(question).getByText(/mỡ máu\) cao chưa/)).toBeVisible();
    expect(QUESTION_TEXT).toContain("cholesterol");

    const panel = screen.getByRole("complementary", { name: "Hoạt động của các agent" });
    const profile = within(panel).getByText("Thông tin đã ghi nhận").closest("div") as HTMLElement;
    expect(within(profile).getByText("Nhóm tuổi").nextElementSibling).toHaveTextContent("50-54");
    expect(within(profile).getByText("Huyết áp cao").nextElementSibling).toHaveTextContent("có");
    expect(within(within(panel).getByRole("list", { name: "Thông tin còn thiếu" })).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Mỡ máu cao", "Vận động thể chất", "Sức khỏe chung"]);
    expect(within(panel).queryByText(/Ước lượng nguy cơ ·/)).toBeNull();
    expect(screen.getByText("Cần thêm thông tin", { selector: ".app-status" })).toBeVisible();
  });

  it("shows the risk estimate with population bars, the model, the not-a-diagnosis note and the safety warning", async () => {
    viewport(true);
    stubChat(() => sse(riskEvents()));
    render(<ChatWorkspace />);
    ask("Mỡ máu bình thường, tôi ít vận động, sức khỏe trung bình.");

    expect(await screen.findByRole("heading", { name: "Ước lượng nguy cơ" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Lời khuyên" })).toBeVisible();
    expect(screen.getByText("Đã bỏ câu có liều thuốc.")).toBeVisible();

    const panel = screen.getByRole("complementary", { name: "Hoạt động của các agent" });
    const bars = within(panel).getByRole("list", { name: "Tỷ lệ ước lượng theo từng nhóm" });
    expect(within(bars).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Không báo cáo mắc bệnh84,0%",
      "Tiền đái tháo đường3,0%",
      "Báo cáo mắc đái tháo đường13,0%",
    ]);
    expect(within(panel).getByText("MLP")).toBeVisible();
    expect(within(panel).getByText(/không phải chẩn đoán/)).toBeVisible();
    expect(within(panel).getByText("2 thông tin chưa hỏi được điền bằng giá trị trung vị của dữ liệu huấn luyện.")).toBeVisible();
    expect(within(panel).queryByText(/Chưa có thông tin sức khỏe nào/)).toBeNull();
    expect(screen.queryByText(/\bconfidence\b|độ tin cậy/i)).toBeNull();
  });

  it("raises a red alert for an emergency and drops the advisory flow", async () => {
    viewport(true);
    stubChat(() => sse(emergencyEvents()));
    render(<ChatWorkspace />);
    ask("Tôi thấy lú lẫn, vã mồ hôi sau khi tiêm insulin");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveClass("response-domain-section--emergency");
    expect(within(alert).getByRole("heading", { name: "Cần đi khám ngay" })).toBeVisible();
    expect(within(alert).getByText("115")).toBeVisible();
    expect(alert).toHaveTextContent(EMERGENCY_TEXT.replaceAll("**", ""));
    expect(screen.getByText("Phát hiện dấu hiệu khẩn cấp; luồng tư vấn đã dừng.")).toBeVisible();
    expect(screen.getByText("Khẩn cấp", { selector: ".app-status" })).toBeVisible();
    expect(screen.queryByText("Nguồn trích dẫn")).toBeNull();
    const panel = screen.getByRole("complementary", { name: "Hoạt động của các agent" });
    expect(within(panel).getByText("2 bước · 0 ms")).toBeVisible();
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
