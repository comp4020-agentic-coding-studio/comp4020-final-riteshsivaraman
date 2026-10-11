import { describe, expect, it } from "vitest";
import { Box3 } from "three";
import {
  ALL_COMPUTER_MODEL_IDS,
  DESKTOP_MODELS,
  DISPLAY_MODELS,
  LAPTOP_MODELS,
  TABLET_MODELS,
  displaySize,
  laptopBezels,
  laptopGeo,
  tabletBezel,
  tabletGeo,
} from "../src/client/src/gfx/computers-geo.ts";

// Promise (SCOPE D37): every iPad, Mac and display the store draws is a
// distinct real model. No two models share the parameters that identify them
// on a table (size, thickness, bezel, notch, camera, ports, stand), so a
// copy-pasted spec, or one model silently standing in for another, fails
// here. Also: the display fits inside every body it is drawn on (bezels are
// derived from the sourced resolution and ppi, so a wrong number shows up as
// a negative bezel), and the drawn geometry is the size its spec says.

const sig = (o: unknown) => JSON.stringify(o);

function expectAllDifferent(label: string, entries: Array<[string, unknown]>) {
  const seen = new Map<string, string>();
  for (const [id, key] of entries) {
    const k = sig(key);
    expect(seen.get(k), `${label}: ${id} is identical to ${seen.get(k)}`).toBeUndefined();
    seen.set(k, id);
  }
}

describe("computer models", () => {
  it("has a unique id per model across every family", () => {
    expect(new Set(ALL_COMPUTER_MODEL_IDS).size).toBe(ALL_COMPUTER_MODEL_IDS.length);
  });

  it("keys every registry by the spec's own id", () => {
    for (const reg of [LAPTOP_MODELS, TABLET_MODELS, DISPLAY_MODELS, DESKTOP_MODELS]) {
      for (const [id, spec] of Object.entries(reg)) expect(spec.id).toBe(id);
    }
  });

  it("gives no two laptops the same body, display, notch or ports", () => {
    const ls = Object.values(LAPTOP_MODELS);
    expectAllDifferent("laptop body", ls.map((s) => [s.id, [s.W, s.D, s.T]]));
    expectAllDifferent("laptop display", ls.map((s) => [s.id, [s.res, s.ppi]]));
    expectAllDifferent("laptop look", ls.map((s) => [s.id, [s.W, s.notch, s.deck, s.ports]]));
  });

  it("gives no two tablets the same body or display", () => {
    const ts = Object.values(TABLET_MODELS);
    expectAllDifferent("tablet body", ts.map((s) => [s.id, [s.W, s.H, s.t]]));
    expectAllDifferent("tablet look", ts.map((s) => [s.id, [s.W, s.H, s.t, s.res, s.rear, s.frontCam, s.keyboard]]));
  });

  it("tells the two 27-inch displays apart by stand and back, since their housings match", () => {
    const ds = Object.values(DISPLAY_MODELS);
    expectAllDifferent("display stand", ds.map((s) => [s.id, s.stand])); // the real, drawn distinction
    expectAllDifferent("display vents", ds.map((s) => [s.id, s.ventRows])); // sourced data only, not drawn (ventRows' own comment says why)
  });

  it("gives no two desktops the same shape", () => {
    expectAllDifferent(
      "desktop",
      Object.values(DESKTOP_MODELS).map((s) => [s.id, s.kind === "box" ? [s.kind, s.W, s.H] : [s.kind, s.W, s.Hh]]),
    );
  });

  it("fits each laptop's display inside its lid, with a real bezel", () => {
    for (const s of Object.values(LAPTOP_MODELS)) {
      const b = laptopBezels(s);
      expect(b.side, s.id).toBeGreaterThan(0.002);
      expect(b.bottom, s.id).toBeGreaterThan(b.side);
    }
    // the entry model's bezels are the thickest (sourced: "thicker bezels all around")
    const neo = laptopBezels(LAPTOP_MODELS["macbook-neo"]).side;
    for (const s of Object.values(LAPTOP_MODELS)) if (s.id !== "macbook-neo") expect(laptopBezels(s).side, s.id).toBeLessThan(neo);
  });

  it("fits each tablet's display inside its body, with a real bezel all round", () => {
    for (const s of Object.values(TABLET_MODELS)) {
      const b = tabletBezel(s);
      expect(b.x, s.id).toBeGreaterThan(0.004);
      expect(b.y, s.id).toBeGreaterThan(0.004);
    }
  });

  it("shows the tablet sizes apart at a glance (the mini is clearly smaller than the 11-inch models)", () => {
    const mini = TABLET_MODELS["ipad-mini"];
    for (const id of ["ipad", "ipad-air-11", "ipad-pro-11"]) expect(mini.W, id).toBeLessThan(TABLET_MODELS[id].W * 0.85);
    expect(TABLET_MODELS["ipad-pro-13"].W).toBeGreaterThan(TABLET_MODELS["ipad-pro-11"].W * 1.1);
    expect(TABLET_MODELS["ipad-air-13"].W).toBeGreaterThan(TABLET_MODELS["ipad-air-11"].W * 1.1);
  });

  it("draws each body at its spec's width", () => {
    for (const s of Object.values(LAPTOP_MODELS)) {
      const box = new Box3().setFromBufferAttribute(laptopGeo(s).body.getAttribute("position") as never);
      expect(box.max.x - box.min.x, s.id).toBeCloseTo(s.W, 3);
    }
    for (const s of Object.values(TABLET_MODELS)) {
      // the side buttons stand about 1 mm proud of the left edge
      const box = new Box3().setFromBufferAttribute(tabletGeo(s).body.getAttribute("position") as never);
      expect(box.max.x - box.min.x, s.id).toBeGreaterThanOrEqual(s.W - 1e-4);
      expect(box.max.x - box.min.x, s.id).toBeLessThan(s.W + 0.003);
    }
  });

  it("derives a 27-inch display from the sourced 5K resolution", () => {
    const [w, h] = displaySize(DISPLAY_MODELS["studio-display"].res, DISPLAY_MODELS["studio-display"].ppi);
    expect(Math.hypot(w, h) / 0.0254).toBeCloseTo(27, 0);
  });
});
