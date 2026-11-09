"use client";

import { ArrowLeftIcon, ArrowSquareOutIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { GraphCanvas } from "@/components/product/graph-canvas";
import { StatePanel } from "@/components/product/portal-state";
import { languageLabel } from "@/components/product/source-collection";
import { fetchGraph, fetchSource } from "@/lib/api-client";
import { safeExternalUrl } from "@/lib/format";
import {
  countByLabel,
  DISEASES,
  type GraphNode,
  type GraphView,
  groupNeighbors,
  labelName,
  limitGroup,
  relationName,
} from "@/lib/graph";
import { useRemote } from "@/lib/use-remote";

import styles from "./knowledge-graph.module.css";

interface TrailStep {
  id: string;
  name: string;
}

const PER_GROUP_STEP = 4;
const PER_GROUP_MAX = 12;
const arrow = (direction: "out" | "in") => (direction === "out" ? "→" : "←");

function SourcePanel({ view }: { view: GraphView }) {
  const { center, neighbors } = view;
  const chunkId = center.label === "Chunk" ? center.id : center.label === "Document" ? neighbors.find((n) => n.node.label === "Chunk")?.node.id : undefined;
  const { data: source, error, loading } = useRemote(chunkId ?? null, fetchSource);
  if (!chunkId) return null;
  if (loading) return <p className={styles.muted} role="status">Đang tải nguồn…</p>;
  if (error || !source) return <p className={styles.muted} role="alert">{error ?? "Không tải được nguồn."}</p>;
  const url = safeExternalUrl(source.source_url);
  return (
    <section className={styles.source} aria-label="Nguồn của nút này">
      <p className={styles.sourceMeta}>
        <strong>{source.document_title}</strong>
        <span>{source.publisher}</span>
        <span className="chat-stream-source-lang" data-lang={languageLabel(source.lang)}>{languageLabel(source.lang)}</span>
      </p>
      {center.label === "Chunk" && <blockquote className={styles.excerpt}>{source.excerpt}</blockquote>}
      {url && (
        <a className="app-button app-button--secondary" href={url} target="_blank" rel="noreferrer">
          <ArrowSquareOutIcon aria-hidden="true" /> Mở nguồn gốc
        </a>
      )}
    </section>
  );
}

function Explorer({ view, onSelect }: { view: GraphView; onSelect: (node: GraphNode) => void }) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState("");
  const [perGroup, setPerGroup] = useState(PER_GROUP_STEP);
  const { center, neighbors } = view;
  const matched = groupNeighbors(neighbors, { hidden, query });
  const shown = matched.map((group) => limitGroup(group, perGroup));
  const matchedCount = matched.reduce((sum, group) => sum + group.items.length, 0);
  const shownCount = shown.reduce((sum, group) => sum + group.items.length, 0);
  const toggle = (label: string) =>
    setHidden((current) => {
      const next = new Set(current);
      if (!next.delete(label)) next.add(label);
      return next;
    });

  return (
    <div className={styles.layout}>
      <section className={styles.canvasPane} aria-labelledby="graph-canvas-title">
        <h2 id="graph-canvas-title" className={styles.paneTitle}>Lân cận của {center.name}</h2>
        {neighbors.length === 0 ? (
          <p className={styles.muted}>Nút này không có nút lân cận.</p>
        ) : (
          <>
            <div className={styles.filters} role="group" aria-label="Chú giải và bộ lọc theo loại nút">
              {countByLabel(neighbors).map(([label, count]) => (
                <button key={label} type="button" className={`${styles.chip} ${styles.tone}`} data-label={label} aria-pressed={!hidden.has(label)} onClick={() => toggle(label)}>
                  <i aria-hidden="true" />{labelName(label)}<small>{count}</small>
                </button>
              ))}
            </div>
            <GraphCanvas center={center} groups={shown} onSelect={onSelect} />
          </>
        )}
      </section>
      <aside className={styles.panel} aria-label="Chi tiết và danh sách lân cận">
        <div className={`${styles.centerCard} ${styles.tone}`} data-label={center.label}>
          <p className={styles.centerKind}><i aria-hidden="true" />{labelName(center.label)}</p>
          <h3>{center.name}</h3>
          <code>{center.id}</code>
          <SourcePanel view={view} />
        </div>
        {neighbors.length > 0 && (
          <>
            <label className={styles.search}>
              <MagnifyingGlassIcon aria-hidden="true" />
              <span className="sr-only">Tìm trong các nút lân cận</span>
              <input type="search" value={query} placeholder="Tìm trong các nút lân cận" onChange={(event) => setQuery(event.target.value)} />
            </label>
            <div className={styles.listBar}>
              <span role="status">Hiển thị {shownCount}/{matchedCount} nút lân cận</span>
              <button type="button" className="app-button app-button--secondary" disabled={perGroup >= PER_GROUP_MAX || shownCount >= matchedCount} onClick={() => setPerGroup((n) => Math.min(n + PER_GROUP_STEP, PER_GROUP_MAX))}>
                Hiện thêm
              </button>
            </div>
            {shown.map((group, index) => (
              <section key={group.key} className={`${styles.group} ${styles.tone}`} data-label={group.label} aria-label={`${labelName(group.label)}, quan hệ ${relationName(group.rel)}`}>
                <h4>
                  <i aria-hidden="true" />
                  {labelName(group.label)}
                  <small>{arrow(group.direction)} {relationName(group.rel)} · {group.items.length}/{matched[index].items.length}</small>
                </h4>
                <ul>
                  {group.items.map(({ node }) => (
                    <li key={node.id}>
                      <button type="button" onClick={() => onSelect(node)}>{node.name}</button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {matched.length === 0 && <p className={styles.muted}>Không có nút nào khớp bộ lọc.</p>}
          </>
        )}
      </aside>
    </div>
  );
}

export function KnowledgeGraph({ initialNode }: { initialNode: string }) {
  const [trail, setTrail] = useState<TrailStep[]>([{ id: initialNode, name: DISEASES.find((d) => d.id === initialNode)?.name ?? initialNode }]);
  const current = trail[trail.length - 1];
  const { data: view, error, loading, retry } = useRemote(current.id, fetchGraph);
  const select = (node: GraphNode) => setTrail((steps) => [...steps, { id: node.id, name: node.name }]);

  return (
    <div className={styles.workbench}>
      <div className={styles.diseases} role="group" aria-label="Chọn bệnh">
        {DISEASES.map(({ id, name }) => (
          <button key={id} type="button" className={styles.disease} aria-pressed={trail[0].id === id} onClick={() => setTrail([{ id, name }])}>{name}</button>
        ))}
      </div>
      <nav className={styles.trail} aria-label="Đường đi trên đồ thị">
        <button type="button" className="app-button app-button--secondary" disabled={trail.length < 2} onClick={() => setTrail((steps) => steps.slice(0, -1))}>
          <ArrowLeftIcon aria-hidden="true" /> Quay lại
        </button>
        <ol>
          {trail.map((step, index) => (
            <li key={`${index}:${step.id}`}>
              {index === trail.length - 1 ? (
                <span aria-current="location" title={step.name}>{step.name}</span>
              ) : (
                <button type="button" title={step.name} onClick={() => setTrail((steps) => steps.slice(0, index + 1))}>{step.name}</button>
              )}
            </li>
          ))}
        </ol>
      </nav>
      {loading && <StatePanel tone="loading" embedded title="Đang tải đồ thị" description="Đang lấy các nút lân cận từ KB_diabet." />}
      {error && (
        <StatePanel tone="error" embedded title="Không tải được đồ thị" description={error}
          actions={<button type="button" className="app-button app-button--primary" onClick={retry}>Thử lại</button>} />
      )}
      {view && <Explorer key={view.center.id} view={view} onSelect={select} />}
    </div>
  );
}
