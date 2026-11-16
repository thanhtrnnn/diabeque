"use client";

/**
 * The Nhà máy page body: HUD on top, the candy-works diorama in the middle, caption ticker below, the run log
 * in its own column on the right, and a character sheet that slides over that column (never over the rooms).
 * Live turns go through the chat stream; recorded scenarios replay real runs from `scenarios.json`.
 */
import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";

import { fetchAgents } from "@/lib/api-client";
import { STATIONS, TOOL_STATION, type StationId } from "@/lib/factory/layout";
import { SCENARIOS, type Scenario } from "@/lib/factory/scenarios";
import { useFactoryRun } from "@/lib/factory/use-factory-run";
import { useMediaQuery } from "@/lib/use-media-query";
import { useRemote } from "@/lib/use-remote";
import { CharacterSheet, type SheetSelection } from "./character-sheet";
import { FactoryAnswer, FactoryHud, FactoryLog, FactoryTicker } from "./factory-hud";
import styles from "./factory.module.css";

const FactoryScene = dynamic(() => import("./scene").then((m) => m.FactoryScene), {
  ssr: false,
  loading: () => <p className={styles.loading} role="status">Đang dựng nhà máy kẹo…</p>,
});

const isStation = (id: string): id is StationId => Object.hasOwn(STATIONS, id);

export function FactoryView({ scenarios = SCENARIOS }: { scenarios?: Scenario[] }) {
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const run = useFactoryRun({ reducedMotion, scenarios });
  const agents = useRemote("agents", fetchAgents);
  const repo = { root: agents.data?.repo_root || undefined, commit: agents.data?.commit ?? null };
  const [selection, setSelection] = useState<SheetSelection | null>(null);
  const [llmDown, setLlmDown] = useState(false);
  const [logOpen, setLogOpen] = useState(true);
  /** From 48rem the sheet docks over the run-log column (below that it is a bottom sheet). */
  const docked = useMediaQuery("(min-width: 48rem)");
  /** The control that opened the sheet, so closing it puts focus back there. */
  const opener = useRef<HTMLElement | null>(null);

  const select = useCallback((id: string) => {
    const station = isStation(id) ? id : TOOL_STATION[id];
    if (!station) return;
    const active = document.activeElement;
    // A canvas click leaves focus on <body>; keep the last real opener then.
    if (active instanceof HTMLElement && active !== document.body && !active.closest("[role=dialog]")) opener.current = active;
    setSelection({ station, tool: isStation(id) ? null : id });
  }, []);

  const covered = selection !== null && docked;

  return (
    // While the sheet is docked, the column is open at its width even if the log was collapsed, so the sheet never
    // reaches over the rooms.
    <div className={styles.factory} data-log={logOpen || covered ? "open" : "closed"}>
      <FactoryHud
        run={run}
        scenarios={scenarios}
        reducedMotion={reducedMotion}
        allowSimulation={agents.data?.allow_simulation === true}
        llmDown={llmDown}
        onLlmDown={setLlmDown}
      />
      <div className={styles.stage}>
        <FactoryScene state={run.state} selected={selection?.station ?? null} onSelect={select} reducedMotion={reducedMotion} />
      </div>
      <FactoryTicker caption={run.state.caption} turn={run.state.turn} busy={run.busy} />
      <FactoryAnswer turn={run.state.turn} question={run.state.question} answer={run.state.answer} busy={run.busy} />
      <FactoryLog log={run.state.log} open={logOpen} onToggle={() => setLogOpen((open) => !open)} onSelect={select} inert={covered} />
      <CharacterSheet
        selection={selection}
        state={run.state}
        repo={repo}
        onSelectTool={(tool) => setSelection((current) => current && { ...current, tool })}
        onClose={() => setSelection(null)}
        onReturnFocus={() => opener.current?.isConnected && opener.current.focus()}
      />
    </div>
  );
}
