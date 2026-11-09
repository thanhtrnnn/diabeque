import { proxy } from "@/lib/backend-proxy";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext<"/api/sources/[id]">) {
  const { id } = await context.params;
  return proxy(`/sources/${encodeURIComponent(id)}`);
}
