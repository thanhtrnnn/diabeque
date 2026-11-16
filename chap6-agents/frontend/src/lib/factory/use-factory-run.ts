"use client";

/**
 * Drives the factory: turns a live chat stream or a recorded scenario into `RunEvent`s and releases them
 * at a pace the scene can animate. Every run carries a generation number; anything from an older run
 * (a late SSE frame, a pending timer) is dropped, so a new question never shows ghosts of the last one.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { ChatStreamProtocolError, parseAgentStep, type AnswerSection, type ChatRequest, type ChatStreamAnswer } from "@/lib/chat-stream-contract";
import { readChatStreamV1 } from "@/lib/chat-stream-parser";
import { initialRunState, reduce, type RunAnswerSection, type RunEvent, type RunState } from "./run-state";
import { SCENARIOS, awaitsIntake, type Scenario } from "./scenarios";

/** Shortest time one step stays on screen before the next is revealed. */
export const STEP_MS = 700;

const NETWORK_MESSAGE = "Không kết nối được máy chủ.";
const HTTP_MESSAGE = "Không thể bắt đầu luồng trả lời lúc này.";
const INCOMPLETE_MESSAGE = "Luồng trả lời kết thúc trước khi có kết quả.";
const GENERIC_MESSAGE = "Luồng trả lời bị gián đoạn.";

export interface FactoryRun {
  state: RunState;
  ask(message: string, simulateLlmDown: boolean): void;
  play(scenarioId: string): void;
  /** Reveals the next held step (step mode under reduced motion; also skips the wait otherwise). */
  next(): void;
  cancel(): void;
  /** New conversation: fresh `conversation_id`, empty factory. */
  reset(): void;
  busy: boolean;
  pendingSteps: number;
}

/** Flattens streamed sections to plain text, citations as [n]; the "Căn cứ" list stays (it names the sources). */
const plainSections = (sections: AnswerSection[]): RunAnswerSection[] =>
  sections.map((s) => ({
    kind: s.kind,
    title: s.title,
    text: s.content.map((t) => (t.type === "text" ? t.text : `[${t.label}]`)).join(""),
  }));

/** Recorded sections still carry `[[cite:x]]` markers; number them in order of first use. */
function numberCitations(sections: RunAnswerSection[]): RunAnswerSection[] {
  const labels = new Map<string, number>();
  return sections.map((s) => ({
    ...s,
    text: s.text.replace(/\[\[cite:([^\]]+)\]\]/g, (_, id: string) => {
      if (!labels.has(id)) labels.set(id, labels.size + 1);
      return `[${labels.get(id)}]`;
    }),
  }));
}

/** Thrown inside the stream callback when the run it belongs to was replaced. */
class StaleRun extends Error {}

const paced = (event: RunEvent) => event.type === "step" || event.type === "start";

async function failureMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: { message?: unknown } } | null;
  return typeof body?.error?.message === "string" ? body.error.message : HTTP_MESSAGE;
}

export function useFactoryRun(opts: { reducedMotion: boolean; scenarios?: Scenario[] }): FactoryRun {
  const scenarios = opts.scenarios ?? SCENARIOS;
  const [state, setState] = useState<RunState>(initialRunState);
  const [busy, setBusy] = useState(false);
  const [pendingSteps, setPendingSteps] = useState(0);

  const stateRef = useRef<RunState>(state);
  const reducedRef = useRef(opts.reducedMotion);
  const generation = useRef(0);
  const queue = useRef<RunEvent[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Step mode: the last step stays until `next()`. */
  const held = useRef(false);
  /** The live stream is still being read. */
  const reading = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const turn = useRef(0);
  const conversationId = useRef<string | null>(null);

  useEffect(() => {
    reducedRef.current = opts.reducedMotion;
  }, [opts.reducedMotion]);

  const sync = useCallback(() => {
    setBusy(reading.current || queue.current.length > 0);
    setPendingSteps(queue.current.filter((event) => event.type === "step").length);
  }, []);

  const apply = useCallback((event: RunEvent) => {
    stateRef.current = reduce(stateRef.current, event);
    setState(stateRef.current);
  }, []);

  const pump = useCallback(() => {
    const gen = generation.current;
    const later = (ms: number, then: () => void) => {
      timer.current = setTimeout(() => {
        if (generation.current !== gen) return;
        timer.current = null;
        then();
        drain();
      }, ms);
    };
    function drain() {
      while (queue.current.length > 0 && timer.current === null) {
        const head = queue.current[0];
        if (held.current) {
          if (paced(head)) break;
          // Step mode: let the step on screen render, then settle the turn without another press.
          later(0, () => apply(queue.current.shift()!));
          break;
        }
        queue.current.shift();
        apply(head);
        const holds = head.type === "step" || (head.type === "finish" && queue.current.length > 0);
        if (!holds) continue;
        if (reducedRef.current) held.current = true;
        else later(STEP_MS, () => { held.current = false; });
      }
      sync();
    }
    drain();
  }, [apply, sync]);

  /** Ends whatever runs now; returns the generation the next run owns. */
  const stop = useCallback(() => {
    generation.current += 1;
    abort.current?.abort();
    abort.current = null;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    held.current = false;
    const wasRunning = reading.current || queue.current.length > 0;
    queue.current = [];
    reading.current = false;
    return { gen: generation.current, wasRunning };
  }, []);

  const begin = useCallback((question = "") => {
    const { gen } = stop();
    turn.current += 1;
    apply({ type: "start", turn: turn.current, question });
    return gen;
  }, [apply, stop]);

  const ask = useCallback((message: string, simulateLlmDown: boolean) => {
    const gen = begin(message);
    conversationId.current ??= crypto.randomUUID();
    const request: ChatRequest = {
      message,
      conversation_id: conversationId.current,
      ...(simulateLlmDown && { simulate: "llm_down" as const }),
    };
    const controller = new AbortController();
    abort.current = controller;
    reading.current = true;
    sync();

    let ended = false;
    const push = (event: RunEvent) => {
      if (generation.current !== gen) throw new StaleRun();
      if (ended) return;
      if (event.type === "finish" || event.type === "streamError") ended = true;
      queue.current.push(event);
      pump();
    };

    void (async () => {
      try {
        const response = await fetch("/api/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
          signal: controller.signal,
        });
        if (!response.ok) throw new ChatStreamProtocolError(await failureMessage(response));
        await readChatStreamV1(response, ({ event, envelope }) => {
          const data = envelope.data;
          if (event === "agent.step") {
            const step = parseAgentStep(data);
            if (step) push({ type: "step", step });
          } else if (event === "agent.error") {
            push({ type: "agentError", node: String(data.node), errorType: String(data.error_type) });
          } else if (event === "stream.error") {
            const error = data.error as { message: string };
            push({ type: "streamError", message: error.message });
          } else if (event === "answer.final") {
            const answer = data.answer as ChatStreamAnswer;
            push({ type: "finish", awaitingIntake: answer.sections.at(-1)?.kind === "question", sections: plainSections(answer.sections) });
          } else if (generation.current !== gen) throw new StaleRun();
        });
        if (generation.current !== gen) return;
        reading.current = false;
        push({ type: "streamError", message: INCOMPLETE_MESSAGE });
      } catch (error) {
        if (generation.current !== gen || error instanceof StaleRun) return;
        reading.current = false;
        const message = error instanceof ChatStreamProtocolError
          ? error.message
          : error instanceof TypeError ? NETWORK_MESSAGE : GENERIC_MESSAGE;
        push({ type: "streamError", message });
      } finally {
        if (generation.current === gen) {
          reading.current = false;
          abort.current = null;
          sync();
        }
      }
    })();
  }, [begin, pump, sync]);

  const play = useCallback((scenarioId: string) => {
    const scenario = scenarios.find((item) => item.id === scenarioId);
    if (!scenario) return;
    begin(scenario.turns[0]?.message);
    scenario.turns.forEach((item, index) => {
      if (index > 0) queue.current.push({ type: "start", turn: (turn.current += 1), question: item.message });
      for (const step of item.steps) queue.current.push({ type: "step", step });
      queue.current.push({ type: "finish", awaitingIntake: awaitsIntake(item), sections: numberCitations(item.sections) });
    });
    pump();
  }, [begin, pump, scenarios]);

  const next = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    held.current = false;
    pump();
  }, [pump]);

  const cancel = useCallback(() => {
    const { wasRunning } = stop();
    if (wasRunning) apply({ type: "cancel" });
    sync();
  }, [apply, stop, sync]);

  const reset = useCallback(() => {
    stop();
    turn.current = 0;
    conversationId.current = null;
    apply({ type: "reset" });
    sync();
  }, [apply, stop, sync]);

  useEffect(() => () => {
    generation.current += 1;
    abort.current?.abort();
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);

  return { state, ask, play, next, cancel, reset, busy, pendingSteps };
}
