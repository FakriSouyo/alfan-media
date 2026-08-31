// ─────────────────────────────────────────────────────────────────────────────
// Navigation actions.
//
// URLs are built ONLY from this whitelist of app routes plus database-returned
// ids that pass UUID validation. User text never reaches a URL directly.
// ─────────────────────────────────────────────────────────────────────────────

import type { NavigateAction } from "../types";
import { UUID_RE } from "../schemas/validate";

/** Static destination whitelist (mirrors the app routing). */
export const NAV_DESTINATIONS = {
  dashboard: "/dashboard",
  sales: "/sales",
  salesNew: "/sales/new",
  salesOrders: "/sales/orders",
  products: "/stock/products",
  productNew: "/stock/products/new",
  categories: "/stock/categories",
  reports: "/reports",
  reportsSales: "/reports/sales",
  reportsInventory: "/reports/inventory",
  settings: "/settings",
} as const;

export type NavDestination = keyof typeof NAV_DESTINATIONS;

export function navTo(
  destination: NavDestination,
  label: string,
  description?: string,
): NavigateAction {
  return { type: "navigate", label, href: NAV_DESTINATIONS[destination], description };
}

/**
 * Deep link to one product. The id MUST come from a tool result (DB) and is
 * validated as UUID before being placed in the path.
 */
export function navToProduct(id: string, label = "Lihat Produk"): NavigateAction | null {
  if (!UUID_RE.test(id)) return null; // never build URLs from unvalidated input
  return { type: "navigate", label, href: `/stock/products/${id}` };
}
