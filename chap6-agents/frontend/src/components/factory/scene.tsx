"use client";

/**
 * The candy-works diorama. Renders `RunState` only (never reads the network): one WebGL canvas with an
 * orthographic isometric camera, plus an HTML layer of station labels that double as keyboard buttons.
 * Load it with `dynamic(..., { ssr: false })`; without WebGL (or after the context is lost) it shows
 * `<FactoryFallback />` instead.
 */
import { BookOpenIcon, CheckCircleIcon, CircleIcon, CloudIcon, CodeIcon, LightningIcon, MinusCircleIcon, WarningIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

import { AGENT_LABELS } from "@/lib/agents";
import { STATIONS, type StationId } from "@/lib/factory/layout";
import type { RunState, StationState } from "@/lib/factory/run-state";
import { SweetRunner, buildSweet } from "./candy";
import { PALETTE, disposeTree } from "./materials";
import styles from "./scene.module.css";
import { animateRoom, buildWorld, paintRoom, stationPosition, type WorldHandles } from "./world";

export interface FactorySceneProps {
  state: RunState;
  selected: StationId | null;
  /** A station id, or a tool name when a machine was picked. */
  onSelect: (id: StationId | string) => void;
  reducedMotion: boolean;
}

/** Camera: ~35° above the table, turned 14° off the front so the main line still reads left to right. */
const ELEVATION = THREE.MathUtils.degToRad(35);
const AZIMUTH = THREE.MathUtils.degToRad(14);
/** Share of the frame kept clear for the HUD: question field on top, caption ticker at the bottom. */
const FRAME_PAD = { top: 0.12, bottom: 0.1, side: 0.03 };

const NAMES: Record<StationId, string> = { ...AGENT_LABELS, gate: "Cửa vào", exit: "Trả lời", memory: "Két nhớ" };
/** Short chip names so neighbouring labels never collide at projector size; the full name stays in `aria-label`. */
const SHORT: Record<StationId, string> = {
  gate: "Cửa vào", safety_in: "An toàn vào", orchestrator: "Điều phối", intake: "Thu thập", risk: "Dự đoán",
  knowledge: "Tra cứu", advisor: "Tư vấn", safety_out: "An toàn ra", exit: "Trả lời", memory: "Két nhớ",
};
const STATE_TEXT: Record<StationState, string> = {
  idle: "đang chờ", active: "đang chạy", done: "đã chạy", skipped: "bỏ qua", fallback: "chạy dự phòng", error: "lỗi",
};
const STATE_ICON: Record<StationState, typeof CircleIcon> = {
  idle: CircleIcon, active: LightningIcon, done: CheckCircleIcon, skipped: MinusCircleIcon, fallback: BookOpenIcon, error: WarningIcon,
};
/** Tab order follows the graph: entry, the two branches, the exit, then the memory safe. */
const TAB_ORDER: StationId[] = ["gate", "safety_in", "orchestrator", "knowledge", "intake", "risk", "advisor", "safety_out", "exit", "memory"];

function webglAvailable(): boolean {
  if (typeof window === "undefined" || typeof window.WebGLRenderingContext === "undefined") return false;
  try {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2") ?? probe.getContext("webgl");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export function FactoryFallback({ reason = "unsupported" }: { reason?: "unsupported" | "lost" }) {
  return (
    <div className={styles.fallback} role="status">
      <p className={styles.fallbackTitle}>Trình duyệt không hỗ trợ WebGL{reason === "lost" ? " lúc này" : ""}</p>
      <p className={styles.fallbackText}>
        {reason === "lost"
          ? "Bộ xử lý đồ họa vừa ngắt kết nối nên nhà máy kẹo không vẽ tiếp được. Tải lại trang để thử lại, hoặc xem sơ đồ các agent ở trang Kiến trúc."
          : "Nhà máy kẹo cần WebGL để vẽ cảnh 3D. Bạn vẫn xem được sơ đồ các agent và luồng xử lý ở trang Kiến trúc."}
      </p>
      <Link className={styles.fallbackLink} href="/app/kien-truc">Mở trang Kiến trúc</Link>
    </div>
  );
}

export function FactoryScene(props: FactorySceneProps) {
  const [support, setSupport] = useState<"ok" | "unsupported" | "lost">(() => (webglAvailable() ? "ok" : "unsupported"));
  if (support !== "ok") return <FactoryFallback reason={support} />;
  return <FactoryCanvas {...props} onLost={() => setSupport("lost")} />;
}

/** `y` is where the chip sits; `anchor` is where its room is when the chip had to move off it. */
type LabelPoint = { x: number; y: number; anchor?: number };

function FactoryCanvas({ state, selected, onSelect, reducedMotion, onLost }: FactorySceneProps & { onLost: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const callbacks = useRef({ onSelect, onLost });
  const [labels, setLabels] = useState<Record<string, LabelPoint>>({});

  useEffect(() => {
    callbacks.current = { onSelect, onLost };
  }, [onSelect, onLost]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let engine: Engine;
    try {
      engine = new Engine(host, {
        onLabels: setLabels,
        onSelect: (id) => callbacks.current.onSelect(id),
        onLost: () => callbacks.current.onLost(),
      });
    } catch {
      queueMicrotask(() => callbacks.current.onLost());
      return;
    }
    engineRef.current = engine;
    return () => {
      engineRef.current = null;
      engine.dispose();
    };
  }, []);

  useEffect(() => {
    engineRef.current?.show(state, selected, reducedMotion);
  }, [state, selected, reducedMotion]);

  const at = (key: string): CSSProperties | undefined => {
    const p = labels[key];
    return p ? { left: `${p.x}px`, top: `${p.y}px` } : { visibility: "hidden" };
  };

  const stems = TAB_ORDER.flatMap((id) => {
    const p = labels[id];
    if (!p || p.anchor === undefined) return [];
    const [from, to] = p.anchor > p.y ? [p.y, p.anchor] : [p.anchor, p.y];
    return [<span key={`stem-${id}`} className={styles.stem} style={{ left: `${p.x}px`, top: `${from}px`, height: `${to - from}px` }} aria-hidden />];
  });

  return (
    <div className={styles.stage} ref={hostRef} data-testid="factory-stage">
      <div className={styles.labels}>
        {stems}
        {TAB_ORDER.map((id) => {
          const s = state.stations[id];
          const Icon = STATE_ICON[s];
          const kind = STATIONS[id].kind;
          return (
            <button
              key={id}
              type="button"
              className={styles.label}
              data-state={s}
              data-below={id === "knowledge" ? "" : undefined}
              data-selected={selected === id ? "" : undefined}
              style={at(id)}
              aria-label={`${NAMES[id]}: ${STATE_TEXT[s]}${kind === "llm" ? ", gọi mô hình ngôn ngữ" : kind === "code" ? ", chỉ chạy code" : ""}`}
              aria-pressed={selected === id}
              onClick={() => onSelect(id)}
            >
              <Icon className={styles.labelIcon} weight={s === "idle" ? "regular" : "fill"} aria-hidden />
              <span>{SHORT[id]}</span>
              {kind === "llm" && <CloudIcon className={styles.kind} weight="fill" aria-hidden />}
              {kind === "code" && <CodeIcon className={styles.kind} weight="bold" aria-hidden />}
            </button>
          );
        })}
        <button type="button" className={styles.label} data-below="" data-cellar="" style={at("cellar")} onClick={() => onSelect("search_knowledge")}>
          <span>Hầm tri thức · Neo4j</span>
        </button>
        <p className={styles.strip} style={at("strip")}>Dựng KB offline: 28 link + 7 PDF → 424 đoạn → bge-m3 → Neo4j → dữ kiện</p>
      </div>
    </div>
  );
}

/** Rough chip size in px (Baloo 2 at 16px), enough to keep neighbouring chips apart. */
const chipWidth = (id: StationId) => 40 + SHORT[id].length * 8.5 + (STATIONS[id].kind === "prop" ? 0 : 20);
const CHIP_H = 34;

/**
 * Lifts a chip above any chip already placed that it would cover, in tab order, so labels never overlap
 * whatever the canvas size. Chips that hang below their room (knowledge) are pushed down instead.
 */
function declutter(labels: Record<string, LabelPoint>): Record<string, LabelPoint> {
  const placed: Array<{ x: number; top: number; w: number }> = [];
  const out = { ...labels };
  for (const id of TAB_ORDER) {
    const p = out[id];
    if (!p) continue;
    const below = id === "knowledge";
    const w = chipWidth(id);
    let top = below ? p.y : p.y - CHIP_H;
    for (let guard = 0; guard < 8; guard++) {
      const hit = placed.find((o) => Math.abs(o.x - p.x) < (o.w + w) / 2 + 6 && Math.abs(o.top - top) < CHIP_H + 4);
      if (!hit) break;
      top = below ? hit.top + CHIP_H + 4 : hit.top - CHIP_H - 4;
    }
    placed.push({ x: p.x, top, w });
    const y = below ? top : top + CHIP_H;
    out[id] = { x: p.x, y, ...(y !== p.y && { anchor: p.y }) };
  }
  return out;
}

// ---------------------------------------------------------------- engine (plain three.js)

interface EngineHooks {
  onLabels: (labels: Record<string, LabelPoint>) => void;
  onSelect: (id: string) => void;
  onLost: () => void;
}

const LLM_STATIONS = (Object.keys(STATIONS) as StationId[]).filter((id) => STATIONS[id].kind === "llm");

class Engine {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  private readonly world: WorldHandles;
  private readonly runner: SweetRunner;
  private readonly env: THREE.Texture;
  private readonly observer: ResizeObserver;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly timer = new THREE.Clock();
  private stations: RunState["stations"] | null = null;
  private reduced = false;
  private down: { x: number; y: number } | null = null;
  private hoverFrame = 0;

  constructor(private readonly host: HTMLElement, private readonly hooks: EngineHooks) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer = renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = styles.canvas;
    host.prepend(renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    this.env = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    pmrem.dispose();
    this.scene.environment = this.env;
    this.scene.environmentIntensity = 0.35;

    const hemi = new THREE.HemisphereLight(PALETTE.sugar, PALETTE.chocolate2, 1.1);
    const sun = new THREE.DirectionalLight("#fff0d8", 2.6);
    sun.position.set(-8, 16, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 12, bottom: -12, near: 1, far: 50 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    this.scene.add(hemi, sun);

    this.world = buildWorld(this.scene);
    const sweet = buildSweet();
    this.scene.add(sweet);
    const curves = Object.fromEntries(Object.entries(this.world.tracks).map(([id, t]) => [id, t.curve]));
    this.runner = new SweetRunner(sweet, curves, stationPosition("gate"));

    const target = this.world.frame[0].getCenter(new THREE.Vector3());
    const dir = new THREE.Vector3(Math.sin(AZIMUTH) * Math.cos(ELEVATION), Math.sin(ELEVATION), Math.cos(AZIMUTH) * Math.cos(ELEVATION));
    this.camera.position.copy(target).addScaledVector(dir, 60);
    this.camera.lookAt(target);
    this.camera.far = 140;

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    const canvas = renderer.domElement;
    canvas.addEventListener("webglcontextlost", this.lost);
    canvas.addEventListener("pointerdown", this.pointerDown);
    canvas.addEventListener("pointerup", this.pointerUp);
    canvas.addEventListener("pointermove", this.pointerMove);
    this.resize();
    renderer.setAnimationLoop(this.frame);
  }

  show(state: RunState, selected: StationId | null, reducedMotion: boolean): void {
    this.stations = state.stations;
    this.reduced = reducedMotion;
    const tex = this.world.stateTextures;
    for (const id of Object.keys(this.world.rooms) as StationId[]) paintRoom(this.world.rooms[id], state.stations[id], selected === id, tex);
    const lit = new Set(state.litTracks);
    for (const [id, { mesh }] of Object.entries(this.world.tracks)) {
      const on = lit.has(id as never);
      mesh.material.color.set(on ? PALETTE.strawberry : PALETTE.licorice);
      mesh.material.emissive.set(on ? PALETTE.strawberry : "#000000");
      mesh.material.emissiveIntensity = on ? 0.45 : 0;
    }
    this.runner.setTracks(state.litTracks, reducedMotion);
    const down = LLM_STATIONS.some((id) => state.stations[id] === "fallback");
    const cloud = this.world.materials.cloud;
    cloud.color.set(down ? PALETTE.ash : PALETTE.sugar);
    cloud.emissiveIntensity = down ? 0 : 0.12;
    this.world.cloud.position.y = 4.5 - (down ? 0.35 : 0);
  }

  private frame = () => {
    const dt = Math.min(this.timer.getDelta(), 0.1);
    const time = this.timer.elapsedTime;
    this.runner.update(dt, this.reduced);
    if (this.stations) {
      for (const id of Object.keys(this.world.rooms) as StationId[]) animateRoom(this.world.rooms[id], this.stations[id], time, this.reduced);
      const busy = LLM_STATIONS.some((id) => this.stations![id] === "active");
      if (busy) this.world.materials.cloud.emissiveIntensity = 0.2 + 0.25 * (0.5 + 0.5 * Math.sin(time * 4));
    }
    if (!this.reduced) this.world.cloud.rotation.y = Math.sin(time * 0.3) * 0.04;
    this.renderer.render(this.scene, this.camera);
  };

  /** Fits the diorama's bounding box into the canvas, leaving room for the HUD, and re-projects labels. */
  private resize(): void {
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.updateMatrixWorld();
    const view = this.camera.matrixWorldInverse;
    const min = new THREE.Vector2(Infinity, Infinity);
    const max = new THREE.Vector2(-Infinity, -Infinity);
    for (const box of this.world.frame) {
      for (let i = 0; i < 8; i++) {
        const p = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(view);
        min.min(new THREE.Vector2(p.x, p.y));
        max.max(new THREE.Vector2(p.x, p.y));
      }
    }
    const usableH = 1 - FRAME_PAD.top - FRAME_PAD.bottom;
    const usableW = 1 - FRAME_PAD.side * 2;
    const spanX = max.x - min.x;
    const spanY = max.y - min.y;
    const aspect = width / height;
    const halfH = Math.max(spanY / usableH, spanX / usableW / aspect) / 2;
    const halfW = halfH * aspect;
    // Centre the box inside the padded band, not the whole canvas.
    const cx = (min.x + max.x) / 2;
    const cy = (min.y + max.y) / 2 - (FRAME_PAD.top - FRAME_PAD.bottom) * halfH;
    Object.assign(this.camera, { left: cx - halfW, right: cx + halfW, top: cy + halfH, bottom: cy - halfH });
    this.camera.updateProjectionMatrix();

    const labels: Record<string, LabelPoint> = {};
    for (const [key, point] of Object.entries(this.world.labelAt)) {
      const p = point.clone().project(this.camera);
      labels[key] = { x: Math.round((p.x * 0.5 + 0.5) * width), y: Math.round((-p.y * 0.5 + 0.5) * height) };
    }
    this.hooks.onLabels(declutter(labels));
  }

  private pick(event: PointerEvent): string | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    for (const hit of this.raycaster.intersectObjects(this.scene.children, true)) {
      if (!hit.object.visible) continue;
      for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) {
        const id = o.userData.select as string | undefined;
        if (id) return id === "cloud" ? null : id;
      }
    }
    return null;
  }

  private pointerDown = (event: PointerEvent) => {
    this.down = { x: event.clientX, y: event.clientY };
  };

  private pointerUp = (event: PointerEvent) => {
    const start = this.down;
    this.down = null;
    if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
    const id = this.pick(event);
    if (id) this.hooks.onSelect(id);
  };

  private pointerMove = (event: PointerEvent) => {
    if (this.hoverFrame) return;
    this.hoverFrame = requestAnimationFrame(() => {
      this.hoverFrame = 0;
      this.renderer.domElement.style.cursor = this.pick(event) ? "pointer" : "";
    });
  };

  private lost = (event: Event) => {
    event.preventDefault();
    this.hooks.onLost();
  };

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    cancelAnimationFrame(this.hoverFrame);
    this.observer.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("webglcontextlost", this.lost);
    canvas.removeEventListener("pointerdown", this.pointerDown);
    canvas.removeEventListener("pointerup", this.pointerUp);
    canvas.removeEventListener("pointermove", this.pointerMove);
    disposeTree(this.scene);
    for (const material of Object.values(this.world.materials)) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
      material.dispose();
    }
    const tex = this.world.stateTextures;
    for (const t of [tex.crackle, tex.crack, tex.book.map, tex.warning.map]) t?.dispose();
    tex.book.dispose();
    tex.warning.dispose();
    this.env.dispose();
    this.renderer.dispose();
    canvas.remove();
  }
}
