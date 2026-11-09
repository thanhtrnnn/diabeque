import type { ReactNode } from "react";

import { safeExternalUrl } from "@/lib/format";

type Block =
  | { kind: "p"; text: string }
  | { kind: "h"; text: string }
  | { kind: "ul" | "ol"; items: string[] };

const CITATION = /\uE000(\d+)\uE001/gu;
const INLINE = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(?<![*\w])\*([^*\s][^*]*)\*(?!\w)/gu;
const HEADING = /^#{1,4}\s+(.+)$/u;
const BULLET = /^[-*•]\s+(.+)$/u;
const NUMBERED = /^\d{1,2}[.)]\s+(.+)$/u;

export function parseBlocks(content: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length > 0) blocks.push({ kind: "p", text: paragraph.join(" ") });
    paragraph = [];
  };
  for (const line of content.replaceAll("\r\n", "\n").split("\n")) {
    const text = line.trim();
    const heading = HEADING.exec(text);
    const item = BULLET.exec(text) ?? NUMBERED.exec(text);
    if (!text) flush();
    else if (heading) {
      flush();
      blocks.push({ kind: "h", text: heading[1] });
    } else if (item) {
      flush();
      const kind = BULLET.test(text) ? "ul" : "ol";
      const last = blocks.at(-1);
      if (last && last.kind === kind) last.items.push(item[1]);
      else blocks.push({ kind, items: [item[1]] });
    } else paragraph.push(text);
  }
  flush();
  return blocks;
}

export const citationMarker = (label: number) => `\uE000${label}\uE001`;

type RenderCitation = (label: number, key: string) => ReactNode;

function plain(text: string, key: string, renderCitation?: RenderCitation): ReactNode[] {
  if (!renderCitation) return [text];
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(CITATION)) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    nodes.push(renderCitation(Number(match[1]), `${key}-c${match.index}`));
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function inline(text: string, renderCitation?: RenderCitation): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(INLINE)) {
    const key = `${match.index}`;
    if (match.index > cursor) nodes.push(...plain(text.slice(cursor, match.index), `${key}-p`, renderCitation));
    const [, bold, code, label, href, italic] = match;
    if (bold) nodes.push(<strong key={key}>{plain(bold, key, renderCitation)}</strong>);
    else if (code) nodes.push(<code key={key}>{code}</code>);
    else if (italic) nodes.push(<em key={key}>{plain(italic, key, renderCitation)}</em>);
    else {
      const safe = safeExternalUrl(href);
      nodes.push(safe ? <a key={key} href={safe} target="_blank" rel="noreferrer">{label}</a> : label);
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) nodes.push(...plain(text.slice(cursor), "tail", renderCitation));
  return nodes;
}

interface ResponseMarkdownProps {
  content: string;
  className?: string;
  /** Renders `citationMarker(n)` occurrences in place, so a chip stays on the sentence it supports. */
  renderCitation?: RenderCitation;
}

export function ResponseMarkdown({ content, className, renderCitation }: ResponseMarkdownProps) {
  return (
    <div className={className}>
      {parseBlocks(content).map((block, index) => {
        if (block.kind === "h") return <h3 key={index}>{inline(block.text, renderCitation)}</h3>;
        if (block.kind === "p") return <p key={index}>{inline(block.text, renderCitation)}</p>;
        const List = block.kind;
        return <List key={index}>{block.items.map((item, i) => <li key={i}>{inline(item, renderCitation)}</li>)}</List>;
      })}
    </div>
  );
}
