import { drawLogo } from "./logo.ts";
import { CanvasTexture, RepeatWrapping } from "three";
import { canvasTexture } from "./common.tsx";

// Original packaging art for the boxes on the bay shelves. Everything is drawn
// here: an invented ring-and-dot brand mark (an eye, for "someone's always
// watching"), generic product words, simple product drawings. No real names
// or marks. Sizes are in metres, as the box stands facing out (w along the
// shelf, h up, d into the wall); they are estimates, see
// references/products-phones.md.

type G = CanvasRenderingContext2D;
type Hero = (g: G, cx: number, cy: number, s: number, accent: string, ink: string) => void;

export interface BoxDesign {
  id: string;
  w: number;
  h: number;
  d: number;
  name: string; // generic words only
  sub: string;
  chips: string[];
  bg: string; // front background
  side: string; // side panels and top
  ink: string; // text
  accent: string;
  hero: Hero;
  // tinted designs are drawn light and take their colour from the instance
  // (so one design gives a whole run of case or band colours)
  tint?: boolean;
  // art that fills the front edge to edge (a colour block) instead of a white box
  block?: boolean;
}

// The brand mark (logo.ts): the store's bracket-and-square, `r` is its half height.
export function brandMark(g: G, x: number, y: number, r: number, colour: string): void {
  drawLogo(g, x, y, r * 2, colour);
}

function rr(g: G, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

function soft(g: G, cx: number, cy: number, r: number, colour: string, a = 0.35): void {
  const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, colour);
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.globalAlpha = a;
  g.fillStyle = grad;
  g.fillRect(cx - r, cy - r, r * 2, r * 2);
  g.globalAlpha = 1;
}

// White plastic shading: a vertical gradient so drawn products read as objects
function whiteFill(g: G, y0: number, y1: number): CanvasGradient {
  const grad = g.createLinearGradient(0, y0, 0, y1);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(1, "#d9dce1");
  return grad;
}

// ---- product drawings (centre cx, cy; s is the drawing's size in px) ----

const buds: Hero = (g, cx, cy, s) => {
  // open case seen from the front, two buds standing in it
  const w = s * 0.78;
  const h = s * 0.5;
  g.fillStyle = whiteFill(g, cy, cy + h);
  rr(g, cx - w / 2, cy - h * 0.05, w, h, h * 0.42);
  g.fill();
  g.strokeStyle = "rgba(0,0,0,0.12)";
  g.lineWidth = 1;
  g.stroke();
  // lid open behind
  g.fillStyle = whiteFill(g, cy - h * 0.7, cy);
  rr(g, cx - w / 2, cy - h * 0.62, w, h * 0.5, h * 0.3);
  g.fill();
  g.stroke();
  for (const sx of [-1, 1]) {
    const bx = cx + sx * w * 0.2;
    g.fillStyle = "#fafafa";
    g.beginPath();
    g.ellipse(bx, cy - h * 0.02, s * 0.085, s * 0.075, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = "#3a3f47";
    g.beginPath();
    g.arc(bx + sx * s * 0.02, cy - h * 0.04, s * 0.025, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = "#4ade80";
  g.beginPath();
  g.arc(cx, cy + h * 0.55, s * 0.012, 0, Math.PI * 2);
  g.fill();
};

const headphones: Hero = (g, cx, cy, s, accent) => {
  g.strokeStyle = accent;
  g.lineWidth = s * 0.07;
  g.lineCap = "round";
  g.beginPath();
  g.arc(cx, cy, s * 0.34, Math.PI * 1.05, Math.PI * 1.95);
  g.stroke();
  g.strokeStyle = "rgba(0,0,0,0.25)";
  g.lineWidth = s * 0.02;
  g.beginPath();
  g.arc(cx, cy + s * 0.03, s * 0.3, Math.PI * 1.1, Math.PI * 1.9);
  g.stroke();
  for (const sx of [-1, 1]) {
    const x = cx + sx * s * 0.33;
    const grad = g.createLinearGradient(x - s * 0.1, 0, x + s * 0.1, 0);
    grad.addColorStop(0, accent);
    grad.addColorStop(sx < 0 ? 1 : 0, "#ffffff");
    g.fillStyle = grad;
    rr(g, x - s * 0.1, cy - s * 0.02, s * 0.2, s * 0.32, s * 0.09);
    g.fill();
    g.fillStyle = "rgba(0,0,0,0.25)";
    rr(g, x - sx * s * 0.07 - s * 0.03, cy + s * 0.02, s * 0.06, s * 0.24, s * 0.03);
    g.fill();
  }
};

const speaker: Hero = (g, cx, cy, s, accent) => {
  const r = s * 0.36;
  const grad = g.createRadialGradient(cx - r * 0.3, cy - r * 0.4, r * 0.1, cx, cy, r);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(1, accent);
  g.fillStyle = grad;
  g.beginPath();
  g.ellipse(cx, cy, r, r * 0.86, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "rgba(0,0,0,0.12)";
  for (let y = -r; y < r; y += s * 0.035) {
    for (let x = -r; x < r; x += s * 0.035) {
      if ((x * x) / (r * r) + (y * y) / (r * r * 0.74) < 0.9) g.fillRect(cx + x, cy + y, 1.2, 1.2);
    }
  }
  // the glowing touch top
  const top = g.createRadialGradient(cx, cy - r * 0.78, 1, cx, cy - r * 0.78, r * 0.55);
  top.addColorStop(0, "#ffffff");
  top.addColorStop(0.5, "#a78bfa");
  top.addColorStop(1, "rgba(96,165,250,0)");
  g.fillStyle = top;
  g.beginPath();
  g.ellipse(cx, cy - r * 0.78, r * 0.55, r * 0.14, 0, 0, Math.PI * 2);
  g.fill();
};

const puck: Hero = (g, cx, cy, s, accent) => {
  g.strokeStyle = "#e5e7eb";
  g.lineWidth = s * 0.03;
  g.beginPath();
  g.moveTo(cx, cy + s * 0.2);
  g.bezierCurveTo(cx + s * 0.1, cy + s * 0.45, cx + s * 0.4, cy + s * 0.2, cx + s * 0.45, cy + s * 0.45);
  g.stroke();
  const r = s * 0.27;
  g.fillStyle = whiteFill(g, cy - r, cy + r);
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#c7cbd1";
  g.lineWidth = s * 0.02;
  g.stroke();
  g.strokeStyle = accent;
  g.lineWidth = s * 0.012;
  g.beginPath();
  g.arc(cx, cy, r * 0.62, 0, Math.PI * 2);
  g.stroke();
  brandMark(g, cx, cy, r * 0.2, "#9aa1a8");
};

const cable: Hero = (g, cx, cy, s, accent) => {
  g.strokeStyle = "#f8fafc";
  g.lineWidth = s * 0.035;
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.ellipse(cx + (i - 1.5) * s * 0.03, cy + (i - 1.5) * s * 0.02, s * 0.3, s * 0.2, -0.2, 0, Math.PI * 2);
    g.stroke();
  }
  g.strokeStyle = "rgba(0,0,0,0.12)";
  g.lineWidth = 1;
  g.beginPath();
  g.ellipse(cx, cy, s * 0.3, s * 0.2, -0.2, 0, Math.PI * 2);
  g.stroke();
  for (const [x, y] of [
    [cx - s * 0.36, cy - s * 0.3],
    [cx + s * 0.26, cy + s * 0.22],
  ]) {
    g.fillStyle = "#ffffff";
    rr(g, x, y, s * 0.12, s * 0.07, s * 0.02);
    g.fill();
    g.fillStyle = accent;
    rr(g, x + s * 0.11, y + s * 0.02, s * 0.05, s * 0.03, s * 0.01);
    g.fill();
  }
};

const plug: Hero = (g, cx, cy, s) => {
  const w = s * 0.46;
  g.fillStyle = whiteFill(g, cy - w / 2, cy + w / 2);
  rr(g, cx - w / 2, cy - w / 2, w, w, w * 0.18);
  g.fill();
  g.strokeStyle = "rgba(0,0,0,0.14)";
  g.lineWidth = 1;
  g.stroke();
  g.fillStyle = "#b8bec6";
  for (const sx of [-1, 1]) {
    g.save();
    g.translate(cx + sx * w * 0.18, cy - w * 0.62);
    g.rotate(sx * 0.5);
    g.fillRect(-s * 0.02, 0, s * 0.04, s * 0.13);
    g.restore();
  }
  g.fillStyle = "#3a3f47";
  rr(g, cx - s * 0.06, cy + w * 0.1, s * 0.12, s * 0.04, s * 0.015);
  g.fill();
};

const bank: Hero = (g, cx, cy, s, accent) => {
  g.save();
  g.translate(cx, cy);
  g.rotate(-0.25);
  const w = s * 0.42;
  const h = s * 0.66;
  const grad = g.createLinearGradient(-w / 2, 0, w / 2, 0);
  grad.addColorStop(0, accent);
  grad.addColorStop(1, "#ffffff");
  g.fillStyle = grad;
  rr(g, -w / 2, -h / 2, w, h, w * 0.2);
  g.fill();
  for (let i = 0; i < 4; i++) {
    g.fillStyle = i < 3 ? "#4ade80" : "rgba(0,0,0,0.2)";
    g.beginPath();
    g.arc(-w * 0.24 + i * w * 0.16, h * 0.36, s * 0.014, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
};

const phoneCase: Hero = (g, cx, cy, s, accent) => {
  // a phone in its case, from the back, slightly turned
  const w = s * 0.44;
  const h = s * 0.9;
  g.save();
  g.translate(cx, cy);
  g.rotate(0.12);
  g.fillStyle = "rgba(0,0,0,0.15)";
  rr(g, -w / 2 + 4, -h / 2 + 6, w, h, w * 0.2);
  g.fill();
  const grad = g.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.5, accent);
  grad.addColorStop(1, accent);
  g.fillStyle = grad;
  rr(g, -w / 2, -h / 2, w, h, w * 0.2);
  g.fill();
  g.fillStyle = "rgba(20,24,30,0.85)";
  rr(g, -w * 0.38, -h * 0.44, w * 0.42, w * 0.42, w * 0.1);
  g.fill();
  g.fillStyle = "#0b0d10";
  for (const [x, y] of [
    [-0.27, -0.36],
    [-0.08, -0.29],
    [-0.27, -0.22],
  ]) {
    g.beginPath();
    g.arc(w * x + w * 0.1, h * y + w * 0.02, w * 0.075, 0, Math.PI * 2);
    g.fill();
  }
  brandMark(g, 0, h * 0.05, w * 0.1, "rgba(255,255,255,0.7)");
  g.restore();
};

const band: Hero = (g, cx, cy, s, accent) => {
  const w = s * 0.22;
  const h = s * 0.95;
  const grad = g.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
  grad.addColorStop(0, accent);
  grad.addColorStop(0.5, "#ffffff");
  grad.addColorStop(1, accent);
  g.fillStyle = grad;
  rr(g, cx - w / 2, cy - h / 2, w, h, w / 2);
  g.fill();
  g.fillStyle = "rgba(0,0,0,0.25)";
  for (let i = 0; i < 7; i++) {
    g.beginPath();
    g.arc(cx, cy + h * 0.1 + i * h * 0.05, w * 0.08, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = "#c9ced3";
  rr(g, cx - w * 0.62, cy - h * 0.12, w * 1.24, h * 0.06, w * 0.1);
  g.fill();
};

const keyboard: Hero = (g, cx, cy, s, accent) => {
  const w = s * 1.7;
  const h = s * 0.5;
  g.fillStyle = "rgba(0,0,0,0.12)";
  rr(g, cx - w / 2 + 3, cy - h / 2 + 5, w, h, h * 0.12);
  g.fill();
  g.fillStyle = whiteFill(g, cy - h / 2, cy + h / 2);
  rr(g, cx - w / 2, cy - h / 2, w, h, h * 0.12);
  g.fill();
  const cols = 14;
  const kw = (w * 0.92) / cols;
  for (let r = 0; r < 5; r++) {
    for (let k = 0; k < cols; k++) {
      if (r === 4 && k > 3 && k < 10) continue;
      g.fillStyle = r === 0 ? "#e5e7eb" : "#f9fafb";
      rr(g, cx - w * 0.46 + k * kw + 1, cy - h * 0.42 + r * h * 0.17, kw - 2, h * 0.14, 2);
      g.fill();
      g.strokeStyle = "rgba(0,0,0,0.1)";
      g.lineWidth = 0.6;
      g.stroke();
    }
  }
  g.fillStyle = "#f9fafb";
  rr(g, cx - w * 0.46 + 4 * kw + 1, cy - h * 0.42 + 4 * h * 0.17, kw * 6 - 2, h * 0.14, 2);
  g.fill();
  g.fillStyle = accent;
  g.fillRect(cx - w / 2, cy + h / 2 - 2, w, 2);
};

const trackpad: Hero = (g, cx, cy, s) => {
  const w = s * 0.76;
  const h = s * 0.62;
  g.fillStyle = "rgba(0,0,0,0.12)";
  rr(g, cx - w / 2 + 4, cy - h / 2 + 6, w, h, s * 0.06);
  g.fill();
  const grad = g.createLinearGradient(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.6, "#e7e9ec");
  grad.addColorStop(1, "#cfd3d8");
  g.fillStyle = grad;
  rr(g, cx - w / 2, cy - h / 2, w, h, s * 0.06);
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.7)";
  g.beginPath();
  g.moveTo(cx - w * 0.4, cy - h / 2);
  g.lineTo(cx - w * 0.15, cy - h / 2);
  g.lineTo(cx - w * 0.45, cy + h / 2);
  g.lineTo(cx - w * 0.5, cy + h * 0.3);
  g.fill();
};

const homeSpeaker: Hero = (g, cx, cy, s, accent) => {
  const w = s * 0.5;
  const h = s * 0.74;
  const grad = g.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
  grad.addColorStop(0, "#9ca3af");
  grad.addColorStop(0.35, "#f3f4f6");
  grad.addColorStop(1, "#6b7280");
  g.fillStyle = grad;
  rr(g, cx - w / 2, cy - h / 2, w, h, w * 0.45);
  g.fill();
  g.fillStyle = "rgba(0,0,0,0.12)";
  for (let y = -h * 0.4; y < h * 0.45; y += s * 0.03) {
    for (let x = -w * 0.42; x < w * 0.42; x += s * 0.03) g.fillRect(cx + x, cy + y, 1.2, 1.2);
  }
  const glow = g.createRadialGradient(cx, cy - h * 0.46, 1, cx, cy - h * 0.46, w * 0.4);
  glow.addColorStop(0, "#ffffff");
  glow.addColorStop(0.5, accent);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = glow;
  g.beginPath();
  g.ellipse(cx, cy - h * 0.46, w * 0.38, w * 0.08, 0, 0, Math.PI * 2);
  g.fill();
};

const camera: Hero = (g, cx, cy, s, accent) => {
  g.fillStyle = "#e5e7eb";
  rr(g, cx - s * 0.04, cy + s * 0.1, s * 0.08, s * 0.25, s * 0.03);
  g.fill();
  g.fillStyle = whiteFill(g, cy + s * 0.32, cy + s * 0.42);
  g.beginPath();
  g.ellipse(cx, cy + s * 0.36, s * 0.2, s * 0.05, 0, 0, Math.PI * 2);
  g.fill();
  const r = s * 0.24;
  g.fillStyle = whiteFill(g, cy - r * 1.8, cy);
  g.beginPath();
  g.arc(cx, cy - s * 0.1, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "rgba(0,0,0,0.15)";
  g.lineWidth = 1;
  g.stroke();
  g.fillStyle = "#111318";
  g.beginPath();
  g.arc(cx, cy - s * 0.1, r * 0.62, 0, Math.PI * 2);
  g.fill();
  const lens = g.createRadialGradient(cx - r * 0.15, cy - s * 0.1 - r * 0.15, 1, cx, cy - s * 0.1, r * 0.4);
  lens.addColorStop(0, accent);
  lens.addColorStop(1, "#05070a");
  g.fillStyle = lens;
  g.beginPath();
  g.arc(cx, cy - s * 0.1, r * 0.34, 0, Math.PI * 2);
  g.fill();
};

const tracker: Hero = (g, cx, cy, s) => {
  for (let i = 0; i < 4; i++) {
    const x = cx + ((i % 2) - 0.5) * s * 0.38;
    const y = cy + (Math.floor(i / 2) - 0.5) * s * 0.38;
    const r = s * 0.15;
    g.fillStyle = "rgba(0,0,0,0.12)";
    g.beginPath();
    g.arc(x + 2, y + 3, r, 0, Math.PI * 2);
    g.fill();
    const grad = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(1, "#d6d9de");
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    brandMark(g, x, y, r * 0.3, "#b6bcc4");
  }
};

const bulb: Hero = (g, cx, cy, s, accent) => {
  soft(g, cx, cy - s * 0.1, s * 0.45, accent, 0.6);
  g.fillStyle = "#fffdf5";
  g.beginPath();
  g.arc(cx, cy - s * 0.12, s * 0.22, Math.PI * 0.8, Math.PI * 2.2);
  g.lineTo(cx + s * 0.09, cy + s * 0.2);
  g.lineTo(cx - s * 0.09, cy + s * 0.2);
  g.closePath();
  g.fill();
  g.fillStyle = "#b8bec6";
  for (let i = 0; i < 3; i++) g.fillRect(cx - s * 0.09, cy + s * 0.2 + i * s * 0.05, s * 0.18, s * 0.035);
};

// ---- the library ----

export const BOX_DESIGNS: BoxDesign[] = [
  { id: "buds", w: 0.11, h: 0.11, d: 0.05, name: "BUDS", sub: "Wireless earphones", chips: ["ANC", "30H"], bg: "#ffffff", side: "#f4f5f7", ink: "#111827", accent: "#94a3b8", hero: buds },
  { id: "budsLite", w: 0.1, h: 0.1, d: 0.045, name: "BUDS lite", sub: "Everyday earphones", chips: ["24H"], bg: "#2dd4bf", side: "#14b8a6", ink: "#062925", accent: "#0f766e", hero: buds, block: true },
  { id: "cans", w: 0.2, h: 0.23, d: 0.1, name: "OVER", sub: "Over-ear headphones", chips: ["ANC", "40H", "SPATIAL"], bg: "#1f2937", side: "#111827", ink: "#f9fafb", accent: "#e8a98c", hero: headphones, block: true },
  { id: "dot", w: 0.12, h: 0.12, d: 0.12, name: "DOT", sub: "Room speaker", chips: ["360"], bg: "#f6f6f4", side: "#f6f6f4", ink: "#1f2937", accent: "#f59e0b", hero: speaker, tint: true },
  { id: "puck", w: 0.1, h: 0.1, d: 0.035, name: "CHARGE PUCK", sub: "Magnetic charger", chips: ["15W"], bg: "#ffffff", side: "#f4f5f7", ink: "#111827", accent: "#60a5fa", hero: puck },
  { id: "cable", w: 0.08, h: 0.11, d: 0.03, name: "CABLE", sub: "Woven, 1 m", chips: ["USB-C", "1M"], bg: "#ffffff", side: "#f4f5f7", ink: "#111827", accent: "#a78bfa", hero: cable },
  { id: "plug", w: 0.07, h: 0.09, d: 0.045, name: "PLUG", sub: "Wall adapter", chips: ["20W"], bg: "#ffffff", side: "#eef0f3", ink: "#111827", accent: "#22c55e", hero: plug },
  { id: "bank", w: 0.085, h: 0.14, d: 0.03, name: "POWER", sub: "Battery pack", chips: ["5000"], bg: "#f6f6f4", side: "#f6f6f4", ink: "#111827", accent: "#9ca3af", hero: bank, tint: true },
  { id: "case", w: 0.095, h: 0.185, d: 0.028, name: "CASE", sub: "Soft-touch shell", chips: ["MAG", "6.1"], bg: "#f7f7f5", side: "#f7f7f5", ink: "#111827", accent: "#9ca3af", hero: phoneCase, tint: true },
  { id: "band", w: 0.055, h: 0.17, d: 0.03, name: "BAND", sub: "Sport loop", chips: ["45"], bg: "#f7f7f5", side: "#f7f7f5", ink: "#111827", accent: "#9ca3af", hero: band, tint: true },
  { id: "keys", w: 0.3, h: 0.115, d: 0.035, name: "KEYS", sub: "Wireless keyboard", chips: ["BT", "USB-C"], bg: "#ffffff", side: "#f4f5f7", ink: "#111827", accent: "#64748b", hero: keyboard },
  { id: "pad", w: 0.17, h: 0.17, d: 0.03, name: "PAD", sub: "Multi-touch surface", chips: ["FORCE"], bg: "#ffffff", side: "#f4f5f7", ink: "#111827", accent: "#64748b", hero: trackpad },
  { id: "home", w: 0.13, h: 0.14, d: 0.13, name: "HOME", sub: "Smart speaker", chips: ["VOICE", "HUB"], bg: "#312e81", side: "#1e1b4b", ink: "#eef2ff", accent: "#818cf8", hero: homeSpeaker, block: true },
  { id: "cam", w: 0.09, h: 0.15, d: 0.09, name: "LOOK", sub: "Indoor camera", chips: ["2K", "NIGHT"], bg: "#ffffff", side: "#f4f5f7", ink: "#111827", accent: "#38bdf8", hero: camera },
  { id: "tags", w: 0.12, h: 0.12, d: 0.035, name: "FIND x4", sub: "Item trackers", chips: ["4 PACK"], bg: "#fef3c7", side: "#fde68a", ink: "#3b2f05", accent: "#f59e0b", hero: tracker, block: true },
  { id: "bulb", w: 0.075, h: 0.13, d: 0.075, name: "GLOW", sub: "Smart bulb", chips: ["E27"], bg: "#ffffff", side: "#f4f5f7", ink: "#111827", accent: "#fbbf24", hero: bulb },
];

export const DESIGN = Object.fromEntries(BOX_DESIGNS.map((d) => [d.id, d])) as Record<string, BoxDesign>;

// The texture of one design is an atlas: the front art on the left, then a
// side panel, then a plain strip for the top. `regions` gives each part's
// u range, for the box UVs.
export interface BoxArt {
  tex: CanvasTexture;
  front: [number, number];
  side: [number, number];
  top: [number, number];
}

const artCache = new Map<string, BoxArt>();

export function boxArt(d: BoxDesign): BoxArt {
  const hit = artCache.get(d.id);
  if (hit) return hit;
  const scale = Math.min(256 / d.h, 320 / d.w);
  const fw = Math.round(d.w * scale);
  const fh = Math.round(d.h * scale);
  const sw = Math.max(24, Math.min(64, Math.round(d.d * scale)));
  const tw = 16;
  const W = fw + sw + tw;
  const tex = canvasTexture(W, fh, (g) => {
    // ---- front ----
    g.fillStyle = d.bg;
    g.fillRect(0, 0, fw, fh);
    const u = Math.min(fw, fh); // the art's unit
    if (d.block) {
      // colour block: a soft light pool behind the hero
      soft(g, fw / 2, fh * 0.45, u * 0.6, "#ffffff", 0.35);
    } else {
      soft(g, fw / 2, fh * 0.5, u * 0.55, d.accent, 0.18);
    }
    const heroS = Math.min(fw * 0.82, fh * 0.6);
    d.hero(g, fw / 2, fh * 0.48, heroS, d.accent, d.ink);
    // brand mark top left, product name and line at the bottom
    const m = Math.max(6, u * 0.07);
    brandMark(g, m + u * 0.045, m + u * 0.045, u * 0.045, d.ink);
    g.fillStyle = d.ink;
    g.textBaseline = "alphabetic";
    g.textAlign = "left";
    const nameSize = Math.max(9, Math.min(fh * 0.1, (fw - 2 * m) / (d.name.length * 0.62)));
    g.font = `700 ${nameSize}px system-ui, -apple-system, Helvetica, sans-serif`;
    g.fillText(d.name, m, fh - m - nameSize * 0.75);
    g.globalAlpha = 0.7;
    const subSize = Math.max(7, nameSize * 0.42);
    g.font = `500 ${subSize}px system-ui, sans-serif`;
    g.fillText(d.sub, m, fh - m * 0.8, fw - 2 * m);
    g.globalAlpha = 1;
    // spec chips, top right
    const chipSize = Math.max(7, u * 0.06);
    g.font = `700 ${chipSize}px system-ui, sans-serif`;
    let cx = fw - m;
    for (const c of d.chips) {
      const tw2 = g.measureText(c).width + chipSize * 0.9;
      if (cx - tw2 < fw * 0.3) break;
      cx -= tw2;
      g.strokeStyle = d.ink;
      g.globalAlpha = 0.55;
      g.lineWidth = 1;
      rr(g, cx, m * 0.6, tw2, chipSize * 1.5, chipSize * 0.75);
      g.stroke();
      g.globalAlpha = 0.8;
      g.textAlign = "center";
      g.fillText(c, cx + tw2 / 2, m * 0.6 + chipSize * 1.13);
      g.textAlign = "left";
      g.globalAlpha = 1;
      cx -= chipSize * 0.4;
    }
    // a thin shrink-wrap highlight across the top of the front
    const sheen = g.createLinearGradient(0, 0, fw, fh);
    sheen.addColorStop(0, "rgba(255,255,255,0.18)");
    sheen.addColorStop(0.35, "rgba(255,255,255,0)");
    g.fillStyle = sheen;
    g.fillRect(0, 0, fw, fh);
    // ---- side ----
    g.fillStyle = d.side;
    g.fillRect(fw, 0, sw, fh);
    g.fillStyle = d.accent;
    g.fillRect(fw, fh * 0.86, sw, fh * 0.04);
    brandMark(g, fw + sw / 2, fh * 0.12, Math.min(sw * 0.2, fh * 0.04), d.ink);
    g.fillStyle = d.ink;
    g.globalAlpha = 0.6;
    for (let i = 0; i < 3; i++) g.fillRect(fw + sw * 0.25, fh * (0.6 + i * 0.05), sw * (0.5 - i * 0.1), Math.max(1, fh * 0.012));
    g.globalAlpha = 1;
    // edge shading where the faces meet, so the box corners read
    g.fillStyle = "rgba(0,0,0,0.08)";
    g.fillRect(fw, 0, 2, fh);
    g.fillRect(fw + sw - 2, 0, 2, fh);
    // ---- top ----
    g.fillStyle = d.side;
    g.fillRect(fw + sw, 0, tw, fh);
  });
  tex.anisotropy = 4;
  const art: BoxArt = {
    tex,
    front: [0, fw / W],
    side: [fw / W, (fw + sw) / W],
    top: [(fw + sw) / W, 1],
  };
  artCache.set(d.id, art);
  return art;
}

// ---- device screens ----

const WALLS: Array<[string, string, string]> = [
  ["#ff7a59", "#7a5cff", "#ffe29a"],
  ["#0ea5e9", "#1e3a8a", "#a5f3fc"],
  ["#f6d365", "#fd6585", "#fff3d6"],
  ["#a18cd1", "#3b2667", "#fbc2eb"],
  ["#34d399", "#065f46", "#d9f99d"],
];

function wallpaper(g: G, W: number, H: number, v: number): void {
  const [a, b, c] = WALLS[v % WALLS.length];
  const grad = g.createLinearGradient(0, 0, W * 0.3, H);
  grad.addColorStop(0, a);
  grad.addColorStop(1, b);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // flowing bands of light
  for (let i = 0; i < 3; i++) {
    g.globalAlpha = 0.22 - i * 0.05;
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(0, H * (0.45 + i * 0.12));
    g.bezierCurveTo(W * 0.4, H * (0.3 + i * 0.1), W * 0.6, H * (0.75 + i * 0.05), W, H * (0.5 + i * 0.12));
    g.lineTo(W, H);
    g.lineTo(0, H);
    g.fill();
  }
  g.globalAlpha = 1;
  soft(g, W * 0.75, H * 0.2, W * 0.6, c, 0.35);
}

const screenCache = new Map<string, CanvasTexture>();

// A phone screen: a lock screen (clock, date, two widgets, bottom buttons) or
// a home screen (widget, app grid, dock). Portrait 128 x 256.
export function phoneScreen(v: number, lock: boolean): CanvasTexture {
  const key = `phone:${v}:${lock}`;
  const hit = screenCache.get(key);
  if (hit) return hit;
  const W = 128;
  const H = 256;
  const tex = canvasTexture(W, H, (g) => {
    wallpaper(g, W, H, v);
    // camera cut-out pill at the top
    g.fillStyle = "#000";
    rr(g, W / 2 - 16, 6, 32, 9, 4.5);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.9)";
    g.font = "600 7px system-ui, sans-serif";
    g.textAlign = "left";
    g.fillText("11:24", 10, 13);
    g.fillRect(W - 24, 8, 12, 5);
    if (lock) {
      g.textAlign = "center";
      g.font = "500 9px system-ui, sans-serif";
      g.fillText("Sunday 11 October", W / 2, 40);
      g.font = "700 44px system-ui, -apple-system, sans-serif";
      g.fillText("11:24", W / 2, 82);
      // two round widgets
      for (const x of [W / 2 - 18, W / 2 + 18]) {
        g.fillStyle = "rgba(255,255,255,0.25)";
        g.beginPath();
        g.arc(x, 104, 12, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "rgba(255,255,255,0.9)";
        g.lineWidth = 2.5;
        g.beginPath();
        g.arc(x, 104, 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * (x < W / 2 ? 1.4 : 0.8));
        g.stroke();
      }
      for (const x of [22, W - 22]) {
        g.fillStyle = "rgba(0,0,0,0.3)";
        g.beginPath();
        g.arc(x, H - 26, 10, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = "rgba(255,255,255,0.85)";
      rr(g, W / 2 - 22, H - 8, 44, 3, 1.5);
      g.fill();
    } else {
      // a wide weather widget, then the app grid, then the dock
      g.fillStyle = "rgba(255,255,255,0.28)";
      rr(g, 9, 24, W - 18, 44, 10);
      g.fill();
      g.fillStyle = "#fff";
      g.font = "700 18px system-ui, sans-serif";
      g.fillText("18°", 18, 52);
      g.fillStyle = "#fde68a";
      g.beginPath();
      g.arc(W - 30, 44, 9, 0, Math.PI * 2);
      g.fill();
      const tw = 22;
      for (let r = 0; r < 4; r++) {
        for (let k = 0; k < 4; k++) {
          const x = 12 + k * 28;
          const y = 80 + r * 32;
          const grad = g.createLinearGradient(x, y, x, y + tw);
          const hue = (v * 70 + r * 47 + k * 83) % 360;
          grad.addColorStop(0, `hsl(${hue},75%,66%)`);
          grad.addColorStop(1, `hsl(${(hue + 20) % 360},70%,48%)`);
          g.fillStyle = grad;
          rr(g, x, y, tw, tw, 6);
          g.fill();
          g.fillStyle = "rgba(255,255,255,0.85)";
          g.beginPath();
          g.arc(x + tw / 2, y + tw / 2, 4 + ((r + k) % 3), 0, Math.PI * 2);
          g.fill();
        }
      }
      g.fillStyle = "rgba(255,255,255,0.3)";
      rr(g, 7, H - 40, W - 14, 32, 12);
      g.fill();
      for (let k = 0; k < 4; k++) {
        g.fillStyle = ["#34d399", "#60a5fa", "#f472b6", "#fbbf24"][k];
        rr(g, 14 + k * 27, H - 35, 21, 21, 6);
        g.fill();
      }
    }
  });
  screenCache.set(key, tex);
  return tex;
}

// A watch face: black, a ring of minute marks, hands, and three complications
// (activity rings, a date, a small temperature arc). Square 128.
export function watchScreen(v: number): CanvasTexture {
  const key = `watch:${v}`;
  const hit = screenCache.get(key);
  if (hit) return hit;
  const S = 128;
  const tex = canvasTexture(S, S, (g) => {
    g.fillStyle = "#000";
    g.fillRect(0, 0, S, S);
    const c = S / 2;
    const accent = ["#f97316", "#38bdf8", "#facc15", "#a78bfa", "#4ade80"][v % 5];
    g.strokeStyle = "#e5e7eb";
    for (let i = 0; i < 60; i++) {
      const t = (i * Math.PI) / 30;
      const r0 = i % 5 === 0 ? 46 : 50;
      g.lineWidth = i % 5 === 0 ? 3 : 1;
      g.beginPath();
      g.moveTo(c + Math.cos(t) * r0, c + Math.sin(t) * r0);
      g.lineTo(c + Math.cos(t) * 54, c + Math.sin(t) * 54);
      g.stroke();
    }
    // activity rings, bottom
    ["#f43f5e", "#a3e635", "#22d3ee"].forEach((col, i) => {
      g.strokeStyle = col;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(c, c + 22, 11 - i * 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * (1.6 - i * 0.35));
      g.stroke();
    });
    // date, left; arc, right
    g.fillStyle = accent;
    g.font = "700 12px system-ui, sans-serif";
    g.textAlign = "center";
    g.fillText("SUN 11", c - 24, c + 4);
    g.strokeStyle = accent;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(c + 26, c, 9, Math.PI * 0.75, Math.PI * 2.25);
    g.stroke();
    // hands
    g.lineCap = "round";
    g.strokeStyle = "#ffffff";
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(c, c);
    g.lineTo(c + 18, c - 22);
    g.stroke();
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(c, c);
    g.lineTo(c - 8, c - 40);
    g.stroke();
    g.strokeStyle = accent;
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(c - 6, c + 10);
    g.lineTo(c + 22, c - 34);
    g.stroke();
    g.fillStyle = accent;
    g.beginPath();
    g.arc(c, c, 3, 0, Math.PI * 2);
    g.fill();
  });
  screenCache.set(key, tex);
  return tex;
}

// Woven speaker fabric, tiling.
let fabricTex: CanvasTexture | null = null;
export function fabricTexture(): CanvasTexture {
  if (fabricTex) return fabricTex;
  const t = canvasTexture(64, 64, (g) => {
    g.fillStyle = "#d9d9d6";
    g.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 2) {
      for (let x = 0; x < 64; x += 2) {
        const n = ((x * 7 + y * 13) % 5) / 5;
        g.fillStyle = (x + y) % 4 === 0 ? `rgba(255,255,255,${0.35 + n * 0.2})` : `rgba(0,0,0,${0.12 + n * 0.08})`;
        g.fillRect(x, y, 1.5, 1.5);
      }
    }
  });
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(6, 3);
  fabricTex = t;
  return t;
}

// The glowing touch top of the speaker: a soft swirl of colour in a ring.
let glowTex: CanvasTexture | null = null;
export function glowTexture(): CanvasTexture {
  if (glowTex) return glowTex;
  glowTex = canvasTexture(64, 64, (g) => {
    g.fillStyle = "#1a1c20";
    g.fillRect(0, 0, 64, 64);
    const grad = g.createRadialGradient(28, 30, 2, 32, 32, 26);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.35, "#c084fc");
    grad.addColorStop(0.7, "#60a5fa");
    grad.addColorStop(1, "rgba(26,28,32,1)");
    g.fillStyle = grad;
    g.beginPath();
    g.arc(32, 32, 26, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.8)";
    g.fillRect(19, 31, 6, 2);
    g.fillRect(39, 31, 6, 2);
    g.fillRect(41, 29, 2, 6);
  });
  return glowTex;
}
