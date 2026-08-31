// ─────────────────────────────────────────────────────────────────────────────
// Small dependency-free validators. Tool parameters come from the NLU layer
// (not raw user input), but everything is re-validated here before it reaches
// Supabase — the model is never a security boundary.
// ─────────────────────────────────────────────────────────────────────────────

export type FieldError = { field: string; message: string };
export type ValidateResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: FieldError[] };

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export function isNonEmptyString(v: unknown, max = 200): v is string {
  return typeof v === "string" && v.trim().length > 0 && v.trim().length <= max;
}

/** A string that may be empty (e.g. an optional description), bounded in length. */
export function isStringMax(v: unknown, max = 200): v is string {
  return typeof v === "string" && v.length <= max;
}

export function isInt(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}

export function isYear(v: unknown): v is number {
  if (!isInt(v, 1900, 2100)) return false;
  return v <= new Date().getFullYear() + 5;
}

export function isSemester(v: unknown): v is "Ganjil" | "Genap" {
  return v === "Ganjil" || v === "Genap";
}

export function isPrice(v: unknown): v is number {
  return isInt(v, 0, 1_000_000_000_000); // up to 1 triliun
}

export function isBarcode(v: unknown): v is string {
  return typeof v === "string" && /^\d{12,14}$/.test(v.trim());
}

export function fail(errors: FieldError[]): ValidateResult<never> {
  return { ok: false, errors };
}
