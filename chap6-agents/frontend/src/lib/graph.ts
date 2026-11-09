export interface GraphNode {
  id: string;
  label: string;
  name: string;
}

export interface GraphNeighbor {
  rel: string;
  direction: "out" | "in";
  node: GraphNode;
}

export interface GraphView {
  center: GraphNode;
  neighbors: GraphNeighbor[];
}

export const NODE_LABELS: Record<string, string> = {
  Disease: "Bệnh",
  Symptom: "Triệu chứng",
  Complication: "Biến chứng",
  RiskFactor: "Yếu tố nguy cơ",
  Recommendation: "Khuyến nghị",
  DrugClass: "Nhóm thuốc",
  Chunk: "Đoạn nguồn",
  Document: "Tài liệu",
  SurveyRecord: "Hồ sơ khảo sát",
  SurveyStatus: "Trạng thái khảo sát",
};

export const RELATION_LABELS: Record<string, string> = {
  HAS_SYMPTOM: "triệu chứng",
  HAS_COMPLICATION: "biến chứng",
  HAS_RISK_FACTOR: "yếu tố nguy cơ",
  HAS_RECOMMENDATION: "khuyến nghị",
  HAS_DRUG_CLASS: "nhóm thuốc",
  SUPPORTED_BY: "được hỗ trợ bởi",
  PART_OF: "thuộc tài liệu",
  HAS_REPORTED_STATUS: "trạng thái",
};

export const DISEASES = [
  { id: "dtd_chung", name: "Đái tháo đường nói chung" },
  { id: "tien_dtd", name: "Tiền đái tháo đường" },
  { id: "dtd_type1", name: "Type 1" },
  { id: "dtd_type2", name: "Type 2" },
  { id: "dtd_thai_ky", name: "Thai kỳ" },
] as const;

export const labelName = (label: string) => NODE_LABELS[label] ?? label;
export const relationName = (rel: string) => RELATION_LABELS[rel] ?? rel;

const LABEL_ORDER = Object.keys(NODE_LABELS);
const labelRank = (label: string) => {
  const index = LABEL_ORDER.indexOf(label);
  return index === -1 ? LABEL_ORDER.length : index;
};

export interface NeighborGroup {
  key: string;
  rel: string;
  direction: "out" | "in";
  label: string;
  items: GraphNeighbor[];
}

export interface GraphFilter {
  hidden: ReadonlySet<string>;
  query: string;
}

export function countByLabel(neighbors: GraphNeighbor[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const { node } of neighbors) counts.set(node.label, (counts.get(node.label) ?? 0) + 1);
  return [...counts].sort(([a], [b]) => labelRank(a) - labelRank(b));
}

export function groupNeighbors(neighbors: GraphNeighbor[], { hidden, query }: GraphFilter): NeighborGroup[] {
  const needle = query.trim().toLowerCase();
  const groups = new Map<string, NeighborGroup>();
  for (const neighbor of neighbors) {
    const { rel, direction, node } = neighbor;
    if (hidden.has(node.label) || (needle && !node.name.toLowerCase().includes(needle))) continue;
    const key = `${rel}|${direction}|${node.label}`;
    const group = groups.get(key) ?? { key, rel, direction, label: node.label, items: [] };
    group.items.push(neighbor);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => labelRank(a.label) - labelRank(b.label) || a.key.localeCompare(b.key));
}

export const limitGroup = (group: NeighborGroup, perGroup: number): NeighborGroup => ({ ...group, items: group.items.slice(0, perGroup) });

export const VIEW = { width: 960, height: 640 } as const;
const CENTER = { x: VIEW.width / 2, y: VIEW.height / 2 };
const RINGS = [235, 170];
const SINGLE_RING_MAX = 12;

export interface PlacedNeighbor {
  neighbor: GraphNeighbor;
  x: number;
  y: number;
  angle: number;
}

export interface PlacedGroup {
  group: NeighborGroup;
  placed: PlacedNeighbor[];
}

export function layoutRadial(groups: NeighborGroup[]): PlacedGroup[] {
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  let index = 0;
  return groups.map((group) => ({
    group,
    placed: group.items.map((neighbor) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * index) / total;
      const radius = total <= SINGLE_RING_MAX ? RINGS[0] : RINGS[index % RINGS.length];
      index += 1;
      return { neighbor, angle, x: CENTER.x + radius * Math.cos(angle), y: CENTER.y + radius * Math.sin(angle) };
    }),
  }));
}

export const GRAPH_CENTER = CENTER;
