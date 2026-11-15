/**
 * Candy pieces of the works: the wrapped sweet that carries one question along the licorice tracks, the
 * small tool machines that stand in the rooms calling them, and the chocolate cellar (KB, Chapter 5).
 */
import * as THREE from "three";

import { PALETTE, stripeTexture, type Materials } from "./materials";

const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, at?: [number, number, number]) => {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = true;
  m.receiveShadow = true;
  if (at) m.position.set(...at);
  return m;
};

const sphere = (r: number) => new THREE.SphereGeometry(r, 20, 14);
const box = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);
const cyl = (r: number, h: number, top = r) => new THREE.CylinderGeometry(top, r, h, 24);

/** Marks an object (and so all its children) as clickable; the scene walks up from a hit to the nearest mark. */
export function selectable<T extends THREE.Object3D>(object: T, id: string): T {
  object.userData.select = id;
  return object;
}

// ---------------------------------------------------------------- the sweet

/** A striped wrapped sweet, long axis on local X. */
export function buildSweet(): THREE.Group {
  const sweet = new THREE.Group();
  sweet.scale.setScalar(1.4);
  const body = mesh(
    sphere(0.24),
    new THREE.MeshPhysicalMaterial({ map: stripeTexture(PALETTE.strawberry, PALETTE.sugar, 3), roughness: 0.18, clearcoat: 1, emissive: new THREE.Color(PALETTE.strawberry), emissiveIntensity: 0.12 }),
  );
  body.scale.set(1.35, 0.95, 0.95);
  sweet.add(body);
  const wrapper = new THREE.MeshPhysicalMaterial({ color: PALETTE.lemon, roughness: 0.15, clearcoat: 1, metalness: 0.1, emissive: new THREE.Color(PALETTE.lemon), emissiveIntensity: 0.15 });
  const flare = new THREE.ConeGeometry(0.17, 0.22, 7, 1, true);
  const knot = sphere(0.06);
  for (const side of [-1, 1]) {
    const cone = mesh(flare, wrapper, [side * 0.42, 0, 0]);
    cone.rotation.z = side * Math.PI / 2;
    sweet.add(cone, mesh(knot, wrapper, [side * 0.32, 0, 0]));
  }
  // Soft glow disc under the sweet so it reads on dark chocolate from the back of a classroom.
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 24),
    new THREE.MeshBasicMaterial({ color: PALETTE.lemon, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.name = "sweet-glow";
  sweet.add(glow);
  return sweet;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export const SWEET_LIFT = 0.62;

/**
 * Moves the sweet along the tracks the run has lit, one track at a time, stopping in each room.
 * Only the newly lit suffix of `litTracks` animates; any other change places the sweet at once.
 */
export class SweetRunner {
  private queue: THREE.Curve<THREE.Vector3>[] = [];
  private current: { curve: THREE.Curve<THREE.Vector3>; t: number; duration: number } | null = null;
  private shown: string[] = [];
  private readonly p = new THREE.Vector3();
  private readonly ahead = new THREE.Vector3();
  private clock = 0;

  constructor(
    readonly object: THREE.Group,
    private readonly curves: Record<string, THREE.Curve<THREE.Vector3>>,
    private readonly home: THREE.Vector3,
  ) {
    this.place(home);
  }

  setTracks(tracks: readonly string[], instant: boolean): void {
    const prefix = this.shown.length <= tracks.length && this.shown.every((id, i) => tracks[i] === id);
    const added = tracks.slice(this.shown.length);
    this.shown = [...tracks];
    if (!prefix || instant) {
      this.queue = [];
      this.current = null;
      const last = tracks.at(-1);
      if (last) this.place(this.curves[last].getPointAt(1, this.p));
      else this.place(this.home);
      return;
    }
    for (const id of added) if (this.curves[id]) this.queue.push(this.curves[id]);
  }

  update(dt: number, reducedMotion: boolean): void {
    this.clock += dt;
    if (!this.current && this.queue.length) {
      const curve = this.queue.shift()!;
      // Long bypass lanes run faster so the sweet keeps pace with the trace.
      const duration = THREE.MathUtils.clamp(curve.getLength() / 11, 0.32, 0.62) / (1 + this.queue.length * 0.6);
      this.current = { curve, t: 0, duration };
    }
    const body = this.object.children[0];
    if (this.current) {
      const c = this.current;
      c.t = Math.min(1, c.t + dt / c.duration);
      const k = easeInOut(c.t);
      c.curve.getPointAt(k, this.p);
      c.curve.getPointAt(Math.min(1, k + 0.02), this.ahead);
      this.place(this.p, Math.sin(Math.PI * c.t) * 0.18);
      if (this.ahead.distanceToSquared(this.p) > 1e-6) {
        this.ahead.y = this.object.position.y;
        this.object.lookAt(this.ahead);
        this.object.rotateY(-Math.PI / 2);
      }
      // Squash and stretch: long while it rolls, round when it lands.
      const s = Math.sin(Math.PI * c.t);
      body.scale.set(1.35 + 0.25 * s, 0.95 - 0.12 * s, 0.95 - 0.12 * s);
      body.rotation.x += dt * 9;
      if (c.t >= 1) this.current = null;
    } else {
      body.scale.set(1.35, 0.95, 0.95);
      if (!reducedMotion) this.object.position.y = SWEET_LIFT + Math.sin(this.clock * 3) * 0.05;
    }
  }

  private place(at: THREE.Vector3, hop = 0): void {
    this.object.position.set(at.x, SWEET_LIFT + hop, at.z);
  }
}

// ---------------------------------------------------------------- tool machines

/** One small candy machine per backend tool, ~0.6 tall, sitting on a room's side pad. */
export function buildMachine(tool: string, m: Materials): THREE.Group {
  const g = new THREE.Group();
  switch (tool) {
    case "compute_bmi": {
      // Candy scale: mint base, column, lemon pan and a needle.
      g.add(mesh(cyl(0.2, 0.08), m.mint, [0, 0.04, 0]), mesh(cyl(0.035, 0.36), m.sugar, [0, 0.26, 0]), mesh(cyl(0.2, 0.04, 0.24), m.lemon, [0, 0.46, 0]));
      const needle = mesh(box(0.03, 0.18, 0.02), m.strawberry, [0, 0.2, 0.2]);
      needle.rotation.z = 0.5;
      g.add(needle);
      break;
    }
    case "validate_profile": {
      // Wafer clipboard with a strawberry tick.
      const board = mesh(box(0.34, 0.44, 0.06), m.sugar, [0, 0.26, 0]);
      board.rotation.x = -0.25;
      const a = mesh(box(0.06, 0.14, 0.05), m.strawberry, [-0.05, 0.24, 0.07]);
      a.rotation.z = 0.7;
      const b = mesh(box(0.06, 0.26, 0.05), m.strawberry, [0.06, 0.29, 0.06]);
      b.rotation.z = -0.55;
      g.add(board, a, b, mesh(box(0.14, 0.06, 0.08), m.lemon, [0, 0.49, -0.04]));
      break;
    }
    case "predict_diabetes_risk": {
      // CNN-1D: a stack of gummy layers narrowing to one output drop.
      [[0.42, m.strawberry], [0.32, m.lemon], [0.22, m.mint]].forEach(([w, mat], i) =>
        g.add(mesh(new THREE.BoxGeometry(w as number, 0.12, 0.3), mat as THREE.Material, [0, 0.07 + i * 0.14, 0])));
      g.add(mesh(sphere(0.07), m.sugar, [0, 0.5, 0]));
      break;
    }
    case "predict_diabetes_type": {
      // LSTM: a chain of lemon links looping on a licorice post.
      g.add(mesh(cyl(0.04, 0.55), m.licorice, [0, 0.28, 0]));
      const link = new THREE.TorusGeometry(0.1, 0.03, 10, 20);
      for (let i = 0; i < 3; i++) {
        const ring = mesh(link, i % 2 ? m.mint : m.lemon, [0, 0.16 + i * 0.15, 0]);
        ring.rotation.y = i % 2 ? Math.PI / 2 : 0;
        g.add(ring);
      }
      break;
    }
    case "search_knowledge": {
      // Winch: licorice drum on two posts, rope down to the cellar lift.
      const drum = mesh(cyl(0.12, 0.36), m.licorice, [0, 0.4, 0]);
      drum.rotation.z = Math.PI / 2;
      g.add(drum, mesh(box(0.05, 0.42, 0.12), m.lemon, [-0.22, 0.21, 0]), mesh(box(0.05, 0.42, 0.12), m.lemon, [0.22, 0.21, 0]), mesh(sphere(0.05), m.strawberry, [0.3, 0.5, 0.05]));
      break;
    }
    case "search_passages": {
      // Magnifier lollipop: the passage search the knowledge room falls back on.
      const ring = mesh(new THREE.TorusGeometry(0.13, 0.035, 10, 24), m.lemon, [0, 0.45, 0]);
      const lens = mesh(new THREE.CircleGeometry(0.12, 20), m.sugar, [0, 0.45, 0]);
      const stick = mesh(cyl(0.025, 0.36), m.sugar, [0, 0.18, 0]);
      g.add(ring, lens, stick);
      break;
    }
    case "get_recommendations": {
      // Faucet pouring a mint drop.
      const pipe = new THREE.CurvePath<THREE.Vector3>();
      pipe.add(new THREE.LineCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.42, 0)));
      pipe.add(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0.42, 0), new THREE.Vector3(0, 0.55, 0), new THREE.Vector3(0.16, 0.5, 0)));
      g.add(mesh(new THREE.TubeGeometry(pipe, 20, 0.05, 10), m.mint), mesh(cyl(0.06, 0.06), m.strawberry, [0, 0.6, 0]), mesh(sphere(0.05), m.lampMint, [0.17, 0.36, 0]));
      break;
    }
  }
  return selectable(g, tool);
}

// ---------------------------------------------------------------- the cellar

export interface CellarBox {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}

/** What sits inside the cut-away: offline KB build strip, Neo4j block with three drills, lift, mixer, citation gate, faucet. */
export function buildCellar(m: Materials, cell: CellarBox, liftX: number, faucetX: number): { group: THREE.Group; neo4j: THREE.Object3D; lamps: THREE.Mesh[] } {
  const group = new THREE.Group();
  group.name = "cellar";
  const floor = cell.y0;
  const zMid = (cell.z0 + cell.z1) / 2 - 0.15;

  // Offline build strip: a licorice belt carrying five props (28 links + 7 PDFs, chunks, bge-m3, Neo4j, facts).
  const stripX0 = cell.x0 + 0.55;
  const step = 0.62;
  group.add(mesh(box(step * 4 + 0.6, 0.1, 0.42), m.licorice, [stripX0 + step * 2, floor + 0.05, zMid + 0.35]));
  const props: THREE.Object3D[] = [];
  const docs = new THREE.Group();
  for (let i = 0; i < 4; i++) docs.add(mesh(box(0.3, 0.05, 0.22), i % 2 ? m.sugar : m.lemon, [0, 0.03 + i * 0.06, 0]));
  docs.add(mesh(box(0.05, 0.25, 0.23), m.strawberry, [0, 0.12, 0]));
  props.push(docs);
  const chunks = new THREE.Group();
  for (let i = 0; i < 4; i++) chunks.add(mesh(box(0.07, 0.18, 0.2), m.cocoa, [-0.13 + i * 0.09, 0.09, 0]));
  props.push(chunks);
  const grinder = new THREE.Group();
  grinder.add(mesh(new THREE.ConeGeometry(0.16, 0.26, 16), m.mint, [0, 0.22, 0]), mesh(cyl(0.07, 0.1), m.sugar, [0, 0.05, 0]));
  grinder.children[0].rotation.x = Math.PI;
  props.push(grinder);
  const mini = new THREE.Group();
  mini.add(mesh(box(0.24, 0.2, 0.2), m.mint, [0, 0.1, 0]), mesh(sphere(0.04), m.lemon, [0, 0.24, 0]));
  props.push(mini);
  const jar = new THREE.Group();
  jar.add(mesh(cyl(0.11, 0.24), m.sugar, [0, 0.12, 0]));
  [m.strawberry, m.lemon, m.mint].forEach((mat, i) => jar.add(mesh(sphere(0.05), mat, [-0.05 + i * 0.05, 0.28, 0])));
  props.push(jar);
  props.forEach((p, i) => {
    p.position.set(stripX0 + i * step, floor + 0.1, zMid + 0.35);
    p.scale.setScalar(1.3);
    group.add(p);
  });

  // Neo4j: a big mint-veined chocolate block; gumdrop nodes joined by licorice edges on its face.
  const neo4j = new THREE.Group();
  const bx = stripX0 + step * 4 + 1.25;
  neo4j.position.set(bx, floor, zMid);
  neo4j.scale.setScalar(1.25);
  neo4j.add(mesh(new THREE.BoxGeometry(1.5, 0.62, 1.1), m.cocoa, [0, 0.31, 0]));
  const nodes: Array<[number, number]> = [[-0.5, 0.2], [-0.15, 0.45], [0.2, 0.18], [0.5, 0.42], [0.05, 0.08]];
  const nodeGeo = sphere(0.07);
  nodes.forEach(([x, y], i) => neo4j.add(mesh(nodeGeo, [m.mint, m.lemon, m.strawberry][i % 3], [x, y, 0.56])));
  for (const [a, b] of [[0, 1], [1, 2], [2, 3], [1, 3], [2, 4]]) {
    const pa = new THREE.Vector3(nodes[a][0], nodes[a][1], 0.56);
    const pb = new THREE.Vector3(nodes[b][0], nodes[b][1], 0.56);
    const edge = mesh(cyl(0.018, pa.distanceTo(pb)), m.licorice, [(pa.x + pb.x) / 2, (pa.y + pb.y) / 2, 0.56]);
    edge.rotation.z = Math.atan2(pb.y - pa.y, pb.x - pa.x) - Math.PI / 2;
    neo4j.add(edge);
  }
  // Three drills (vector, BM25, graph) boring into the block from above.
  [m.mint, m.lemon, m.strawberry].forEach((mat, i) => {
    const drill = new THREE.Group();
    drill.position.set(-0.45 + i * 0.45, 0.62, -0.1);
    drill.add(mesh(new THREE.ConeGeometry(0.09, 0.26, 12), mat, [0, 0.05, 0]), mesh(cyl(0.07, 0.16), m.licorice, [0, 0.25, 0]));
    drill.children[0].rotation.x = Math.PI;
    drill.name = "drill";
    neo4j.add(drill);
  });
  group.add(selectable(neo4j, "search_knowledge"));

  // The knowledge room's lift: a licorice rail and a lemon cage halfway down.
  const lift = new THREE.Group();
  lift.position.set(liftX, floor, zMid - 0.15);
  lift.add(mesh(cyl(0.04, cell.y1 - floor), m.licorice, [-0.22, (cell.y1 - floor) / 2, 0]), mesh(cyl(0.04, cell.y1 - floor), m.licorice, [0.22, (cell.y1 - floor) / 2, 0]));
  lift.add(mesh(box(0.5, 0.05, 0.42), m.lemon, [0, 0.42, 0]), mesh(box(0.5, 0.05, 0.42), m.lemon, [0, 0.82, 0]));
  group.add(selectable(lift, "search_knowledge"));

  // Ranking mixer and citation gate: retrieval results are blended, then only cited lines pass.
  const mixer = new THREE.Group();
  mixer.position.set(liftX + 0.95, floor, zMid);
  mixer.scale.setScalar(1.3);
  mixer.add(mesh(new THREE.SphereGeometry(0.34, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), m.sugar, [0, 0.36, 0]));
  mixer.add(mesh(cyl(0.04, 0.6), m.lemon, [0.05, 0.6, 0]), mesh(sphere(0.07), m.strawberry, [0.05, 0.92, 0]));
  group.add(selectable(mixer, "search_knowledge"));
  const gate = new THREE.Group();
  gate.position.set(liftX + 1.95, floor, zMid);
  gate.scale.setScalar(1.3);
  gate.add(mesh(box(0.08, 0.7, 0.08), m.mint, [-0.25, 0.35, 0]), mesh(box(0.08, 0.7, 0.08), m.mint, [0.25, 0.35, 0]), mesh(box(0.6, 0.1, 0.12), m.strawberry, [0, 0.72, 0]));
  gate.add(mesh(box(0.3, 0.05, 0.05), m.lemon, [0, 0.4, 0]));
  group.add(selectable(gate, "search_knowledge"));

  // Pipe from the gate along the back wall to the recommendation faucet under the advice room.
  const pipe = new THREE.CatmullRomCurve3([
    new THREE.Vector3(liftX + 1.85, floor + 0.55, cell.z0 + 0.25),
    new THREE.Vector3(faucetX - 0.4, floor + 0.55, cell.z0 + 0.25),
    new THREE.Vector3(faucetX, floor + 0.62, cell.z0 + 0.35),
    new THREE.Vector3(faucetX, cell.y1, cell.z0 + 0.45),
  ]);
  group.add(mesh(new THREE.TubeGeometry(pipe, 48, 0.06, 10), m.mint));
  const faucet = buildMachine("get_recommendations", m);
  faucet.position.set(faucetX + 0.1, floor, zMid + 0.2);
  faucet.scale.setScalar(1.3);
  group.add(faucet);

  // Hanging lemon lamps keep the cellar readable without a second shadow light.
  const lamps: THREE.Mesh[] = [];
  const bulb = sphere(0.09);
  for (let x = cell.x0 + 1.2; x < cell.x1 - 0.4; x += 2.3) {
    const lamp = new THREE.Mesh(bulb, m.lampLit);
    lamp.position.set(x, cell.y1 - 0.14, zMid + 0.2);
    group.add(lamp, mesh(cyl(0.012, 0.1), m.licorice, [x, cell.y1 - 0.04, zMid + 0.2]));
    lamps.push(lamp);
  }
  // One warm fill light inside the cut-away (no shadows): the sun cannot reach under the slab.
  const fill = new THREE.PointLight(PALETTE.lemon, 30, 14, 1.4);
  fill.position.set((cell.x0 + cell.x1) / 2, cell.y1 - 0.3, cell.z1 + 0.6);
  group.add(fill);
  return { group, neo4j, lamps };
}

// ---------------------------------------------------------------- set dressing, cloud

/** Sprinkles over the chocolate bar (kept off the station rows) and lollipop trees along the back edge. */
export function buildDecor(m: Materials, edge: { X0: number; X1: number; Z0: number; Z1: number }, SZ: number): THREE.Group {
  const { X0, X1, Z0, Z1 } = edge;
  const group = new THREE.Group();
  const t = new THREE.Object3D();
  // Sprinkles scattered over the bar, kept off the station rows.
  const sprinkle = new THREE.CapsuleGeometry(0.035, 0.14, 2, 6);
  const tones = [m.strawberry, m.lemon, m.mint, m.sugar];
  const rnd = (() => { let k = 11; return () => ((k = (k * 16807) % 2147483647) / 2147483647); })();
  for (const [ti, mat] of tones.entries()) {
    const count = 70;
    const inst = new THREE.InstancedMesh(sprinkle, mat, count);
    for (let i = 0; i < count; i++) {
      let x = 0, z = 0;
      for (let tries = 0; tries < 20; tries++) {
        x = X0 + 0.4 + rnd() * (X1 - X0 - 0.8);
        z = Z0 + 0.4 + rnd() * (Z1 - Z0 - 0.8);
        const v = -z / SZ;
        const nearRow = [0, -2, 3].some((row) => Math.abs(v - row) < 0.8) || Math.abs(v - 1.5) < 0.9;
        if (!nearRow) break;
      }
      t.position.set(x, 0.03, z);
      t.rotation.set(Math.PI / 2, 0, rnd() * Math.PI * 2 + ti);
      t.scale.set(1, 1, 1);
      t.updateMatrix();
      inst.setMatrixAt(i, t.matrix);
    }
    inst.receiveShadow = true;
    group.add(inst);
  }

  // Lollipop trees along the back edge frame the works like a stage set.
  const stick = new THREE.CylinderGeometry(0.05, 0.05, 1.6, 10);
  const pop = new THREE.CylinderGeometry(0.55, 0.55, 0.16, 32);
  const popMats = [m.cane, m.caneLemon, m.cane, m.caneLemon];
  [-9.8, -4.8, 5.2, 10.0].forEach((x, i) => {
    const s1 = mesh(stick, m.sugar);
    s1.position.set(x, 0.8, Z0 + 0.5);
    const head = new THREE.Mesh(pop, popMats[i]);
    head.castShadow = true;
    head.position.set(x, 1.95, Z0 + 0.5);
    head.rotation.x = Math.PI / 2;
    group.add(s1, head);
  });
  return group;
}

export const CLOUD_AT = new THREE.Vector3(0.6, 4.5, -3.6);


export function buildCloud(m: Materials): THREE.Group {
  const cloud = new THREE.Group();
  cloud.name = "cloud";
  cloud.position.copy(CLOUD_AT);
  cloud.scale.setScalar(0.85);
  const puff = new THREE.IcosahedronGeometry(1, 3);
  const puffs: Array<[number, number, number, number]> = [
    [0, 0.2, 0, 1.25], [-1.3, 0, 0.2, 0.95], [1.35, 0.05, 0.1, 1.0], [-0.6, 0.7, -0.2, 0.9], [0.7, 0.75, -0.1, 0.95],
    [-2.3, -0.2, 0, 0.7], [2.4, -0.15, 0.1, 0.72], [0, -0.35, 0.6, 0.85], [-1.2, -0.4, 0.7, 0.6], [1.3, -0.4, 0.7, 0.62],
  ];
  puffs.forEach(([x, y, z, r], i) => {
    const p = new THREE.Mesh(puff, i % 3 === 1 ? m.cotton : m.cloud);
    p.position.set(x, y, z);
    p.scale.set(r, r * 0.82, r);
    p.castShadow = true;
    cloud.add(p);
  });
  return selectable(cloud, "cloud");
}

/** Fluffy cotton-candy line from an LLM kettle's knob up into the cloud. */
export function buildFeed(from: THREE.Vector3, index: number, m: Materials): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
  const to = CLOUD_AT.clone().add(new THREE.Vector3((from.x - CLOUD_AT.x) * 0.3, -0.7, 0.4));
  const curve = new THREE.CatmullRomCurve3([from, from.clone().add(new THREE.Vector3(0, 1.0, 0)), from.clone().lerp(to, 0.6).add(new THREE.Vector3(0, 0.4, 0)), to]);
  const material = m.cotton.clone();
  const geometry = new THREE.TubeGeometry(curve, 64, 0.1, 10, false);
  // Bumpy fluff: push rings in and out so it reads as spun sugar, not a pipe.
  const pos = geometry.attributes.position;
  const v = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i <= 64; i++) {
    curve.getPointAt(i / 64, c);
    for (let j = 0; j <= 10; j++) {
      const k = i * 11 + j;
      v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(1 + 0.35 * Math.sin(i * 1.7 + index) * Math.cos(j * 2.1)).add(c);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
  }
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}
