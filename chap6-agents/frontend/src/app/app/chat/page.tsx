import { ChatWorkspace } from "@/components/product/chat-workspace";
import { ProductShell } from "@/components/product/product-shell";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Hỏi đáp" };

const first = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);

export default async function ChatPage({ searchParams }: PageProps<"/app/chat">) {
  const params = await searchParams;
  const question = first(params.q);
  const conversation = question ? undefined : first(params.conversation);
  return (
    <ProductShell current="chat">
      <ChatWorkspace
        key={question ?? conversation ?? "new"}
        initialQuestion={question}
        initialConversationId={conversation}
      />
    </ProductShell>
  );
}
