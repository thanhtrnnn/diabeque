import { proxy } from "@/lib/backend-proxy";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 2000;

export async function GET(request: Request, context: RouteContext<"/api/graph/[id]">) {
  const { id } = await context.params;
  const limit = Number(new URL(request.url).searchParams.get("limit"));
  const query = Number.isInteger(limit) && limit > 0 ? `?limit=${Math.min(limit, MAX_LIMIT)}` : "";
  return proxy(`/graph/${encodeURIComponent(id)}${query}`);
}
