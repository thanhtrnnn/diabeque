import { GRAPH_CENTER, type GraphNode, type NeighborGroup, VIEW, labelName, layoutRadial, relationName } from "@/lib/graph";

import styles from "./knowledge-graph.module.css";

const CENTER_RADIUS = 20;
const NODE_RADIUS = 8;
const LABELS_MAX_NODES = 28;
const TEXT_CHARS = 22;
const TEXT_GAP = 14;
const LABEL_AT = 0.6;

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function edgeEnds(x: number, y: number, direction: "out" | "in") {
  const dx = x - GRAPH_CENTER.x;
  const dy = y - GRAPH_CENTER.y;
  const length = Math.hypot(dx, dy) || 1;
  const near = { x: GRAPH_CENTER.x + (dx / length) * CENTER_RADIUS, y: GRAPH_CENTER.y + (dy / length) * CENTER_RADIUS };
  const far = { x: x - (dx / length) * (NODE_RADIUS + 3), y: y - (dy / length) * (NODE_RADIUS + 3) };
  return direction === "out" ? [near, far] : [far, near];
}

function textPlacement(angle: number, x: number, y: number) {
  const cos = Math.cos(angle);
  if (cos > 0.25) return { x: x + TEXT_GAP, y, anchor: "start" as const, baseline: "middle" as const };
  if (cos < -0.25) return { x: x - TEXT_GAP, y, anchor: "end" as const, baseline: "middle" as const };
  const below = Math.sin(angle) > 0;
  return { x, y: y + (below ? TEXT_GAP + 6 : -TEXT_GAP), anchor: "middle" as const, baseline: below ? ("hanging" as const) : ("auto" as const) };
}

export function GraphCanvas({ center, groups, onSelect }: { center: GraphNode; groups: NeighborGroup[]; onSelect: (node: GraphNode) => void }) {
  const placedGroups = layoutRadial(groups);
  const total = placedGroups.reduce((sum, { placed }) => sum + placed.length, 0);
  const showLabels = total <= LABELS_MAX_NODES;

  return (
    <svg className={styles.canvas} viewBox={`0 0 ${VIEW.width} ${VIEW.height}`} aria-hidden="true" focusable="false" data-testid="graph-canvas">
      <defs>
        <marker id="graph-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M0 0 L8 4 L0 8 Z" className={styles.arrow} />
        </marker>
      </defs>
      {placedGroups.map(({ group, placed }) => placed.map(({ neighbor, x, y }) => {
        const [from, to] = edgeEnds(x, y, neighbor.direction);
        return <line key={`${group.key}|${neighbor.node.id}`} className={styles.edge} x1={from.x} y1={from.y} x2={to.x} y2={to.y} markerEnd="url(#graph-arrow)" />;
      }))}
      {placedGroups.map(({ group, placed }) => {
        const middle = placed[Math.floor(placed.length / 2)];
        if (!middle) return null;
        return (
          <text key={`rel|${group.key}`} className={styles.edgeLabel} x={GRAPH_CENTER.x + (middle.x - GRAPH_CENTER.x) * LABEL_AT} y={GRAPH_CENTER.y + (middle.y - GRAPH_CENTER.y) * LABEL_AT} textAnchor="middle" dominantBaseline="middle">
            {relationName(group.rel)}
          </text>
        );
      })}
      {placedGroups.map(({ group, placed }) => placed.map(({ neighbor, x, y, angle }) => {
        const text = textPlacement(angle, x, y);
        return (
          <g key={`node|${group.key}|${neighbor.node.id}`} className={`${styles.node} ${styles.tone}`} data-label={neighbor.node.label} data-node-id={neighbor.node.id} onClick={() => onSelect(neighbor.node)}>
            <title>{`${labelName(neighbor.node.label)}: ${neighbor.node.name}`}</title>
            <circle cx={x} cy={y} r={NODE_RADIUS} />
            {showLabels && <text x={text.x} y={text.y} textAnchor={text.anchor} dominantBaseline={text.baseline}>{truncate(neighbor.node.name, TEXT_CHARS)}</text>}
          </g>
        );
      }))}
      <g className={`${styles.centerNode} ${styles.tone}`} data-label={center.label}>
        <title>{`${labelName(center.label)}: ${center.name}`}</title>
        <circle cx={GRAPH_CENTER.x} cy={GRAPH_CENTER.y} r={CENTER_RADIUS} />
        <text x={GRAPH_CENTER.x} y={GRAPH_CENTER.y + CENTER_RADIUS + 18} textAnchor="middle">{truncate(center.name, 34)}</text>
      </g>
    </svg>
  );
}
