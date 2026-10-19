// The store's mark, drawn in a 2D canvas, for every device, box and screen that
// carries it. The same shape as public/brand/logo.png (a bracket round a small
// square, picked 2026-10-19 from four options made with the course image
// proxy, docs/experiments/logo), so a canvas texture needs no image to load.
type G = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const W = 332; // the mark's own box, in the units below
const H = 310;

// Draws the mark centred on (cx, cy), `size` tall, in one colour.
export function drawLogo(g: G, cx: number, cy: number, size: number, colour: string): void {
  const k = size / H;
  g.save();
  g.translate(cx - (W * k) / 2, cy - size / 2);
  g.scale(k, k);
  g.fillStyle = colour;
  g.beginPath();
  g.moveTo(60, 0);
  g.lineTo(332, 0);
  g.lineTo(332, 155);
  g.lineTo(257, 155);
  g.lineTo(257, 73);
  g.lineTo(74, 73);
  g.lineTo(74, 235);
  g.lineTo(332, 235);
  g.lineTo(332, 310);
  g.lineTo(60, 310);
  g.quadraticCurveTo(0, 310, 0, 250);
  g.lineTo(0, 60);
  g.quadraticCurveTo(0, 0, 60, 0);
  g.closePath();
  g.fill();
  g.fillRect(116, 117, 100, 76);
  g.restore();
}
