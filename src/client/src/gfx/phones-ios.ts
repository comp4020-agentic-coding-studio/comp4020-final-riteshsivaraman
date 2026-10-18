import type { CanvasTexture } from "three";
import { canvasTexture } from "./common.tsx";
import type { ScreenCutout } from "./phones-geo.ts";

// EXPERIMENT (2026-10-17): a phone lock / home screen drawn the way a modern
// phone OS looks, in plain canvas calls. Opt in with `?ios=1`; `screenTexture`
// in phones.tsx hands phones to `iosPhoneScreen` when `IOS_PILOT` is set, and
// nothing changes otherwise. Layout is in a 390 pt wide space (the layout
// `ios-pilot/*.html` was designed in), scaled to the texture, which stays
// under the 512 px cap in docs/graphics-brief.md. Icons are our own line
// glyphs as SVG path strings; no Apple fonts, symbols or artwork. The glass is
// a translucent fill with a lit edge, no real blur.

type G = CanvasRenderingContext2D;

export const IOS_PILOT = typeof location !== "undefined" && new URLSearchParams(location.search).get("ios") === "1";

const LW = 390; // layout width, pt
const TEX_W = 240;
const TEX_MAX_H = 512;
const FONT = "system-ui, Arial, sans-serif";

function rr(g: G, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

// An elliptical radial glow: colour at the centre fading to clear at `stop`
// of the radii. The same three blobs as the CSS wallpaper in ios-pilot.
function blob(g: G, cx: number, cy: number, rx: number, ry: number, rgb: string, stop: number): void {
  g.save();
  g.translate(cx, cy);
  g.scale(rx, ry);
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, 1);
  grad.addColorStop(0, `rgb(${rgb})`);
  grad.addColorStop(stop, `rgba(${rgb},0)`);
  g.fillStyle = grad;
  g.fillRect(-4, -4, 8, 8);
  g.restore();
}

function wallpaper(g: G, H: number): void {
  g.fillStyle = "#1c1a4d";
  g.fillRect(0, 0, LW, H);
  blob(g, LW * 0.15, H * 0.08, LW * 1.2, H * 0.55, "255,138,92", 0.6);
  blob(g, LW * 0.95, H * 0.42, LW * 0.9, H * 0.6, "122,92,255", 0.65);
  blob(g, LW * 0.25, H * 1.05, LW * 1.2, H * 0.7, "255,226,154", 0.55);
}

// A glass panel: translucent fill, a lit top edge, a faint rim and a soft drop shadow.
function glass(g: G, x: number, y: number, w: number, h: number, r: number, alpha = 0.22): void {
  g.save();
  g.shadowColor = "rgba(10,8,40,0.28)";
  g.shadowBlur = 24;
  g.shadowOffsetY = 10;
  rr(g, x, y, w, h, r);
  g.fillStyle = `rgba(255,255,255,${alpha})`;
  g.fill();
  g.restore();
  const sheen = g.createLinearGradient(0, y, 0, y + h);
  sheen.addColorStop(0, "rgba(255,255,255,0.22)");
  sheen.addColorStop(0.5, "rgba(255,255,255,0)");
  rr(g, x, y, w, h, r);
  g.fillStyle = sheen;
  g.fill();
  rr(g, x + 0.5, y + 0.5, w - 1, h - 1, r);
  g.strokeStyle = "rgba(255,255,255,0.3)";
  g.lineWidth = 1;
  g.stroke();
}

function text(g: G, s: string, x: number, y: number, size: number, weight: number, align: CanvasTextAlign = "left", alpha = 1): void {
  g.font = `${weight} ${size}px ${FONT}`;
  g.textAlign = align;
  g.fillStyle = `rgba(255,255,255,${alpha})`;
  g.fillText(s, x, y);
}

function cutoutShape(g: G, cutout: ScreenCutout): void {
  g.fillStyle = "#000";
  g.beginPath();
  if (cutout === "notch") g.roundRect(87, -20, 216, 52, [0, 0, 20, 20]);
  else if (cutout === "punch") g.arc(195, 27, 13, 0, Math.PI * 2);
  else g.roundRect(132, 11, 126, 37, 19);
  g.fill();
}

function statusBar(g: G, withTime: boolean): void {
  if (withTime) text(g, "11:24", 34, 36, 17, 600);
  g.fillStyle = "#fff";
  for (let i = 0; i < 4; i++) {
    rr(g, 325 + i * 5, 36 - (4 + i * 2.7) - 1, 3, 4 + i * 2.7, 0.8);
    g.fill();
  }
  g.strokeStyle = "#fff";
  g.lineWidth = 1.8;
  g.lineCap = "round";
  for (const r of [9, 6, 3]) {
    g.beginPath();
    g.arc(352, 36, r, -Math.PI * 0.78, -Math.PI * 0.22);
    g.stroke();
  }
  rr(g, 360, 22, 24, 12.5, 3.8);
  g.strokeStyle = "rgba(255,255,255,0.45)";
  g.lineWidth = 1;
  g.stroke();
  rr(g, 361.5, 23.5, 17, 9.5, 2.4);
  g.fillStyle = "#fff";
  g.fill();
}

function homeIndicator(g: G, H: number): void {
  rr(g, 130, H - 13, 134, 5, 2.5);
  g.fillStyle = "rgba(255,255,255,0.92)";
  g.fill();
}

// ---- icon glyphs: a 24 x 24 box of strokes ----
// A string is an SVG path; the arrays are a circle [cx, cy, r] or a rounded rect [x, y, w, h, r].
type Op = string | ["c", number, number, number] | ["r", number, number, number, number, number];

const GLYPHS: Record<string, Op[]> = {
  photos: [["c", 12, 9, 3.2], "M4 19l5-6 3.5 4 2.5-3 5 5z"],
  clock: [["c", 12, 12, 8.5], "M12 7v5l3 2"],
  notes: ["M6 3.5h12v17H6z", "M9 8.5h6M9 12h6M9 15.5h3.5"],
  weather: [["c", 12, 12, 4], "M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"],
  music: ["M9.5 17.5V6.5l9-2v11", ["c", 7.2, 17.5, 2.3], ["c", 16.2, 15.5, 2.3]],
  store: ["M5.5 8.5h13l-1 12h-11z", "M9 8.5a3 3 0 0 1 6 0"],
  wallet: [["r", 3.5, 6.5, 17, 12, 2.5], "M3.5 10.5h17", "M6.5 15.5h4"],
  settings: [["c", 12, 12, 3.2]],
  calc: [["r", 5, 3.5, 14, 17, 2.5], ["r", 8, 6.5, 8, 3, 0.8], "M8.5 13.5h.01M12 13.5h.01M15.5 13.5h.01M8.5 17h.01M12 17h.01M15.5 17h.01"],
  files: ["M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"],
  list: [["c", 8, 7.5, 2], ["c", 8, 12.5, 2], ["c", 8, 17.5, 2], "M13 7.5h6M13 12.5h6M13 17.5h6"],
  mail: [["r", 3.5, 6, 17, 12.5, 2.5], "M4 8l8 5.5L20 8"],
  web: [["c", 12, 12, 8.5], "M12 3.5c-2.6 2.4-3.6 5.4-3.6 8.5s1 6.1 3.6 8.5c2.6-2.4 3.6-5.4 3.6-8.5s-1-6.1-3.6-8.5zM3.8 12h16.4"],
  person: [["c", 12, 9, 3.5], "M5.5 19.5c.8-3.4 3.4-5 6.5-5s5.7 1.6 6.5 5"],
  heart: ["M12 19.5s-7-4.3-7-9.2A4 4 0 0 1 12 8a4 4 0 0 1 7 2.3c0 4.9-7 9.2-7 9.2z"],
  phone: ["M6.6 3.5h3l1.3 4-2 1.3a11 11 0 0 0 5.3 5.3l1.3-2 4 1.3v3a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z"],
  chat: ["M4 5.5h16v11H9.5L5 20.5v-4H4z"],
  pin: ["M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10z", ["c", 12, 11, 2.2]],
  camera: ["M3 8.5h4l1.5-2.5h7L17 8.5h4V19H3z", ["c", 12, 13.5, 3.6]],
};

function strokeGlyph(g: G, name: string, cx: number, cy: number, size: number, colour: string): void {
  g.save();
  g.translate(cx - size / 2, cy - size / 2);
  g.scale(size / 24, size / 24);
  g.strokeStyle = colour;
  g.lineWidth = 2.1;
  g.lineCap = "round";
  g.lineJoin = "round";
  for (const op of GLYPHS[name]) {
    if (typeof op === "string") g.stroke(new Path2D(op));
    else {
      g.beginPath();
      if (op[0] === "c") g.arc(op[1], op[2], op[3], 0, Math.PI * 2);
      else g.roundRect(op[1], op[2], op[3], op[4], op[5]);
      g.stroke();
    }
  }
  if (name === "settings") {
    g.setLineDash([3.2, 2.6]);
    g.beginPath();
    g.arc(12, 12, 8, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();
}

interface App {
  label: string;
  glyph: string;
  top: string;
  bottom: string;
  ink?: string; // glyph colour, default white
}

const APPS: App[] = [
  { label: "Photos", glyph: "photos", top: "#ffb347", bottom: "#ff7b5c" },
  { label: "Clock", glyph: "clock", top: "#3a3a46", bottom: "#14141a" },
  { label: "Calendar", glyph: "", top: "#ffffff", bottom: "#e9e9ee" }, // drawn by hand: SUN / 11
  { label: "Notes", glyph: "notes", top: "#fff3a8", bottom: "#ffd84a", ink: "#7a5a00" },
  { label: "Weather", glyph: "weather", top: "#5ac8fa", bottom: "#2a7de1" },
  { label: "Music", glyph: "music", top: "#ff6b8b", bottom: "#d6285a" },
  { label: "Store", glyph: "store", top: "#5b8cff", bottom: "#3a4fe0" },
  { label: "Wallet", glyph: "wallet", top: "#2c2c34", bottom: "#0c0c10" },
  { label: "Settings", glyph: "settings", top: "#a3a3ad", bottom: "#6c6c76" },
  { label: "Calculator", glyph: "calc", top: "#ff9f43", bottom: "#e8590c" },
  { label: "Files", glyph: "files", top: "#4fb3ff", bottom: "#2377d9" },
  { label: "Reminders", glyph: "list", top: "#ffffff", bottom: "#e9e9ee", ink: "#ff3b30" },
  { label: "Mail", glyph: "mail", top: "#5fb2ff", bottom: "#2b6fe0" },
  { label: "Web", glyph: "web", top: "#5ac8fa", bottom: "#1f8fe5" },
  { label: "Contacts", glyph: "person", top: "#b4b4bd", bottom: "#7c7c88" },
  { label: "Health", glyph: "heart", top: "#ffffff", bottom: "#ececf1", ink: "#ff2d55" },
];

const DOCK: App[] = [
  { label: "Phone", glyph: "phone", top: "#5ee07a", bottom: "#1fae4b" },
  { label: "Messages", glyph: "chat", top: "#5ee07a", bottom: "#1fae4b" },
  { label: "Maps", glyph: "pin", top: "#6fd0a0", bottom: "#2b9d6b" },
  { label: "Camera", glyph: "camera", top: "#8e8e98", bottom: "#4a4a54" },
];

function icon(g: G, app: App, x: number, y: number): void {
  const grad = g.createLinearGradient(0, y, 0, y + 60);
  grad.addColorStop(0, app.top);
  grad.addColorStop(1, app.bottom);
  rr(g, x, y, 60, 60, 14);
  g.fillStyle = grad;
  g.fill();
  rr(g, x + 0.25, y + 0.25, 59.5, 59.5, 14);
  g.strokeStyle = "rgba(255,255,255,0.35)";
  g.lineWidth = 0.5;
  g.stroke();
  if (app.glyph) strokeGlyph(g, app.glyph, x + 30, y + 30, 32, app.ink ?? "#fff");
  else {
    g.fillStyle = "#ff3b30";
    g.font = `700 10px ${FONT}`;
    g.textAlign = "center";
    g.fillText("SUN", x + 30, y + 21);
    g.fillStyle = "#1c1c1e";
    g.font = `300 30px ${FONT}`;
    g.fillText("11", x + 30, y + 49);
  }
}

function drawLock(g: G, H: number): void {
  g.fillStyle = "#fff";
  rr(g, 188, 79, 14, 10, 2.6);
  g.fill();
  g.strokeStyle = "#fff";
  g.lineWidth = 2;
  g.beginPath();
  g.arc(195, 79, 3.5, Math.PI, 0);
  g.stroke();
  text(g, "Sunday 11 October", LW / 2, 130, 20, 600, "center", 0.92);
  text(g, "11:24", LW / 2, 214, 98, 600, "center");
  // two round widgets: a battery ring and the weather
  glass(g, 126, 262, 76, 76, 38);
  g.lineWidth = 6;
  g.lineCap = "round";
  g.strokeStyle = "rgba(255,255,255,0.25)";
  g.beginPath();
  g.arc(164, 300, 29, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = "#fff";
  g.beginPath();
  g.arc(164, 300, 29, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * 0.72);
  g.stroke();
  text(g, "72%", 164, 306, 17, 600, "center");
  glass(g, 214, 262, 76, 76, 38);
  text(g, "18°", 252, 297, 22, 600, "center");
  text(g, "Clear", 252, 316, 11, 500, "center", 0.85);
  // torch and camera buttons
  for (const [x, glyph] of [[46, "weather"], [294, "camera"]] as const) {
    glass(g, x, H - 126, 50, 50, 25, 0.12);
    if (glyph === "camera") strokeGlyph(g, "camera", x + 25, H - 101, 22, "#fff");
    else {
      rr(g, x + 20, H - 114, 10, 22, 3);
      g.strokeStyle = "#fff";
      g.lineWidth = 1.8;
      g.stroke();
    }
  }
  text(g, "Swipe up to unlock", LW / 2, H - 20, 12, 500, "center", 0.7);
}

function drawHome(g: G, H: number): void {
  const tall = H >= 700;
  if (tall) {
    glass(g, 27, 70, 336, 154, 24);
    text(g, "Canberra", 45, 102, 15, 600);
    text(g, "18°", 45, 150, 44, 300);
    g.fillStyle = "#ffe29a";
    g.beginPath();
    g.arc(335, 108, 9, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#ffe29a";
    g.lineWidth = 2.4;
    g.lineCap = "round";
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      g.beginPath();
      g.moveTo(335 + Math.cos(a) * 14, 108 + Math.sin(a) * 14);
      g.lineTo(335 + Math.cos(a) * 18, 108 + Math.sin(a) * 18);
      g.stroke();
    }
    [["Now", "18°"], ["12pm", "20°"], ["2pm", "22°"], ["4pm", "21°"], ["6pm", "17°"]].forEach(([t, d], i) => {
      const x = 45 + i * 75;
      text(g, t, x + 22, 182, 12, 500, "center", 0.8);
      text(g, d, x + 22, 202, 15, 600, "center");
    });
  }
  // the app grid: four columns, 84 pt apart, as many rows as fit above the dock
  const y0 = tall ? 248 : 70;
  const dockY = H - 126;
  const rows = Math.max(1, Math.min(4, Math.floor((dockY - 40 - y0 + 22) / 102)));
  APPS.slice(0, rows * 4).forEach((app, i) => {
    const cx = 27 + (i % 4) * 84 + 42;
    const x = cx - 30;
    const y = y0 + Math.floor(i / 4) * 102;
    icon(g, app, x, y);
    text(g, app.label, cx, y + 78, 13, 600, "center");
  });
  for (let i = 0; i < 3; i++) {
    g.fillStyle = i === 0 ? "#fff" : "rgba(255,255,255,0.4)";
    g.beginPath();
    g.arc(LW / 2 - 16 + i * 16, dockY - 34, 3.5, 0, Math.PI * 2);
    g.fill();
  }
  glass(g, 12, dockY, 366, 92, 34);
  DOCK.forEach((app, i) => icon(g, app, 27 + i * 84 + 12, dockY + 16));
}

const cache = new Map<string, CanvasTexture>();

// `aspect` is the screen's height over its width (about 2.1 for a slab phone).
export function iosPhoneScreen(mode: "home" | "lock", aspect: number, cutout: ScreenCutout): CanvasTexture {
  const key = `${mode}:${aspect.toFixed(2)}:${cutout}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const texH = Math.min(TEX_MAX_H, Math.round(TEX_W * aspect));
  const texW = Math.round(texH / aspect);
  const H = LW * aspect;
  const tex = canvasTexture(texW, texH, (g) => {
    g.scale(texW / LW, texH / H);
    wallpaper(g, H);
    cutoutShape(g, cutout);
    statusBar(g, mode === "home");
    if (mode === "lock") drawLock(g, H);
    else drawHome(g, H);
    homeIndicator(g, H);
  });
  cache.set(key, tex);
  return tex;
}
