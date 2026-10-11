import { describe, expect, it } from "vitest";
import { defaultStorage, PRODUCTS, productById, START_STOCK } from "../src/shared/catalogue.ts";

// Promise: the catalogue is internally consistent — every id is unique,
// every colour the shop claims to stock a product in actually has a stock
// row, every storage option has a real price, and nothing is missing a
// price. A copy-paste across models (SCOPE D37's "every model is different")
// going wrong here is a data bug, not a look bug — that's phones-geo.ts's
// spec's job.

describe("the catalogue", () => {
  it("has a unique id per product", () => {
    const ids = PRODUCTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every product at least one colour and one storage option", () => {
    for (const p of PRODUCTS) {
      expect(p.colours.length, p.id).toBeGreaterThan(0);
      expect(p.storageOptions.length, p.id).toBeGreaterThan(0);
    }
  });

  it("prices every storage option it lists, and nothing extra", () => {
    for (const p of PRODUCTS) {
      expect(Object.keys(p.priceByStorage).sort(), p.id).toEqual([...p.storageOptions].sort());
      for (const storage of p.storageOptions) expect(p.priceByStorage[storage], `${p.id} ${storage}`).toBeGreaterThan(0);
    }
  });

  it("sources every product (SCOPE D37: no invented names)", () => {
    for (const p of PRODUCTS) expect(p.source.length, p.id).toBeGreaterThan(0);
  });

  it("looks up a product by id, and not by a bad one", () => {
    expect(productById(PRODUCTS[0].id)?.id).toBe(PRODUCTS[0].id);
    expect(productById("not-a-real-product")).toBeUndefined();
  });

  it("names the cheapest storage option as the default SKU", () => {
    for (const p of PRODUCTS) {
      const cheapest = [...p.storageOptions].sort((a, b) => p.priceByStorage[a] - p.priceByStorage[b])[0];
      expect(defaultStorage(p), p.id).toBe(cheapest);
    }
  });

  it("stocks every product in every colour it claims to come in, at the default storage", () => {
    for (const p of PRODUCTS) {
      const byColour = START_STOCK[p.id];
      expect(byColour, p.id).toBeDefined();
      for (const colour of p.colours) {
        expect(byColour[colour], `${p.id} ${colour}`).toBeDefined();
        expect(byColour[colour][defaultStorage(p)], `${p.id} ${colour} ${defaultStorage(p)}`).toBeTypeOf("number");
      }
    }
  });

  it("never stocks a colour or storage the product doesn't claim to have", () => {
    for (const [id, byColour] of Object.entries(START_STOCK)) {
      const p = productById(id);
      expect(p, id).toBeDefined();
      for (const [colour, byStorage] of Object.entries(byColour)) {
        expect(p!.colours, `${id} ${colour}`).toContain(colour);
        for (const storage of Object.keys(byStorage)) expect(p!.storageOptions, `${id} ${colour} ${storage}`).toContain(storage);
      }
    }
  });

  it("never stocks a negative quantity", () => {
    for (const byColour of Object.values(START_STOCK)) {
      for (const byStorage of Object.values(byColour)) {
        for (const qty of Object.values(byStorage)) expect(qty).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
