import "server-only";

import { API_BASE_URL } from "@/lib/backend";

export async function proxy(path: string, init?: RequestInit): Promise<Response> {
  const upstream = await fetch(`${API_BASE_URL}${path}`, { ...init, cache: "no-store" }).catch(() => null);
  if (!upstream) {
    return Response.json(
      { error: { code: "DEPENDENCY_UNAVAILABLE", message: "Không kết nối được dịch vụ tra cứu." } },
      { status: 503 },
    );
  }
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
  });
}
