/** Workers further down the line: Cụ Cân Đong (risk), Bé Đèn Pin (knowledge), Chị Pha Chế (advisor), Ông Soát Vé (safety_out). */
import * as THREE from "three";

import {
  BaseRig, _a, _b, approach, ball, canvasTexture, capsule, head, lathe, limb, part, reach, relax, rod,
} from "./character-parts";
import { PALETTE } from "./materials";

// ---------------------------------------------------------------- Cụ Cân Đong (risk)

const MAX_TILT = 0.42;

export class ElderRig extends BaseRig {
  private readonly beam = new THREE.Group();
  private readonly pans: THREE.Group[] = [];
  private readonly armL;
  private readonly armR;
  private readonly head: THREE.Group;
  private tiltTarget = 0;
  private tilt = 0;

  constructor() {
    super(3);
    const { m, body } = this;
    for (const side of [-1, 1]) body.add(part(rod(0.055, 0.14), m.cocoa, [side * 0.09, 0.07, 0]));
    const robe = part(lathe([[0, 0.12], [0.24, 0.12], [0.25, 0.3], [0.2, 0.5], [0.1, 0.58], [0, 0.6]]), m.mint);
    robe.rotation.x = 0.28;
    robe.position.z = -0.02;
    body.add(robe);
    const scarf = part(new THREE.TorusGeometry(0.13, 0.045, 8, 20), m.strawberry, [0, 0.56, 0.12]);
    scarf.rotation.x = Math.PI / 2 + 0.3;
    body.add(scarf);
    this.head = head(m, 0.17, { smile: false });
    this.head.position.set(0, 0.7, 0.18);
    // Long sugar beard and brows, a cocoa skullcap.
    const beard = part(new THREE.ConeGeometry(0.13, 0.32, 16), m.sugar, [0, -0.2, 0.08]);
    beard.rotation.x = Math.PI + 0.25;
    const cap = part(new THREE.SphereGeometry(0.175, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.4), m.cocoa, [0, 0.01, -0.01]);
    this.head.add(beard, cap);
    for (const side of [-1, 1]) {
      const brow = part(capsule(0.022, 0.07), m.sugar, [side * 0.07, 0.07, 0.15], false);
      brow.rotation.z = Math.PI / 2 - side * 0.3;
      this.head.add(brow);
    }
    body.add(this.head);
    this.armL = limb(m.mint, 0.2, 0.05, { material: m.sugar, r: 0.05 });
    this.armR = limb(m.mint, 0.2, 0.05, { material: m.sugar, r: 0.05 });
    this.armL.pivot.position.set(0.2, 0.5, 0.08);
    this.armR.pivot.position.set(-0.2, 0.5, 0.08);
    body.add(this.armL.pivot, this.armR.pivot);
    // Candy-cane walking stick in the right hand.
    const stick = new THREE.Group();
    stick.add(part(rod(0.022, 0.5), m.cane, [0, -0.15, 0]));
    const hook = part(new THREE.TorusGeometry(0.06, 0.022, 8, 16, Math.PI), m.cane, [-0.06, 0.1, 0]);
    stick.add(hook);
    this.armR.tip.add(stick);

    // The balance: lemon post, beam that tips with the risk, two sugar pans that stay level.
    const scale = new THREE.Group();
    scale.position.set(0.36, 0, 0.36);
    scale.add(part(rod(0.13, 0.05, 0.15), m.cocoa, [0, 0.025, 0]), part(rod(0.025, 0.62), m.lemon, [0, 0.33, 0]));
    scale.add(part(ball(0.045, 12, 10), m.strawberry, [0, 0.66, 0]));
    this.beam.position.y = 0.64;
    this.beam.add(part(new THREE.BoxGeometry(0.7, 0.05, 0.06), m.lemon));
    const weights = [m.mint, m.strawberry];
    for (const [i, side] of [-1, 1].entries()) {
      const pan = new THREE.Group();
      pan.position.x = side * 0.34;
      pan.add(part(rod(0.007, 0.2), m.licorice, [0, -0.1, 0], false));
      pan.add(part(rod(0.1, 0.04, 0.15, 20), m.sugar, [0, -0.22, 0]));
      // Mint gumdrop: no diabetes group. Strawberry gumdrop with a sugar band: diabetes groups.
      const drop = part(new THREE.SphereGeometry(0.085, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), weights[i], [0, -0.2, 0]);
      pan.add(drop);
      if (side > 0) pan.add(part(new THREE.TorusGeometry(0.055, 0.012, 6, 16), m.sugar, [0, -0.18, 0], false).rotateX(Math.PI / 2));
      this.beam.add(pan);
      this.pans.push(pan);
    }
    scale.add(this.beam);
    this.root.add(scale);
  }

  /** `tilt`: share of the diabetes groups, 0..1; no value (or NaN) levels the beam. */
  act(kind: string, value?: number): void {
    if (kind !== "tilt") return;
    this.tiltTarget = value === undefined || Number.isNaN(value) ? 0 : -(THREE.MathUtils.clamp(value, 0, 1) - 0.5) * 2 * MAX_TILT;
  }

  protected animate(dt: number): void {
    const r = this.reduced;
    const work = this.mood === "work";
    // While weighing, the beam rocks a little before it settles.
    const wobble = work && !r ? Math.sin(this.t * 7) * 0.06 * Math.max(0, 1 - this.moodT / 2.5) : 0;
    this.tilt = approach(this.tilt, this.tiltTarget, 3, dt, r);
    this.beam.rotation.z = this.tilt + wobble;
    for (const pan of this.pans) pan.rotation.z = -this.beam.rotation.z;
    relax(this.armR.pivot, 0.2, -0.25);
    if (this.mood === "alarm") {
      relax(this.armL.pivot, 0, 2.4);
    } else if (work) {
      reach(this.armL.pivot, _b.set(0.3, 0.62, 0.3), 0.24);
    } else {
      relax(this.armL.pivot, 0.1, 0.25);
    }
    this.head.rotation.x = work ? 0.25 : 0.1;
    this.head.rotation.y = work ? 0.5 : 0.2;
  }
}

// ---------------------------------------------------------------- Bé Đèn Pin (knowledge)

export class MinerRig extends BaseRig {
  private readonly lens: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial>;
  private readonly beamCone: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>;
  private readonly armL;
  private readonly armR;
  private readonly home = new THREE.Vector3();
  private readonly below = new THREE.Vector3();
  private depth = 0;
  private down = false;
  private placed = false;
  private yaw = 0;

  constructor() {
    super(4);
    const { m, body } = this;
    for (const side of [-1, 1]) body.add(part(rod(0.05, 0.13), m.licorice, [side * 0.07, 0.065, 0]));
    body.add(part(capsule(0.16, 0.14), m.mint, [0, 0.3, 0]));
    for (const side of [-1, 1]) {
      const strap = part(new THREE.BoxGeometry(0.035, 0.2, 0.02), m.lemon, [side * 0.07, 0.38, 0.15], false);
      body.add(strap);
    }
    const face = head(m, 0.22);
    face.position.set(0, 0.64, 0.02);
    // Miner's helmet: lemon dome, brim, chocolate lamp housing with a lens that lights.
    face.add(part(new THREE.SphereGeometry(0.235, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), m.lemon, [0, 0.03, 0]));
    face.add(part(rod(0.28, 0.025, 0.28, 28), m.lemon, [0, 0.04, 0.02]));
    const housing = part(rod(0.07, 0.07, 0.07, 16), m.chocolate, [0, 0.15, 0.2]);
    housing.rotation.x = Math.PI / 2;
    this.lens = new THREE.Mesh(rod(0.055, 0.02, 0.055, 16), new THREE.MeshStandardMaterial({ color: PALETTE.sugar, emissive: PALETTE.lemon, emissiveIntensity: 0 }));
    this.lens.position.set(0, 0.15, 0.24);
    this.lens.rotation.x = Math.PI / 2;
    this.beamCone = new THREE.Mesh(
      new THREE.ConeGeometry(0.32, 1.1, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: PALETTE.lemon, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    );
    this.beamCone.position.set(0, 0.06, 0.8);
    this.beamCone.rotation.x = -Math.PI / 2 - 0.2;
    this.beamCone.visible = false;
    face.add(housing, this.lens, this.beamCone);
    body.add(face);
    this.armL = limb(m.mint, 0.16, 0.045, { material: m.sugar, r: 0.05 });
    this.armR = limb(m.mint, 0.16, 0.045, { material: m.sugar, r: 0.05 });
    this.armL.pivot.position.set(0.16, 0.38, 0);
    this.armR.pivot.position.set(-0.16, 0.38, 0);
    body.add(this.armL.pivot, this.armR.pivot);
    // Little candy pick.
    const pick = new THREE.Group();
    pick.add(part(rod(0.016, 0.3), m.sugar, [0, 0.05, 0]));
    const blade = part(new THREE.TorusGeometry(0.1, 0.022, 6, 12, Math.PI * 0.7), m.strawberry, [0, 0.12, 0]);
    blade.rotation.z = Math.PI * 0.15;
    pick.add(blade);
    pick.rotation.x = Math.PI / 2;
    this.armR.tip.add(pick);
  }

  /** Where the miner stands on the plinth and in the cellar, both in the parent's space. */
  setLift(home: THREE.Vector3, below: THREE.Vector3): void {
    this.home.copy(home);
    this.below.copy(below);
    this.yaw = this.root.rotation.y;
    this.placed = true;
  }

  /** `descend`: 1 rides the lift down to the cellar with the headlamp on, 0 comes back up. */
  act(kind: string, value = 0): void {
    if (kind === "descend") this.down = value > 0;
  }

  protected animate(dt: number): void {
    const r = this.reduced;
    this.depth = approach(this.depth, this.down ? 1 : 0, 4, dt, r);
    if (this.placed) {
      // Straight drop, eased; the plinth and slab hide the shaft, the cut-away shows the arrival.
      const k = this.depth * this.depth * (3 - 2 * this.depth);
      this.root.position.lerpVectors(this.home, this.below, k);
      // Down below the miner turns to light up the Neo4j block on the left.
      this.root.rotation.y = this.yaw - 0.9 * k;
    }
    const lit = this.down || this.depth > 0.02;
    this.lens.material.emissiveIntensity = lit ? 2.2 : 0;
    this.beamCone.visible = lit;
    this.beamCone.material.opacity = r ? 0.22 : 0.18 + Math.sin(this.t * 5) * 0.04;
    if (this.mood === "alarm") {
      relax(this.armL.pivot, 0, 2.5);
      relax(this.armR.pivot, 0, -2.5);
      return;
    }
    const swing = this.mood === "work" && !r ? Math.sin(this.t * 8) * 0.7 : 0;
    relax(this.armR.pivot, -1.2 + swing, -0.2);
    relax(this.armL.pivot, this.down ? -0.4 : 0, 0.25);
  }
}

// ---------------------------------------------------------------- Chị Pha Chế (advisor)

export class MixerRig extends BaseRig {
  private readonly jug = new THREE.Group();
  private readonly stream: THREE.Mesh;
  private readonly liquid: THREE.Mesh;
  private readonly armL;
  private readonly armR;
  private pour = 0;
  private level = 0.35;

  constructor() {
    super(5);
    const { m, body } = this;
    for (const side of [-1, 1]) body.add(part(rod(0.05, 0.16), m.licorice, [side * 0.08, 0.08, 0]));
    body.add(part(lathe([[0, 0.14], [0.27, 0.14], [0.29, 0.3], [0.14, 0.52], [0.19, 0.66], [0.11, 0.75], [0, 0.76]]), m.strawberry));
    const apron = part(new THREE.CylinderGeometry(0.2, 0.28, 0.32, 20, 1, true, -0.9, 1.8), m.sugar, [0, 0.3, 0.02]);
    body.add(apron);
    const face = head(m, 0.18);
    face.position.set(0, 0.93, 0);
    const hair = part(new THREE.SphereGeometry(0.19, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), m.chocolate, [0, 0.01, -0.02]);
    hair.rotation.x = -0.3;
    face.add(hair, part(ball(0.12, 16, 12), m.chocolate, [0, 0.22, -0.05]), part(ball(0.08, 14, 10), m.chocolate, [0, 0.35, -0.06]));
    const pin = part(rod(0.015, 0.3), m.lemon, [0, 0.3, -0.06], false);
    pin.rotation.z = 0.9;
    face.add(pin);
    body.add(face);
    this.armL = limb(m.strawberry, 0.22, 0.045, { material: m.sugar, r: 0.05 });
    this.armR = limb(m.strawberry, 0.22, 0.045, { material: m.sugar, r: 0.05 });
    this.armL.pivot.position.set(-0.16, 0.66, 0);
    this.armR.pivot.position.set(0.16, 0.66, 0);
    body.add(this.armL.pivot, this.armR.pivot);

    // Mint jug with a sugar handle and a spout on its +x side; it pivots at its base to pour.
    this.jug.position.set(0.3, 0.6, 0.18);
    this.jug.add(part(lathe([[0, 0], [0.09, 0], [0.11, 0.06], [0.1, 0.16], [0.07, 0.22], [0.08, 0.24], [0, 0.24]], 20), m.mint));
    const handle = part(new THREE.TorusGeometry(0.06, 0.016, 6, 12, Math.PI), m.sugar, [-0.1, 0.12, 0]);
    handle.rotation.z = Math.PI / 2;
    const spout = part(new THREE.ConeGeometry(0.035, 0.09, 10), m.mint, [0.1, 0.22, 0]);
    spout.rotation.z = -Math.PI / 2.6;
    this.jug.add(handle, spout);
    body.add(this.jug);

    // Glass on a cocoa stand; lemon liquid rises inside while she pours.
    const stand = new THREE.Group();
    stand.position.set(0.56, 0, 0.18);
    stand.add(part(rod(0.11, 0.2, 0.09), m.cocoa, [0, 0.1, 0]));
    stand.add(new THREE.Mesh(rod(0.085, 0.22, 0.1, 20), new THREE.MeshStandardMaterial({ color: PALETTE.sugar, transparent: true, opacity: 0.55, roughness: 0.1, depthWrite: false })).translateY(0.31));
    this.liquid = part(rod(0.075, 1, 0.085, 20), m.lemon, [0, 0.2, 0], false);
    stand.add(this.liquid);
    this.root.add(stand);
    this.stream = part(rod(0.035, 0.2), new THREE.MeshStandardMaterial({ color: PALETTE.lemon, emissive: PALETTE.lemon, emissiveIntensity: 0.6 }), [0.555, 0.52, 0.18], false);
    this.stream.visible = false;
    this.root.add(this.stream);
  }

  protected animate(dt: number): void {
    const r = this.reduced;
    const work = this.mood === "work";
    const target = work ? (r ? 1.1 : 0.95 + Math.sin(this.t * 3) * 0.15) : 0;
    this.pour = approach(this.pour, target, 6, dt, r);
    this.jug.rotation.z = -this.pour;
    this.stream.visible = this.pour > 0.8;
    if (work) this.level = r ? 0.7 : 0.25 + ((this.moodT * 0.18) % 0.6);
    this.liquid.scale.y = this.level * 0.21;
    this.liquid.position.y = 0.2 + this.liquid.scale.y / 2;
    // Right hand on the jug handle, left hand steadying the glass while pouring.
    _b.set(-0.1, 0.12, 0).applyAxisAngle(_a.set(0, 0, 1), -this.pour).add(this.jug.position);
    reach(this.armR.pivot, _b, 0.27);
    if (this.mood === "alarm") relax(this.armL.pivot, 0, -2.4);
    else if (work) reach(this.armL.pivot, _b.set(0.42, 0.4, 0.2), 0.27);
    else relax(this.armL.pivot, 0, -0.2);
  }
}

// ---------------------------------------------------------------- Ông Soát Vé (safety_out)

export class InspectorRig extends BaseRig {
  private readonly stamp = new THREE.Group();
  private readonly pad: THREE.Mesh<THREE.BoxGeometry, THREE.MeshPhysicalMaterial>;
  private readonly mark: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  private readonly marks: { ok: THREE.CanvasTexture; removed: THREE.CanvasTexture };
  private readonly armL;
  private readonly armR;
  private readonly grip = new THREE.Vector3();
  private kind: "ok" | "removed" | null = null;
  private stamped = false;

  constructor() {
    super(6);
    const { m, body } = this;
    for (const side of [-1, 1]) body.add(part(rod(0.05, 0.36), m.licorice, [side * 0.08, 0.18, 0]));
    // Candy-stripe coat: tall and narrow, the opposite build of the gatekeeper.
    body.add(part(lathe([[0, 0.34], [0.2, 0.34], [0.19, 0.6], [0.2, 0.8], [0.14, 0.9], [0, 0.91]]), m.cane));
    for (const x of [-0.06, 0.06]) for (const y of [0.5, 0.62, 0.74]) body.add(part(ball(0.026, 8, 6), m.chocolate, [x, y, 0.195], false));
    const face = head(m, 0.16);
    face.position.set(0, 1.06, 0);
    // Thin licorice moustache, lemon monocle, flat-topped conductor's cap with a strawberry band.
    for (const side of [-1, 1]) {
      const tip = part(capsule(0.016, 0.08), m.licorice, [side * 0.055, -0.05, 0.15], false);
      tip.rotation.z = side * 1.9;
      face.add(tip);
    }
    face.add(part(new THREE.TorusGeometry(0.045, 0.01, 6, 18), m.lemon, [0.058, 0.02, 0.155], false));
    const crown = part(rod(0.15, 0.13, 0.19, 24), m.chocolate, [0, 0.16, -0.01]);
    crown.rotation.x = -0.12;
    const band = part(rod(0.156, 0.04, 0.162, 24), m.strawberry, [0, 0.12, 0]);
    const visor = part(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 20, 1, false, -Math.PI / 2, Math.PI), m.licorice, [0, 0.1, 0.03]);
    visor.rotation.x = 0.25;
    face.add(crown, band, visor);
    body.add(face);
    this.armL = limb(m.chocolate, 0.24, 0.045, { material: m.sugar, r: 0.05 });
    this.armR = limb(m.chocolate, 0.24, 0.045, { material: m.sugar, r: 0.05 });
    this.armL.pivot.position.set(-0.19, 0.84, 0);
    this.armR.pivot.position.set(0.19, 0.84, 0);
    body.add(this.armL.pivot, this.armR.pivot);

    // Ticket desk, the ticket, and the mark the stamp leaves.
    const desk = new THREE.Group();
    desk.position.set(0.42, 0, 0.32);
    desk.add(part(new THREE.BoxGeometry(0.4, 0.44, 0.32), m.lemon, [0, 0.22, 0]));
    const ticket = part(new THREE.BoxGeometry(0.34, 0.01, 0.24), m.sugar, [0, 0.445, 0]);
    this.marks = { ok: stampTexture("ok"), removed: stampTexture("removed") };
    this.mark = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.21), new THREE.MeshStandardMaterial({ map: this.marks.ok, transparent: true, roughness: 0.6 }));
    this.mark.rotation.x = -Math.PI / 2;
    this.mark.position.y = 0.452;
    this.mark.visible = false;
    desk.add(ticket, this.mark);
    this.root.add(desk);

    // Big stamp: strawberry knob, sugar neck, chocolate block, inked pad.
    this.pad = part(new THREE.BoxGeometry(0.22, 0.03, 0.16), m.mint.clone(), [0, 0.015, 0]);
    this.stamp.add(this.pad, part(new THREE.BoxGeometry(0.24, 0.08, 0.18), m.chocolate, [0, 0.07, 0]));
    this.stamp.add(part(rod(0.025, 0.12), m.sugar, [0, 0.16, 0]), part(ball(0.06, 14, 10), m.strawberry, [0, 0.25, 0]));
    this.stamp.position.set(0.42, 0.7, 0.32);
    this.root.add(this.stamp);
  }

  dispose(): void {
    super.dispose();
    this.marks.ok.dispose();
    this.marks.removed.dispose();
  }

  /** `stamp`: 0 nothing stamped yet, 1 cleared, 2 a dosage sentence was removed (red crossed stamp). */
  act(kind: string, value = 0): void {
    if (kind !== "stamp") return;
    const next = value === 2 ? "removed" : value === 1 ? "ok" : null;
    if (next === this.kind) return;
    this.kind = next;
    this.stamped = false;
    if (next) {
      this.mark.material.map = this.marks[next];
      this.mark.material.needsUpdate = true;
      this.pad.material.color.set(next === "removed" ? PALETTE.strawberry : PALETTE.mint);
    }
  }

  protected animate(): void {
    const r = this.reduced;
    const work = this.mood === "work";
    let y = 0.7;
    if (work) {
      // Lift slowly, slam down fast, hold: a stamp's rhythm.
      const c = r ? 0.6 : (this.moodT * 1.6) % 1;
      y = c < 0.55 ? 0.7 - Math.pow(Math.min(1, c / 0.15), 2) * 0.24 : 0.46 + ((c - 0.55) / 0.45) * 0.24;
      if (c > 0.12 || r) this.stamped = true;
    }
    this.stamp.position.y = Math.max(0.46, y);
    this.mark.visible = this.kind !== null && (this.stamped || !work);
    this.grip.set(0.42, this.stamp.position.y + 0.25, 0.32);
    reach(this.armR.pivot, this.grip, 0.29);
    if (this.mood === "alarm") relax(this.armL.pivot, 0, -2.4);
    else relax(this.armL.pivot, 0.1, -0.15);
  }
}

function stampTexture(kind: "ok" | "removed"): THREE.CanvasTexture {
  const { texture, ctx } = canvasTexture(256, 196);
  if (!ctx) return texture;
  ctx.lineWidth = 16;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (kind === "ok") {
    // Round mint seal with a check, drawn over a chocolate outline so it reads on the sugar ticket.
    ctx.strokeStyle = PALETTE.chocolate2;
    ctx.lineWidth = 26;
    ctx.beginPath();
    ctx.arc(128, 98, 78, 0, Math.PI * 2);
    ctx.moveTo(84, 100);
    ctx.lineTo(116, 132);
    ctx.lineTo(174, 66);
    ctx.stroke();
    ctx.lineWidth = 16;
    ctx.strokeStyle = PALETTE.mint;
    ctx.beginPath();
    ctx.arc(128, 98, 78, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(84, 100);
    ctx.lineTo(116, 132);
    ctx.lineTo(174, 66);
    ctx.stroke();
  } else {
    // Square strawberry block crossed out twice: a removed sentence.
    ctx.strokeStyle = PALETTE.strawberry;
    ctx.strokeRect(22, 18, 212, 160);
    ctx.beginPath();
    ctx.moveTo(50, 42);
    ctx.lineTo(206, 154);
    ctx.moveTo(206, 42);
    ctx.lineTo(50, 154);
    ctx.stroke();
  }
  texture.needsUpdate = true;
  return texture;
}
