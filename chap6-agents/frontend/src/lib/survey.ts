import { TOPIC_LABELS } from "@/lib/topics";

export type Task = "status3" | "diabtype";

export interface FeatureOption {
  value: number;
  label_vi: string;
}

export interface FeatureField {
  name: string;
  label_vi: string;
  kind: "binary" | "number" | "ordinal";
  min: number;
  max: number;
  options?: FeatureOption[];
}

export type FeatureSets = Record<Task, FeatureField[]>;

export interface ClassifyResult {
  label: number;
  label_name: string;
  /** Calibrated and class-weighted: the screening view the label comes from. */
  probs: Record<string, number>;
  /** Class frequencies of the survey data restored; null when the survey database is absent. */
  probs_population: Record<string, number> | null;
  model: string;
  topic: string;
}

export const TASKS: Array<{ task: Task; tab: string; hint: string }> = [
  { task: "status3", tab: "Ba nhóm tình trạng", hint: "Dự đoán nhóm báo cáo của hồ sơ: không mắc bệnh, tiền đái tháo đường hoặc đã báo cáo mắc đái tháo đường." },
  { task: "diabtype", tab: "Type 1 / Type 2", hint: "Chỉ dành cho người đã báo cáo mắc bệnh. Dự đoán loại đái tháo đường là type 1 hay type 2." },
];

export const CLASS_NAMES: Record<Task, Record<string, string>> = {
  status3: { "0": "Không báo cáo mắc bệnh", "1": "Tiền đái tháo đường", "2": "Báo cáo mắc đái tháo đường" },
  diabtype: { "1": "Type 1", "2": "Type 2" },
};

export const TOPIC_QUESTIONS: Record<string, string> = {
  prevention: "Làm thế nào để phòng ngừa đái tháo đường?",
  prediabetes: "Người bị tiền đái tháo đường nên làm gì?",
  diabetes_general: "Người bệnh đái tháo đường nên ăn uống và sinh hoạt thế nào?",
  type1: "Người bệnh đái tháo đường type 1 cần lưu ý gì?",
  type2: "Người bệnh đái tháo đường type 2 cần lưu ý gì?",
};

export const CAVEAT = "Kết quả dựa trên khảo sát tự báo cáo BRFSS, không phải chẩn đoán. Hãy hỏi ý kiến bác sĩ.";

export const EXAMPLE_PROFILE: Record<string, number> = {
  BMI: 40, Age: 9, HighBP: 1, HighChol: 1, GenHlth: 4,
  CholCheck: 1, Smoker: 0, Stroke: 0, HeartDiseaseorAttack: 0, PhysActivity: 1, HvyAlcoholConsump: 0,
  AnyHealthcare: 1, NoDocbcCost: 0, MentHlth: 0, PhysHlth: 0, DiffWalk: 0, Sex: 0, Education: 5, Income: 7,
};

export type FieldControl = "toggle" | "select" | "number";
export type FormValues = Record<string, string>;

export const fieldControl = (field: FeatureField): FieldControl =>
  field.options ? "select" : field.kind === "binary" ? "toggle" : "number";

export const profileToValues = (profile: Record<string, number>): FormValues =>
  Object.fromEntries(Object.entries(profile).map(([name, value]) => [name, String(value)]));

export const fieldValue = (field: FeatureField, values: FormValues): string => values[field.name] ?? (fieldControl(field) === "toggle" ? "0" : "");

export function toFeatures(values: FormValues, fields: FeatureField[]): Record<string, number> {
  const features: Record<string, number> = {};
  for (const field of fields) {
    const raw = fieldValue(field, values).trim();
    if (raw !== "" && Number.isFinite(Number(raw))) features[field.name] = Number(raw);
  }
  return features;
}

export function chatHref(topic: string): string {
  const question = TOPIC_QUESTIONS[topic];
  if (!question || !(topic in TOPIC_LABELS)) return "/app/chat";
  return `/app/chat?${new URLSearchParams({ q: question })}`;
}

const percent = new Intl.NumberFormat("vi-VN", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const formatPercent = (probability: number) => percent.format(probability);
