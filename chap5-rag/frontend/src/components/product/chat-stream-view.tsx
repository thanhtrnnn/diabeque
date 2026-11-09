"use client";

import { CheckCircleIcon, CircleNotchIcon, CopyIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { citationMarker, ResponseMarkdown } from "@/components/product/response-markdown";
import { languageLabel, SourceCollection } from "@/components/product/source-collection";
import type { AnswerSection, AnswerToken, ChatStreamAnswer, SourceRecord } from "@/lib/chat-stream-contract";
import type { ChatStreamState } from "@/lib/chat-stream-reducer";

function toMarkdown(content: AnswerToken[]): string {
  return content.map((token) => (token.type === "text" ? token.text : citationMarker(token.label))).join("");
}

export function citationLabels(sections: AnswerSection[]): Map<string, number> {
  const labels = new Map<string, number>();
  for (const { content } of sections) for (const token of content) if (token.type === "citation") labels.set(token.citation_id, token.label);
  return labels;
}

function sourcesByCitation(sources: SourceRecord[]): Map<string, SourceRecord> {
  return new Map(sources.flatMap((source) => (source.citation_id ? [[source.citation_id, source] as const] : [])));
}

export function AnswerSections({ sections, sources, settled, activeSectionId = null, onOpenSource }: {
  sections: AnswerSection[];
  sources: SourceRecord[];
  settled: boolean;
  activeSectionId?: string | null;
  onOpenSource: (source: SourceRecord) => void;
}) {
  const byCitation = useMemo(() => sourcesByCitation(sources), [sources]);
  const idByLabel = useMemo(() => new Map([...citationLabels(sections)].map(([id, label]) => [label, id])), [sections]);
  const renderCitation = (label: number, key: string) => {
    const id = idByLabel.get(label);
    const source = id ? byCitation.get(id) : undefined;
    return (
      <button
        className="chat-stream-citation-chip"
        type="button"
        key={key}
        aria-label={source ? `Mở trích dẫn số ${label}` : `Trích dẫn số ${label} mở được khi câu trả lời hoàn tất`}
        onClick={() => source && onOpenSource(source)}
        disabled={!source}
      >[{label}]</button>
    );
  };
  return (
    <>
      <p className="sr-only" role="status">{settled ? "Câu trả lời đã hiển thị đầy đủ." : "Đang hiển thị câu trả lời."}</p>
      {sections.map((section) => (
        <section
          className={`response-domain-section response-domain-section--${section.kind}`}
          key={section.id}
          data-writing={section.id === activeSectionId ? "true" : undefined}
        >
          {section.kind !== "notice" && <h3>{section.title}</h3>}
          <div className="chat-stream-section-copy">
            <ResponseMarkdown content={toMarkdown(section.content)} renderCitation={renderCitation} />
          </div>
        </section>
      ))}
    </>
  );
}

export function StreamProgress({ state, onStop }: { state: ChatStreamState; onStop: () => void }) {
  const liveText = state.answerState
    ? "Đang hiển thị câu trả lời đã kiểm chứng nguồn"
    : state.sources.length > 0
      ? `Đã tìm thấy ${state.sources.length} đoạn nguồn, đang soạn câu trả lời`
      : "Đang tra cứu nguồn trong đồ thị tri thức";
  return (
    <section className="chat-stream-progress" aria-busy={!state.terminal} aria-labelledby="stream-progress-title">
      <div className="app-assistant-byline">
        <span>ĐTĐ</span>
        <div>
          <strong id="stream-progress-title">Đang tra cứu</strong>
          <small aria-live="polite" aria-atomic="true">{liveText}</small>
        </div>
      </div>
      {!state.terminal && (
        <>
          <CircleNotchIcon className="is-spinning" aria-hidden="true" />
          <button className="app-button app-button--secondary chat-stream-stop" type="button" onClick={onStop}>Dừng tạo câu trả lời</button>
        </>
      )}
    </section>
  );
}

export function StreamingAnswer({ state, onOpenSource }: { state: ChatStreamState; onOpenSource: (source: SourceRecord) => void }) {
  if (!state.answerState) return null;
  const writing = state.sections.find((section) => !section.completed)?.id ?? null;
  return (
    <article className="chat-stream-answer" aria-label="Câu trả lời đang soạn">
      <AnswerSections sections={state.sections} sources={state.sources} settled={false} activeSectionId={writing} onOpenSource={onOpenSource} />
    </article>
  );
}

function withSources(answer: ChatStreamAnswer): string {
  const notes = answer.citations.map((citation) => {
    const label = citationLabels(answer.sections).get(citation.id);
    return `[${label}] ${citation.label} · ${citation.publisher} · ${languageLabel(citation.lang)}${citation.source_url ? ` · ${citation.source_url}` : ""}`;
  });
  return [answer.answer, notes.length > 0 ? `Nguồn\n${notes.join("\n")}` : "", answer.disclaimer].filter(Boolean).join("\n\n");
}

const COPY_FEEDBACK_MS = 2000;

export function CopyActions({ answer }: { answer: ChatStreamAnswer }) {
  const [copied, setCopied] = useState<"plain" | "sources" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function copy(kind: "plain" | "sources") {
    await navigator.clipboard?.writeText(kind === "plain" ? `${answer.answer}\n\n${answer.disclaimer}` : withSources(answer));
    setCopied(kind);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), COPY_FEEDBACK_MS);
  }

  const button = (kind: "plain" | "sources", idle: string, done: string) => (
    <button type="button" className="app-button app-button--secondary" onClick={() => void copy(kind)}>
      {copied === kind ? <CheckCircleIcon weight="fill" aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
      {copied === kind ? done : idle}
    </button>
  );
  return (
    <div className="chat-stream-answer-actions">
      <p className="sr-only" role="status">{copied ? "Đã sao chép." : ""}</p>
      {button("plain", "Sao chép câu trả lời", "Đã sao chép câu trả lời")}
      {button("sources", "Sao chép kèm nguồn", "Đã sao chép kèm nguồn")}
    </div>
  );
}

export function SettledAnswer({ answer, onOpenSource }: { answer: ChatStreamAnswer; onOpenSource: (source: SourceRecord) => void }) {
  const answered = answer.state === "answered";
  return (
    <article className="chat-stream-answer" aria-label="Câu trả lời">
      <AnswerSections sections={answer.sections} sources={answer.sources} settled onOpenSource={onOpenSource} />
      {answered && <CopyActions answer={answer} />}
      {answer.sources.length > 0 && answer.state !== "out_of_scope" && (
        <SourceCollection
          sources={answer.sources}
          labels={citationLabels(answer.sections)}
          onOpen={onOpenSource}
          title={answered ? "Nguồn trích dẫn" : "Nguồn đã rà soát"}
          kicker={answered ? "Căn cứ đã dùng" : "Không đủ để kết luận"}
        />
      )}
    </article>
  );
}
