import type { ClassifyResult, FeatureSets } from "@/lib/survey";

const fields = [
  { name: "HighBP", label_vi: "Huyết áp cao", kind: "binary", min: 0, max: 1 },
  { name: "BMI", label_vi: "Chỉ số khối cơ thể (BMI)", kind: "number", min: 10, max: 100 },
  { name: "GenHlth", label_vi: "Tự đánh giá sức khỏe chung", kind: "ordinal", min: 1, max: 5, options: [
    { value: 1, label_vi: "Xuất sắc" }, { value: 2, label_vi: "Rất tốt" }, { value: 3, label_vi: "Tốt" }, { value: 4, label_vi: "Trung bình" }, { value: 5, label_vi: "Kém" },
  ] },
  { name: "Sex", label_vi: "Giới tính", kind: "binary", min: 0, max: 1, options: [{ value: 0, label_vi: "Nữ" }, { value: 1, label_vi: "Nam" }] },
  { name: "Age", label_vi: "Nhóm tuổi", kind: "ordinal", min: 1, max: 13, options: [
    { value: 8, label_vi: "55-59" }, { value: 9, label_vi: "60-64" }, { value: 10, label_vi: "65-69" },
  ] },
] satisfies FeatureSets["status3"];

export const featuresFixture: FeatureSets = { status3: fields, diabtype: fields };

export const status3Result: ClassifyResult = {
  label: 2,
  label_name: "Báo cáo mắc đái tháo đường",
  probs: { "0": 0.06188202649354935, "1": 0.301666796207428, "2": 0.6364511847496033 },
  topic: "diabetes_general",
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
