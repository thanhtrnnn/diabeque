import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend", () => ({ API_BASE_URL: "http://backend.test/api/v1" }));

import { POST } from "@/app/api/chat/stream/route";
import { answeredEvents, frames } from "@/test/stream-fixtures";

afterEach(() => vi.unstubAllGlobals());

const request = (body: unknown) =>
  new Request("http://localhost/api/chat/stream", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });

describe("chat stream BFF route", () => {
  it("forwards only message and conversation_id, without credentials, and streams the body back", async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(frames(answeredEvents()), { headers: { "Content-Type": "text/event-stream" } }));
    vi.stubGlobal("fetch", upstream);

    const response = await POST(request({
      message: "  Triệu chứng đái tháo đường?  ", conversation_id: "c-1", topic: "type2",
      businessId: "b", tacNhan: "ke_toan", duLieu: {}, processingMode: "agentic",
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(await response.text()).toContain("event: stream.started");
    const [url, init] = upstream.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://backend.test/api/v1/chat/stream");
    expect(JSON.parse(String(init.body))).toEqual({ message: "Triệu chứng đái tháo đường?", conversation_id: "c-1" });
    const headers = new Headers(init.headers);
    expect(headers.has("authorization")).toBe(false);
    expect(headers.has("cookie")).toBe(false);
  });

  it.each([
    ["invalid JSON", "{"],
    ["a one-character message", { message: "a", conversation_id: "c" }],
    ["a missing conversation id", { message: "đái tháo đường" }],
  ])("rejects %s before calling the backend", async (_name, body) => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("maps a backend validation failure to 400 and other failures to 502", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("{}", { status: 422 })).mockResolvedValueOnce(new Response("{}", { status: 500 })));
    expect((await POST(request({ message: "đái tháo đường", conversation_id: "c" }))).status).toBe(400);
    expect((await POST(request({ message: "đái tháo đường", conversation_id: "c" }))).status).toBe(502);
  });

  it("answers 503 when the backend is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const response = await POST(request({ message: "đái tháo đường", conversation_id: "c" }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "DEPENDENCY_UNAVAILABLE" } });
  });
});
