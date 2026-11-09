import type { AgentRisk, AgentStep } from "@/lib/chat-stream-contract";
import { CLASS_NAMES } from "@/lib/survey";

/** Shown with every risk estimate. The backend text says the same; this is the card's own copy. */
export const RISK_NOTE = "Đây là ước lượng thống kê từ khảo sát tự báo cáo, không phải chẩn đoán. Chỉ xét nghiệm và bác sĩ mới xác định được tình trạng.";

/** Vietnamese names for the fields the intake agent requires (`backend/app/agents/fields.py::REQUIRED`). */
export const FIELD_LABELS: Record<string, string> = {
  Age: "Nhóm tuổi",
  Sex: "Giới tính",
  BMI: "Chỉ số BMI",
  HighBP: "Huyết áp cao",
  HighChol: "Mỡ máu cao",
  PhysActivity: "Vận động thể chất",
  GenHlth: "Sức khỏe chung",
};

export const fieldLabel = (name: string): string => FIELD_LABELS[name] ?? name;

export const TASK_LABELS: Record<AgentRisk["task"], string> = {
  status3: "Ba nhóm tình trạng",
  diabtype: "Type 1 hay Type 2",
};

const secondsFormat = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatDuration(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${secondsFormat.format(ms / 1000)} s`;
}

export const totalMs = (steps: AgentStep[]): number => steps.reduce((sum, step) => sum + step.ms, 0);

const TRACE_LIMIT = 600;

/** Pretty JSON for a tool's args or result, cut at `limit` characters so one big payload cannot flood the panel. */
export function traceJson(value: unknown, limit = TRACE_LIMIT): { text: string; truncated: boolean } {
  let text: string;
  try {
    text = JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    text = String(value);
  }
  return text.length > limit ? { text: `${text.slice(0, limit).trimEnd()}…`, truncated: true } : { text, truncated: false };
}

export interface RiskRow {
  code: string;
  name: string;
  probability: number;
  /** The class the screening model picked (`risk.label`), which need not be the most frequent one. */
  predicted: boolean;
}

/** Population probabilities when the backend has them, else the calibrated screening ones. */
export function riskRows(risk: AgentRisk): { rows: RiskRow[]; population: boolean } {
  const population = risk.probs_population !== null && Object.keys(risk.probs_population).length > 0;
  const probs = population ? risk.probs_population ?? risk.probs : risk.probs;
  const rows = Object.entries(probs)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([code, probability]) => ({
      code,
      name: CLASS_NAMES[risk.task][code] ?? code,
      probability,
      predicted: Number(code) === risk.label,
    }));
  return { rows, population };
}
