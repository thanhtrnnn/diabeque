"use client";

import { useCallback } from "react";

import { ArchitectureDiagram } from "@/components/product/architecture-diagram";
import { StatePanel } from "@/components/product/portal-state";
import { fetchAgents } from "@/lib/api-client";
import {
  AGENT_BRANCHES,
  AGENT_DETAILS,
  AGENT_IDS,
  AGENT_LABELS,
  type AgentEntry,
  type AgentId,
} from "@/lib/agents";
import { useRemote } from "@/lib/use-remote";

import styles from "./architecture.module.css";

const STATIC_AGENTS: AgentEntry[] = AGENT_IDS.map((id) => ({ id, label: AGENT_LABELS[id] }));

const isKnown = (id: string): id is AgentId => id in AGENT_DETAILS;

export function ArchitectureView() {
  const load = useCallback(() => fetchAgents(), []);
  const remote = useRemote("agents", load);
  const agents = remote.data?.agents ?? STATIC_AGENTS;
  const labels: Record<string, string> = Object.fromEntries(agents.map((agent) => [agent.id, agent.label]));
  const name = (id: string) => labels[id] ?? id;

  return (
    <div className={styles.layout}>
      <section className={styles.figure} aria-labelledby="architecture-graph-title">
        <h2 id="architecture-graph-title">Đồ thị điều phối</h2>
        <ArchitectureDiagram labels={labels} />
        <ul className={styles.legend} aria-label="Chú giải">
          <li><i className={styles.swatch} aria-hidden="true" />Luôn chạy tiếp</li>
          <li><i className={`${styles.swatch} ${styles.swatchDashed}`} aria-hidden="true" />Rẽ nhánh theo điều kiện</li>
          <li><i className={`${styles.swatch} ${styles.swatchDashed} ${styles.swatchDanger}`} aria-hidden="true" />Lối tắt khẩn cấp</li>
        </ul>
        <ul className={styles.branches} aria-label="Các nhánh có điều kiện">
          {AGENT_BRANCHES.map((edge) => (
            <li key={`${edge.from}-${edge.to}`}>
              <strong>{name(edge.from)}</strong> → <strong>{name(edge.to)}</strong>
              <span>{edge.when}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className={styles.column}>
        <section aria-labelledby="architecture-agents-title">
          <h2 id="architecture-agents-title">Các agent</h2>
          <ol className={styles.agents}>
            {agents.map((agent, index) => {
              const detail = isKnown(agent.id) ? AGENT_DETAILS[agent.id] : null;
              return (
                <li key={agent.id} className={styles.agent} data-agent={agent.id}>
                  <span className={styles.index} aria-hidden="true">{index + 1}</span>
                  <div className={styles.agentBody}>
                    <h3>{agent.label} <code>{agent.id}</code></h3>
                    {detail && <p>{detail.role}</p>}
                    {detail && (
                      <ul className={styles.tools} aria-label={`Công cụ của ${agent.label}`}>
                        {detail.tools.map((tool) => <li key={tool}>{tool}</li>)}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <section aria-labelledby="architecture-mermaid-title">
          <h2 id="architecture-mermaid-title">Mô tả Mermaid</h2>
          {remote.loading && <StatePanel tone="loading" embedded title="Đang tải sơ đồ" description="Đang lấy danh sách agent và đồ thị từ máy chủ." />}
          {remote.error && (
            <StatePanel
              tone="error"
              embedded
              title="Không tải được sơ đồ từ máy chủ"
              description={remote.error}
              actions={<button type="button" className="app-button app-button--primary" onClick={remote.retry}>Thử lại</button>}
            />
          )}
          {remote.data && (
            <details className={styles.mermaid}>
              <summary>Xem văn bản Mermaid do LangGraph sinh ra</summary>
              <pre><code>{remote.data.mermaid}</code></pre>
            </details>
          )}
        </section>
      </div>
    </div>
  );
}
