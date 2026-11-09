import { proxy } from "@/lib/backend-proxy";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const { task, features } = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  if (typeof task !== "string" || typeof features !== "object" || features === null || Array.isArray(features)) {
    return Response.json({ error: { code: "VALIDATION_ERROR", message: "Cần có task và features." } }, { status: 400 });
  }
  return proxy("/classify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task, features }),
  });
}
