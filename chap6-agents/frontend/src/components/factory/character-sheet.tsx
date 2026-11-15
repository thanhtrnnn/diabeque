"use client";

/**
 * Character reference sheet for the picked worker (or prop): who it is, code or LLM, its tool machines, how it
 * falls back, its last step with tool args/results, and the source lines behind them. A non-modal Radix Dialog
 * docked over the run-log column, so the diorama stays visible and clickable while it is open.
 */
import * as Dialog from "@radix-ui/react-dialog";
import { CloudIcon, CodeIcon, GithubLogoIcon, WrenchIcon, XIcon } from "@phosphor-icons/react";

import { formatDuration, traceJson } from "@/lib/agent-trace";
import { AGENT_IDS, AGENT_LABELS, type AgentId } from "@/lib/agents";
import type { AgentToolCall, CodeRef } from "@/lib/chat-stream-contract";
import { CAST, PROP_NOTES } from "@/lib/factory/cast";
import type { StationId } from "@/lib/factory/layout";
import { githubLink, vscodeLink } from "@/lib/factory/links";
import type { RunState, StationState } from "@/lib/factory/run-state";
import styles from "./factory.module.css";

export interface SheetSelection {
  station: StationId;
  /** A tool machine picked in the scene or in the sheet's tool list. */
  tool: string | null;
}

interface SheetProps {
  selection: SheetSelection | null;
  state: RunState;
  repo: { root: string | undefined; commit: string | null };
  onSelectTool: (tool: string | null) => void;
  onClose: () => void;
}

const STATE_TEXT: Record<StationState, string> = {
  idle: "Đang chờ", active: "Đang chạy", done: "Đã chạy", skipped: "Bỏ qua lượt này", fallback: "Chạy dự phòng", error: "Lỗi",
};
const agentIds = new Set<string>(AGENT_IDS);
const isAgent = (id: StationId): id is AgentId => agentIds.has(id);
const fileOf = (ref: CodeRef) => `${ref.path.split("/").at(-1)}:${ref.line}`;

export function CharacterSheet({ selection, state, repo, onSelectTool, onClose }: SheetProps) {
  const id = selection?.station ?? null;
  return (
    <Dialog.Root open={id !== null} onOpenChange={(open) => !open && onClose()} modal={false}>
      <Dialog.Content
        className={styles.sheet}
        // Picking another worker in the scene swaps the sheet instead of closing it.
        onInteractOutside={(event) => event.preventDefault()}
      >
        {id && (isAgent(id) ? (
          <AgentSheet id={id} tool={selection!.tool} state={state} repo={repo} onSelectTool={onSelectTool} />
        ) : (
          <>
            <header className={styles.sheetHead}>
              <Dialog.Title className={styles.sheetName}>{PROP_NOTES[id].name}</Dialog.Title>
              <p className={styles.sheetStation}>Đạo cụ trong xưởng · {STATE_TEXT[state.stations[id]].toLowerCase()}</p>
            </header>
            <Dialog.Description className={styles.sheetRole}>{PROP_NOTES[id].note}</Dialog.Description>
          </>
        ))}
        <Dialog.Close className={styles.sheetClose} aria-label="Đóng tờ nhân vật">
          <XIcon weight="bold" aria-hidden />
        </Dialog.Close>
      </Dialog.Content>
    </Dialog.Root>
  );
}

function AgentSheet({ id, tool, state, repo, onSelectTool }: {
  id: AgentId;
  tool: string | null;
  state: RunState;
  repo: SheetProps["repo"];
  onSelectTool: (tool: string | null) => void;
}) {
  const member = CAST[id];
  const step = state.lastSteps[id];
  const calls = step?.tools ?? [];
  const shown = tool ? calls.filter((call) => call.name === tool) : calls;
  const status = state.stations[id];

  return (
    <>
      <header className={styles.sheetHead} data-kind={member.llm ? "llm" : "code"}>
        <Dialog.Title className={styles.sheetName}>{member.name}</Dialog.Title>
        <p className={styles.sheetStation}>Phòng {AGENT_LABELS[id]}</p>
        <div className={styles.sheetTags}>
          <span className={styles.badge} data-tone={member.llm ? "llm" : "code"}>
            {member.llm ? <CloudIcon weight="fill" aria-hidden /> : <CodeIcon weight="bold" aria-hidden />}
            {member.llm ? "Gọi LLM" : "Chỉ chạy code"}
          </span>
          <span className={styles.badge} data-tone={status}>{STATE_TEXT[status]}</span>
        </div>
      </header>
      <Dialog.Description className={styles.sheetRole}>{member.role}</Dialog.Description>

      <section className={styles.sheetSection} aria-labelledby={`sheet-tools-${id}`}>
        <h3 id={`sheet-tools-${id}`} className={styles.sheetHeading}>Máy trong phòng</h3>
        {member.tools.length === 0 ? (
          <p className={styles.sheetText}>{member.llm ? "Không có máy tool: chỉ gọi LLM để phân loại ý định." : "Không có máy tool: chỉ chạy luật."}</p>
        ) : (
          <ul className={styles.tools}>
            {member.tools.map((name) => {
              const used = calls.some((call) => call.name === name);
              return (
                <li key={name}>
                  <button
                    type="button"
                    className={styles.tool}
                    aria-pressed={tool === name}
                    onClick={() => onSelectTool(tool === name ? null : name)}
                  >
                    <WrenchIcon weight="bold" aria-hidden />
                    <code>{name}</code>
                    <span className={styles.toolUsed}>{used ? "đã gọi lần gần nhất" : "chưa gọi"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={styles.sheetSection} aria-labelledby={`sheet-fallback-${id}`}>
        <h3 id={`sheet-fallback-${id}`} className={styles.sheetHeading}>Khi lỗi</h3>
        <p className={styles.sheetText}>{member.fallback}</p>
      </section>

      <section className={styles.sheetSection} aria-labelledby={`sheet-last-${id}`}>
        <h3 id={`sheet-last-${id}`} className={styles.sheetHeading}>Lần chạy gần nhất</h3>
        {!step ? (
          <p className={styles.sheetText}>Phòng này chưa chạy. Gửi một câu hỏi đi qua phòng này để xem tham số, kết quả và dòng code.</p>
        ) : (
          <>
            <p className={styles.sheetText}>
              <strong>{step.summary || "đã xử lý"}</strong>
              <span className={styles.sheetMeta}> · {formatDuration(step.ms)}{step.fallback ? ` · dự phòng: ${step.fallback}` : ""}</span>
            </p>
            {step.code && <CodeLinks code={step.code} repo={repo} subject={AGENT_LABELS[id]} />}
            {tool && shown.length === 0 && <p className={styles.sheetText}>Lần chạy gần nhất không gọi <code>{tool}</code>.</p>}
            {shown.map((call, index) => <ToolCall key={`${call.name}-${index}`} call={call} repo={repo} />)}
          </>
        )}
      </section>
    </>
  );
}

function ToolCall({ call, repo }: { call: AgentToolCall; repo: SheetProps["repo"] }) {
  const args = traceJson(call.args, 400);
  const result = traceJson(call.result, 600);
  return (
    <div className={styles.call}>
      <p className={styles.callName}><WrenchIcon weight="bold" aria-hidden /><code>{call.name}</code></p>
      <p className={styles.callLabel}>Tham số{args.truncated ? " (cắt ngắn)" : ""}</p>
      <pre className={styles.json}>{args.text}</pre>
      <p className={styles.callLabel}>Kết quả{result.truncated ? " (cắt ngắn)" : ""}</p>
      <pre className={styles.json}>{result.text}</pre>
      {call.code && <CodeLinks code={call.code} repo={repo} subject={call.name} />}
    </div>
  );
}

/** VS Code only when the backend told us where the repo is; GitHub always (pinned commit, else `main`). */
function CodeLinks({ code, repo, subject }: { code: CodeRef; repo: SheetProps["repo"]; subject: string }) {
  const local = vscodeLink(repo.root, code);
  return (
    <p className={styles.links}>
      <code className={styles.where}>{fileOf(code)}</code>
      {local && (
        <a className={styles.link} href={local}>
          <CodeIcon weight="bold" aria-hidden />
          Mở trong VS Code<span className="sr-only"> · {subject}</span>
        </a>
      )}
      <a className={styles.link} href={githubLink(repo.commit, code)} target="_blank" rel="noreferrer">
        <GithubLogoIcon weight="fill" aria-hidden />
        Xem trên GitHub<span className="sr-only"> · {subject}</span>
      </a>
    </p>
  );
}
