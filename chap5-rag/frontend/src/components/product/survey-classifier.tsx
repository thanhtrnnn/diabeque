"use client";

import { ArrowRightIcon, ChatCenteredTextIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { StatePanel } from "@/components/product/portal-state";
import { classify, fetchFeatures } from "@/lib/api-client";
import {
  CAVEAT,
  CLASS_NAMES,
  chatHref,
  type ClassifyResult,
  EXAMPLE_PROFILE,
  type FeatureField,
  fieldControl,
  fieldValue,
  type FormValues,
  formatPercent,
  profileToValues,
  type Task,
  TASKS,
  toFeatures,
} from "@/lib/survey";
import { TOPIC_LABELS } from "@/lib/topics";
import { useRemote } from "@/lib/use-remote";

import styles from "./survey-classifier.module.css";

type Submission =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; task: Task; result: ClassifyResult };

function FieldInput({ field, value, onChange }: { field: FeatureField; value: string; onChange: (value: string) => void }) {
  const control = fieldControl(field);
  if (control === "toggle") {
    return (
      <label className={styles.toggle}>
        <input type="checkbox" checked={value === "1"} onChange={(event) => onChange(event.target.checked ? "1" : "0")} />
        <span>{field.label_vi}</span>
      </label>
    );
  }
  return (
    <label className={styles.field}>
      <span>{field.label_vi}</span>
      {control === "select" ? (
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">Để trống (dùng trung vị)</option>
          {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label_vi}</option>)}
        </select>
      ) : (
        <input type="number" inputMode="decimal" step="any" min={field.min} max={field.max} value={value} placeholder={`${field.min}–${field.max}`} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  );
}

function ResultCard({ task, result }: { task: Task; result: ClassifyResult }) {
  const topic = TOPIC_LABELS[result.topic];
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    section.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, []);
  return (
    <section ref={section} className={styles.result} aria-labelledby="classify-result-title">
      <p className="app-kicker">Kết quả dự đoán</p>
      <h2 id="classify-result-title">{result.label_name}</h2>
      <ul className={styles.probs} aria-label="Xác suất đã hiệu chỉnh theo từng nhóm">
        {Object.entries(result.probs).sort(([a], [b]) => Number(a) - Number(b)).map(([code, probability]) => (
          <li key={code} data-predicted={Number(code) === result.label}>
            <span>{CLASS_NAMES[task][code] ?? code}</span>
            <strong>{formatPercent(probability)}</strong>
            <span className={styles.bar} aria-hidden="true"><i style={{ width: `${probability * 100}%` }} /></span>
          </li>
        ))}
      </ul>
      {topic && <p className={styles.topic}>Chủ đề tra cứu gợi ý: <strong>{topic}</strong></p>}
      <p className={styles.caveat}>{CAVEAT}</p>
      <Link className="app-button app-button--primary" href={chatHref(result.topic)}>
        <ChatCenteredTextIcon aria-hidden="true" /> Tra cứu theo chủ đề này <ArrowRightIcon aria-hidden="true" />
      </Link>
    </section>
  );
}

export function SurveyClassifier() {
  const features = useRemote("features", fetchFeatures);
  const [task, setTask] = useState<Task>("status3");
  const [values, setValues] = useState<FormValues>({});
  const [submission, setSubmission] = useState<Submission>({ status: "idle" });
  const active = TASKS.find((entry) => entry.task === task) ?? TASKS[0];
  const fields = features.data?.[task] ?? [];
  const choose = (name: string, value: string) => setValues((current) => ({ ...current, [name]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmission({ status: "loading" });
    try {
      setSubmission({ status: "done", task, result: await classify(task, toFeatures(values, fields)) });
    } catch (error) {
      setSubmission({ status: "error", message: error instanceof Error ? error.message : "Không phân loại được hồ sơ." });
    }
  }

  if (features.error) {
    return <StatePanel tone="error" embedded title="Không tải được biểu mẫu" description={features.error} actions={<button type="button" className="app-button app-button--primary" onClick={features.retry}>Thử lại</button>} />;
  }
  if (!features.data) return <StatePanel tone="loading" embedded title="Đang tải biểu mẫu" description="Đang lấy danh sách trường khảo sát." />;

  const general = fields.filter((field) => fieldControl(field) !== "toggle");
  const history = fields.filter((field) => fieldControl(field) === "toggle");

  return (
    <div className={styles.workbench}>
      <div className={styles.tabs} role="tablist" aria-label="Bài toán phân loại">
        {TASKS.map((entry) => (
          <button key={entry.task} type="button" role="tab" id={`tab-${entry.task}`} aria-selected={entry.task === task} aria-controls="classify-panel" onClick={() => { setTask(entry.task); setSubmission({ status: "idle" }); }}>
            {entry.tab}
          </button>
        ))}
      </div>
      <div className={styles.layout} role="tabpanel" id="classify-panel" aria-labelledby={`tab-${task}`}>
        <form className={styles.form} onSubmit={submit}>
          <p className={styles.hint}>{active.hint}</p>
          <div className={styles.actions}>
            <button type="button" className="app-button app-button--secondary" onClick={() => setValues(profileToValues(EXAMPLE_PROFILE))}>Hồ sơ minh họa</button>
            <button type="button" className="app-button app-button--secondary" onClick={() => setValues({})}>Xóa biểu mẫu</button>
          </div>
          <p className={styles.hint}>Ô số và danh sách để trống sẽ được thay bằng giá trị trung vị của dữ liệu huấn luyện.</p>
          <fieldset className={styles.grid}>
            <legend>Thông tin chung</legend>
            {general.map((field) => <FieldInput key={field.name} field={field} value={fieldValue(field, values)} onChange={(value) => choose(field.name, value)} />)}
          </fieldset>
          <fieldset className={styles.grid}>
            <legend>Tiền sử và thói quen</legend>
            {history.map((field) => <FieldInput key={field.name} field={field} value={fieldValue(field, values)} onChange={(value) => choose(field.name, value)} />)}
          </fieldset>
          <button type="submit" className="app-button app-button--primary" disabled={submission.status === "loading"}>
            {submission.status === "loading" ? "Đang phân loại…" : "Phân loại hồ sơ"}
          </button>
        </form>
        <div className={styles.output} aria-live="polite">
          {submission.status === "error" && <p className={styles.error} role="alert">{submission.message}</p>}
          {submission.status === "done" && <ResultCard task={submission.task} result={submission.result} />}
          {(submission.status === "idle" || submission.status === "loading") && <p className={styles.hint}>Điền biểu mẫu hoặc dùng hồ sơ minh họa, rồi bấm &quot;Phân loại hồ sơ&quot;.</p>}
        </div>
      </div>
    </div>
  );
}
