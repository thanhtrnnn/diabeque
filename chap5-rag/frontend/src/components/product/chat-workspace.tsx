"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowDownIcon,
  DotsThreeVerticalIcon,
  IconContext,
  ListIcon,
  PaperPlaneTiltIcon,
  PlusIcon,
  WarningCircleIcon,
  XCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { SettledAnswer, StreamingAnswer, StreamProgress } from "@/components/product/chat-stream-view";
import { CitationSheet } from "@/components/product/citation-sheet";
import {
  ChatStreamProtocolError,
  type ChatRequest,
  type ChatStreamAnswer,
  type SourceRecord,
} from "@/lib/chat-stream-contract";
import { readChatStreamV1 } from "@/lib/chat-stream-parser";
import { initialChatStreamState, reduceChatStream, type ChatStreamState } from "@/lib/chat-stream-reducer";
import {
  appendTurn,
  loadConversations,
  removeConversation,
  renameConversation,
  saveConversations,
  type StoredConversation,
} from "@/lib/conversation-store";
import { useStickToBottom } from "@/lib/stick-to-bottom";
import { rutGonTieuDe } from "@/lib/tieu-de-hoi-thoai";
import { TOPIC_LABELS } from "@/lib/topics";

interface Turn { question: string; answer: ChatStreamAnswer }

type Pending =
  | { status: "streaming"; question: string; stream: ChatStreamState | null }
  | { status: "error"; question: string; message: string; retryable: boolean }
  | { status: "cancelled"; question: string };

const SUGGESTIONS = [
  "Người bị tiền đái tháo đường nên ăn gì?",
  "Triệu chứng thường gặp của đái tháo đường type 2 là gì?",
  "Đái tháo đường type 1 khác type 2 như thế nào?",
];

const STATE_LABELS: Record<ChatStreamAnswer["state"], string> = {
  answered: "Đã trả lời",
  insufficient_evidence: "Chưa đủ căn cứ",
  out_of_scope: "Ngoài phạm vi",
};

const CANCELLED_MESSAGE = "Bạn đã dừng tạo câu trả lời. Có thể thử lại với cùng câu hỏi.";
const NETWORK_MESSAGE = "Mất kết nối khi gửi câu hỏi. Câu hỏi đã được giữ lại, hãy thử lại.";
const GENERIC_MESSAGE = "Không thể kết nối tới dịch vụ tra cứu. Câu hỏi của bạn chưa được gửi thành công.";

class UserFacingError extends Error {}

function replaceConversationUrl(conversationId?: string) {
  const url = conversationId ? `/app/chat?conversation=${encodeURIComponent(conversationId)}` : "/app/chat";
  window.history.replaceState(window.history.state, "", url);
}

function shortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

interface HistoryProps {
  items: StoredConversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRename: (item: StoredConversation) => void;
  onDelete: (item: StoredConversation) => void;
  onNew: () => void;
}

function HistoryContent({ items, selectedId, onSelect, onRename, onDelete, onNew }: HistoryProps) {
  return (
    <>
      <button className="app-button app-button--secondary app-chat-history__new" type="button" onClick={onNew}>
        <PlusIcon aria-hidden="true" /> Hội thoại mới
      </button>
      {items.length === 0 && <p className="app-chat-history__empty">Chưa có hội thoại nào được lưu trên trình duyệt này.</p>}
      {items.length > 0 && (
        <nav className="app-chat-history__list" aria-label="Các hội thoại đã lưu">
          {items.map((item) => (
            <section className={item.id === selectedId ? "is-current" : undefined} key={item.id}>
              <button type="button" className="app-chat-history__open" onClick={() => onSelect(item.id)}>
                <strong>{item.title}</strong>
                <small>{item.turns.length} lượt · {shortDate(item.updatedAt)}</small>
              </button>
              <details className="app-history-actions">
                <summary aria-label={`Tùy chọn cho ${item.title}`}><DotsThreeVerticalIcon aria-hidden="true" /></summary>
                <div>
                  <button type="button" onClick={() => onRename(item)} aria-label={`Đổi tên ${item.title}`}>Đổi tên</button>
                  <button type="button" onClick={() => onDelete(item)} aria-label={`Xóa ${item.title}`}>Xóa</button>
                </div>
              </details>
            </section>
          ))}
        </nav>
      )}
    </>
  );
}

function AnswerView({ answer, onOpenSource }: { answer: ChatStreamAnswer; onOpenSource: (source: SourceRecord) => void }) {
  const disclaimer = <p className="app-answer-disclaimer">{answer.disclaimer}</p>;
  if (answer.state === "answered") {
    return (
      <article className="app-answer">
        <header className="app-assistant-byline"><span>ĐTĐ</span><div><strong>Trợ lý tra cứu</strong><small>Mỗi ý đều kèm đoạn nguồn</small></div></header>
        <SettledAnswer answer={answer} onOpenSource={onOpenSource} />
        {disclaimer}
      </article>
    );
  }
  const refused = answer.state === "insufficient_evidence";
  const Icon = refused ? XCircleIcon : WarningCircleIcon;
  return (
    <section className="app-decision-state app-decision-state--danger" aria-labelledby={`state-${answer.id}`}>
      <Icon weight="fill" aria-hidden="true" />
      <div>
        <p className="app-kicker">{refused ? "Không đưa ra kết luận" : "Ngoài phạm vi tra cứu"}</p>
        <h2 id={`state-${answer.id}`}>{refused ? "Chưa đủ căn cứ trong nguồn đã tra" : "Câu hỏi không thuộc lĩnh vực đái tháo đường"}</h2>
        <SettledAnswer answer={answer} onOpenSource={onOpenSource} />
        {disclaimer}
      </div>
    </section>
  );
}

function PendingView({ pending, onStop, onRetry, onOpenSource }: {
  pending: Pending;
  onStop: () => void;
  onRetry: () => void;
  onOpenSource: (source: SourceRecord) => void;
}) {
  if (pending.status === "streaming") {
    const stream = pending.stream ?? initialChatStreamState;
    return <><StreamProgress state={stream} onStop={onStop} /><StreamingAnswer state={stream} onOpenSource={onOpenSource} /></>;
  }
  const cancelled = pending.status === "cancelled";
  const retryable = cancelled || pending.retryable;
  return (
    <section className={`app-decision-state${cancelled ? "" : " app-decision-state--danger"}`} role={cancelled ? "status" : "alert"} aria-labelledby="pending-error-title">
      <WarningCircleIcon weight="fill" aria-hidden="true" />
      <div>
        <p className="app-kicker">{cancelled ? "Đã dừng theo yêu cầu" : "Không thể hoàn tất tra cứu"}</p>
        <h2 id="pending-error-title">{cancelled ? "Đã dừng tạo câu trả lời" : "Dịch vụ tra cứu đang gián đoạn"}</h2>
        <p>{pending.status === "error" ? pending.message : CANCELLED_MESSAGE}</p>
        {retryable
          ? <button className="app-button app-button--secondary" type="button" onClick={onRetry}>Thử lại</button>
          : <p className="app-decision-state__hint">Hỏi lại nguyên văn sẽ cho kết quả y hệt. Hãy diễn đạt câu hỏi cụ thể hơn.</p>}
      </div>
    </section>
  );
}

export function ChatWorkspace({ initialQuestion, initialConversationId, initialTopic }: {
  initialQuestion?: string;
  initialConversationId?: string;
  initialTopic?: string;
}) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [topic, setTopic] = useState(initialTopic ?? "");
  const [draft, setDraft] = useState("");
  const [history, setHistory] = useState<StoredConversation[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySelectionKey, setHistorySelectionKey] = useState(0);
  const [source, setSource] = useState<SourceRecord | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const historyRef = useRef<StoredConversation[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const lastQuestionRef = useRef("");
  const sourceTriggerRef = useRef<HTMLElement | null>(null);
  const historyTriggerRef = useRef<HTMLButtonElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const stableViewportHeightRef = useRef(0);
  const currentTurnRef = useRef<HTMLElement | null>(null);
  const { ref: scrollRef, pinned, scrollToBottom, anchorToTop } = useStickToBottom(pending?.status === "streaming");

  const busy = pending?.status === "streaming";
  const latestState = pending ? null : turns.at(-1)?.answer.state ?? null;
  const title = conversationId
    ? history.find((item) => item.id === conversationId)?.title ?? rutGonTieuDe(turns[0]?.question)
    : "Hội thoại mới";

  const updateHistory = useCallback((change: (items: StoredConversation[]) => StoredConversation[]) => {
    const next = change(historyRef.current);
    historyRef.current = next;
    setHistory(next);
    saveConversations(next);
  }, []);

  const ask = useCallback(async (questionText: string, activeId: string | null) => {
    const id = activeId ?? crypto.randomUUID();
    setConversationId(id);
    lastQuestionRef.current = questionText;
    setPending({ status: "streaming", question: questionText, stream: null });
    const controller = new AbortController();
    abortRef.current = controller;
    let retryable = true;
    const request: ChatRequest = { message: questionText, conversation_id: id, ...(topic ? { topic } : {}) };
    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: { message?: unknown } } | null;
        throw new UserFacingError(typeof body?.error?.message === "string" ? body.error.message : "Không thể bắt đầu luồng trả lời lúc này.");
      }
      let current = initialChatStreamState;
      let queued: number | null = null;
      const commit = () => {
        queued = null;
        setPending((state) => (state?.status === "streaming" ? { ...state, stream: current } : state));
      };
      commit();
      await readChatStreamV1(response, (event) => {
        current = reduceChatStream(current, event);
        if (current.terminal) {
          if (queued !== null) cancelAnimationFrame(queued);
          commit();
        } else if (queued === null) queued = requestAnimationFrame(commit);
      });
      if (queued !== null) cancelAnimationFrame(queued);
      if (current.phase !== "completed" || !current.finalAnswer) {
        retryable = current.errorRetryable;
        throw new UserFacingError(current.error ?? "Luồng trả lời kết thúc trước khi có kết quả.");
      }
      const answer = current.finalAnswer;
      setTurns((items) => [...items, { question: questionText, answer }]);
      setPending(null);
      updateHistory((items) => appendTurn(items, id, { question: questionText, topic: topic || null, answer }));
      replaceConversationUrl(id);
    } catch (error) {
      const cancelled = error instanceof DOMException && error.name === "AbortError";
      const message = error instanceof UserFacingError || error instanceof ChatStreamProtocolError
        ? error.message
        : error instanceof TypeError ? NETWORK_MESSAGE : GENERIC_MESSAGE;
      setPending(cancelled
        ? { status: "cancelled", question: questionText }
        : { status: "error", question: questionText, message, retryable });
    } finally {
      abortRef.current = null;
    }
  }, [topic, updateHistory]);

  const openConversation = useCallback((id: string) => {
    const found = historyRef.current.find((item) => item.id === id);
    if (!found) return;
    setConversationId(found.id);
    setTurns(found.turns.map(({ question, answer }) => ({ question, answer })));
    setPending(null);
    setHistoryOpen(false);
    setHistorySelectionKey((key) => key + 1);
    replaceConversationUrl(found.id);
  }, []);

  useEffect(() => {
    const task = window.setTimeout(() => {
      const stored = loadConversations();
      historyRef.current = stored;
      setHistory(stored);
      if (initialQuestion) void ask(initialQuestion, null);
      else if (initialConversationId) openConversation(initialConversationId);
    }, 0);
    return () => window.clearTimeout(task);
    // Runs once per mount; the page remounts the workspace when its query changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const viewport = window.visualViewport;
    const currentHeight = () => viewport?.height ?? window.innerHeight;
    stableViewportHeightRef.current = currentHeight();
    const update = () => {
      const height = currentHeight();
      const focused = document.activeElement === composerRef.current;
      if (!focused) stableViewportHeightRef.current = Math.max(stableViewportHeightRef.current, height);
      setKeyboardOpen(focused && stableViewportHeightRef.current - height > 120);
    };
    window.addEventListener("resize", update);
    viewport?.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      window.removeEventListener("resize", update);
      viewport?.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
    };
  }, []);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const desktop = window.matchMedia("(min-width: 64rem)");
    const closeDrawer = (event: MediaQueryListEvent) => { if (event.matches) setHistoryOpen(false); };
    desktop.addEventListener("change", closeDrawer);
    return () => desktop.removeEventListener("change", closeDrawer);
  }, []);

  useLayoutEffect(() => {
    const textarea = composerRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    if (!draft) {
      textarea.style.overflowY = "hidden";
      return;
    }
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
    textarea.style.overflowY = textarea.scrollHeight > 160 ? "auto" : "hidden";
  }, [draft]);

  useLayoutEffect(() => {
    if (historySelectionKey === 0) return;
    const scrollport = scrollRef.current;
    if (!scrollport) return;
    scrollport.scrollTop = 0;
    scrollport.dispatchEvent(new Event("scroll"));
  }, [scrollRef, historySelectionKey]);

  useEffect(() => {
    if (busy) anchorToTop(currentTurnRef.current);
  }, [anchorToTop, busy, pending?.question]);

  function openSource(selected: SourceRecord) {
    sourceTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSource(selected);
  }

  function closeSource() {
    setSource(null);
    const trigger = sourceTriggerRef.current;
    sourceTriggerRef.current = null;
    window.setTimeout(() => { if (trigger?.isConnected) trigger.focus(); }, 0);
  }

  function startNewConversation() {
    abortRef.current?.abort();
    setConversationId(null);
    setTurns([]);
    setPending(null);
    setHistoryOpen(false);
    replaceConversationUrl();
  }

  function rename(item: StoredConversation) {
    const next = window.prompt("Tên mới của hội thoại", item.title)?.trim();
    if (next && next !== item.title) updateHistory((items) => renameConversation(items, item.id, next));
  }

  function remove(item: StoredConversation) {
    if (!window.confirm(`Xóa hội thoại “${item.title}”?`)) return;
    updateHistory((items) => removeConversation(items, item.id));
    if (conversationId === item.id) startNewConversation();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const questionText = draft.trim();
    if (!questionText || busy) return;
    setDraft("");
    void ask(questionText, conversationId);
  }

  function changeHistoryOpen(open: boolean) {
    setHistoryOpen(open);
    if (!open) window.requestAnimationFrame(() => historyTriggerRef.current?.focus());
  }

  const historyProps: HistoryProps = {
    items: history,
    selectedId: conversationId,
    onSelect: openConversation,
    onRename: rename,
    onDelete: remove,
    onNew: startNewConversation,
  };
  const empty = turns.length === 0 && !pending;

  return (
    <IconContext.Provider value={{ weight: "bold" }}>
      <div className="app-chat-workspace" data-keyboard-open={keyboardOpen ? "true" : undefined}>
        <aside className="app-chat-history-rail" aria-label="Lịch sử hội thoại">
          <div className="app-chat-history-rail__heading"><h2>Hội thoại</h2></div>
          <HistoryContent {...historyProps} />
        </aside>
        <Dialog.Root open={historyOpen} onOpenChange={changeHistoryOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="app-chat-history-overlay" />
            <Dialog.Content className="app-chat-history-dialog" id="app-chat-history-dialog" aria-describedby="app-chat-history-description">
              <div className="app-chat-history-dialog__heading">
                <div><Dialog.Title>Lịch sử hội thoại</Dialog.Title></div>
                <Dialog.Close className="app-icon-button" aria-label="Đóng lịch sử"><XIcon aria-hidden="true" /></Dialog.Close>
              </div>
              <HistoryContent {...historyProps} />
              <p className="sr-only" id="app-chat-history-description">Các hội thoại lưu trên trình duyệt này.</p>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <section className="app-chat-column">
          <header className="app-chat-toolbar">
            <button ref={historyTriggerRef} className="app-chat-history-button" type="button" onClick={() => setHistoryOpen(true)} aria-label="Mở lịch sử hội thoại" aria-expanded={historyOpen} aria-controls="app-chat-history-dialog">
              <ListIcon aria-hidden="true" /> <span className="app-chat-history-button__label">Lịch sử</span>
            </button>
            <div className="app-chat-title">
              <h1 title={title}>{title}</h1>
              <p className="app-chat-title__lead">{empty ? "Đặt câu hỏi đầu tiên về đái tháo đường." : "Câu trả lời và nguồn của hội thoại đang mở."}</p>
            </div>
            {latestState && (
              <span className={`app-status app-status--${latestState === "answered" ? "success" : "danger"}`}>
                <span className="app-status__scope">Lượt mới nhất: </span>{STATE_LABELS[latestState]}
              </span>
            )}
          </header>
          <div className="app-conversation-context">
            <label className="chat-topic-picker">
              <span>Chủ đề</span>
              <select value={topic} onChange={(event) => setTopic(event.target.value)} disabled={busy} aria-label="Lọc truy xuất theo chủ đề">
                <option value="">Tất cả chủ đề</option>
                {Object.entries(TOPIC_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>
          <div className="app-chat-scroll" ref={scrollRef}>
            {turns.map((turn, index) => (
              <section className="app-chat-turn" key={turn.answer.id} data-latest={index === turns.length - 1 && !pending ? "true" : undefined}>
                <div className="app-question-message"><div><strong>Bạn</strong></div><p>{turn.question}</p></div>
                <AnswerView answer={turn.answer} onOpenSource={openSource} />
              </section>
            ))}
            {pending && (
              <section className="app-chat-turn" ref={currentTurnRef}>
                <div className="app-question-message"><div><strong>Bạn</strong></div><p>{pending.question}</p></div>
                <PendingView pending={pending} onStop={() => abortRef.current?.abort()} onRetry={() => void ask(lastQuestionRef.current, conversationId)} onOpenSource={openSource} />
              </section>
            )}
            {empty && (
              <section className="app-chat-empty" aria-labelledby="empty-title">
                <span className="app-empty-monogram" aria-hidden="true">ĐTĐ</span>
                <h2 id="empty-title">Hỏi về đái tháo đường</h2>
                <p>Tôi chỉ trả lời dựa trên các nguồn y tế đã thu thập. Mỗi ý đều kèm trích dẫn mở được đoạn nguồn.</p>
                <div>{SUGGESTIONS.map((item) => <button type="button" key={item} onClick={() => void ask(item, conversationId)}>{item}</button>)}</div>
              </section>
            )}
          </div>
          {!pinned && !empty && (
            <button className="app-icon-button app-scroll-to-end" type="button" onClick={() => scrollToBottom()} aria-label="Xuống cuối hội thoại" title="Xuống cuối hội thoại">
              <ArrowDownIcon weight="bold" aria-hidden="true" />
            </button>
          )}
          <form className="app-composer" onSubmit={submit}>
            <label className="sr-only" htmlFor="chat-question">Đặt câu hỏi</label>
            <div className="app-composer__control">
              <textarea
                id="chat-question"
                ref={composerRef}
                rows={1}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.nativeEvent.isComposing || event.shiftKey) return;
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }}
                placeholder="Nhập câu hỏi về đái tháo đường…"
                aria-describedby="chat-question-help"
                disabled={busy}
              />
              <button type="submit" aria-label="Gửi câu hỏi" disabled={!draft.trim() || busy}><PaperPlaneTiltIcon aria-hidden="true" /></button>
            </div>
            <div className="app-composer__meta">
              <small id="chat-question-help">Thông tin tham khảo, không thay thế tư vấn của bác sĩ.</small>
              <span className="app-composer__hint"><kbd>Enter</kbd> để gửi · <kbd>Shift</kbd> + <kbd>Enter</kbd> xuống dòng</span>
            </div>
          </form>
        </section>
        <Dialog.Root open={source !== null} onOpenChange={(open) => !open && closeSource()}>
          {source && <CitationSheet source={source} onClose={closeSource} />}
        </Dialog.Root>
      </div>
    </IconContext.Provider>
  );
}
