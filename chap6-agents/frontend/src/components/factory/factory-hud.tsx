"use client";

/** The factory's controls and read-outs: question field and scenario chips on top, caption ticker, run log. */
import {
  ArrowClockwiseIcon, BookOpenIcon, CaretDoubleLeftIcon, CaretDoubleRightIcon, CloudSlashIcon, FastForwardIcon,
  PaperPlaneRightIcon, StopIcon, WarningIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { formatDuration } from "@/lib/agent-trace";
import { AGENT_LABELS, type AgentId } from "@/lib/agents";
import type { LogEntry } from "@/lib/factory/run-state";
import type { Scenario } from "@/lib/factory/scenarios";
import type { FactoryRun } from "@/lib/factory/use-factory-run";
import styles from "./factory.module.css";

interface HudProps {
  run: FactoryRun;
  scenarios: Scenario[];
  reducedMotion: boolean;
  /** `/api/agents` says the backend honours `simulate: "llm_down"`. */
  allowSimulation: boolean;
  llmDown: boolean;
  onLlmDown: (on: boolean) => void;
}

export function FactoryHud({ run, scenarios, reducedMotion, allowSimulation, llmDown, onLlmDown }: HudProps) {
  const [question, setQuestion] = useState("");
  const { busy, pendingSteps } = run;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const message = question.trim();
    if (!message) return;
    run.ask(message, allowSimulation && llmDown);
    setQuestion("");
  };

  return (
    <div className={styles.hud}>
      <div className={styles.hudRow}>
        <form className={styles.ask} onSubmit={submit}>
          <input
            className={styles.askInput}
            type="text"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            aria-label="Câu hỏi cho nhà máy"
            placeholder="Gõ câu hỏi, ví dụ: HbA1c là gì?"
            autoComplete="off"
            enterKeyHint="send"
          />
          <button className={styles.askSend} type="submit" disabled={!question.trim()}>
            <PaperPlaneRightIcon weight="fill" aria-hidden />
            Gửi
          </button>
        </form>
        <div className={styles.controls}>
          {allowSimulation && (
            <button
              type="button"
              role="switch"
              aria-checked={llmDown}
              className={styles.switch}
              onClick={() => onLlmDown(!llmDown)}
            >
              <span className={styles.switchTrack} aria-hidden><span className={styles.switchThumb} /></span>
              <CloudSlashIcon weight="bold" aria-hidden />
              Cắt mây LLM
            </button>
          )}
          {reducedMotion && (
            <button type="button" className={styles.control} data-primary="" onClick={run.next} disabled={!busy}>
              <FastForwardIcon weight="fill" aria-hidden />
              Bước tiếp{pendingSteps > 0 ? ` (còn ${pendingSteps})` : ""}
            </button>
          )}
          {busy && (
            <button type="button" className={styles.control} onClick={run.cancel}>
              <StopIcon weight="fill" aria-hidden />
              Dừng
            </button>
          )}
          <button type="button" className={styles.control} onClick={run.reset}>
            <ArrowClockwiseIcon weight="bold" aria-hidden />
            Hội thoại mới
          </button>
        </div>
      </div>
      <div className={styles.hudRow}>
        {scenarios.length > 0 ? (
          <div className={styles.chips} role="group" aria-label="Kịch bản ghi sẵn">
            <span className={styles.chipsLabel} aria-hidden>Kịch bản ghi sẵn</span>
            {scenarios.map((scenario) => (
              <button key={scenario.id} type="button" className={styles.chip} onClick={() => run.play(scenario.id)}>
                {scenario.label}
              </button>
            ))}
          </div>
        ) : (
          <p className={styles.note}>
            Chưa có kịch bản ghi sẵn — chạy <code>make -C chap6-agents scenarios</code> rồi tải lại trang. Câu hỏi gõ tay vẫn chạy trực tiếp.
          </p>
        )}
      </div>
    </div>
  );
}

/** Bottom strip: the turn badge, then the current step told in one line (a polite live region). */
export function FactoryTicker({ caption, turn, busy }: { caption: string; turn: number; busy: boolean }) {
  return (
    <div className={styles.tickerBar}>
      <span className={styles.turn} data-busy={busy ? "" : undefined}>{turn > 0 ? `Lượt ${turn}` : "Chưa có lượt"}</span>
      <p className={styles.ticker} role="status" aria-label="Chú thích bước">
        {caption}
      </p>
    </div>
  );
}

const isAgentEntry = (entry: LogEntry): entry is LogEntry & { station: AgentId } => entry.step !== undefined && entry.station !== null;

interface LogProps {
  log: LogEntry[];
  open: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
}

export function FactoryLog({ log, open, onToggle, onSelect }: LogProps) {
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [log.length]);

  return (
    <section className={styles.log} aria-label="Vết chạy" data-open={open ? "" : undefined}>
      <div className={styles.logHead}>
        {open && <h2 className={styles.logTitle}>Vết chạy</h2>}
        <button type="button" className={styles.logToggle} onClick={onToggle} aria-expanded={open} aria-label={open ? "Thu gọn vết chạy" : "Mở vết chạy"}>
          {open ? <CaretDoubleRightIcon weight="bold" aria-hidden /> : <CaretDoubleLeftIcon weight="bold" aria-hidden />}
        </button>
      </div>
      {open && (
        log.length === 0 ? (
          <p className={styles.logEmpty}>Chưa có bước nào. Gửi một câu hỏi hoặc chọn một kịch bản, từng agent sẽ ghi lại việc mình làm ở đây.</p>
        ) : (
          <ol className={styles.logList} ref={listRef}>
            {log.map((entry, index) => (
              <li key={index} className={styles.logEntry} data-level={entry.level} data-kind={isAgentEntry(entry) ? "step" : "event"}>
                {isAgentEntry(entry) ? <StepEntry entry={entry} onSelect={onSelect} /> : (
                  <p className={styles.logEvent}>
                    {entry.level === "error" && <WarningIcon weight="fill" aria-hidden />}
                    {entry.text}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )
      )}
    </section>
  );
}

function StepEntry({ entry, onSelect }: { entry: LogEntry & { station: AgentId }; onSelect: (id: string) => void }) {
  const step = entry.step!;
  return (
    <>
      <div className={styles.logStepHead}>
        <button type="button" className={styles.logAgent} onClick={() => onSelect(entry.station)}>
          {AGENT_LABELS[entry.station]}
        </button>
        <span className={styles.logMs}>{formatDuration(step.ms)}</span>
      </div>
      <p className={styles.logSummary}>{step.summary || "đã xử lý"}</p>
      {step.fallback && (
        <span className={styles.badge} data-tone="fallback">
          <BookOpenIcon weight="fill" aria-hidden />
          Dự phòng: {step.fallback}
        </span>
      )}
    </>
  );
}
