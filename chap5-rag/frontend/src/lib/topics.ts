export const TOPIC_LABELS: Record<string, string> = {
  prevention: "Phòng ngừa",
  prediabetes: "Tiền đái tháo đường",
  diabetes_general: "Đái tháo đường nói chung",
  type1: "Đái tháo đường type 1",
  type2: "Đái tháo đường type 2",
};

export function parseTopic(value: unknown): string | undefined {
  return typeof value === "string" && value in TOPIC_LABELS ? value : undefined;
}
