"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ArrowSquareOutIcon, CheckCircleIcon, CopyIcon, XIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

import { BRANCH_LABELS, languageLabel, SOURCE_ROLE_LABELS } from "@/components/product/source-collection";
import type { SourceRecord } from "@/lib/chat-stream-contract";
import { safeExternalUrl } from "@/lib/format";

const COPY_FEEDBACK_MS = 2000;

function citationText(source: SourceRecord): string {
  const url = safeExternalUrl(source.source_url);
  return [source.document_title, `${source.publisher} · ${languageLabel(source.lang)}`, source.excerpt, url].filter(Boolean).join("\n");
}

export function CitationSheet({ source, onClose }: { source: SourceRecord; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const url = safeExternalUrl(source.source_url);
  const paragraphs = source.excerpt.split(/\n{2,}/u).map((p) => p.trim()).filter(Boolean);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function copy() {
    await navigator.clipboard?.writeText(citationText(source));
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
  }

  return (
    <Dialog.Portal>
      <Dialog.Overlay className="app-sheet-overlay" />
      <Dialog.Content className="app-citation-sheet" aria-describedby="citation-description">
        <div className="app-citation-sheet__header citation-sheet__header--sticky">
          <div className="citation-sheet__identity">
            <p className="app-kicker">{SOURCE_ROLE_LABELS[source.role]}</p>
            <Dialog.Title>{source.document_title}</Dialog.Title>
            <p className="citation-sheet__provision">
              <span>{source.publisher}</span>
              <span className="chat-stream-source-lang" data-lang={languageLabel(source.lang)}>{languageLabel(source.lang)}</span>
            </p>
          </div>
          <div className="citation-sheet__header-actions">
            {url && <a className="citation-sheet__header-link" href={url} target="_blank" rel="noreferrer">Nguồn gốc</a>}
            <button className="app-icon-button" type="button" onClick={copy} aria-label="Sao chép trích dẫn">
              {copied ? <CheckCircleIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
            </button>
            <Dialog.Close className="app-icon-button" aria-label="Đóng nguyên văn" onClick={onClose}>
              <XIcon aria-hidden="true" />
            </Dialog.Close>
          </div>
        </div>
        <section className="app-citation-sheet__intro" id="citation-description">
          <strong>Đoạn nguồn đã dùng</strong>
          <p>
            Hạng truy xuất {source.retrieval_rank} · điểm {source.normalized_score.toFixed(2)} · truy xuất bằng {source.retrieved_by.map((b) => BRANCH_LABELS[b]).join(", ") || "không rõ"}.
          </p>
        </section>
        <article className="citation-excerpt">
          <h3>Nguyên văn</h3>
          {paragraphs.map((paragraph, index) => <p className="citation-excerpt__body" key={index}>{paragraph}</p>)}
        </article>
        <div className="app-citation-sheet__actions">
          <p className="sr-only" role="status">{copied ? "Đã sao chép trích dẫn." : ""}</p>
          <button className="app-button app-button--primary" type="button" onClick={copy}>
            {copied ? <CheckCircleIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
            {copied ? "Đã sao chép" : "Sao chép trích dẫn"}
          </button>
          {url && (
            <a className="app-button app-button--secondary" href={url} target="_blank" rel="noreferrer">
              <ArrowSquareOutIcon aria-hidden="true" /> Mở nguồn gốc
            </a>
          )}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  );
}
