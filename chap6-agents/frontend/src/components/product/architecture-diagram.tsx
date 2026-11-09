import { AGENT_IDS, AGENT_LABELS, type AgentId } from "@/lib/agents";

import styles from "./architecture.module.css";

const NODE_WIDTH = 140;
const NODE_HEIGHT = 48;

type Tone = "safety" | "router" | "worker";

const NODES: Record<AgentId, { x: number; y: number; tone: Tone }> = {
  safety_in: { x: 240, y: 100, tone: "safety" },
  orchestrator: { x: 240, y: 214, tone: "router" },
  knowledge: { x: 110, y: 336, tone: "worker" },
  intake: { x: 350, y: 336, tone: "worker" },
  risk: { x: 350, y: 442, tone: "worker" },
  advisor: { x: 350, y: 548, tone: "worker" },
  safety_out: { x: 240, y: 664, tone: "safety" },
};

/** Edges that always run (`always`), branches chosen at run time (`branch`) and the emergency shortcut. */
const EDGES: Array<{ id: string; d: string; kind: "always" | "branch" | "emergency" }> = [
  { id: "start", d: "M240 40 V76", kind: "always" },
  { id: "in-orchestrator", d: "M240 124 V190", kind: "branch" },
  { id: "orchestrator-knowledge", d: "M210 238 C210 280 110 270 110 310", kind: "branch" },
  { id: "orchestrator-intake", d: "M270 238 C270 280 350 270 350 310", kind: "branch" },
  { id: "intake-risk", d: "M350 360 V416", kind: "branch" },
  { id: "risk-advisor", d: "M350 466 V522", kind: "always" },
  { id: "advisor-out", d: "M340 572 C340 620 280 610 280 638", kind: "always" },
  { id: "knowledge-out", d: "M110 360 C110 560 200 590 200 638", kind: "always" },
  { id: "out-end", d: "M240 688 V706", kind: "always" },
  { id: "orchestrator-out", d: "M170 214 H16 V664 H170", kind: "branch" },
  { id: "intake-out", d: "M420 336 H442 V652 H310", kind: "branch" },
  { id: "emergency", d: "M310 100 H466 V676 H310", kind: "emergency" },
];

export function ArchitectureDiagram({ labels = AGENT_LABELS }: { labels?: Partial<Record<string, string>> }) {
  return (
    <svg
      className={styles.diagram}
      viewBox="0 0 480 740"
      role="img"
      aria-labelledby="architecture-diagram-title"
      aria-describedby="architecture-diagram-desc"
    >
      <title id="architecture-diagram-title">Sơ đồ kiến trúc giám sát nhiều agent</title>
      <desc id="architecture-diagram-desc">
        An toàn (vào) kiểm tin nhắn rồi chuyển cho Điều phối. Điều phối chọn nhánh tra cứu tri thức, hoặc nhánh thu thập thông tin,
        dự đoán nguy cơ và tư vấn. Mọi nhánh đều kết thúc ở An toàn (ra). Khi có dấu hiệu khẩn cấp, An toàn (vào) đi thẳng tới An toàn (ra).
      </desc>
      <defs>
        <marker id="arch-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
          <path className={styles.arrow} d="M0 0 L10 5 L0 10 z" />
        </marker>
        <marker id="arch-arrow-danger" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
          <path className={styles.arrowDanger} d="M0 0 L10 5 L0 10 z" />
        </marker>
      </defs>

      {EDGES.map((edge) => (
        <path
          key={edge.id}
          className={`${styles.edge} ${edge.kind === "always" ? "" : styles.dashed} ${edge.kind === "emergency" ? styles.emergency : ""}`}
          d={edge.d}
          markerEnd={`url(#${edge.kind === "emergency" ? "arch-arrow-danger" : "arch-arrow"})`}
        />
      ))}

      <text className={styles.edgeLabel} x="384" y="92" textAnchor="middle" data-tone="danger">khẩn cấp</text>
      <text className={styles.edgeLabel} x="24" y="256">chào hỏi,</text>
      <text className={styles.edgeLabel} x="24" y="272">ngoài phạm vi</text>
      <text className={styles.edgeLabel} x="100" y="296" textAnchor="end">kiến thức</text>
      <text className={styles.edgeLabel} x="362" y="296">nguy cơ</text>
      <text className={styles.edgeLabel} x="436" y="610" textAnchor="end">thiếu thông tin</text>

      <g className={styles.terminal}>
        <rect x={240 - 48} y={12} width={96} height={28} rx={14} />
        <text x={240} y={31} textAnchor="middle">Bắt đầu</text>
        <rect x={240 - 48} y={706} width={96} height={28} rx={14} />
        <text x={240} y={725} textAnchor="middle">Kết thúc</text>
      </g>

      {AGENT_IDS.map((id) => {
        const node = NODES[id];
        return (
          <g key={id} className={styles.node} data-tone={node.tone} data-agent={id}>
            <rect x={node.x - NODE_WIDTH / 2} y={node.y - NODE_HEIGHT / 2} width={NODE_WIDTH} height={NODE_HEIGHT} rx={8} />
            <text className={styles.nodeLabel} x={node.x} y={node.y - 3} textAnchor="middle">{labels[id] ?? AGENT_LABELS[id]}</text>
            <text className={styles.nodeId} x={node.x} y={node.y + 14} textAnchor="middle">{id}</text>
          </g>
        );
      })}
    </svg>
  );
}
