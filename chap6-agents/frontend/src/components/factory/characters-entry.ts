/** Workers at the front of the line: Bác Gác Cổng (safety_in), Cô Bẻ Ghi (orchestrator) with the rail switch, Chú Sổ Tay (intake). */
import * as THREE from "three";

import { SWITCH_TRACKS } from "@/lib/factory/cast";
import {
  BaseRig, _a, _b, approach, ball, canvasTexture, capsule, head, lathe, limb, part, reach, relax, rod,
} from "./character-parts";
import { PALETTE } from "./materials";

// ---------------------------------------------------------------- Bác Gác Cổng (safety_in)

export class GatekeeperRig extends BaseRig {
  private readonly armL;
  private readonly armR;
  private readonly head: THREE.Group;
  private readonly whistle = new THREE.Group();
  private readonly paddle = new THREE.Group();
  private readonly rings: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly mouth = new THREE.Vector3(0.0, 0.8, 0.24);
  private readonly chest = new THREE.Vector3(0.0, 0.5, 0.33);

  constructor() {
    super(0);
    const { m, body } = this;
    for (const side of [-1, 1]) body.add(part(rod(0.075, 0.16), m.licorice, [side * 0.12, 0.08, 0]));
    body.add(part(lathe([[0, 0.14], [0.3, 0.14], [0.36, 0.26], [0.37, 0.44], [0.32, 0.6], [0.18, 0.68], [0, 0.69]]), m.mint));
    const belt = part(new THREE.TorusGeometry(0.365, 0.035, 8, 32), m.chocolate, [0, 0.31, 0]);
    belt.rotation.x = Math.PI / 2;
    body.add(belt, part(new THREE.BoxGeometry(0.1, 0.08, 0.04), m.lemon, [0, 0.31, 0.37]));
    for (const y of [0.42, 0.53]) body.add(part(ball(0.03, 8, 6), m.lemon, [0, y, 0.35 - (y - 0.42) * 0.3], false));

    this.head = head(m, 0.2);
    this.head.position.set(0, 0.84, 0.02);
    // Bushy chocolate moustache.
    for (const side of [-1, 1]) {
      const tuft = part(capsule(0.035, 0.09), m.chocolate, [side * 0.06, -0.06, 0.18], false);
      tuft.rotation.z = side * 1.2;
      this.head.add(tuft);
    }
    // Tall dome guard helmet with a lemon badge and a chin strap.
    const helmet = part(new THREE.SphereGeometry(0.215, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), m.chocolate, [0, 0.09, -0.01]);
    helmet.scale.set(1, 1.6, 1);
    const brim = part(rod(0.235, 0.03, 0.235, 28), m.chocolate, [0, 0.1, 0]);
    const badge = part(new THREE.OctahedronGeometry(0.06), m.lemon, [0, 0.24, 0.19], false);
    badge.scale.set(1, 1.2, 0.4);
    const knob = part(ball(0.045, 10, 8), m.lemon, [0, 0.45, -0.01], false);
    this.head.add(helmet, brim, badge, knob);
    body.add(this.head);

    this.armL = limb(m.mint, 0.24, 0.065, { material: m.sugar, r: 0.065 });
    this.armR = limb(m.mint, 0.24, 0.065, { material: m.sugar, r: 0.065 });
    this.armL.pivot.position.set(0.34, 0.6, 0);
    this.armR.pivot.position.set(-0.34, 0.6, 0);
    body.add(this.armL.pivot, this.armR.pivot);

    // Whistle on a strawberry cord: on the chest at rest, at the mouth on an emergency.
    this.whistle.add(part(capsule(0.035, 0.07), m.lemon), part(ball(0.05, 12, 10), m.lemon, [0.06, -0.01, 0]));
    this.whistle.children[0].rotation.z = Math.PI / 2;
    body.add(this.whistle);
    for (let i = 0; i < 2; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1 + i * 0.06, 0.012, 6, 24, Math.PI * 0.8), new THREE.MeshBasicMaterial({ color: PALETTE.lemon, transparent: true, opacity: 0.8, depthWrite: false }));
      ring.rotation.z = Math.PI * 0.1;
      ring.visible = false;
      this.rings.push(ring);
      body.add(ring);
    }

    // No-entry paddle: a strawberry disc crossed by a sugar bar, raised on the side away from the bell jar.
    this.paddle.add(part(rod(0.016, 0.28), m.sugar, [0, -0.14, 0]));
    const disc = part(rod(0.15, 0.035, 0.15, 28), m.strawberry, [0, -0.36, 0]);
    disc.rotation.x = Math.PI / 2;
    this.paddle.add(disc, part(new THREE.BoxGeometry(0.2, 0.06, 0.05), m.sugar, [0, -0.36, 0]));
    this.paddle.visible = false;
    this.armR.tip.add(this.paddle);
  }

  protected animate(dt: number): void {
    const alarm = this.mood === "alarm";
    const work = this.mood === "work";
    const r = this.reduced;
    this.whistle.position.lerpVectors(this.chest, this.mouth, alarm ? 1 : 0);
    this.paddle.visible = alarm;
    // Paddle stays upright whatever the arm does.
    this.paddle.rotation.z = alarm ? -Math.PI - this.armR.pivot.rotation.z : 0;
    if (alarm) {
      reach(this.armL.pivot, _b.copy(this.mouth).add(_a.set(0.08, -0.05, 0.02)), 0.3);
      relax(this.armR.pivot, 0, -2.6);
      this.head.rotation.y = 0;
      // Sound rings ripple out from the whistle (held still, half grown, under reduced motion).
      for (let i = 0; i < this.rings.length; i++) {
        const ring = this.rings[i];
        ring.visible = true;
        const k = r ? 0.5 + i * 0.3 : (this.t * 2.2 + i * 0.5) % 1;
        ring.position.set(0.1 + k * 0.2, 0.84 + k * 0.12, 0.3 + k * 0.2);
        ring.scale.setScalar(0.6 + k * 0.9);
        ring.material.opacity = r ? 0.8 : 0.9 * (1 - k);
      }
      return;
    }
    for (const ring of this.rings) ring.visible = false;
    if (work) {
      // Inspecting the message: shading his eyes and scanning left and right.
      this.armR.pivot.rotation.set(-2.2, 0, -0.5);
      this.head.rotation.y = r ? 0.35 : Math.sin(this.t * 3.5) * 0.45;
    } else {
      relax(this.armR.pivot, 0, -0.18);
      this.head.rotation.y = approach(this.head.rotation.y, 0, 6, dt, r);
    }
    relax(this.armL.pivot, 0, 0.18);
  }
}

// ---------------------------------------------------------------- Cô Bẻ Ghi (orchestrator) and the rail switch

/** Lever angle per exit (front, main line, back) and parked; the rail angle (about y) per exit and parked. */
const LEVER = { parked: 0.6, exits: [-0.6, -0.2, 0.2] };
const RAIL = { parked: -Math.PI / 4, exits: [-Math.PI / 2, 0, Math.PI / 2] };
const LAMP_ON = new THREE.Color(PALETTE.lemon);
const LAMP_OFF = new THREE.Color(PALETTE.cocoa);

export class SwitchOperatorRig extends BaseRig {
  /** The rail switch on the plinth: the scene moves it to the station centre. */
  readonly switchPiece = new THREE.Group();
  private readonly blade = new THREE.Group();
  private readonly lamps: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>[] = [];
  private readonly lever = new THREE.Group();
  private readonly knob = new THREE.Vector3();
  private readonly book = new THREE.Group();
  private readonly page: THREE.Object3D;
  private readonly armL;
  private readonly armR;
  private readonly head: THREE.Group;
  private exit = -1;
  private leverAngle = LEVER.parked;
  private railAngle = RAIL.parked;
  private bookOpen = false;

  constructor() {
    super(1);
    const { m, body } = this;
    for (const side of [-1, 1]) body.add(part(rod(0.05, 0.16), m.licorice, [side * 0.08, 0.08, 0]));
    body.add(part(lathe([[0, 0.13], [0.3, 0.13], [0.22, 0.36], [0.14, 0.58], [0.1, 0.64], [0, 0.65]]), m.strawberry));
    body.add(part(new THREE.BoxGeometry(0.16, 0.18, 0.03), m.lemon, [0, 0.45, 0.17]));
    this.head = head(m, 0.19);
    this.head.position.set(0, 0.82, 0);
    const hair = part(new THREE.SphereGeometry(0.205, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), m.cocoa, [0, 0.01, -0.02]);
    hair.rotation.x = -0.35;
    const band = part(new THREE.TorusGeometry(0.19, 0.025, 8, 28), m.mint, [0, 0.08, 0]);
    band.rotation.x = Math.PI / 2 - 0.35;
    this.head.add(hair, band);
    for (const side of [-1, 1]) {
      this.head.add(part(ball(0.11, 16, 12), m.cocoa, [side * 0.24, 0.02, -0.03]));
      const bow = part(new THREE.TorusGeometry(0.04, 0.018, 6, 12), m.lemon, [side * 0.17, 0.06, -0.02], false);
      bow.rotation.y = Math.PI / 2;
      this.head.add(bow);
    }
    body.add(this.head);
    this.armL = limb(m.strawberry, 0.22, 0.05, { material: m.sugar, r: 0.055 });
    this.armR = limb(m.strawberry, 0.22, 0.05, { material: m.sugar, r: 0.055 });
    this.armL.pivot.position.set(0.15, 0.58, 0);
    this.armR.pivot.position.set(-0.15, 0.58, 0);
    body.add(this.armL.pivot, this.armR.pivot);

    // Lever on her right: chocolate base, sugar quadrant with four notches, candy-cane stick, strawberry knob.
    const stand = new THREE.Group();
    stand.position.set(-0.4, 0, 0.12);
    stand.add(part(new THREE.BoxGeometry(0.26, 0.1, 0.16), m.chocolate, [0, 0.05, 0]));
    const quadrant = part(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 24, 1, false, Math.PI - 0.75, 1.5), m.sugar, [0, 0.1, -0.02]);
    quadrant.rotation.x = Math.PI / 2;
    stand.add(quadrant);
    for (const a of [LEVER.parked, ...LEVER.exits]) stand.add(part(ball(0.03, 8, 6), m.licorice, [-Math.sin(a) * 0.27, 0.1 + Math.cos(a) * 0.27, 0.0], false));
    this.lever.position.y = 0.1;
    this.lever.add(part(rod(0.045, 0.55), m.cane, [0, 0.27, 0.02]), part(ball(0.1, 16, 12), m.strawberry, [0, 0.58, 0.02]));
    stand.add(this.lever);
    this.root.add(stand);

    // Rule book: two lemon covers with sugar pages and one page that flips.
    const cover = new THREE.BoxGeometry(0.16, 0.2, 0.015);
    const sheet = new THREE.BoxGeometry(0.14, 0.18, 0.01);
    for (const side of [-1, 1]) {
      const leaf = new THREE.Group();
      leaf.rotation.y = side * 0.35;
      leaf.add(part(cover, m.lemon, [side * 0.08, 0, 0]), part(sheet, m.sugar, [side * 0.075, 0, 0.012], false));
      for (let i = 0; i < 3; i++) leaf.add(part(new THREE.BoxGeometry(0.09, 0.012, 0.004), m.cocoa, [side * 0.075, 0.05 - i * 0.04, 0.019], false));
      this.book.add(leaf);
    }
    const flip = new THREE.Group();
    flip.add(part(sheet, m.sugar, [0.07, 0, 0.02], false));
    this.page = flip;
    this.book.add(flip);
    this.book.position.set(0.06, 0.5, 0.3);
    this.book.rotation.x = -0.5;
    this.book.visible = false;
    body.add(this.book);

    this.buildSwitch();
    this.detached.push(this.switchPiece);
  }

  private buildSwitch(): void {
    const { m } = this;
    const hub = part(rod(0.2, 0.08, 0.2, 28), m.strawberry, [0, 0.04, 0]);
    const cap = part(rod(0.1, 0.04, 0.1, 20), m.sugar, [0, 0.09, 0]);
    this.switchPiece.add(hub, cap, this.blade);
    // A short length of candy rail with an arrow head; it turns about the hub to face the chosen exit.
    this.blade.add(part(new THREE.BoxGeometry(0.95, 0.04, 0.22), m.cocoa, [0.62, 0.03, 0]));
    for (const z of [-0.07, 0.07]) this.blade.add(part(new THREE.BoxGeometry(0.95, 0.05, 0.035), m.lemon, [0.62, 0.07, z]));
    const tip = part(new THREE.ConeGeometry(0.17, 0.26, 3), m.lemon, [1.2, 0.07, 0]);
    tip.rotation.set(Math.PI / 2, 0, -Math.PI / 2);
    tip.scale.set(1, 1, 0.35);
    this.blade.add(tip);
    // One lamp per exit on the plinth rim: the chosen exit lights and grows (a shape cue, not only colour).
    RAIL.exits.forEach((a) => {
      const lamp = new THREE.Mesh(ball(0.09, 12, 10), new THREE.MeshStandardMaterial({ color: PALETTE.cocoa, emissive: PALETTE.lemon, emissiveIntensity: 0, roughness: 0.4 }));
      // On the rim beside the lane, so the blade never covers it.
      lamp.position.set(Math.cos(a) * 0.92 + Math.sin(a) * 0.3, 0.07, -Math.sin(a) * 0.92 + Math.cos(a) * 0.3);
      this.lamps.push(lamp);
      this.switchPiece.add(lamp);
    });
  }

  act(kind: string, value = -1): void {
    if (kind === "switch") this.exit = value >= 0 && value < SWITCH_TRACKS.length ? value : -1;
    if (kind === "book") this.bookOpen = value > 0;
  }

  protected animate(dt: number): void {
    const r = this.reduced;
    const exit = this.exit;
    // The lever leads; the rail follows a beat behind, so the throw reads as cause and effect.
    this.leverAngle = approach(this.leverAngle, exit >= 0 ? LEVER.exits[exit] : LEVER.parked, 16, dt, r);
    const leverDone = Math.abs(this.leverAngle - (exit >= 0 ? LEVER.exits[exit] : LEVER.parked)) < 0.08;
    const railTarget = exit >= 0 ? RAIL.exits[exit] : RAIL.parked;
    if (leverDone || r) this.railAngle = approach(this.railAngle, railTarget, 11, dt, r);
    this.lever.rotation.z = this.leverAngle;
    this.blade.rotation.y = this.railAngle;
    for (let i = 0; i < this.lamps.length; i++) {
      const lamp = this.lamps[i];
      const on = i === exit && Math.abs(this.railAngle - railTarget) < 0.1;
      lamp.material.color.copy(on ? LAMP_ON : LAMP_OFF);
      lamp.material.emissiveIntensity = on ? 1.6 : 0;
      lamp.scale.setScalar(on ? 1.5 : 1);
    }

    // Right hand on the lever knob (lever base sits in root space, beside the body).
    const a = this.leverAngle;
    this.knob.set(-0.4 - Math.sin(a) * 0.58, 0.1 + Math.cos(a) * 0.58, 0.14);
    reach(this.armR.pivot, this.knob, 0.3);

    this.book.visible = this.bookOpen;
    if (this.bookOpen) {
      reach(this.armL.pivot, _b.set(0.1, 0.48, 0.28), 0.3);
      this.page.rotation.y = r ? -0.6 : -((this.t * 1.4) % 1) * Math.PI * 0.8;
    } else if (this.mood === "alarm") {
      relax(this.armL.pivot, 0, 2.4);
    } else {
      relax(this.armL.pivot, 0, 0.2);
    }
    this.head.rotation.z = this.mood === "work" && !r ? Math.sin(this.t * 4) * 0.08 : 0;
  }
}

// ---------------------------------------------------------------- Chú Sổ Tay (intake)

export class RecordKeeperRig extends BaseRig {
  private readonly armL;
  private readonly armR;
  private readonly paper: { texture: THREE.CanvasTexture; ctx: CanvasRenderingContext2D | null };
  private fields = -1;
  private readonly pencilAt = new THREE.Vector3();

  constructor() {
    super(2);
    const { m, body } = this;
    for (const side of [-1, 1]) body.add(part(rod(0.06, 0.16), m.licorice, [side * 0.11, 0.08, 0]));
    const egg = part(ball(0.3, 28, 20), m.lemon, [0, 0.44, 0]);
    egg.scale.set(1, 1.12, 0.9);
    body.add(egg);
    for (const side of [-1, 1]) {
      const bow = part(new THREE.ConeGeometry(0.06, 0.1, 4), m.strawberry, [side * 0.05, 0.75, 0.2], false);
      bow.rotation.z = side * Math.PI / 2;
      body.add(bow);
    }
    const face = head(m, 0.19);
    face.position.set(0, 0.92, 0.02);
    for (const side of [-1, 1]) {
      const lens = part(new THREE.TorusGeometry(0.06, 0.014, 6, 20), m.licorice, [side * 0.07, 0.025, 0.18], false);
      face.add(lens);
    }
    face.add(part(new THREE.BoxGeometry(0.04, 0.014, 0.014), m.licorice, [0, 0.03, 0.19], false));
    const tuft = part(new THREE.SphereGeometry(0.195, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.32), m.cocoa, [0, 0.01, 0]);
    face.add(tuft);
    // Pencil tucked behind the ear.
    const pencil = new THREE.Group();
    pencil.add(part(rod(0.022, 0.2), m.lemon), part(new THREE.ConeGeometry(0.022, 0.05, 10), m.strawberry, [0, 0.12, 0], false));
    pencil.position.set(0.17, 0.06, 0);
    pencil.rotation.z = -0.9;
    face.add(pencil);
    body.add(face);

    this.armL = limb(m.lemon, 0.2, 0.055, { material: m.sugar, r: 0.06 });
    this.armR = limb(m.lemon, 0.2, 0.055, { material: m.sugar, r: 0.06 });
    this.armL.pivot.position.set(0.27, 0.58, 0.04);
    this.armR.pivot.position.set(-0.27, 0.58, 0.04);
    body.add(this.armL.pivot, this.armR.pivot);
    const nib = new THREE.Group();
    nib.add(part(rod(0.018, 0.16), m.mint), part(new THREE.ConeGeometry(0.018, 0.04, 8), m.licorice, [0, -0.1, 0], false));
    this.armR.tip.add(nib);

    // Clipboard held up in front, tilted back so the camera above can read it.
    const board = new THREE.Group();
    board.position.set(0.02, 0.5, 0.36);
    board.rotation.x = -0.55;
    board.add(part(new THREE.BoxGeometry(0.48, 0.56, 0.03), m.chocolate));
    board.add(part(new THREE.BoxGeometry(0.16, 0.06, 0.05), m.lemon, [0, 0.27, 0.02], false));
    this.paper = canvasTexture(256, 288);
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.47), new THREE.MeshStandardMaterial({ map: this.paper.texture, roughness: 0.8 }));
    sheet.position.set(0, -0.02, 0.017);
    board.add(sheet);
    body.add(board);
    this.act("fields", 0);
  }

  /** `fields`: how many of the 7 required fields are on the clipboard. Redraws only on change. */
  act(kind: string, value = 0): void {
    if (kind !== "fields" || value === this.fields) return;
    this.fields = value;
    const { ctx, texture } = this.paper;
    if (!ctx) return;
    const w = 256;
    ctx.fillStyle = PALETTE.sugar;
    ctx.fillRect(0, 0, w, 288);
    ctx.fillStyle = PALETTE.chocolate;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "800 118px system-ui, sans-serif";
    ctx.fillText(`${value}/7`, w / 2, 112);
    // Seven boxes: ticked ones are filled and carry a check, so the count never relies on colour.
    const size = 26;
    const gap = 6;
    const x0 = (w - (size * 7 + gap * 6)) / 2;
    for (let i = 0; i < 7; i++) {
      const x = x0 + i * (size + gap);
      const y = 214;
      ctx.lineWidth = 4;
      ctx.strokeStyle = PALETTE.chocolate;
      ctx.fillStyle = i < value ? PALETTE.mint : PALETTE.sugar;
      ctx.beginPath();
      ctx.roundRect(x, y, size, size, 5);
      ctx.fill();
      ctx.stroke();
      if (i < value) {
        ctx.beginPath();
        ctx.moveTo(x + 6, y + 13);
        ctx.lineTo(x + 11, y + 19);
        ctx.lineTo(x + 20, y + 7);
        ctx.stroke();
      }
    }
    texture.needsUpdate = true;
  }

  protected animate(): void {
    const r = this.reduced;
    reach(this.armL.pivot, _b.set(0.22, 0.4, 0.4), 0.26);
    if (this.mood === "alarm") {
      relax(this.armR.pivot, 0, -2.4);
      return;
    }
    if (this.mood === "work") {
      // Writing on the clipboard: small loops of the pencil hand.
      const t = r ? 0 : this.t * 10;
      this.pencilAt.set(-0.04 + Math.sin(t) * 0.07, 0.56 + Math.cos(t * 0.5) * 0.04, 0.44);
      reach(this.armR.pivot, this.pencilAt, 0.26);
    } else {
      reach(this.armR.pivot, _b.set(-0.2, 0.46, 0.38), 0.26);
    }
  }
}
