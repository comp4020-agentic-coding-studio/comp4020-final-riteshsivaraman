// Reuses the real, sourced catalogue (SCOPE D37, src/shared/catalogue.ts)
// rather than inventing placeholder products for the sim -- the point of
// this prototype is the interaction model, not the product data, and the
// real data is already there and already right.
import { PRODUCTS, type Product } from "../../src/shared/catalogue.ts";

export const SIM_PRODUCTS: Product[] = PRODUCTS;

export function priceOf(product: Product, storage: string): number {
  return product.priceByStorage[storage] ?? product.priceByStorage[product.storageOptions[0]];
}
