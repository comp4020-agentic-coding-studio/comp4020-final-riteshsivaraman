// Canvas artwork for the shell: floors, walls, ceiling, light glows, posters,
// lightboxes, the invented brand mark and the back room's signs. Everything is
// drawn here in code; nothing is downloaded. Textures are cached by key so a
// repeated element shares one upload.
import { type CanvasTexture, RepeatWrapping } from "three";
import { canvasTexture } from "./common.tsx";

const cache = new Map<string, CanvasTexture>();
function cached(key: string, make: () => CanvasTexture): CanvasTexture {
  let t = cache.get(key);
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const tile = (t: CanvasTexture, rx = 1, ry = 1): CanvasTexture => {
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 4;
  return t;
};

// Fine vertical brushing: many faint streaks.
function brush(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number, alpha = 0.05) {
  const r = rng(seed);
  for (let i = 0; i < w * 1.2; i++) {
    g.fillStyle = r() > 0.5 ? `rgba(255,255,255,${alpha * r()})` : `rgba(40,44,50,${alpha * r()})`;
    g.fillRect(x + r() * w, y, 1, h);
  }
}

// ---------------------------------------------------------------- the mark
// The invented mark: a ring of rounded teeth around a ring and a dot (a
// "watching eye" gear). Not any company's mark.
export function drawMark(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: string | CanvasGradient) {
  g.save();
  g.fillStyle = fill;
  g.strokeStyle = fill;
  g.lineWidth = r * 0.16;
  g.beginPath();
  g.arc(cx, cy, r * 0.56, 0, Math.PI * 2);
  g.stroke();
  const teeth = 12;
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    g.save();
    g.translate(cx + Math.cos(a) * r * 0.86, cy + Math.sin(a) * r * 0.86);
    g.rotate(a);
    g.beginPath();
    g.roundRect(-r * 0.11, -r * 0.08, r * 0.22, r * 0.16, r * 0.06);
    g.fill();
    g.restore();
  }
  g.beginPath();
  g.arc(cx, cy, r * 0.2, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

// The logo face: graphite disc, a soft halo and the mark in bright white.
export function logoTexture(): CanvasTexture {
  return cached("logo", () =>
    canvasTexture(256, 256, (g) => {
      const bg = g.createRadialGradient(128, 110, 10, 128, 128, 140);
      bg.addColorStop(0, "#3a3f47");
      bg.addColorStop(1, "#16181c");
      g.fillStyle = bg;
      g.fillRect(0, 0, 256, 256);
      const halo = g.createRadialGradient(128, 128, 30, 128, 128, 120);
      halo.addColorStop(0, "rgba(255,255,255,0.22)");
      halo.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = halo;
      g.fillRect(0, 0, 256, 256);
      g.shadowColor = "rgba(255,255,255,0.9)";
      g.shadowBlur = 14;
      const f = g.createLinearGradient(60, 40, 196, 216);
      f.addColorStop(0, "#ffffff");
      f.addColorStop(1, "#d6dbe2");
      drawMark(g, 128, 128, 92, f);
    }),
  );
}

// A soft round glow (additive), white or tinted.
export function glowTexture(colour = "255,255,255"): CanvasTexture {
  return cached(`glow:${colour}`, () =>
    canvasTexture(128, 128, (g) => {
      const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      r.addColorStop(0, `rgba(${colour},0.85)`);
      r.addColorStop(0.35, `rgba(${colour},0.35)`);
      r.addColorStop(1, `rgba(${colour},0)`);
      g.fillStyle = r;
      g.fillRect(0, 0, 128, 128);
    }),
  );
}

// A soft rounded-rectangle falloff: the light a ceiling panel throws on the
// slats around it.
export function spillTexture(): CanvasTexture {
  return cached("spill", () =>
    canvasTexture(256, 128, (g) => {
      g.filter = "blur(18px)";
      g.fillStyle = "rgba(255,248,236,0.9)";
      g.beginPath();
      g.roundRect(64, 40, 128, 48, 20);
      g.fill();
      g.filter = "none";
    }),
  );
}

// ---------------------------------------------------------------- shop shell
// Polished stone: four 0.9 m tiles per texture repeat (1.8 m), each a slightly
// different tone with cloudy veining, fine speckle and 7 mm joints.
export function stoneFloorTexture(): CanvasTexture {
  return cached("stone", () =>
    tile(
      canvasTexture(512, 512, (g) => {
        const r = rng(7);
        const tones = ["#dcdedf", "#d5d8da", "#e0e1e1", "#d8dadb"];
        for (let ty = 0; ty < 2; ty++)
          for (let tx = 0; tx < 2; tx++) {
            const x0 = tx * 256;
            const y0 = ty * 256;
            g.fillStyle = tones[ty * 2 + tx];
            g.fillRect(x0, y0, 256, 256);
            g.save();
            g.beginPath();
            g.rect(x0, y0, 256, 256);
            g.clip();
            for (let i = 0; i < 26; i++) {
              g.fillStyle = `rgba(${r() > 0.5 ? "255,255,255" : "120,124,130"},${0.03 + r() * 0.04})`;
              g.beginPath();
              g.ellipse(x0 + r() * 256, y0 + r() * 256, 20 + r() * 70, 6 + r() * 20, 0.6 + r() * 0.5, 0, Math.PI * 2);
              g.fill();
            }
            g.strokeStyle = "rgba(150,154,160,0.12)";
            g.lineWidth = 1;
            for (let i = 0; i < 3; i++) {
              g.beginPath();
              let px = x0 + r() * 256;
              let py = y0;
              g.moveTo(px, py);
              while (py < y0 + 256) {
                px += (r() - 0.4) * 30;
                py += 20 + r() * 30;
                g.lineTo(px, py);
              }
              g.stroke();
            }
            g.restore();
          }
        for (let i = 0; i < 2600; i++) {
          g.fillStyle = `rgba(${r() > 0.55 ? "255,255,255" : "90,94,100"},${0.08 + r() * 0.12})`;
          g.fillRect(r() * 512, r() * 512, 1.2, 1.2);
        }
        // joints: a dark line with a faint highlight on one side
        for (const p of [0, 256]) {
          g.fillStyle = "#a9adb2";
          g.fillRect(p, 0, 2, 512);
          g.fillRect(0, p, 512, 2);
          g.fillStyle = "rgba(255,255,255,0.5)";
          g.fillRect(p + 2, 0, 1, 512);
          g.fillRect(0, p + 2, 512, 1);
        }
      }),
    ),
  );
}

// The shop's side and back walls, one 1.2 m panel wide and the full 3 m high:
// a charcoal skirting, a dark brushed band to 0.95 m, a mid band to 1.5 m, then
// the light upper wall fading lighter toward the ceiling, with shadow reveals
// between the bands and a fine vertical seam at the panel edge.
export const WALL_MODULE = 1.2;
export function shopWallTexture(): CanvasTexture {
  return cached("shopwall", () =>
    tile(
      canvasTexture(256, 512, (g) => {
        const H = 512;
        const py = (m: number) => Math.round(H * (1 - m / 3));
        const band = (y0: number, y1: number, a: string, b: string, seed: number) => {
          const gr = g.createLinearGradient(0, py(y1), 0, py(y0));
          gr.addColorStop(0, a);
          gr.addColorStop(1, b);
          g.fillStyle = gr;
          g.fillRect(0, py(y1), 256, py(y0) - py(y1));
          brush(g, 0, py(y1), 256, py(y0) - py(y1), seed, 0.06);
        };
        band(1.5, 3.0, "#eceef0", "#d3d7db", 1);
        band(0.95, 1.5, "#b3b8be", "#aab0b6", 2);
        band(0.08, 0.95, "#8f959c", "#868c93", 3);
        g.fillStyle = "#33373c";
        g.fillRect(0, py(0.08), 256, H - py(0.08));
        // reveals between bands and above the skirting
        for (const m of [0.08, 0.95, 1.5]) {
          g.fillStyle = "rgba(30,34,40,0.75)";
          g.fillRect(0, py(m) - 2, 256, 3);
          g.fillStyle = "rgba(255,255,255,0.45)";
          g.fillRect(0, py(m) - 3, 256, 1);
        }
        // vertical seam at the panel edge
        g.fillStyle = "rgba(40,44,50,0.55)";
        g.fillRect(0, 0, 2, py(0.08));
        g.fillStyle = "rgba(255,255,255,0.5)";
        g.fillRect(2, 0, 1, py(0.08));
      }),
    ),
  );
}

// Ceiling slats running across the room: a shadow gap, a highlight on the
// bevel, then the slat face shading slightly darker toward its far edge.
export function slatTexture(): CanvasTexture {
  return cached("slats", () =>
    tile(
      canvasTexture(64, 64, (g) => {
        const gr = g.createLinearGradient(0, 0, 0, 64);
        gr.addColorStop(0, "#f2f3f4");
        gr.addColorStop(0.75, "#dfe2e5");
        gr.addColorStop(1, "#c9cdd2");
        g.fillStyle = gr;
        g.fillRect(0, 0, 64, 64);
        g.fillStyle = "#6e747b";
        g.fillRect(0, 58, 64, 6);
        g.fillStyle = "#9aa0a7";
        g.fillRect(0, 56, 64, 2);
        g.fillStyle = "#ffffff";
        g.fillRect(0, 0, 64, 2);
      }),
    ),
  );
}

// A recessed light panel: a thin aluminium frame, then an even white diffuser
// with the faintest falloff to its edges.
export function lightPanelTexture(): CanvasTexture {
  return cached("panel", () =>
    canvasTexture(256, 64, (g) => {
      g.fillStyle = "#b9bec4";
      g.fillRect(0, 0, 256, 64);
      const gr = g.createLinearGradient(0, 4, 0, 60);
      gr.addColorStop(0, "#f4f6fa");
      gr.addColorStop(0.5, "#ffffff");
      gr.addColorStop(1, "#f4f6fa");
      g.fillStyle = gr;
      g.fillRect(4, 4, 248, 56);
    }),
  );
}

// Glass reflection streaks: soft diagonal bands on clear.
export function streakTexture(): CanvasTexture {
  return cached("streak", () =>
    canvasTexture(256, 256, (g) => {
      g.clearRect(0, 0, 256, 256);
      const r = rng(3);
      for (let i = 0; i < 5; i++) {
        const x = r() * 300 - 30;
        const w = 8 + r() * 36;
        g.save();
        g.translate(x, 0);
        g.transform(1, 0, -0.35, 1, 0, 0);
        const gr = g.createLinearGradient(0, 0, w, 0);
        const a = 0.12 + r() * 0.18;
        gr.addColorStop(0, "rgba(255,255,255,0)");
        gr.addColorStop(0.5, `rgba(255,255,255,${a})`);
        gr.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = gr;
        g.fillRect(0, 0, w, 256);
        g.restore();
      }
    }),
  );
}

// ---------------------------------------------------------------- artwork
export type PosterKind = "phone" | "watch" | "buds" | "colour" | "mark" | "laptop";

// One phone seen from the back or front, rotated, drawn at (x, y) with height h.
function phoneShape(g: CanvasRenderingContext2D, x: number, y: number, h: number, rot: number, body: [string, string], screen: [string, string] | null) {
  const w = h * 0.48;
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.shadowColor = "rgba(0,0,0,0.35)";
  g.shadowBlur = h * 0.08;
  g.shadowOffsetY = h * 0.03;
  const b = g.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  b.addColorStop(0, body[0]);
  b.addColorStop(1, body[1]);
  g.fillStyle = b;
  g.beginPath();
  g.roundRect(-w / 2, -h / 2, w, h, w * 0.18);
  g.fill();
  g.shadowColor = "transparent";
  if (screen) {
    const s = g.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    s.addColorStop(0, screen[0]);
    s.addColorStop(1, screen[1]);
    g.fillStyle = s;
    g.beginPath();
    g.roundRect(-w / 2 + w * 0.05, -h / 2 + w * 0.05, w * 0.9, h - w * 0.1, w * 0.14);
    g.fill();
    // a glowing swirl on the screen
    g.globalCompositeOperation = "lighter";
    for (let i = 0; i < 3; i++) {
      const rg = g.createRadialGradient(0, h * (0.1 - i * 0.15), 0, 0, h * (0.1 - i * 0.15), w * 0.7);
      rg.addColorStop(0, "rgba(255,255,255,0.35)");
      rg.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = rg;
      g.fillRect(-w / 2, -h / 2, w, h);
    }
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "#0b0c0f";
    g.beginPath();
    g.roundRect(-w * 0.13, -h / 2 + w * 0.09, w * 0.26, w * 0.07, w * 0.035);
    g.fill();
  } else {
    // camera block, two lenses
    g.fillStyle = "rgba(255,255,255,0.18)";
    g.beginPath();
    g.roundRect(-w / 2 + w * 0.08, -h / 2 + w * 0.08, w * 0.42, w * 0.42, w * 0.1);
    g.fill();
    for (const [lx, ly] of [
      [0.19, 0.19],
      [0.19, 0.39],
      [0.38, 0.29],
    ]) {
      g.fillStyle = "#14161a";
      g.beginPath();
      g.arc(-w / 2 + w * lx, -h / 2 + w * ly, w * 0.08, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "rgba(120,150,255,0.6)";
      g.beginPath();
      g.arc(-w / 2 + w * lx - w * 0.02, -h / 2 + w * ly - w * 0.02, w * 0.025, 0, Math.PI * 2);
      g.fill();
    }
  }
  // an edge highlight
  g.strokeStyle = "rgba(255,255,255,0.35)";
  g.lineWidth = Math.max(1, w * 0.012);
  g.beginPath();
  g.roundRect(-w / 2, -h / 2, w, h, w * 0.18);
  g.stroke();
  g.restore();
}

function bigWord(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, colour: string, align: CanvasTextAlign = "left") {
  g.save();
  g.fillStyle = colour;
  g.font = `600 ${size}px "Helvetica Neue", system-ui, sans-serif`;
  g.textAlign = align;
  g.textBaseline = "alphabetic";
  (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${Math.round(size * 0.06)}px`;
  g.fillText(text, x, y);
  g.restore();
}

// Poster and screen art. Sizes are in pixels, aspect follows the panel. Only
// generic product words appear; tag lines are `[TK]` (not invented here).
export function posterTexture(kind: PosterKind, w = 512, h = 256, variant = 0): CanvasTexture {
  return cached(`poster:${kind}:${w}:${h}:${variant}`, () =>
    canvasTexture(w, h, (g) => {
      const m = Math.min(w, h);
      if (kind === "colour") {
        const pals = [
          ["#ff6a3d", "#ffb347", "#7a5cff"],
          ["#00c2a8", "#1e6bff", "#b8f3ff"],
          ["#ff4d8d", "#ffd36e", "#4b2bd1"],
        ][variant % 3];
        g.fillStyle = "#0e0f13";
        g.fillRect(0, 0, w, h);
        g.globalCompositeOperation = "lighter";
        pals.forEach((c, i) => {
          const cx = w * (0.25 + i * 0.27);
          const cy = h * (0.45 + (i % 2) * 0.15);
          const rg = g.createRadialGradient(cx, cy, 0, cx, cy, m * 0.75);
          rg.addColorStop(0, c);
          rg.addColorStop(1, "rgba(0,0,0,0)");
          g.fillStyle = rg;
          g.fillRect(0, 0, w, h);
        });
        g.globalCompositeOperation = "source-over";
        // bold rounded ribbons
        const r = rng(11 + variant);
        for (let i = 0; i < 4; i++) {
          g.save();
          g.translate(w * (0.15 + r() * 0.7), h * (0.2 + r() * 0.6));
          g.rotate(-0.6 + r() * 0.4);
          g.fillStyle = `rgba(255,255,255,${0.1 + r() * 0.12})`;
          g.beginPath();
          g.roundRect(-m * 0.4, -m * 0.06, m * 0.8, m * 0.12, m * 0.06);
          g.fill();
          g.restore();
        }
        bigWord(g, "NEW", w * 0.06, h * 0.9, m * 0.2, "#ffffff");
        return;
      }
      if (kind === "mark") {
        const bg = g.createLinearGradient(0, 0, w, h);
        bg.addColorStop(0, "#1b1e24");
        bg.addColorStop(1, "#0b0c0f");
        g.fillStyle = bg;
        g.fillRect(0, 0, w, h);
        g.shadowColor = "rgba(255,255,255,0.8)";
        g.shadowBlur = m * 0.06;
        drawMark(g, w / 2, h / 2, m * 0.36, "#ffffff");
        return;
      }
      if (kind === "phone") {
        const bg = g.createLinearGradient(0, 0, w, h);
        const pals: Array<[string, string, string, string]> = [
          ["#0b1020", "#24164a", "#ff7a59", "#7a5cff"],
          ["#071a1a", "#0f3b3a", "#2dd4bf", "#3b82f6"],
          ["#1a0d14", "#3b1530", "#ffb347", "#ff4d8d"],
        ];
        const p = pals[variant % 3];
        bg.addColorStop(0, p[0]);
        bg.addColorStop(1, p[1]);
        g.fillStyle = bg;
        g.fillRect(0, 0, w, h);
        const glow = g.createRadialGradient(w * 0.62, h * 0.5, 0, w * 0.62, h * 0.5, m * 0.7);
        glow.addColorStop(0, "rgba(255,255,255,0.18)");
        glow.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = glow;
        g.fillRect(0, 0, w, h);
        phoneShape(g, w * 0.7, h * 0.55, h * 0.95, 0.32, ["#2b2f36", "#555b66"], null);
        phoneShape(g, w * 0.55, h * 0.5, h * 0.95, -0.18, ["#1c1f24", "#3a3f48"], [p[2], p[3]]);
        bigWord(g, "PHONE", w * 0.06, h * 0.58, m * 0.17, "#ffffff");
        g.fillStyle = "rgba(255,255,255,0.6)";
        g.fillRect(w * 0.06, h * 0.64, m * 0.18, Math.max(2, m * 0.012));
        return;
      }
      if (kind === "watch") {
        const bg = g.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0, "#f7f1ea");
        bg.addColorStop(1, "#e6d9cb");
        g.fillStyle = bg;
        g.fillRect(0, 0, w, h);
        const cx = w * 0.66;
        const cy = h * 0.5;
        const s = h * 0.62;
        // strap
        const strap = g.createLinearGradient(cx - s * 0.3, 0, cx + s * 0.3, 0);
        strap.addColorStop(0, "#c46a4a");
        strap.addColorStop(0.5, "#e58a63");
        strap.addColorStop(1, "#b75e40");
        g.fillStyle = strap;
        g.beginPath();
        g.roundRect(cx - s * 0.3, -10, s * 0.6, h + 20, s * 0.08);
        g.fill();
        g.shadowColor = "rgba(0,0,0,0.3)";
        g.shadowBlur = s * 0.1;
        g.fillStyle = "#2b2f36";
        g.beginPath();
        g.roundRect(cx - s * 0.42, cy - s * 0.5, s * 0.84, s, s * 0.22);
        g.fill();
        g.shadowColor = "transparent";
        g.fillStyle = "#050608";
        g.beginPath();
        g.roundRect(cx - s * 0.36, cy - s * 0.44, s * 0.72, s * 0.88, s * 0.17);
        g.fill();
        // rings on the face
        const cols = ["#ff3b6b", "#a6ff3b", "#3be3ff"];
        cols.forEach((c, i) => {
          g.strokeStyle = c;
          g.lineWidth = s * 0.06;
          g.lineCap = "round";
          g.beginPath();
          g.arc(cx, cy, s * (0.28 - i * 0.08), -Math.PI / 2, -Math.PI / 2 + Math.PI * (1.3 + i * 0.25));
          g.stroke();
        });
        g.fillStyle = "#c9ced3";
        g.fillRect(cx + s * 0.42, cy - s * 0.12, s * 0.04, s * 0.14);
        bigWord(g, "WATCH", w * 0.06, h * 0.58, m * 0.17, "#2b2f36");
        return;
      }
      if (kind === "buds") {
        const bg = g.createRadialGradient(w * 0.6, h * 0.5, 0, w * 0.6, h * 0.5, w * 0.7);
        bg.addColorStop(0, "#3a4b6b");
        bg.addColorStop(1, "#0d1220");
        g.fillStyle = bg;
        g.fillRect(0, 0, w, h);
        const cx = w * 0.66;
        const cy = h * 0.52;
        const s = h * 0.7;
        // headphones: a band and two cups
        g.strokeStyle = "#d8dde4";
        g.lineWidth = s * 0.08;
        g.beginPath();
        g.arc(cx, cy, s * 0.42, Math.PI * 1.05, Math.PI * 1.95);
        g.stroke();
        for (const sx of [-1, 1]) {
          const cg = g.createLinearGradient(cx + sx * s * 0.42 - s * 0.14, 0, cx + sx * s * 0.42 + s * 0.14, 0);
          cg.addColorStop(0, "#e8ecf1");
          cg.addColorStop(1, "#9aa3b2");
          g.fillStyle = cg;
          g.beginPath();
          g.roundRect(cx + sx * s * 0.42 - s * 0.14, cy - s * 0.12, s * 0.28, s * 0.4, s * 0.12);
          g.fill();
        }
        // sound rings
        g.strokeStyle = "rgba(160,200,255,0.35)";
        g.lineWidth = 2;
        for (let i = 1; i < 4; i++) {
          g.beginPath();
          g.arc(cx, cy + s * 0.08, s * (0.6 + i * 0.15), -0.5, 0.5);
          g.stroke();
        }
        bigWord(g, "AUDIO", w * 0.06, h * 0.58, m * 0.17, "#ffffff");
        return;
      }
      // laptop
      const bg = g.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, "#efeaf8");
      bg.addColorStop(1, "#d8cdee");
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      const cx = w * 0.62;
      const base = h * 0.82;
      const sw = h * 1.0;
      const sh = sw * 0.62;
      g.shadowColor = "rgba(40,20,80,0.3)";
      g.shadowBlur = sh * 0.12;
      g.fillStyle = "#2a2d33";
      g.beginPath();
      g.roundRect(cx - sw / 2, base - sh, sw, sh, sh * 0.04);
      g.fill();
      g.shadowColor = "transparent";
      const sc = g.createLinearGradient(cx - sw / 2, base - sh, cx + sw / 2, base);
      sc.addColorStop(0, "#5b2bd1");
      sc.addColorStop(0.5, "#b07cf2");
      sc.addColorStop(1, "#ff8fb1");
      g.fillStyle = sc;
      g.fillRect(cx - sw / 2 + sh * 0.04, base - sh + sh * 0.04, sw - sh * 0.08, sh - sh * 0.08);
      g.fillStyle = "#c9ced3";
      g.beginPath();
      g.moveTo(cx - sw * 0.58, base);
      g.lineTo(cx + sw * 0.58, base);
      g.lineTo(cx + sw * 0.55, base + h * 0.04);
      g.lineTo(cx - sw * 0.55, base + h * 0.04);
      g.closePath();
      g.fill();
      bigWord(g, "LAPTOP", w * 0.05, h * 0.5, m * 0.15, "#2a2142");
    }),
  );
}

// Lightbox art, from the reference: big product shots cropped by the frame on
// a white field, no text. "card" is a small framed accessory picture.
export function lightboxArt(kind: "phones" | "laptops" | "card", aspect: number): CanvasTexture {
  const w = 512;
  const h = Math.max(128, Math.min(512, Math.round(w / aspect)));
  return cached(`lb:${kind}:${h}`, () =>
    canvasTexture(w, h, (g) => {
      const bg = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.7);
      bg.addColorStop(0, "#ffffff");
      bg.addColorStop(1, "#eef0f3");
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      if (kind === "card") {
        const cw = h * 0.6;
        const ch = h * 0.75;
        g.fillStyle = "#e3e6ec";
        g.fillRect(w / 2 - cw / 2, h * 0.1, cw, ch);
        const gr = g.createLinearGradient(0, h * 0.1, 0, h * 0.1 + ch);
        gr.addColorStop(0, "#c9d1e3");
        gr.addColorStop(1, "#9ba8c7");
        g.fillStyle = gr;
        g.fillRect(w / 2 - cw / 2 + 6, h * 0.1 + 6, cw - 12, ch * 0.6);
        g.fillStyle = "#4a5266";
        for (let i = 0; i < 3; i++) {
          g.beginPath();
          g.roundRect(w / 2 - cw * 0.32 + i * cw * 0.24, h * 0.1 + ch * 0.72, cw * 0.16, ch * 0.18, 4);
          g.fill();
        }
        drawMark(g, w / 2, h * 0.1 + ch * 0.3, ch * 0.16, "rgba(255,255,255,0.9)");
        return;
      }
      if (kind === "phones") {
        const cols: Array<[string, string]> = [
          ["#1f3b3a", "#6fb6a8"],
          ["#22324a", "#7ea6d8"],
          ["#1f3b3a", "#a6d8c7"],
          ["#2d2a4a", "#b7a6ff"],
        ];
        const n = Math.max(2, Math.round(aspect * 1.6));
        for (let i = 0; i < n; i++) {
          const c = cols[i % cols.length];
          phoneShape(g, w * ((i + 0.6) / n), h * 0.62, h * 1.15, -0.32, [c[0], c[1]], i % 2 ? [c[1], "#ffffff"] : null);
        }
        return;
      }
      // laptops: one open laptop at an angle, its screen glowing
      g.save();
      g.translate(w * 0.5, h * 0.62);
      g.rotate(-0.12);
      const sw = h * 1.1;
      const sh = sw * 0.62;
      g.shadowColor = "rgba(0,0,0,0.3)";
      g.shadowBlur = 20;
      g.fillStyle = "#2a2d33";
      g.beginPath();
      g.roundRect(-sw / 2, -sh, sw, sh, 8);
      g.fill();
      g.shadowColor = "transparent";
      const sc = g.createLinearGradient(-sw / 2, -sh, sw / 2, 0);
      sc.addColorStop(0, "#2a2f52");
      sc.addColorStop(0.6, "#b07cf2");
      sc.addColorStop(1, "#ffd1e8");
      g.fillStyle = sc;
      g.fillRect(-sw / 2 + 8, -sh + 8, sw - 16, sh - 16);
      g.fillStyle = "#c9ced3";
      g.fillRect(-sw * 0.58, 0, sw * 1.16, h * 0.05);
      g.restore();
    }),
  );
}

// ---------------------------------------------------------------- back room
// Painted partition wall, one 1.2 m panel wide, 2.6 m high: mid-grey paint
// with a faint roller texture, a seam at the panel edge, a 120 mm dark
// baseboard and a coloured wayfinding band at 1.0 to 1.15 m.
export const BACK_WALL_H = 2.6;
export function backWallTexture(band: string): CanvasTexture {
  return cached(`bw:${band}`, () =>
    tile(
      canvasTexture(128, 256, (g) => {
        const H = 256;
        const py = (m: number) => Math.round(H * (1 - m / BACK_WALL_H));
        const gr = g.createLinearGradient(0, 0, 0, H);
        gr.addColorStop(0, "#b4b9be");
        gr.addColorStop(1, "#a2a8ae");
        g.fillStyle = gr;
        g.fillRect(0, 0, 128, H);
        const r = rng(5);
        for (let i = 0; i < 900; i++) {
          g.fillStyle = `rgba(${r() > 0.5 ? "255,255,255" : "60,64,70"},${0.03 + r() * 0.04})`;
          g.fillRect(r() * 128, r() * H, 2, 1);
        }
        g.fillStyle = band;
        g.fillRect(0, py(1.15), 128, py(1.0) - py(1.15));
        g.fillStyle = "rgba(255,255,255,0.25)";
        g.fillRect(0, py(1.15), 128, 1);
        g.fillStyle = "#3a3f45";
        g.fillRect(0, py(0.12), 128, H - py(0.12));
        g.fillStyle = "rgba(255,255,255,0.2)";
        g.fillRect(0, py(0.12), 128, 1);
        g.fillStyle = "rgba(50,54,60,0.6)";
        g.fillRect(0, 0, 2, py(0.12));
        g.fillStyle = "rgba(255,255,255,0.35)";
        g.fillRect(2, 0, 1, py(0.12));
      }),
    ),
  );
}

// Sealed concrete: darker than the walls, mottled, with saw-cut joints every
// 3 m (one texture repeat).
export function concreteTexture(): CanvasTexture {
  return cached("concrete", () =>
    tile(
      canvasTexture(256, 256, (g) => {
        g.fillStyle = "#7f8488";
        g.fillRect(0, 0, 256, 256);
        const r = rng(9);
        for (let i = 0; i < 70; i++) {
          g.fillStyle = `rgba(${r() > 0.5 ? "200,204,208" : "50,54,58"},${0.04 + r() * 0.06})`;
          g.beginPath();
          g.ellipse(r() * 256, r() * 256, 10 + r() * 50, 6 + r() * 30, r() * 3, 0, Math.PI * 2);
          g.fill();
        }
        for (let i = 0; i < 1500; i++) {
          g.fillStyle = `rgba(${r() > 0.5 ? "230,230,230" : "40,40,40"},${0.08 + r() * 0.1})`;
          g.fillRect(r() * 256, r() * 256, 1, 1);
        }
        g.fillStyle = "#4e5357";
        g.fillRect(0, 0, 256, 2);
        g.fillRect(0, 0, 2, 256);
      }),
    ),
  );
}

// A suspended ceiling: 600 mm tiles in a white grid (one repeat is 1.2 m).
export function ceilingTileTexture(): CanvasTexture {
  return cached("ctile", () =>
    tile(
      canvasTexture(128, 128, (g) => {
        g.fillStyle = "#e9ebed";
        g.fillRect(0, 0, 128, 128);
        const r = rng(4);
        for (let i = 0; i < 500; i++) {
          g.fillStyle = `rgba(120,124,130,${0.05 + r() * 0.08})`;
          g.fillRect(r() * 128, r() * 128, 1, 1);
        }
        g.fillStyle = "#c3c7cc";
        for (const p of [0, 64]) {
          g.fillRect(p, 0, 3, 128);
          g.fillRect(0, p, 128, 3);
        }
      }),
    ),
  );
}

// Yellow and black safety hatching.
export function hatchTexture(): CanvasTexture {
  return cached("hatch", () =>
    tile(
      canvasTexture(64, 64, (g) => {
        g.fillStyle = "#1d1f22";
        g.fillRect(0, 0, 64, 64);
        g.fillStyle = "#f2c230";
        for (let i = -64; i < 128; i += 32) {
          g.beginPath();
          g.moveTo(i, 64);
          g.lineTo(i + 16, 64);
          g.lineTo(i + 80, 0);
          g.lineTo(i + 64, 0);
          g.closePath();
          g.fill();
        }
      }),
    ),
  );
}

// A back-room area sign: dark plate, a coloured block with an arrow, the name.
export function areaSignTexture(text: string, colour: string): CanvasTexture {
  return cached(`as:${text}:${colour}`, () =>
    canvasTexture(512, 128, (g) => {
      g.fillStyle = "#1f2731";
      g.fillRect(0, 0, 512, 128);
      g.fillStyle = colour;
      g.fillRect(0, 0, 96, 128);
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.moveTo(30, 40);
      g.lineTo(62, 64);
      g.lineTo(30, 88);
      g.closePath();
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.15)";
      g.fillRect(96, 0, 2, 128);
      g.fillStyle = "#ffffff";
      let size = 52;
      g.font = `700 ${size}px "Helvetica Neue", system-ui, sans-serif`;
      while (g.measureText(text).width > 390 && size > 24) {
        size -= 2;
        g.font = `700 ${size}px "Helvetica Neue", system-ui, sans-serif`;
      }
      g.textBaseline = "middle";
      g.fillText(text, 116, 66);
    }),
  );
}

// The roller door: horizontal ribs, a strip of small vision slots at about
// 1.5 m, a heavy bottom rail.
export function rollerDoorTexture(): CanvasTexture {
  return cached("roller", () =>
    canvasTexture(256, 256, (g) => {
      g.fillStyle = "#b9bfc5";
      g.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 256; y += 8) {
        g.fillStyle = "#8e959d";
        g.fillRect(0, y, 256, 2);
        g.fillStyle = "#d6dadf";
        g.fillRect(0, y + 2, 256, 1);
      }
      // vision strip: 1.45 to 1.6 m of 2.6 m
      const y0 = Math.round(256 * (1 - 1.6 / 2.6));
      for (let x = 10; x < 250; x += 30) {
        g.fillStyle = "#2b3640";
        g.fillRect(x, y0, 20, 10);
        g.fillStyle = "rgba(170,210,240,0.5)";
        g.fillRect(x + 2, y0 + 2, 6, 3);
      }
      g.fillStyle = "#5b6168";
      g.fillRect(0, 246, 256, 10);
    }),
  );
}
