// The screen library for laptops, tablets, monitors and desktops: ten
// original designs drawn in canvas, each framed for a device format with its
// bezel (and camera dot) baked into the same texture, so a screen is a single
// mesh. Drawn once per (design, format) and shared by every device.
import { CanvasTexture, Color, MeshStandardMaterial, SRGBColorSpace } from "three";

export type ScreenFormat = "laptop" | "tablet" | "monitor" | "aio";

// Canvas size and bezel (px) per format. The aspect matches the screen mesh
// (the whole front face of the lid / tablet / housing, minus a 1 mm rim);
// bezel widths follow the real proportions in references/products-computers.md.
const FORMATS: Record<ScreenFormat, { w: number; h: number; side: number; top: number; bottom: number; bezel: string; cam: boolean }> = {
  laptop: { w: 256, h: 181, side: 5, top: 8, bottom: 15, bezel: "#08090b", cam: true },
  tablet: { w: 256, h: 182, side: 8, top: 8, bottom: 8, bezel: "#08090b", cam: true },
  monitor: { w: 256, h: 149, side: 5, top: 5, bottom: 5, bezel: "#08090b", cam: false },
  aio: { w: 256, h: 148, side: 6, top: 7, bottom: 6, bezel: "#eceeef", cam: true },
};

export const SCREEN_DESIGNS = 10;

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type G = CanvasRenderingContext2D;

function rr(g: G, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

function mark(g: G, cx: number, cy: number, r: number, colour: string) {
  // the store's invented ring-and-dot mark (same as the phones use)
  g.strokeStyle = colour;
  g.lineWidth = Math.max(1, r * 0.32);
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = colour;
  g.beginPath();
  g.arc(cx + r * 0.15, cy - r * 0.1, r * 0.36, 0, Math.PI * 2);
  g.fill();
}

function textLine(g: G, text: string, x: number, y: number, px: number, colour: string, weight = 600) {
  g.fillStyle = colour;
  g.font = `${weight} ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  g.textBaseline = "alphabetic";
  g.fillText(text, x, y);
}

// Each design fills the display rect (0,0,w,h) after a translate.
const DESIGNS: Array<(g: G, w: number, h: number, f: ScreenFormat) => void> = [
  // 0: aurora: glowing bands over a night gradient
  (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#071226");
    bg.addColorStop(1, "#1b1145");
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    const bands: Array<[string, number, number]> = [
      ["#33f0c0", 0.35, 0.18],
      ["#5a7dff", 0.55, 0.22],
      ["#d35bff", 0.72, 0.14],
    ];
    g.globalCompositeOperation = "lighter";
    for (const [c, yy, amp] of bands) {
      g.strokeStyle = c;
      g.globalAlpha = 0.5;
      g.lineWidth = h * 0.16;
      g.shadowColor = c;
      g.shadowBlur = 18;
      g.beginPath();
      for (let x = -10; x <= w + 10; x += 6) {
        const y = h * yy + Math.sin(x / w * 5 + yy * 9) * h * amp * 0.6 + Math.sin(x / w * 11) * h * 0.03;
        if (x === -10) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    g.shadowBlur = 0;
    const r = rng(7);
    g.fillStyle = "#ffffff";
    for (let i = 0; i < 40; i++) g.fillRect(r() * w, r() * h * 0.5, 1, 1);
  },
  // 1: landscape at dusk, like a photo: sky, sun, layered ridges, a lake
  (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h * 0.62);
    sky.addColorStop(0, "#2b4c8c");
    sky.addColorStop(0.55, "#e98a6b");
    sky.addColorStop(1, "#ffd59a");
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    const sun = g.createRadialGradient(w * 0.62, h * 0.5, 2, w * 0.62, h * 0.5, h * 0.35);
    sun.addColorStop(0, "rgba(255,250,225,1)");
    sun.addColorStop(0.15, "rgba(255,236,180,0.9)");
    sun.addColorStop(1, "rgba(255,200,150,0)");
    g.fillStyle = sun;
    g.fillRect(0, 0, w, h);
    const ridges: Array<[string, number, number, number]> = [
      ["#9a6f8f", 0.46, 0.1, 3],
      ["#5d4a76", 0.53, 0.09, 5],
      ["#2c2a4a", 0.6, 0.07, 9],
    ];
    for (const [c, base, amp, k] of ridges) {
      g.fillStyle = c;
      g.beginPath();
      g.moveTo(0, h);
      for (let x = 0; x <= w; x += 4) {
        const t = x / w;
        g.lineTo(x, h * (base - amp * (0.6 * Math.abs(Math.sin(t * k + base * 7)) + 0.4 * Math.sin(t * k * 2.7))));
      }
      g.lineTo(w, h);
      g.fill();
    }
    const lake = g.createLinearGradient(0, h * 0.62, 0, h);
    lake.addColorStop(0, "#f2b386");
    lake.addColorStop(1, "#24294a");
    g.fillStyle = lake;
    g.fillRect(0, h * 0.62, w, h * 0.38);
    g.fillStyle = "rgba(255,240,200,0.55)";
    for (let i = 0; i < 9; i++) g.fillRect(w * 0.62 - 14 + Math.sin(i * 1.7) * 6, h * 0.64 + i * 4, 28 - i * 2, 1.5);
  },
  // 2: a desktop: wallpaper, menu bar, two windows, a dock
  (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, "#1e8c93");
    bg.addColorStop(0.5, "#3c5fc9");
    bg.addColorStop(1, "#8a46c8");
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(255,255,255,0.18)";
    g.beginPath();
    g.arc(w * 0.8, h * 0.25, h * 0.45, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(240,244,250,0.75)";
    g.fillRect(0, 0, w, 7);
    mark(g, 6, 3.5, 2, "#222");
    g.fillStyle = "#333";
    for (let i = 0; i < 4; i++) g.fillRect(14 + i * 16, 2.5, 11, 2);
    g.fillRect(w - 30, 2.5, 24, 2);
    const win = (x: number, y: number, ww: number, hh: number, body: (x: number, y: number) => void) => {
      g.shadowColor = "rgba(0,0,0,0.35)";
      g.shadowBlur = 8;
      g.fillStyle = "#f7f8fa";
      rr(g, x, y, ww, hh, 4);
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = "#e3e6ea";
      g.fillRect(x, y + 3, ww, 7);
      rr(g, x, y, ww, 10, 4);
      g.fill();
      ["#ff5f57", "#febc2e", "#28c840"].forEach((c, i) => {
        g.fillStyle = c;
        g.beginPath();
        g.arc(x + 6 + i * 6, y + 5, 2, 0, Math.PI * 2);
        g.fill();
      });
      body(x, y + 12);
    };
    win(w * 0.08, h * 0.14, w * 0.5, h * 0.52, (x, y) => {
      g.fillStyle = "#c9d2dc";
      for (let i = 0; i < 7; i++) g.fillRect(x + 6, y + 4 + i * 9, (w * 0.5 - 12) * (0.5 + ((i * 37) % 50) / 100), 3);
    });
    win(w * 0.45, h * 0.3, w * 0.45, h * 0.45, (x, y) => {
      const ig = g.createLinearGradient(x, y, x + w * 0.45, y + h * 0.3);
      ig.addColorStop(0, "#ffb36b");
      ig.addColorStop(1, "#ff5d8f");
      g.fillStyle = ig;
      g.fillRect(x + 5, y + 3, w * 0.45 - 10, h * 0.45 - 20);
    });
    g.fillStyle = "rgba(255,255,255,0.35)";
    rr(g, w * 0.22, h - 17, w * 0.56, 13, 4);
    g.fill();
    const apps = ["#3d8bff", "#34c759", "#ff9f0a", "#ff375f", "#bf5af2", "#64d2ff", "#ffd60a", "#8e8e93"];
    const step = (w * 0.56 - 8) / apps.length;
    apps.forEach((c, i) => {
      g.fillStyle = c;
      rr(g, w * 0.22 + 5 + i * step, h - 15, step - 3, 9, 2.5);
      g.fill();
    });
  },
  // 3: a spec sheet for the device itself (generic words, no names)
  (g, w, h, f) => {
    g.fillStyle = "#f5f5f7";
    g.fillRect(0, 0, w, h);
    const [title, l1, l2] =
      f === "laptop"
        ? ["LAPTOP", "13- and 14-inch", "from 1.13 cm thin"]
        : f === "tablet"
          ? ["TABLET", "11- and 13-inch", "from 5.1 mm thin"]
          : f === "monitor"
            ? ["DISPLAY", "27-inch 5K", "one cable"]
            : ["DESKTOP", "24-inch 4.5K", "seven finishes"];
    mark(g, 14, 13, 5, "#1d1d1f");
    // product drawing on the left
    const cx = w * 0.3;
    const cy = h * 0.55;
    const pg = g.createLinearGradient(cx - 50, cy - 40, cx + 50, cy + 30);
    pg.addColorStop(0, "#d7dbe0");
    pg.addColorStop(1, "#9aa1aa");
    g.fillStyle = pg;
    if (f === "laptop") {
      rr(g, cx - 46, cy - 38, 92, 58, 4);
      g.fill();
      g.fillStyle = "#1a2a5a";
      g.fillRect(cx - 42, cy - 34, 84, 50);
      g.fillStyle = pg;
      rr(g, cx - 56, cy + 20, 112, 6, 3);
      g.fill();
    } else {
      rr(g, cx - 40, cy - 34, 80, 62, 6);
      g.fill();
      g.fillStyle = "#1a2a5a";
      rr(g, cx - 36, cy - 30, 72, 54, 3);
      g.fill();
      if (f !== "tablet") {
        g.fillStyle = pg;
        g.fillRect(cx - 6, cy + 28, 12, 12);
        g.fillRect(cx - 18, cy + 39, 36, 3);
      }
    }
    textLine(g, title, w * 0.56, h * 0.36, 20, "#1d1d1f", 800);
    textLine(g, l1, w * 0.56, h * 0.52, 11, "#3a3a3c", 500);
    textLine(g, l2, w * 0.56, h * 0.64, 11, "#3a3a3c", 500);
    ["#2b2f36", "#c9ced3", "#e8d9c4", "#3a4a63", "#a7b7a4", "#d8b4a0"].forEach((c, i) => {
      g.fillStyle = c;
      g.beginPath();
      g.arc(w * 0.58 + i * 13, h * 0.78, 4.5, 0, Math.PI * 2);
      g.fill();
    });
    g.fillStyle = "#0a74e8";
    rr(g, w * 0.56, h * 0.86, 44, 12, 6);
    g.fill();
  },
  // 4: a video call grid: four tiles, the bottom-right one is you
  (g, w, h) => {
    g.fillStyle = "#1c1d21";
    g.fillRect(0, 0, w, h);
    const tones: Array<[string, string, string]> = [
      ["#3b4a6b", "#7d90b8", "#e3b48f"],
      ["#5a4636", "#a88867", "#c98e6a"],
      ["#2f5b4f", "#6fae96", "#f0c9a5"],
      ["#4a3a5e", "#9b84c4", "#8d5a3f"],
    ];
    const pad = 4;
    const tw = (w - pad * 3) / 2;
    const th = (h - 20 - pad * 3) / 2;
    tones.forEach(([a, b, skin], i) => {
      const x = pad + (i % 2) * (tw + pad);
      const y = pad + Math.floor(i / 2) * (th + pad);
      const tg = g.createLinearGradient(x, y, x + tw, y + th);
      tg.addColorStop(0, a);
      tg.addColorStop(1, b);
      g.fillStyle = tg;
      rr(g, x, y, tw, th, 4);
      g.fill();
      g.save();
      rr(g, x, y, tw, th, 4);
      g.clip();
      g.fillStyle = ["#2a2f3a", "#e9e4dc", "#33415c", "#c44d58"][i];
      g.beginPath();
      g.ellipse(x + tw / 2, y + th * 1.02, tw * 0.3, th * 0.38, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = skin;
      g.beginPath();
      g.arc(x + tw / 2, y + th * 0.45, th * 0.2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = ["#2b1d14", "#6b4a2b", "#111", "#d9b26b"][i];
      g.beginPath();
      g.arc(x + tw / 2, y + th * 0.4, th * 0.2, Math.PI, 0);
      g.fill();
      g.restore();
      g.fillStyle = "rgba(0,0,0,0.45)";
      rr(g, x + 3, y + th - 10, 30, 7, 3);
      g.fill();
      g.fillStyle = "#fff";
      g.fillRect(x + 6, y + th - 7.5, 22, 2);
      if (i === 3) {
        g.strokeStyle = "#3ddc84";
        g.lineWidth = 2;
        rr(g, x + 1, y + 1, tw - 2, th - 2, 4);
        g.stroke();
      }
    });
    const by = h - 13;
    ["#3a3b40", "#3a3b40", "#3a3b40", "#e5484d"].forEach((c, i) => {
      g.fillStyle = c;
      rr(g, w / 2 - 44 + i * 23, by, i === 3 ? 24 : 18, 10, 5);
      g.fill();
    });
  },
  // 5: a spreadsheet with a bar chart
  (g, w, h) => {
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#1f7a4d";
    g.fillRect(0, 0, w, 10);
    g.fillStyle = "#eef1f4";
    g.fillRect(0, 10, w, 9);
    g.fillStyle = "#9aa3ad";
    for (let i = 0; i < 8; i++) g.fillRect(5 + i * 14, 13, 9, 3);
    const top = 21;
    const rowH = 8;
    const colW = 30;
    g.fillStyle = "#f3f4f6";
    g.fillRect(0, top, w, rowH);
    g.fillRect(0, top, 12, h);
    g.strokeStyle = "#dfe3e8";
    g.lineWidth = 1;
    for (let y = top; y < h; y += rowH) {
      g.beginPath();
      g.moveTo(0, y + 0.5);
      g.lineTo(w, y + 0.5);
      g.stroke();
    }
    for (let x = 12; x < w; x += colW) {
      g.beginPath();
      g.moveTo(x + 0.5, top);
      g.lineTo(x + 0.5, h);
      g.stroke();
    }
    const r = rng(11);
    for (let y = top + rowH; y < h - 2; y += rowH) {
      for (let x = 12; x < w * 0.55; x += colW) {
        g.fillStyle = x === 12 ? "#4b5563" : "#374151";
        const len = x === 12 ? 10 + r() * 14 : 8 + r() * 16;
        g.fillRect(x + colW - 3 - len, y + 3, len, 2);
      }
    }
    g.fillStyle = "#d7f0e2";
    g.fillRect(12 + colW, top + rowH * 4, colW, rowH);
    g.strokeStyle = "#1f7a4d";
    g.lineWidth = 1.5;
    g.strokeRect(12 + colW + 0.5, top + rowH * 4 + 0.5, colW, rowH);
    const cx = w * 0.6;
    const cw = w * 0.36;
    const cy = top + 10;
    const ch = h - cy - 12;
    g.fillStyle = "#ffffff";
    g.shadowColor = "rgba(0,0,0,0.2)";
    g.shadowBlur = 5;
    g.fillRect(cx, cy, cw, ch);
    g.shadowBlur = 0;
    const bars = [0.4, 0.55, 0.5, 0.7, 0.62, 0.85];
    bars.forEach((b, i) => {
      g.fillStyle = i === bars.length - 1 ? "#1f7a4d" : "#7fc4a0";
      const bw = (cw - 16) / bars.length;
      g.fillRect(cx + 8 + i * bw + 1, cy + ch - 6 - b * (ch - 16), bw - 3, b * (ch - 16));
    });
  },
  // 6: a music player
  (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, "#5b1f3f");
    bg.addColorStop(1, "#14101f");
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    const s = h * 0.62;
    const ax = w * 0.08;
    const ay = h * 0.12;
    const art = g.createLinearGradient(ax, ay, ax + s, ay + s);
    art.addColorStop(0, "#ff8a5c");
    art.addColorStop(1, "#c2187a");
    g.fillStyle = art;
    rr(g, ax, ay, s, s, 5);
    g.fill();
    g.fillStyle = "rgba(255,240,200,0.85)";
    g.beginPath();
    g.arc(ax + s * 0.62, ay + s * 0.4, s * 0.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(40,10,40,0.6)";
    g.beginPath();
    g.moveTo(ax, ay + s);
    g.lineTo(ax + s * 0.35, ay + s * 0.55);
    g.lineTo(ax + s * 0.6, ay + s * 0.8);
    g.lineTo(ax + s * 0.8, ay + s * 0.6);
    g.lineTo(ax + s, ay + s);
    g.fill();
    const tx = ax + s + 14;
    textLine(g, "Track 04", tx, h * 0.3, 15, "#ffffff", 700);
    g.fillStyle = "rgba(255,255,255,0.55)";
    g.fillRect(tx, h * 0.37, 60, 4);
    g.fillRect(tx, h * 0.45, 40, 4);
    const pw = w - tx - 14;
    g.fillStyle = "rgba(255,255,255,0.25)";
    rr(g, tx, h * 0.6, pw, 3, 1.5);
    g.fill();
    g.fillStyle = "#ffffff";
    rr(g, tx, h * 0.6, pw * 0.38, 3, 1.5);
    g.fill();
    g.beginPath();
    g.arc(tx + pw * 0.38, h * 0.6 + 1.5, 3.5, 0, Math.PI * 2);
    g.fill();
    const my = h * 0.78;
    const mx = tx + pw / 2;
    g.beginPath();
    g.arc(mx, my, 10, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#2a1530";
    g.fillRect(mx - 4, my - 5, 3, 10);
    g.fillRect(mx + 1, my - 5, 3, 10);
    g.fillStyle = "#ffffff";
    for (const d of [-1, 1]) {
      g.beginPath();
      g.moveTo(mx + d * 22, my - 5);
      g.lineTo(mx + d * 22, my + 5);
      g.lineTo(mx + d * 30, my);
      g.closePath();
      g.fill();
    }
  },
  // 7: a store product page for invented headphones
  (g, w, h) => {
    g.fillStyle = "#fbfbfd";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(240,240,244,0.95)";
    g.fillRect(0, 0, w, 11);
    mark(g, 9, 5.5, 3, "#1d1d1f");
    g.fillStyle = "#6e6e73";
    for (let i = 0; i < 6; i++) g.fillRect(28 + i * 26, 4.5, 16, 2);
    const cx = w * 0.32;
    const cy = h * 0.58;
    const r = h * 0.3;
    const tone = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    tone.addColorStop(0, "#c9d8e8");
    tone.addColorStop(1, "#7f95ad");
    g.strokeStyle = tone;
    g.lineWidth = 7;
    g.lineCap = "round";
    g.beginPath();
    g.arc(cx, cy, r, Math.PI * 1.1, Math.PI * 1.9);
    g.stroke();
    g.lineCap = "butt";
    g.fillStyle = tone;
    for (const d of [-1, 1]) {
      rr(g, cx + d * r * 0.95 - 10, cy - 6, 20, 30, 9);
      g.fill();
    }
    g.fillStyle = "rgba(0,0,0,0.08)";
    g.beginPath();
    g.ellipse(cx, cy + 34, r * 1.1, 4, 0, 0, Math.PI * 2);
    g.fill();
    textLine(g, "HEADPHONES", w * 0.58, h * 0.4, 15, "#1d1d1f", 800);
    g.fillStyle = "#86868b";
    g.fillRect(w * 0.58, h * 0.47, 70, 3);
    g.fillRect(w * 0.58, h * 0.53, 54, 3);
    ["#c9d8e8", "#2b2f36", "#e8d9c4", "#d8b4a0"].forEach((c, i) => {
      g.fillStyle = c;
      g.beginPath();
      g.arc(w * 0.6 + i * 12, h * 0.65, 4, 0, Math.PI * 2);
      g.fill();
    });
    g.fillStyle = "#0a74e8";
    rr(g, w * 0.58, h * 0.74, 50, 14, 7);
    g.fill();
    textLine(g, "Buy", w * 0.58 + 16, h * 0.74 + 10.5, 9, "#ffffff", 700);
  },
  // 8: abstract shapes, poster style
  (g, w, h) => {
    g.fillStyle = "#f1e7d6";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#e3a32b";
    g.beginPath();
    g.arc(w * 0.28, h * 0.42, h * 0.32, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#c8553d";
    g.beginPath();
    g.moveTo(w * 0.5, h);
    g.arc(w * 0.66, h, h * 0.42, Math.PI, 0);
    g.fill();
    g.fillStyle = "#1f3a5f";
    g.fillRect(w * 0.6, h * 0.1, w * 0.26, h * 0.34);
    g.fillStyle = "#2a9d8f";
    g.beginPath();
    g.moveTo(w * 0.08, h * 0.95);
    g.lineTo(w * 0.42, h * 0.95);
    g.lineTo(w * 0.25, h * 0.66);
    g.closePath();
    g.fill();
    g.strokeStyle = "#1d1d1f";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(w * 0.05, h * 0.12);
    g.lineTo(w * 0.5, h * 0.12);
    g.stroke();
  },
  // 9: a map, a pin and a blue dot (someone knows where you are)
  (g, w, h) => {
    g.fillStyle = "#eef0e8";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#cfe6c4";
    g.fillRect(w * 0.08, h * 0.55, w * 0.22, h * 0.3);
    g.fillRect(w * 0.7, h * 0.1, w * 0.18, h * 0.22);
    g.fillStyle = "#a9d3f0";
    g.beginPath();
    g.moveTo(w * 0.55, h);
    g.bezierCurveTo(w * 0.6, h * 0.7, w * 0.85, h * 0.65, w, h * 0.5);
    g.lineTo(w, h);
    g.fill();
    g.strokeStyle = "#ffffff";
    g.lineWidth = 4;
    const r = rng(23);
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      const y = (i + 0.5) * (h / 6) + (r() - 0.5) * 6;
      g.moveTo(0, y);
      g.lineTo(w, y + (r() - 0.5) * 14);
      g.stroke();
      const x = (i + 0.5) * (w / 6) + (r() - 0.5) * 10;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + (r() - 0.5) * 18, h);
      g.stroke();
    }
    g.strokeStyle = "#f6c453";
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(0, h * 0.7);
    g.bezierCurveTo(w * 0.3, h * 0.6, w * 0.5, h * 0.3, w, h * 0.25);
    g.stroke();
    const px = w * 0.42;
    const py = h * 0.4;
    g.fillStyle = "rgba(10,116,232,0.18)";
    g.beginPath();
    g.arc(px, py, 16, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.arc(px, py, 6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#0a74e8";
    g.beginPath();
    g.arc(px, py, 4.5, 0, Math.PI * 2);
    g.fill();
    const qx = w * 0.68;
    const qy = h * 0.5;
    g.fillStyle = "#e5484d";
    g.beginPath();
    g.arc(qx, qy - 14, 7, Math.PI * 0.85, Math.PI * 2.15);
    g.lineTo(qx, qy);
    g.closePath();
    g.fill();
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.arc(qx, qy - 14, 2.6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#ffffff";
    g.shadowColor = "rgba(0,0,0,0.2)";
    g.shadowBlur = 4;
    rr(g, 6, 6, w * 0.4, 12, 6);
    g.fill();
    g.shadowBlur = 0;
    g.fillStyle = "#9aa1a8";
    g.fillRect(14, 11, w * 0.24, 2);
  },
];

const texCache = new Map<string, CanvasTexture>();
export function screenTexture(design: number, format: ScreenFormat): CanvasTexture {
  const d = ((design % SCREEN_DESIGNS) + SCREEN_DESIGNS) % SCREEN_DESIGNS;
  const key = `${d}:${format}`;
  let tex = texCache.get(key);
  if (tex) return tex;
  const f = FORMATS[format];
  const canvas = document.createElement("canvas");
  canvas.width = f.w;
  canvas.height = f.h;
  const g = canvas.getContext("2d")!;
  g.fillStyle = f.bezel;
  g.fillRect(0, 0, f.w, f.h);
  const dw = f.w - f.side * 2;
  const dh = f.h - f.top - f.bottom;
  g.save();
  g.translate(f.side, f.top);
  rr(g, 0, 0, dw, dh, format === "tablet" ? 6 : format === "laptop" ? 3 : 1);
  g.clip();
  DESIGNS[d](g, dw, dh, format);
  g.restore();
  if (f.cam) {
    g.fillStyle = format === "aio" ? "#3b3f45" : "#1c2028";
    g.beginPath();
    g.arc(f.w / 2, f.top / 2, 1.6, 0, Math.PI * 2);
    g.fill();
  }
  tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  texCache.set(key, tex);
  return tex;
}

// The screen glows (emissive, not tone-mapped so the colours stay true) and
// is glossy glass: low roughness picks up the store's reflections on top.
const matCache = new Map<string, MeshStandardMaterial>();
export function screenMaterial(design: number, format: ScreenFormat): MeshStandardMaterial {
  const key = `${((design % SCREEN_DESIGNS) + SCREEN_DESIGNS) % SCREEN_DESIGNS}:${format}`;
  let m = matCache.get(key);
  if (m) return m;
  m = new MeshStandardMaterial({
    color: new Color("#000000"),
    emissive: new Color("#ffffff"),
    emissiveMap: screenTexture(design, format),
    roughness: 0.08,
    metalness: 0,
    envMapIntensity: 0.9,
  });
  m.toneMapped = false;
  matCache.set(key, m);
  return m;
}
