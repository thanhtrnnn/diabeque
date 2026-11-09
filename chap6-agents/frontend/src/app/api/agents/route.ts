import { proxy } from "@/lib/backend-proxy";

export const dynamic = "force-dynamic";

export async function GET() {
  return proxy("/agents");
}
