import { proxy } from "@/lib/backend-proxy";

export const dynamic = "force-dynamic";

export const GET = () => proxy("/classify/features");
