"use client";

import { CheckCircleIcon, CircleNotchIcon, CopyIcon, InfoIcon, QuestionIcon, SirenIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { citationMarker, ResponseMarkdown } from "@/components/product/response-markdown";
import { languageLabel, SourceCollection } from "@/components/product/source-collection";
import type { AnswerSection, AnswerToken, AnswerWarning, ChatStreamAnswer, SourceRecord } from "@/lib/chat-stream-contract";
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
      {sections.map((section) => {
        const alert = section.kind === "emergency";
        const copy = (
          <div className="chat-stream-section-copy">
            <ResponseMarkdown content={toMarkdown(section.content)} renderCitation={renderCitation} />
          </div>
        );
        return (
          <section
            className={`response-domain-section response-domain-section--${section.kind}`}
            key={section.id}
            role={alert && settled ? "alert" : undefined}
            data-writing={section.id === activeSectionId ? "true" : undefined}
          >
            {alert && <SirenIcon className="response-domain-section__icon" weight="fill" aria-hidden="true" />}
            {section.kind === "question" && <QuestionIcon className="response-domain-section__icon" weight="fill" aria-hidden="true" />}
            {alert || section.kind === "question" ? (
              <div className="response-domain-section__body">
                <h3>{section.title}</h3>
                {copy}
              </div>
            ) : (
              <>
                {section.kind !== "notice" && <h3>{section.title}</h3>}
                {copy}
              </>
            )}
          </section>
        );
      })}
    </>
  );
}

export function StreamProgress({ state, onStop }: { state: ChatStreamState; onStop: () => void }) {
  const last = state.steps.at(-1);
  const liveText = state.answerState
    ? "Đang hiển thị câu trả lời đã qua kiểm an toàn"
    : state.sources.length > 0
      ? `Đã tìm thấy ${state.sources.length} đoạn nguồn, đang soạn câu trả lời`
      : last
        ? `Xong bước ${last.label}, đang chờ agent tiếp theo`
        : "Các agent đang bắt đầu xử lý";
  return (
    <section className="chat-stream-progress" aria-busy={!state.terminal} aria-labelledby="stream-progress-title">
      <div className="app-assistant-byline">
        <span>ĐTĐ</span>
        <div>
          <strong id="stream-progress-title">Đang xử lý</strong>
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

/** Small notices for what the safety agents changed or stopped, for example a removed dose. */
export function AnswerWarnings({ warnings }: { warnings: AnswerWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <ul className="chat-stream-warnings" aria-label="Lưu ý của lớp an toàn">
      {warnings.map((warning) => (
        <li key={warning.code} data-code={warning.code}><InfoIcon aria-hidden="true" /><span>{warning.message}</span></li>
      ))}
    </ul>
  );
}

const NO_SOURCE_STATES = new Set<ChatStreamAnswer["state"]>(["out_of_scope", "emergency", "needs_info"]);

export function SettledAnswer({ answer, onOpenSource }: { answer: ChatStreamAnswer; onOpenSource: (source: SourceRecord) => void }) {
  const answered = answer.state === "answered";
  const cited = answer.sources.some((source) => source.role === "supporting");
  return (
    <article className="chat-stream-answer" aria-label="Câu trả lời">
      <AnswerSections sections={answer.sections} sources={answer.sources} settled onOpenSource={onOpenSource} />
      <AnswerWarnings warnings={answer.warnings} />
      {answered && <CopyActions answer={answer} />}
      {answer.sources.length > 0 && !NO_SOURCE_STATES.has(answer.state) && (
        <SourceCollection
          sources={answer.sources}
          labels={citationLabels(answer.sections)}
          onOpen={onOpenSource}
          title={cited ? "Nguồn trích dẫn" : "Nguồn đã rà soát"}
          kicker={cited ? "Căn cứ đã dùng" : answered ? "Không dùng làm căn cứ" : "Không đủ để kết luận"}
        />
      )}
    </article>
  );
}
