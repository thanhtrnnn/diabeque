/**
 * Building blocks for the factory characters: candy materials, primitive body parts (head with face, limbs
 * that pivot at the shoulder), and `BaseRig`, which owns the shared mood motion. Squash-and-stretch while
 * working, a gentle breath while idle, a hop on hover, a shiver on alarm. Under reduced motion nothing
 * moves position: moods come through in pose and props only, and poses snap instead of easing.
 */
import * as THREE from "three";

import type { Mood } from "@/lib/factory/cues";
import { PALETTE, disposeTree, stripeTexture } from "./materials";

export type { Mood };

export interface CharacterRig {
  root: THREE.Group;
  setMood(mood: Mood): void;
  update(dt: number): void;
  act?(kind: string, value?: number): void;
  setReducedMotion(on: boolean): void;
  dispose(): void;
}

/** Each rig gets its own materials so disposing one never frees another's. */
export function candyMaterials() {
  const glossy = (hex: string, extra: THREE.MeshPhysicalMaterialParameters = {}) =>
    new THREE.MeshPhysicalMaterial({ color: new THREE.Color(hex), roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.2, ...extra });
  return {
    sugar: glossy(PALETTE.sugar, { roughness: 0.5, clearcoat: 0.3 }),
    strawberry: glossy(PALETTE.strawberry),
    lemon: glossy(PALETTE.lemon),
    mint: glossy(PALETTE.mint),
    cocoa: glossy(PALETTE.cocoa, { roughness: 0.4 }),
    chocolate: glossy(PALETTE.chocolate2, { roughness: 0.38 }),
    licorice: glossy(PALETTE.licorice, { roughness: 0.25, clearcoat: 1 }),
    cotton: glossy(PALETTE.cotton, { roughness: 0.7, clearcoat: 0 }),
    cane: new THREE.MeshPhysicalMaterial({ map: stripeTexture(PALETTE.strawberry, PALETTE.sugar, 3), roughness: 0.25, clearcoat: 1 }),
  };
}
export type CandyMaterials = ReturnType<typeof candyMaterials>;

export function part<T extends THREE.BufferGeometry, M extends THREE.Material>(geometry: T, material: M, at?: [number, number, number], shadow = true) {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = shadow;
  m.receiveShadow = true;
  if (at) m.position.set(...at);
  return m;
}

export const ball = (r: number, w = 20, h = 14) => new THREE.SphereGeometry(r, w, h);
export const rod = (r: number, h: number, top = r, seg = 16) => new THREE.CylinderGeometry(top, r, h, seg);
export const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 4, 12);
export const lathe = (points: Array<[number, number]>, seg = 28) => new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), seg);

/** A sugar head facing +z with licorice eyes, cotton cheeks and a small smile. Returns the head group. */
export function head(m: CandyMaterials, r: number, opts: { skin?: THREE.Material; eyeGap?: number; smile?: boolean } = {}): THREE.Group {
  const g = new THREE.Group();
  g.add(part(ball(r, 24, 18), opts.skin ?? m.sugar));
  const gap = (opts.eyeGap ?? 0.36) * r;
  const eye = ball(r * 0.15, 10, 8);
  const cheek = ball(r * 0.17, 10, 8);
  for (const side of [-1, 1]) {
    g.add(part(eye, m.licorice, [side * gap, r * 0.12, r * 0.9], false));
    const c = part(cheek, m.cotton, [side * r * 0.6, -r * 0.22, r * 0.72], false);
    c.scale.set(1, 0.6, 0.4);
    g.add(c);
  }
  if (opts.smile !== false) {
    const smile = part(new THREE.TorusGeometry(r * 0.2, r * 0.045, 6, 12, Math.PI), m.licorice, [0, -r * 0.18, r * 0.95], false);
    smile.rotation.z = Math.PI;
    g.add(smile);
  }
  return g;
}

/** An arm or leg hanging down (-y) from its pivot; rotate the returned group to swing it. `hand` sits at the tip. */
export function limb(m: THREE.Material, len: number, r: number, end?: { material: THREE.Material; r: number }) {
  const pivot = new THREE.Group();
  pivot.add(part(capsule(r, len), m, [0, -len / 2 - r * 0.3, 0]));
  const tip = new THREE.Group();
  tip.position.y = -len - r * 0.4;
  if (end) tip.add(part(ball(end.r, 12, 10), end.material));
  pivot.add(tip);
  return { pivot, tip };
}

/** Frame-rate independent ease toward a target; snaps when motion is reduced. */
export const approach = (value: number, target: number, rate: number, dt: number, snap: boolean) =>
  snap ? target : value + (target - value) * (1 - Math.exp(-rate * dt));

export abstract class BaseRig implements CharacterRig {
  readonly root = new THREE.Group();
  /** Pivot at the feet: squash, stretch, breath and hop act on this group. */
  protected readonly body = new THREE.Group();
  protected readonly m = candyMaterials();
  protected mood: Mood = "idle";
  protected reduced = false;
  /** Seconds since the rig was built, and since the current mood began. */
  protected t = 0;
  protected moodT = 0;
  /** Phase offset so neighbours never breathe in step. */
  private readonly phase: number;

  constructor(seed: number) {
    this.phase = seed * 1.37;
    this.root.add(this.body);
  }

  setMood(mood: Mood): void {
    if (mood === this.mood) return;
    this.mood = mood;
    this.moodT = 0;
  }

  setReducedMotion(on: boolean): void {
    this.reduced = on;
  }

  update(dt: number): void {
    this.t += dt;
    this.moodT += dt;
    this.moveBody();
    this.animate(dt);
  }

  /** Per-character poses and props for this frame. */
  protected abstract animate(dt: number): void;

  private moveBody(): void {
    const b = this.body;
    b.position.y = 0;
    b.rotation.z = 0;
    b.scale.set(1, 1, 1);
    if (this.reduced) return;
    const t = this.t + this.phase;
    switch (this.mood) {
      case "idle": {
        const s = Math.sin(t * 1.8) * 0.018;
        b.scale.set(1 - s * 0.5, 1 + s, 1 - s * 0.5);
        break;
      }
      case "work": {
        // Candy squash and stretch: squat on the beat, stretch tall on the rebound.
        const beat = Math.sin(t * 9);
        const s = beat * 0.07;
        b.scale.set(1 - s * 0.6, 1 + s, 1 - s * 0.6);
        b.position.y = Math.max(0, beat) * 0.035;
        break;
      }
      case "hover": {
        const k = Math.abs(Math.sin(this.moodT * 6));
        b.position.y = k * 0.16;
        b.scale.set(1 - k * 0.05, 1 + k * 0.1, 1 - k * 0.05);
        break;
      }
      case "alarm":
        b.rotation.z = Math.sin(t * 22) * 0.06;
        b.position.y = Math.abs(Math.sin(t * 11)) * 0.05;
        break;
    }
  }

  /** Extra objects a rig owns outside its root (the rail switch) are listed here so dispose reaches them. */
  protected readonly detached: THREE.Object3D[] = [];

  dispose(): void {
    disposeTree(this.root);
    for (const o of this.detached) {
      o.removeFromParent();
      disposeTree(o);
    }
    for (const material of Object.values(this.m)) {
      material.map?.dispose();
      material.dispose();
    }
  }
}

export function canvasTexture(w: number, h: number): { texture: THREE.CanvasTexture; ctx: CanvasRenderingContext2D | null } {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { texture, ctx: canvas.getContext("2d") };
}

/** Scratch vectors for per-frame maths (never held across calls). */
export const _a = new THREE.Vector3();
export const _b = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);

/**
 * Points a limb (hanging along -y from `pivot`) at `target`, both in the pivot's parent space, and stretches
 * it like pulled sugar when the target is further than the limb is long.
 */
export function reach(pivot: THREE.Object3D, target: THREE.Vector3, length: number): void {
  _a.subVectors(target, pivot.position);
  const d = _a.length();
  if (d < 1e-4) return;
  pivot.quaternion.setFromUnitVectors(DOWN, _a.divideScalar(d));
  pivot.scale.set(1, THREE.MathUtils.clamp(d / length, 0.6, 1.7), 1);
}

export const relax = (pivot: THREE.Object3D, x: number, z: number) => {
  pivot.scale.set(1, 1, 1);
  pivot.rotation.set(x, 0, z);
};
