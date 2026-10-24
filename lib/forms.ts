// Small helpers for reading plain HTML form fields.

export function text(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

export function int(fd: FormData, key: string): number | null {
  const v = text(fd, key);
  if (v === null) return null;
  const n = Number(v);
  if (!Number.isInteger(n)) throw new UserError(`${key} must be a whole number`);
  return n;
}

export function decimal(fd: FormData, key: string): number | null {
  const v = text(fd, key);
  if (v === null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new UserError(`${key} must be a number`);
  return n;
}

// "12.50" dollars -> 1250 cents.
export function cents(fd: FormData, key: string): number | null {
  const n = decimal(fd, key);
  return n === null ? null : Math.round(n * 100);
}

export const checked = (fd: FormData, key: string) => fd.get(key) === "on";

export const all = (fd: FormData, key: string) =>
  fd.getAll(key).filter((v): v is string => typeof v === "string" && v !== "");

export function money(c: number | null | undefined): string {
  return c === null || c === undefined ? "" : `$${(c / 100).toFixed(2)}`;
}

// An error whose message is safe to show the user as-is.
export class UserError extends Error {}
