"use client";

import { PortalError } from "@/components/product/portal-state";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <PortalError reset={reset} homeHref="/app/chat" />;
}
