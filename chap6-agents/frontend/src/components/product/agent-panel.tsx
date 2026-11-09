"use client";

import { CircleNotchIcon, ShieldWarningIcon, UserCircleIcon } from "@phosphor-icons/react";
import { useId } from "react";

import {
  fieldLabel,
  formatDuration,
  RISK_NOTE,
  riskRows,
  TASK_LABELS,
  totalMs,
  traceJson,
} from "@/lib/agent-trace";
import type { AgentInfo, AgentStep } from "@/lib/chat-stream-contract";
import { formatPercent } from "@/lib/survey";

import styles from "./agent-panel.module.css";

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  const { text, truncated } = traceJson(value);
  return (
    <div className={styles.pair}>
      <span>{label}{truncated ? " (đã rút gọn)" : ""}</span>
      <pre>{text}</pre>
    </div>
  );
}

function StepRow({ step, index }: { step: AgentStep; index: number }) {
  return (
    <li className={styles.step} data-agent={step.agent}>
      <span className={styles.marker} aria-hidden="true">{index + 1}</span>
      <div className={styles.body}>
        <div className={styles.head}>
          <strong>{step.label}</strong>
          <span className={styles.ms}>{formatDuration(step.ms)}</span>
        </div>
        <p className={styles.summary}>{step.summary}</p>
        {step.tools.length > 0 && (
          <details className={styles.tools}>
            <summary>{step.tools.length} lệnh gọi công cụ</summary>
            <ul>
              {step.tools.map((tool, i) => (
                <li key={`${tool.name}-${i}`}>
                  <code className={styles.toolName}>{tool.name}</code>
                  <JsonBlock label="Đầu vào" value={tool.args} />
                  <JsonBlock label="Kết quả" value={tool.result} />
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </li>
  );
}

/** One row per finished agent, filling in as `agent.step` events arrive. */
export function AgentTrace({ steps, running, titled = true }: { steps: AgentStep[]; running: boolean; titled?: boolean }) {
  const headingId = useId();
  return (
    <section className={styles.trace} aria-labelledby={titled ? headingId : undefined} aria-label={titled ? undefined : "Quá trình các agent"}>
      {titled && (
        <div className={styles.titleRow}>
          <h2 id={headingId}>Quá trình các agent</h2>
          {steps.length > 0 && <span className={styles.total}>{steps.length} bước · {formatDuration(totalMs(steps))}</span>}
        </div>
      )}
      {steps.length === 0 && !running && (
        <p className={styles.empty}>Chưa có lượt xử lý nào. Gửi một câu hỏi để xem từng agent làm việc: an toàn, điều phối, thu thập thông tin, dự đoán nguy cơ, tra cứu và tư vấn.</p>
      )}
      {(steps.length > 0 || running) && (
        <ol className={styles.steps} aria-label="Các agent đã chạy trong lượt này">
          {steps.map((step, index) => <StepRow key={`${step.agent}-${index}`} step={step} index={index} />)}
          {running && (
            <li className={styles.pending} role="status">
              <CircleNotchIcon className={styles.spin} aria-hidden="true" />
              <span>{steps.length === 0 ? "Đang khởi động các agent…" : "Đang chờ agent tiếp theo…"}</span>
            </li>
          )}
        </ol>
      )}
    </section>
  );
}

function RiskBars({ risk }: { risk: NonNullable<AgentInfo["risk"]> }) {
  const { rows, population } = riskRows(risk);
  return (
    <div className={styles.risk}>
      <h3>Ước lượng nguy cơ · {TASK_LABELS[risk.task]}</h3>
      <p className={styles.caption}>
        {population
          ? "Tỷ lệ ở những người có hồ sơ tương tự trong dữ liệu khảo sát BRFSS."
          : "Xác suất đã hiệu chỉnh của mô hình, chưa khôi phục tần suất của dữ liệu."}
      </p>
      <ul className={styles.bars} aria-label={population ? "Tỷ lệ ước lượng theo từng nhóm" : "Xác suất theo từng nhóm"}>
        {rows.map((row) => (
          <li key={row.code} data-predicted={row.predicted}>
            <span>{row.name}</span>
            <strong>{formatPercent(row.probability)}</strong>
            <span className={styles.track} aria-hidden="true"><i style={{ width: `${row.probability * 100}%` }} /></span>
          </li>
        ))}
      </ul>
      <p className={styles.caption}>
        Nhóm chọn ở chế độ sàng lọc: <strong>{risk.label_name}</strong>. Mô hình: <strong>{risk.model.toUpperCase()}</strong>.
      </p>
      {risk.defaulted.length > 0 && (
        <p className={styles.caption}>{risk.defaulted.length} thông tin chưa hỏi được điền bằng giá trị trung vị của dữ liệu huấn luyện.</p>
      )}
      <p className={styles.note} role="note"><ShieldWarningIcon aria-hidden="true" />{RISK_NOTE}</p>
    </div>
  );
}

/** The collected profile, what is still missing, and the risk estimate once there is one. */
export function AgentInsights({ agent, refreshing = false }: { agent: AgentInfo | null; refreshing?: boolean }) {
  const headingId = useId();
  const hasContent = agent !== null && (agent.profile.length > 0 || agent.missing.length > 0 || agent.risk !== null);
  return (
    <section className={styles.insights} aria-labelledby={headingId} aria-busy={refreshing || undefined}>
      <div className={styles.titleRow}>
        <h2 id={headingId}>Hồ sơ và nguy cơ</h2>
        {refreshing && <span className={styles.total}>Đang cập nhật…</span>}
      </div>
      {!hasContent && (
        <p className={styles.empty}>Chưa có thông tin sức khỏe nào. Hãy mô tả tuổi, giới tính, chiều cao, cân nặng và bệnh nền để nhận ước lượng nguy cơ.</p>
      )}
      {agent && agent.profile.length > 0 && (
        <div>
          <h3><UserCircleIcon aria-hidden="true" /> Thông tin đã ghi nhận</h3>
          <dl className={styles.profile}>
            {agent.profile.map((field) => (
              <div key={field.name}>
                <dt>{field.label}</dt>
                <dd>{field.display}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {agent && agent.missing.length > 0 && (
        <div>
          <h3>Còn thiếu</h3>
          <ul className={styles.missing} aria-label="Thông tin còn thiếu">
            {agent.missing.map((name) => <li key={name}>{fieldLabel(name)}</li>)}
          </ul>
        </div>
      )}
      {agent?.risk && <RiskBars risk={agent.risk} />}
    </section>
  );
}

/** Right-hand column on wide screens: the live trace of the newest turn plus the profile card. */
export function AgentSidePanel({ steps, running, agent }: { steps: AgentStep[]; running: boolean; agent: AgentInfo | null }) {
  return (
    <aside className={styles.side} aria-label="Hoạt động của các agent">
      <AgentTrace steps={steps} running={running} />
      <AgentInsights agent={agent} refreshing={running && agent !== null} />
    </aside>
  );
}

/** Narrow screens: the trace sits inside the turn it belongs to, open while it runs and folded once it is done. */
export function AgentTurnInline({ steps, running }: { steps: AgentStep[]; running: boolean }) {
  if (steps.length === 0 && !running) return null;
  return (
    <div className={styles.inline}>
      <details open={running || undefined}>
        <summary>
          Quá trình các agent{steps.length > 0 ? ` · ${steps.length} bước · ${formatDuration(totalMs(steps))}` : ""}
        </summary>
        <AgentTrace steps={steps} running={running} titled={false} />
      </details>
    </div>
  );
}

/** Narrow screens: the profile and risk card of the newest turn, under its answer. */
export function AgentInsightsInline({ agent }: { agent: AgentInfo }) {
  return (
    <div className={styles.inline}>
      <AgentInsights agent={agent} />
    </div>
  );
}
