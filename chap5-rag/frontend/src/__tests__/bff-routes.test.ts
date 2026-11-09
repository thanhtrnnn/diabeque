import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend", () => ({ API_BASE_URL: "http://backend.test/api/v1" }));

import { POST as classify } from "@/app/api/classify/route";
import { GET as features } from "@/app/api/classify/features/route";
import { GET as graph } from "@/app/api/graph/[id]/route";
import { GET as source } from "@/app/api/sources/[id]/route";

afterEach(() => vi.unstubAllGlobals());

const upstream = (response: Response) => {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};
const calledUrl = (fetchMock: ReturnType<typeof vi.fn>) => (fetchMock.mock.calls[0] as [string, RequestInit])[0];
const jsonRequest = (body: unknown) => new Request("http://localhost/api/classify", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });

describe("graph BFF route", () => {
  it("forwards the node id and a clamped limit, and returns the backend body untouched", async () => {
    const fetchMock = upstream(new Response('{"center":{"id":"dtd_type2"},"neighbors":[]}', { headers: { "Content-Type": "application/json" } }));
    const response = await graph(new Request("http://localhost/api/graph/dtd_type2?limit=99999"), { params: Promise.resolve({ id: "dtd_type2" }) });
    expect(calledUrl(fetchMock)).toBe("http://backend.test/api/v1/graph/dtd_type2?limit=2000");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"center":{"id":"dtd_type2"},"neighbors":[]}');
  });

  it("encodes chunk ids that contain #, drops a non-numeric limit, and sends no credentials", async () => {
    const fetchMock = upstream(new Response("{}"));
    await graph(new Request("http://localhost/api/graph/x?limit=abc"), { params: Promise.resolve({ id: "ndss-pregnancy#001" }) });
    expect(calledUrl(fetchMock)).toBe("http://backend.test/api/v1/graph/ndss-pregnancy%23001");
    const headers = new Headers((fetchMock.mock.calls[0] as [string, RequestInit])[1].headers);
    expect(headers.has("authorization")).toBe(false);
    expect(headers.has("cookie")).toBe(false);
  });

  it("passes a backend 404 through with its status and body", async () => {
    upstream(new Response('{"detail":"Không có nút này"}', { status: 404, headers: { "Content-Type": "application/json" } }));
    const response = await graph(new Request("http://localhost/api/graph/zz"), { params: Promise.resolve({ id: "zz" }) });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ detail: "Không có nút này" });
  });

  it("answers 503 when the backend is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const response = await graph(new Request("http://localhost/api/graph/dtd_type2"), { params: Promise.resolve({ id: "dtd_type2" }) });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: "DEPENDENCY_UNAVAILABLE", message: "Không kết nối được dịch vụ tra cứu." } });
  });
});

describe("sources and features BFF routes", () => {
  it("forwards a chunk id to /sources with the # encoded", async () => {
    const fetchMock = upstream(new Response('{"document_title":"Pregnancy and Diabetes FAQs"}'));
    const response = await source(new Request("http://localhost/api/sources/x"), { params: Promise.resolve({ id: "ndss-pregnancy#001" }) });
    expect(calledUrl(fetchMock)).toBe("http://backend.test/api/v1/sources/ndss-pregnancy%23001");
    expect(await response.json()).toEqual({ document_title: "Pregnancy and Diabetes FAQs" });
  });

  it("forwards the feature registry request", async () => {
    const fetchMock = upstream(new Response('{"status3":[],"diabtype":[]}'));
    const response = await features();
    expect(calledUrl(fetchMock)).toBe("http://backend.test/api/v1/classify/features");
    expect(await response.json()).toEqual({ status3: [], diabtype: [] });
  });
});

describe("classify BFF route", () => {
  it("forwards only task and features as JSON", async () => {
    const fetchMock = upstream(new Response('{"label":1}'));
    const response = await classify(jsonRequest({ task: "status3", features: { BMI: 40 }, extra: "x" }));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://backend.test/api/v1/classify");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ task: "status3", features: { BMI: 40 } });
    expect(await response.json()).toEqual({ label: 1 });
  });

  it("passes a backend 422 through", async () => {
    upstream(new Response('{"detail":[{"msg":"Input should be status3 or diabtype"}]}', { status: 422 }));
    const response = await classify(jsonRequest({ task: "zzz", features: {} }));
    expect(response.status).toBe(422);
  });

  it.each([
    ["invalid JSON", "{"],
    ["a missing task", { features: {} }],
    ["array features", { task: "status3", features: [1] }],
    ["null features", { task: "status3", features: null }],
  ])("rejects %s before calling the backend", async (_name, body) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await classify(jsonRequest(body))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
