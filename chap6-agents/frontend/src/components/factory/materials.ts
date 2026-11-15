/**
 * Candy materials and the canvas textures they draw on. Everything here is procedural (no raster files):
 * peppermint swirls for room floors, twisted stripes for candy canes and wrappers, crackle and crack overlays
 * for fallback and error rooms, and badge icons for the rule book and the warning sign.
 */
import * as THREE from "three";

/** Direction-contract palette, plus shades mixed only from it. */
export const PALETTE = {
  chocolate: "#2a160c",
  chocolate2: "#3b1f12",
  cocoa: "#5a3220",
  strawberry: "#ff6fa8",
  lemon: "#ffd23f",
  mint: "#6ad1e3",
  sugar: "#fff4e0",
  licorice: "#160b07",
  cotton: "#ffc2dc",
  ash: "#8a7a70",
} as const;

const color = (hex: string) => new THREE.Color(hex);

/** Deterministic pseudo-random numbers so every reload draws the same cracks. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Peppermint swirl for a cylinder cap (caps map the disc onto the whole square). */
export function swirlTexture(a: string, b: string, blades = 8): THREE.CanvasTexture {
  return canvasTexture(256, (ctx, n) => {
    const c = n / 2;
    ctx.fillStyle = b;
    ctx.fillRect(0, 0, n, n);
    ctx.fillStyle = a;
    for (let i = 0; i < blades; i++) {
      const a0 = (i / blades) * Math.PI * 2;
      const a1 = a0 + Math.PI / blades;
      ctx.beginPath();
      ctx.moveTo(c, c);
      // Each blade bends as it leaves the centre: the swirl in a pulled sugar disc.
      for (let t = 0; t <= 1.0001; t += 0.05) {
        const r = t * c;
        const ang = a0 + t * 0.9;
        ctx.lineTo(c + Math.cos(ang) * r, c + Math.sin(ang) * r);
      }
      for (let t = 1; t >= 0; t -= 0.05) {
        const r = t * c;
        const ang = a1 + t * 0.9;
        ctx.lineTo(c + Math.cos(ang) * r, c + Math.sin(ang) * r);
      }
      ctx.closePath();
      ctx.fill();
    }
    // Sugar rim.
    ctx.lineWidth = n * 0.035;
    ctx.strokeStyle = PALETTE.sugar;
    ctx.beginPath();
    ctx.arc(c, c, c - ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.stroke();
  });
}

/** Diagonal stripes; repeat along U to wind a stripe around a cane or wrapper. */
export function stripeTexture(a: string, b: string, stripes = 4): THREE.CanvasTexture {
  const texture = canvasTexture(128, (ctx, n) => {
    ctx.fillStyle = b;
    ctx.fillRect(0, 0, n, n);
    ctx.fillStyle = a;
    const w = n / stripes;
    for (let i = -stripes; i < stripes * 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * w, 0);
      ctx.lineTo(i * w + w / 2, 0);
      ctx.lineTo(i * w + w / 2 + n, n);
      ctx.lineTo(i * w + n, n);
      ctx.closePath();
      ctx.fill();
    }
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/**
 * Transparent overlay for a room shell. `crackle` is fine sugar crazing (the room is running on its rule book);
 * `crack` is a few heavy fractures from one impact point (the room failed).
 */
export function crackTexture(kind: "crackle" | "crack"): THREE.CanvasTexture {
  const texture = canvasTexture(512, (ctx, n) => {
    const rnd = seeded(kind === "crack" ? 7 : 3);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (kind === "crackle") {
      for (let i = 0; i < 70; i++) {
        let x = rnd() * n;
        let y = rnd() * n;
        let ang = rnd() * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let s = 0; s < 6; s++) {
          ang += (rnd() - 0.5) * 1.6;
          x += Math.cos(ang) * n * 0.035;
          y += Math.sin(ang) * n * 0.035;
          ctx.lineTo(x, y);
        }
        ctx.strokeStyle = PALETTE.chocolate;
        ctx.lineWidth = 7;
        ctx.stroke();
        ctx.strokeStyle = PALETTE.lemon;
        ctx.lineWidth = 3.5;
        ctx.stroke();
      }
      return;
    }
    for (let k = 0; k < 2; k++) {
      const cx = n * (0.3 + 0.4 * k);
      const cy = n * (0.35 + 0.2 * k);
      for (let i = 0; i < 7; i++) {
        let x = cx;
        let y = cy;
        let ang = (i / 7) * Math.PI * 2 + rnd() * 0.5;
        const path: Array<[number, number]> = [[x, y]];
        for (let s = 0; s < 8; s++) {
          ang += (rnd() - 0.5) * 0.9;
          x += Math.cos(ang) * n * 0.05;
          y += Math.sin(ang) * n * 0.05;
          path.push([x, y]);
        }
        for (const [w, style] of [[16, PALETTE.licorice], [7, PALETTE.strawberry]] as const) {
          ctx.beginPath();
          path.forEach(([px, py], j) => (j ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
          ctx.strokeStyle = style;
          ctx.lineWidth = w;
          ctx.stroke();
        }
      }
    }
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Glossy chocolate-bar top: square segments with a darker groove and a highlight edge. */
export function chocolateBarTexture(cols: number, rows: number): THREE.CanvasTexture {
  const texture = canvasTexture(1024, (ctx, n) => {
    ctx.fillStyle = PALETTE.chocolate2;
    ctx.fillRect(0, 0, n, n);
    const w = n / cols;
    const h = n / rows;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const x = i * w;
        const y = j * h;
        ctx.fillStyle = PALETTE.chocolate;
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = PALETTE.chocolate2;
        ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
        ctx.fillStyle = "#4a2818";
        ctx.fillRect(x + 6, y + 6, w - 12, 3);
        ctx.fillRect(x + 6, y + 6, 3, h - 12);
      }
    }
  });
  return texture;
}

/** Round badge sprites drawn as shapes: a rule book (fallback) and a warning sign (error). */
export function badgeTexture(kind: "book" | "warning"): THREE.CanvasTexture {
  return canvasTexture(256, (ctx, n) => {
    const c = n / 2;
    ctx.fillStyle = PALETTE.chocolate;
    ctx.beginPath();
    ctx.arc(c, c, c - 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = kind === "book" ? PALETTE.lemon : PALETTE.strawberry;
    ctx.beginPath();
    ctx.arc(c, c, c - 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = PALETTE.chocolate;
    ctx.fillStyle = PALETTE.sugar;
    ctx.lineWidth = 10;
    if (kind === "book") {
      // Open book: two pages meeting at a spine, three rule lines on each page.
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(c, c - 46);
        ctx.quadraticCurveTo(c + side * 34, c - 64, c + side * 70, c - 52);
        ctx.lineTo(c + side * 70, c + 50);
        ctx.quadraticCurveTo(c + side * 34, c + 38, c, c + 58);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.lineWidth = 7;
        for (let i = 0; i < 3; i++) {
          const y = c - 22 + i * 24;
          ctx.beginPath();
          ctx.moveTo(c + side * 16, y);
          ctx.lineTo(c + side * 54, y - 6);
          ctx.stroke();
        }
        ctx.lineWidth = 10;
      }
    } else {
      ctx.beginPath();
      ctx.moveTo(c, c - 66);
      ctx.lineTo(c + 70, c + 56);
      ctx.lineTo(c - 70, c + 56);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = PALETTE.chocolate;
      ctx.beginPath();
      ctx.roundRect(c - 9, c - 30, 18, 52, 9);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(c, c + 38, 10, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Shared candy materials. Per-room materials are cloned so one room's state never tints another. */
export function createMaterials() {
  const glossy = (hex: string, extra: THREE.MeshPhysicalMaterialParameters = {}) =>
    new THREE.MeshPhysicalMaterial({ color: color(hex), roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15, ...extra });
  return {
    chocolateTop: glossy(PALETTE.chocolate2, { roughness: 0.32, clearcoat: 0.9 }),
    chocolateSide: glossy(PALETTE.chocolate, { roughness: 0.42, clearcoat: 0.5 }),
    chocolateDeep: new THREE.MeshStandardMaterial({ color: color("#1d0e07"), roughness: 0.7 }),
    cocoa: glossy(PALETTE.cocoa, { roughness: 0.4 }),
    strawberry: glossy(PALETTE.strawberry),
    lemon: glossy(PALETTE.lemon),
    mint: glossy(PALETTE.mint),
    sugar: glossy(PALETTE.sugar, { roughness: 0.45, clearcoat: 0.3 }),
    licorice: glossy(PALETTE.licorice, { roughness: 0.35 }),
    lampLit: new THREE.MeshStandardMaterial({ color: color(PALETTE.lemon), emissive: color(PALETTE.lemon), emissiveIntensity: 1.4 }),
    lampMint: new THREE.MeshStandardMaterial({ color: color(PALETTE.mint), emissive: color(PALETTE.mint), emissiveIntensity: 1.1 }),
    cotton: new THREE.MeshStandardMaterial({ color: color(PALETTE.cotton), roughness: 0.95, emissive: color(PALETTE.strawberry), emissiveIntensity: 0.08 }),
    cloud: new THREE.MeshStandardMaterial({ color: color(PALETTE.sugar), roughness: 1, emissive: color(PALETTE.cotton), emissiveIntensity: 0.12 }),
    cane: new THREE.MeshPhysicalMaterial({ map: stripeTexture(PALETTE.strawberry, PALETTE.sugar, 3), roughness: 0.25, clearcoat: 1 }),
    caneLemon: new THREE.MeshPhysicalMaterial({ map: stripeTexture(PALETTE.lemon, PALETTE.chocolate2, 3), roughness: 0.25, clearcoat: 1 }),
  };
}
export type Materials = ReturnType<typeof createMaterials>;

/** Clear hard-candy bell jar; one per code room so state tints stay local. */
export function glassMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: color("#f2fbff"),
    transmission: 1,
    thickness: 0.35,
    roughness: 0.04,
    ior: 1.45,
    attenuationColor: color(PALETTE.mint),
    attenuationDistance: 2.5,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    specularIntensity: 1,
    side: THREE.DoubleSide,
    transparent: true,
  });
}

/** Solid glossy kettle; one per LLM room. */
export function kettleMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ color: color(PALETTE.strawberry), roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 0.4, sheenColor: color(PALETTE.sugar) });
}

/** Frees every geometry, material and texture under `root`. Safe to call on shared objects more than once. */
export function disposeTree(root: THREE.Object3D): void {
  const textures = new Set<THREE.Texture>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material;
    if (mat) for (const m of Array.isArray(mat) ? mat : [mat]) materials.add(m);
  });
  for (const material of materials) {
    for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    material.dispose();
  }
  for (const texture of textures) texture.dispose();
}
