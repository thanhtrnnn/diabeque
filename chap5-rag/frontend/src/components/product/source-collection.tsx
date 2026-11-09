"use client";

import { useId, useMemo } from "react";

import type { RetrievalBranch, SourceRecord, SourceRole } from "@/lib/chat-stream-contract";
import { safeExternalUrl } from "@/lib/format";

export const SOURCE_ROLE_LABELS: Record<SourceRole, string> = {
  supporting: "Căn cứ trả lời",
  context: "Nguồn tham khảo",
};
export const BRANCH_LABELS: Record<RetrievalBranch, string> = {
  bm25: "BM25",
  vector: "Vector",
  graph: "Đồ thị",
};

export function languageLabel(lang: string): string {
  return lang.toLowerCase().startsWith("vi") ? "VI" : lang.toUpperCase();
}

interface SourceGroup {
  documentId: string;
  title: string;
  publisher: string;
  lang: string;
  url: string | null;
  rows: SourceRecord[];
}

function groupByDocument(sources: SourceRecord[]): SourceGroup[] {
  const groups = new Map<string, SourceGroup>();
  for (const source of [...sources].sort((a, b) => a.retrieval_rank - b.retrieval_rank)) {
    const group = groups.get(source.document_id);
    if (group) {
      group.rows.push(source);
      group.url ??= safeExternalUrl(source.source_url);
    } else {
      groups.set(source.document_id, {
        documentId: source.document_id,
        title: source.document_title,
        publisher: source.publisher,
        lang: source.lang,
        url: safeExternalUrl(source.source_url),
        rows: [source],
      });
    }
  }
  return [...groups.values()];
}

function snippet(excerpt: string): string {
  const flat = excerpt.replace(/\s+/gu, " ").trim();
  return flat.length > 160 ? `${flat.slice(0, 160).replace(/\s+\S*$/u, "")}…` : flat;
}

function SourceGroups({ sources, labels, onOpen }: {
  sources: SourceRecord[];
  labels: ReadonlyMap<string, number>;
  onOpen: (source: SourceRecord) => void;
}) {
  return (
    <ul className="chat-stream-source-groups" aria-label="Danh sách nguồn">
      {groupByDocument(sources).map((group) => (
        <li className="chat-stream-source-group" key={group.documentId}>
          <div className="chat-stream-source-group__doc">
            <div className="chat-stream-source-group__id">
              <strong>{group.publisher}</strong>
              <span className="chat-stream-source-lang" data-lang={languageLabel(group.lang)}>{languageLabel(group.lang)}</span>
            </div>
            <span className="chat-stream-source-group__title">{group.title}</span>
            {group.url && (
              <a className="chat-stream-source-group__link" href={group.url} target="_blank" rel="noreferrer" aria-label={`Mở nguồn gốc ${group.title}`}>
                Xem nguồn gốc
              </a>
            )}
          </div>
          <ul className="chat-stream-source-provisions" aria-label={`Đoạn đã tra trong ${group.title}`}>
            {group.rows.map((row) => {
              const label = row.citation_id ? labels.get(row.citation_id) : undefined;
              const body = (
                <>
                  <span className="chat-stream-source-provision__path">
                    <span className="chat-stream-source-provision__label">{label ? `[${label}] ` : ""}{snippet(row.excerpt)}</span>
                    <span className="chat-stream-source-provision__clause">
                      {row.retrieved_by.map((branch) => BRANCH_LABELS[branch]).join(" · ")}
                    </span>
                  </span>
                  <span className="chat-stream-source-role" data-role={row.role}>{SOURCE_ROLE_LABELS[row.role]}</span>
                </>
              );
              return (
                <li key={row.source_id}>
                  <button type="button" onClick={() => onOpen(row)} aria-label={`Mở đoạn trích từ ${group.title}`}>{body}</button>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}

export function SourceCollection({ sources, labels, onOpen, title = "Nguồn trích dẫn", kicker = "Căn cứ đã dùng" }: {
  sources: SourceRecord[];
  /** citation_id to the [n] number shown inline in the answer. */
  labels: ReadonlyMap<string, number>;
  onOpen: (source: SourceRecord) => void;
  title?: string;
  kicker?: string;
}) {
  const headingId = useId();
  const supporting = useMemo(() => sources.filter((s) => s.role === "supporting"), [sources]);
  const context = useMemo(() => sources.filter((s) => s.role === "context"), [sources]);
  const documents = useMemo(() => new Set(sources.map((s) => s.document_id)).size, [sources]);
  return (
    <section className="chat-stream-sources" aria-labelledby={headingId}>
      <div className="chat-stream-sources__heading">
        <div><p className="app-kicker">{kicker}</p><h3 id={headingId}>{title}</h3></div>
        <span>{documents} tài liệu · {sources.length} đoạn</span>
      </div>
      {supporting.length > 0 && <SourceGroups sources={supporting} labels={labels} onOpen={onOpen} />}
      {supporting.length === 0 && context.length === 0 && (
        <p className="chat-stream-source-empty">Câu trả lời này không kèm nguồn nào.</p>
      )}
      {context.length > 0 && (
        <details className="chat-stream-sources__details">
          <summary>{SOURCE_ROLE_LABELS.context} ({context.length}) đã rà nhưng không dùng làm căn cứ</summary>
          <SourceGroups sources={context} labels={labels} onOpen={onOpen} />
        </details>
      )}
    </section>
  );
}
