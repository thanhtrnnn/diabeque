import { NextResponse } from "next/server";

import { API_BASE_URL } from "@/lib/backend";
import type { ChatRequest } from "@/lib/chat-stream-contract";

export const dynamic = "force-dynamic";

const MIN_MESSAGE_LENGTH = 2;
const MAX_MESSAGE_LENGTH = 2000;

function failure(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function parseRequest(body: unknown): ChatRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const { message, conversation_id: conversationId } = body as Record<string, unknown>;
  if (typeof message !== "string" || message.trim().length < MIN_MESSAGE_LENGTH || message.length > MAX_MESSAGE_LENGTH) return null;
  if (typeof conversationId !== "string" || !conversationId) return null;
  return { message: message.trim(), conversation_id: conversationId };
}

export async function POST(request: Request) {
  const payload = parseRequest(await request.json().catch(() => null));
  if (!payload) return failure(400, "VALIDATION_ERROR", "Câu hỏi hoặc mã hội thoại chưa hợp lệ.");

  const upstream = await fetch(`${API_BASE_URL}/chat/stream`, {
    method: "POST",
    headers: { Accept: "text/event-stream", "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: request.signal,
  }).catch(() => null);

  if (!upstream) return failure(503, "DEPENDENCY_UNAVAILABLE", "Không kết nối được dịch vụ tra cứu.");
  if (!upstream.ok || !upstream.body) {
    return failure(
      upstream.status === 422 || upstream.status === 400 ? 400 : 502,
      upstream.status === 422 || upstream.status === 400 ? "VALIDATION_ERROR" : "DEPENDENCY_UNAVAILABLE",
      upstream.status === 422 || upstream.status === 400
        ? "Câu hỏi chưa hợp lệ."
        : "Không thể bắt đầu luồng trả lời lúc này.",
    );
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
