/**
 * The static diorama built from `STATIONS` / `TRACKS`: a chocolate-bar platform with a cut-away cellar in its
 * front face, sugar-glass bell jars for code rooms, candy kettles with cotton-candy feed lines for LLM rooms,
 * twisted licorice tracks, and the cotton-candy cloud. State painting lives here too so the scene stays thin.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

import { STATIONS, TOOL_STATION, TRACKS, type StationId, type StationKind, type TrackId } from "@/lib/factory/layout";
import type { StationState } from "@/lib/factory/run-state";
import { buildCellar, buildCloud, buildDecor, buildFeed, buildMachine, selectable } from "./candy";
import {
  PALETTE, badgeTexture, chocolateBarTexture, crackTexture, createMaterials, glassMaterial, kettleMaterial, swirlTexture,
  type Materials,
} from "./materials";

/** World units between neighbouring stations along u (left to right) and v (front to back). */
export const SX = 2.75;
export const SZ = 1.6;
export const TRACK_Y = 0.16;
const PLINTH_H = 0.3;
const PLINTH_R = 1.05;

export const stationPosition = (id: StationId) => uvToWorld(STATIONS[id].u, STATIONS[id].v);
const uvToWorld = (u: number, v: number) => new THREE.Vector3((u - 3.5) * SX, 0, -v * SZ);

export interface RoomHandles {
  kind: StationKind;
  /** Everything above the plinth: bobs while active, tilts on error. */
  bob: THREE.Group;
  tints: Array<{ material: THREE.MeshStandardMaterial; base: THREE.Color }>;
  ring: THREE.Mesh<THREE.TorusGeometry, THREE.MeshStandardMaterial>;
  selectRing: THREE.Mesh;
  knob: THREE.Mesh;
  shell: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | null;
  badge: THREE.Sprite;
  feed: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[];
}

export interface WorldHandles {
  stations: Record<StationId, THREE.Object3D>;
  /** Empty group per station where a character rig attaches (Task 11). */
  anchors: Record<StationId, THREE.Group>;
  rooms: Record<StationId, RoomHandles>;
  tracks: Record<TrackId, { mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>; curve: THREE.CurvePath<THREE.Vector3> }>;
  machines: Record<string, THREE.Object3D>;
  cloud: THREE.Group;
  cellar: THREE.Group;
  /** Where each station's HTML label sits (world space). */
  labelAt: Record<StationId | "cellar" | "strip", THREE.Vector3>;
  /** Boxes the camera must keep in frame (platform, cloud): framed part by part so empty corners do not count. */
  frame: THREE.Box3[];
  materials: Materials;
  stateTextures: StateTextures;
}

const shadowed = <T extends THREE.Mesh>(m: T) => {
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};

// ---------------------------------------------------------------- tracks

/** Polyline with rounded bends, so the sweet glides around corners at a steady arc-length speed. */
export function roundedPath(points: THREE.Vector3[], radius: number): THREE.CurvePath<THREE.Vector3> {
  const path = new THREE.CurvePath<THREE.Vector3>();
  const line = (a: THREE.Vector3, b: THREE.Vector3) => {
    if (a.distanceTo(b) > 1e-4) path.add(new THREE.LineCurve3(a.clone(), b.clone()));
  };
  let start = points[0];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const din = p.clone().sub(points[i - 1]);
    const dout = points[i + 1].clone().sub(p);
    const r = Math.min(radius, din.length() / 2, dout.length() / 2);
    const a = p.clone().sub(din.normalize().multiplyScalar(r));
    const b = p.clone().add(dout.normalize().multiplyScalar(r));
    line(start, a);
    if (r > 1e-4) path.add(new THREE.QuadraticBezierCurve3(a, p.clone(), b));
    start = b;
  }
  line(start, points[points.length - 1]);
  return path;
}

/** A tube whose cross-section is a five-lobed star twisting along the path: a licorice rope. */
function licoriceGeometry(curve: THREE.Curve<THREE.Vector3>, radius: number): THREE.BufferGeometry {
  const length = curve.getLength();
  const segments = Math.max(16, Math.ceil(length * 16));
  const radial = 20;
  const geometry = new THREE.TubeGeometry(curve, segments, radius, radial, false);
  const pos = geometry.attributes.position;
  const v = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    curve.getPointAt(i / segments, c);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, k).sub(c);
      v.multiplyScalar(1 + 0.2 * Math.cos(5 * (j / radial) * Math.PI * 2 + (i / segments) * length * 5)).add(c);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}

function buildTracks(scene: THREE.Scene): WorldHandles["tracks"] {
  const out = {} as WorldHandles["tracks"];
  for (const [id, track] of Object.entries(TRACKS) as Array<[TrackId, (typeof TRACKS)[TrackId]]>) {
    const points = [stationPosition(track.from), ...track.via.map(([u, v]) => uvToWorld(u, v)), stationPosition(track.to)];
    points.forEach((p) => (p.y = TRACK_Y));
    const curve = roundedPath(points, 0.7);
    const material = new THREE.MeshPhysicalMaterial({ color: PALETTE.licorice, roughness: 0.32, clearcoat: 0.9, clearcoatRoughness: 0.2 });
    const mesh = shadowed(new THREE.Mesh(licoriceGeometry(curve, 0.1), material));
    mesh.name = `track:${id}`;
    scene.add(mesh);
    out[id] = { mesh, curve };
  }
  return out;
}

// ---------------------------------------------------------------- rooms

const lathe = (points: Array<[number, number]>, segments = 48) =>
  new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segments);

function sharedRoomGeometry() {
  return {
    plinth: new THREE.CylinderGeometry(PLINTH_R, PLINTH_R + 0.08, PLINTH_H, 48),
    ring: new THREE.TorusGeometry(PLINTH_R + 0.02, 0.06, 10, 64),
    selectRing: new THREE.TorusGeometry(PLINTH_R + 0.22, 0.045, 8, 64),
    jar: lathe([[0.86, 0], [0.84, 0.05], [0.8, 0.6], [0.77, 1.05], [0.68, 1.4], [0.5, 1.62], [0.27, 1.73], [0, 1.76]]),
    jarRim: new THREE.TorusGeometry(0.85, 0.06, 10, 48),
    kettle: lathe([[0, 0], [0.42, 0], [0.54, 0.06], [0.62, 0.22], [0.66, 0.45], [0.62, 0.68], [0.5, 0.82], [0.36, 0.88], [0.4, 0.9], [0.36, 0.99], [0.22, 1.06], [0, 1.08]]),
    knob: new THREE.SphereGeometry(0.12, 20, 14),
    spout: new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0.5, 0.3, 0), new THREE.Vector3(0.95, 0.35, 0), new THREE.Vector3(1, 0.82, 0)), 16, 0.08, 10),
    handle: new THREE.TorusGeometry(0.34, 0.06, 10, 24, Math.PI),
    post: new THREE.CylinderGeometry(0.1, 0.1, 1.5, 16),
    arch: new THREE.TorusGeometry(0.72, 0.1, 12, 32, Math.PI),
    safe: new RoundedBoxGeometry(1.1, 0.95, 0.85, 3, 0.12),
    dial: new THREE.CylinderGeometry(0.18, 0.18, 0.08, 24),
  };
}
type RoomGeometry = ReturnType<typeof sharedRoomGeometry>;

export interface StateTextures { crackle: THREE.Texture; crack: THREE.Texture; book: THREE.SpriteMaterial; warning: THREE.SpriteMaterial }

function buildRoom(id: StationId, g: RoomGeometry, m: Materials, tex: StateTextures, swirls: Record<StationKind, THREE.Texture>) {
  const kind = STATIONS[id].kind;
  const station = new THREE.Group();
  station.name = `station:${id}`;
  station.position.copy(stationPosition(id));
  selectable(station, id);

  const capMat = new THREE.MeshPhysicalMaterial({ map: swirls[kind], roughness: 0.3, clearcoat: 1 });
  const plinth = shadowed(new THREE.Mesh(g.plinth, [m.chocolateSide, capMat, m.chocolateSide]));
  plinth.position.y = PLINTH_H / 2;
  const ringMat = new THREE.MeshStandardMaterial({ color: PALETTE.cocoa, roughness: 0.4 });
  const ring = new THREE.Mesh(g.ring, ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = PLINTH_H;
  const selectRing = new THREE.Mesh(g.selectRing, new THREE.MeshBasicMaterial({ color: PALETTE.sugar }));
  selectRing.rotation.x = Math.PI / 2;
  selectRing.position.y = 0.05;
  selectRing.visible = false;
  station.add(plinth, ring, selectRing);

  const bob = new THREE.Group();
  bob.position.y = PLINTH_H;
  station.add(bob);
  const tints: RoomHandles["tints"] = [];
  const tinted = <T extends THREE.MeshStandardMaterial>(material: T) => {
    tints.push({ material, base: material.color.clone() });
    return material;
  };
  const knobMat = new THREE.MeshStandardMaterial({ color: PALETTE.lemon, roughness: 0.3, emissive: new THREE.Color(PALETTE.lemon), emissiveIntensity: 0 });
  const knob = shadowed(new THREE.Mesh(g.knob, knobMat));
  let shell: RoomHandles["shell"] = null;
  const shellMat = () => new THREE.MeshBasicMaterial({ map: tex.crackle, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const anchor = new THREE.Group();
  anchor.name = "character-anchor";
  let badgeY = 2.3;

  if (kind === "code") {
    const jar = new THREE.Mesh(g.jar, tinted(glassMaterial()));
    jar.renderOrder = 2;
    const rim = shadowed(new THREE.Mesh(g.jarRim, m.sugar));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.04;
    knob.position.y = 1.84;
    shell = new THREE.Mesh(g.jar, shellMat());
    shell.scale.setScalar(1.02);
    bob.add(jar, rim, knob, shell);
    anchor.position.set(-0.3, 0, -0.25);
  } else if (kind === "llm") {
    const kettle = new THREE.Group();
    kettle.position.set(0.42, 0, -0.62);
    kettle.scale.setScalar(0.85);
    const body = tinted(kettleMaterial());
    const pot = shadowed(new THREE.Mesh(g.kettle, body));
    const spout = shadowed(new THREE.Mesh(g.spout, body));
    const handle = shadowed(new THREE.Mesh(g.handle, m.lemon));
    handle.position.set(-0.62, 0.48, 0);
    handle.rotation.z = Math.PI / 2;
    knob.position.y = 1.14;
    shell = new THREE.Mesh(g.kettle, shellMat());
    shell.scale.setScalar(1.025);
    kettle.add(pot, spout, handle, knob, shell);
    bob.add(kettle);
    anchor.position.set(-0.45, 0, 0.42);
    badgeY = 2.0;
  } else if (id === "memory") {
    const body = tinted(new THREE.MeshPhysicalMaterial({ color: PALETTE.cocoa, roughness: 0.3, clearcoat: 1 }));
    const safe = shadowed(new THREE.Mesh(g.safe, body));
    safe.position.y = 0.48;
    const dial = shadowed(new THREE.Mesh(g.dial, m.lemon));
    dial.rotation.x = Math.PI / 2;
    dial.position.set(0, 0.52, 0.45);
    knob.position.set(0, 1.04, 0);
    knob.scale.setScalar(0.8);
    bob.add(safe, dial, shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.06), m.mint)).translateY(0.24).translateZ(0.44), knob);
    badgeY = 1.7;
  } else {
    // Gate and exit: candy-cane arches the track runs through.
    const cane = id === "gate" ? m.cane : m.caneLemon;
    for (const side of [-1, 1]) {
      const post = shadowed(new THREE.Mesh(g.post, cane));
      post.position.set(0, 0.75, side * 0.72);
      bob.add(post);
    }
    const arch = shadowed(new THREE.Mesh(g.arch, cane));
    arch.rotation.y = Math.PI / 2;
    arch.position.y = 1.5;
    knob.position.y = 2.28;
    bob.add(arch, knob);
    badgeY = 2.8;
  }
  bob.add(anchor);

  const badge = new THREE.Sprite(tex.book);
  badge.scale.setScalar(0.75);
  // Beside the room at shoulder height, clear of the label that sits above it.
  badge.position.set(0.95, 1.15, 0.45);
  badge.userData.labelY = badgeY + 0.1;
  badge.renderOrder = 10;
  badge.visible = false;
  bob.add(badge);
  if (shell) shell.visible = false;

  const room: RoomHandles = { kind, bob, tints, ring, selectRing, knob, shell, badge, feed: [] };
  return { station, anchor, room };
}

// ---------------------------------------------------------------- platform

function buildPlatform(scene: THREE.Scene, m: Materials, cell: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }) {
  const { x0, x1, y0, y1, z0, z1 } = cell;
  const X0 = -11.1, X1 = 11.1, Z0 = -6.1, Z1 = z1, BOTTOM = y0 - 0.3;
  const top = new THREE.MeshPhysicalMaterial({ map: chocolateBarTexture(9, 5), roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.2 });
  const slab = shadowed(new THREE.Mesh(new RoundedBoxGeometry(X1 - X0 + 0.3, -y1 + 0.02, Z1 - Z0 + 0.3, 3, 0.14), top));
  slab.position.set(0, y1 / 2 - 0.01, (Z0 + Z1) / 2);
  const block = (a: number, b: number, c: number, d: number, e: number, f: number, mat: THREE.Material | THREE.Material[]) => {
    const mesh = shadowed(new THREE.Mesh(new THREE.BoxGeometry(b - a, d - c, f - e), mat));
    mesh.position.set((a + b) / 2, (c + d) / 2, (e + f) / 2);
    scene.add(mesh);
  };
  scene.add(slab);
  const s = m.chocolateSide;
  block(X0, X1, BOTTOM, y1, Z0, z0, [s, s, s, s, m.cocoa, s]);
  block(X0, x0, BOTTOM, y1, z0, Z1, s);
  block(x1, X1, BOTTOM, y1, z0, Z1, s);
  block(x0, x1, BOTTOM, y0, z0, Z1, [s, s, m.cocoa, s, s, s]);

  // Chocolate drips along the front lip.
  const drip = new THREE.CapsuleGeometry(0.09, 1, 4, 10);
  const xs: number[] = [];
  for (let x = X0 + 0.3; x < X1; x += 0.55) xs.push(x);
  const drips = new THREE.InstancedMesh(drip, m.chocolateSide, xs.length);
  const t = new THREE.Object3D();
  xs.forEach((x, i) => {
    const len = 0.15 + 0.45 * Math.abs(Math.sin(i * 12.9898) * 0.5 + Math.sin(i * 3.1) * 0.5);
    t.position.set(x + Math.sin(i * 7.7) * 0.12, y1 - len / 2 + 0.05, Z1 + 0.13);
    t.scale.set(1, len, 1);
    t.updateMatrix();
    drips.setMatrixAt(i, t.matrix);
  });
  drips.castShadow = true;
  scene.add(drips);

  scene.add(buildDecor(m, { X0, X1, Z0, Z1 }, SZ));

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ color: PALETTE.licorice, opacity: 0.45 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = BOTTOM - 0.01;
  ground.receiveShadow = true;
  scene.add(ground);
  return new THREE.Box3(new THREE.Vector3(X0 - 0.2, BOTTOM, Z0 - 0.2), new THREE.Vector3(X1 + 0.2, 2.2, Z1 + 0.3));
}

// ---------------------------------------------------------------- assembly

export function buildWorld(scene: THREE.Scene): WorldHandles {
  const m = createMaterials();
  const g = sharedRoomGeometry();
  const tex: StateTextures = {
    crackle: crackTexture("crackle"),
    crack: crackTexture("crack"),
    book: new THREE.SpriteMaterial({ map: badgeTexture("book"), depthTest: false }),
    warning: new THREE.SpriteMaterial({ map: badgeTexture("warning"), depthTest: false }),
  };
  tex.crackle.repeat.set(3, 1);
  tex.crack.repeat.set(2, 1);
  const swirls: Record<StationKind, THREE.Texture> = {
    code: swirlTexture(PALETTE.mint, PALETTE.sugar),
    llm: swirlTexture(PALETTE.strawberry, PALETTE.sugar),
    prop: swirlTexture(PALETTE.lemon, PALETTE.chocolate2),
  };

  const knowledgeAt = stationPosition("knowledge");
  const cell = { x0: -7.6, x1: stationPosition("advisor").x + 0.9, y0: -2.2, y1: -0.4, z0: knowledgeAt.z - 1.1, z1: knowledgeAt.z + 1.35 };
  const bounds = buildPlatform(scene, m, cell);
  const cellar = buildCellar(m, cell, knowledgeAt.x, stationPosition("advisor").x);
  scene.add(cellar.group);

  const stations = {} as WorldHandles["stations"];
  const anchors = {} as WorldHandles["anchors"];
  const rooms = {} as WorldHandles["rooms"];
  const labelAt = {} as WorldHandles["labelAt"];
  for (const id of Object.keys(STATIONS) as StationId[]) {
    const built = buildRoom(id, g, m, tex, swirls);
    scene.add(built.station);
    stations[id] = built.station;
    anchors[id] = built.anchor;
    rooms[id] = built.room;
    labelAt[id] = id === "knowledge"
      ? built.station.position.clone().add(new THREE.Vector3(0, 0, PLINTH_R + 0.25))
      : built.station.position.clone().add(new THREE.Vector3(0, built.room.badge.userData.labelY as number, 0));
  }
  labelAt.cellar = new THREE.Vector3(knowledgeAt.x + 1.4, cell.y0 - 0.75, cell.z1 + 0.2);
  labelAt.strip = new THREE.Vector3(cell.x0, cell.y0 - 0.75, cell.z1 + 0.2);

  // Tool machines on a small candy pad at each tool room's front-right.
  const machines: WorldHandles["machines"] = {};
  const pad = new THREE.CylinderGeometry(0.62, 0.68, 0.16, 32);
  const byStation = new Map<StationId, string[]>();
  for (const [tool, id] of Object.entries(TOOL_STATION)) byStation.set(id, [...(byStation.get(id) ?? []), tool]);
  for (const [id, tools] of byStation) {
    const station = stations[id];
    const front = id === "knowledge" ? new THREE.Vector3(1.05, 0, 0.95) : new THREE.Vector3(0.95, 0, 1.2);
    const base = shadowed(new THREE.Mesh(pad, m.sugar));
    base.position.copy(front).setY(0.08);
    station.add(base);
    tools.forEach((tool, i) => {
      const spread = 0.55;
      const machine = buildMachine(tool, m);
      machine.scale.setScalar(1.35);
      machine.position.copy(front).add(new THREE.Vector3((i - (tools.length - 1) / 2) * spread, 0.16, 0));
      station.add(machine);
      machines[tool] = machine;
    });
  }

  const cloud = buildCloud(m);
  scene.add(cloud);
  let feedIndex = 0;
  for (const id of Object.keys(STATIONS) as StationId[]) {
    if (STATIONS[id].kind !== "llm") continue;
    const room = rooms[id];
    room.bob.updateMatrixWorld(true);
    stations[id].updateMatrixWorld(true);
    const from = room.knob.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.08, 0));
    const feed = buildFeed(from, feedIndex++, m);
    scene.add(feed);
    room.feed.push(feed);
  }
  const frame = [bounds, new THREE.Box3().setFromObject(cloud)];

  const tracks = buildTracks(scene);
  return { stations, anchors, rooms, tracks, machines, cloud, cellar: cellar.group, labelAt, frame, materials: m, stateTextures: tex };
}

// ---------------------------------------------------------------- state painting

const ASH = new THREE.Color(PALETTE.ash);
const RING: Record<StationState, { color: string; glow: number }> = {
  idle: { color: PALETTE.cocoa, glow: 0 },
  active: { color: PALETTE.lemon, glow: 1.3 },
  done: { color: PALETTE.mint, glow: 0.8 },
  skipped: { color: PALETTE.ash, glow: 0 },
  fallback: { color: PALETTE.lemon, glow: 0.7 },
  error: { color: PALETTE.strawberry, glow: 1 },
};

/** Applies a station state once per change: tint, ring, knob lamp, crack shell, badge, tilt. */
export function paintRoom(room: RoomHandles, state: StationState, selected: boolean, textures: StateTextures): void {
  for (const { material, base } of room.tints) {
    material.color.copy(base);
    if (state === "skipped") material.color.lerp(ASH, room.kind === "code" ? 0.3 : 0.75);
    // Skipped glass frosts over instead of darkening: tinted transmission reads as black glass.
    if (room.kind === "code") material.roughness = state === "skipped" ? 0.5 : 0.04;
    material.emissive.set(state === "active" ? PALETTE.lemon : "#000000");
    // Glass only takes a faint warm tint: more and the jar turns opaque yellow and hides what is inside.
    material.emissiveIntensity = state === "active" ? (room.kind === "code" ? 0.06 : 0.25) : 0;
  }
  const ring = RING[state];
  room.ring.material.color.set(ring.color);
  room.ring.material.emissive.set(ring.color);
  room.ring.material.emissiveIntensity = ring.glow;
  const knob = room.knob.material as THREE.MeshStandardMaterial;
  knob.emissiveIntensity = state === "done" || state === "active" ? 1.2 : 0;
  knob.color.set(state === "skipped" ? PALETTE.ash : PALETTE.lemon);
  if (room.shell) {
    room.shell.visible = state === "fallback" || state === "error";
    room.shell.material.map = state === "error" ? textures.crack : textures.crackle;
    room.shell.material.needsUpdate = true;
  }
  room.badge.visible = state === "fallback" || state === "error";
  room.badge.material = state === "error" ? textures.warning : textures.book;
  room.bob.rotation.z = state === "error" ? 0.09 : 0;
  room.bob.position.y = PLINTH_H;
  room.bob.scale.set(1, 1, 1);
  room.selectRing.visible = selected;
  for (const feed of room.feed) {
    feed.material.color.set(state === "skipped" ? PALETTE.ash : PALETTE.cotton);
    feed.material.emissiveIntensity = state === "active" ? 0.6 : 0.08;
  }
}

/** Per-frame motion for the active room: candy squash-and-stretch bob and a breathing ring. */
export function animateRoom(room: RoomHandles, state: StationState, time: number, reducedMotion: boolean): void {
  if (state !== "active") return;
  const pulse = 0.5 + 0.5 * Math.sin(time * 6);
  room.ring.material.emissiveIntensity = 0.9 + 0.8 * pulse;
  for (const feed of room.feed) feed.material.emissiveIntensity = 0.35 + 0.5 * pulse;
  if (reducedMotion) return;
  const hop = Math.abs(Math.sin(time * 5));
  room.bob.position.y = PLINTH_H + hop * 0.12;
  room.bob.scale.set(1 + (1 - hop) * 0.05, 1 - (1 - hop) * 0.07, 1 + (1 - hop) * 0.05);
}
