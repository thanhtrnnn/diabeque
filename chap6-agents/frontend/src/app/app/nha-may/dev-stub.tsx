"use client";

// STUB (Task 10 manual check): fires fixture runs at the scene. Task 12 deletes this file.
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import type { StationId } from "@/lib/factory/layout";
import { DEV_ERROR_RUN, DEV_SCENARIOS } from "@/lib/factory/dev-fixture";
import { initialRunState, reduce, type RunState } from "@/lib/factory/run-state";
import { STEP_MS, useFactoryRun } from "@/lib/factory/use-factory-run";
import { useMediaQuery } from "@/lib/use-media-query";

const FactoryScene = dynamic(() => import("@/components/factory/scene").then((m) => m.FactoryScene), { ssr: false });

export function DevStub() {
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const run = useFactoryRun({ reducedMotion, scenarios: DEV_SCENARIOS });
  const [errorRun, setErrorRun] = useState<{ state: RunState; at: number } | null>(null);
  const [selected, setSelected] = useState<StationId | null>(null);
  const [picked, setPicked] = useState("");

  useEffect(() => {
    if (!errorRun || errorRun.at >= DEV_ERROR_RUN.length) return;
    const id = setTimeout(() => setErrorRun({ state: reduce(errorRun.state, DEV_ERROR_RUN[errorRun.at]), at: errorRun.at + 1 }), STEP_MS);
    return () => clearTimeout(id);
  }, [errorRun]);

  const state = errorRun?.state ?? run.state;
  const bar = { position: "absolute", top: 12, left: 12, zIndex: 5, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 14 } as const;
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <FactoryScene
        state={state}
        selected={selected}
        reducedMotion={reducedMotion}
        onSelect={(id) => {
          setPicked(id);
          setSelected(id in state.stations ? (id as StationId) : null);
        }}
      />
      <style>{"[data-dev-stub] button{background:#3b1f12;color:#fff4e0;border:1px solid #5a3220;border-radius:999px;padding:4px 12px}"}</style>
      <div style={bar} data-dev-stub>
        {DEV_SCENARIOS.map((scenario) => (
          <button key={scenario.id} type="button" onClick={() => { setErrorRun(null); run.play(scenario.id); }}>{scenario.label}</button>
        ))}
        <button type="button" onClick={() => { run.cancel(); setErrorRun({ state: initialRunState(), at: 0 }); }}>Lỗi tool</button>
        <button type="button" onClick={() => run.next()}>Bước tiếp</button>
        <button type="button" onClick={() => { setErrorRun(null); run.reset(); }}>Đặt lại</button>
        <span style={{ color: "#fff4e0" }}>{state.caption} {picked && `· chọn: ${picked}`}</span>
      </div>
    </div>
  );
}
