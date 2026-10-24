"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { PoolClient } from "pg";
import { withUser } from "@/lib/db";
import { all, cents, checked, decimal, int, text, UserError } from "@/lib/forms";
import { log } from "@/lib/log";
import { currentUserId, TEST_USER_COOKIE, testLoginEnabled } from "@/lib/session";

// Every form posts here. Each action runs as the signed-in test user (so RLS applies), then
// redirects back to the page it came from with ?ok=… or ?error=… for the page to show.

function backTo(fd: FormData) {
  const back = text(fd, "back");
  return back && back.startsWith("/") && !back.startsWith("//") ? back : "/";
}

function withMessage(path: string, kind: "ok" | "error", message: string) {
  const url = new URL(path, "http://local");
  url.searchParams.delete("ok");
  url.searchParams.delete("error");
  url.searchParams.set(kind, message);
  return url.pathname + url.search;
}

// Postgres errors we expect and whose messages are safe to show; everything else is logged.
const SHOWN_CODES = new Set(["P0001", "P0002", "28000", "42501", "23503", "23514", "22023"]);

function describe(action: string, err: unknown): string {
  if (err instanceof UserError) return err.message;
  const code = (err as { code?: string }).code;
  if (code && SHOWN_CODES.has(code)) {
    log.warn("action_rejected", { action, code });
    return (err as Error).message;
  }
  if (code === "23505") return "That already exists.";
  if (code === "22P02" || code === "22007") return "One of the values isn't valid.";
  if (code === "42P01") return "The database schema isn't applied in this environment.";
  log.error("action_failed", { action, code, message: (err as Error).message });
  return "Something went wrong. It has been logged as action_failed.";
}

async function act(fd: FormData, action: string, fn: (db: PoolClient, me: string) => Promise<string>) {
  let target: string;
  try {
    const me = await currentUserId();
    if (!me) throw new UserError("Pick a test user at the top of the page first.");
    const message = await withUser(me, (db) => fn(db, me));
    target = withMessage(backTo(fd), "ok", message);
  } catch (err) {
    target = withMessage(backTo(fd), "error", describe(action, err));
  }
  redirect(target); // outside try: redirect() works by throwing
}

function required<T>(value: T | null, label: string): T {
  if (value === null) throw new UserError(`${label} is required.`);
  return value;
}

// ── Test login ──────────────────────────────────────────────

export async function switchUser(fd: FormData) {
  if (testLoginEnabled()) {
    const store = await cookies();
    const user = text(fd, "user");
    if (user) store.set(TEST_USER_COOKIE, user, { httpOnly: true, sameSite: "lax", path: "/" });
    else store.delete(TEST_USER_COOKIE);
  }
  // Stay on the page the switcher was used from (the layout doesn't know its own path).
  let back = "/";
  try {
    const ref = new URL((await headers()).get("referer") ?? "");
    back = withMessage(ref.pathname + ref.search, "ok", "Switched user.");
  } catch {}
  redirect(back);
}

// ── Catalog ─────────────────────────────────────────────────

export async function createSet(fd: FormData) {
  await act(fd, "create_set", async (db, me) => {
    const { rows } = await db.query(
      `insert into sets (sport, year, manufacturer, name, created_by) values ($1, $2, $3, $4, $5) returning id`,
      [required(text(fd, "sport"), "Sport"), required(int(fd, "year"), "Year"),
       required(text(fd, "manufacturer"), "Manufacturer"), required(text(fd, "name"), "Name"), me],
    );
    log.info("set_created", { setId: rows[0].id });
    return "Set added (with a Base parallel).";
  });
}

export async function createParallel(fd: FormData) {
  await act(fd, "create_parallel", async (db, me) => {
    await db.query(
      "insert into parallels (set_id, name, print_run, created_by) values ($1, $2, $3, $4)",
      [required(text(fd, "set_id"), "Set"), required(text(fd, "name"), "Name"), int(fd, "print_run"), me],
    );
    return "Parallel added.";
  });
}

// A card, its players (found by name or created), and its Base variant.
export async function createCard(fd: FormData) {
  await act(fd, "create_card", async (db, me) => {
    const setId = required(text(fd, "set_id"), "Set");
    const { rows: [card] } = await db.query(
      `insert into cards (set_id, card_number, title, is_rookie, created_by) values ($1, $2, $3, $4, $5) returning id`,
      [setId, required(text(fd, "card_number"), "Card number"), text(fd, "title"), checked(fd, "is_rookie"), me],
    );
    const names = (text(fd, "players") ?? "").split(",").map((n) => n.trim()).filter(Boolean);
    for (const [i, name] of names.entries()) {
      const found = await db.query("select id from players where lower(full_name) = lower($1) limit 1", [name]);
      const playerId = found.rows[0]?.id ?? (await db.query(
        "insert into players (full_name, created_by) values ($1, $2) returning id", [name, me],
      )).rows[0].id;
      await db.query("insert into card_players (card_id, player_id, position) values ($1, $2, $3)", [card.id, playerId, i + 1]);
    }
    await db.query(
      `insert into card_variants (card_id, parallel_id, created_by)
       select $1, id, $3 from parallels where set_id = $2 and name = 'Base'`,
      [card.id, setId, me],
    );
    return "Card added (with its Base variant).";
  });
}

export async function createVariant(fd: FormData) {
  await act(fd, "create_variant", async (db, me) => {
    await db.query(
      `insert into card_variants (card_id, parallel_id, is_autograph, is_relic, print_run, created_by)
       values ($1, $2, $3, $4, $5, $6)`,
      [required(text(fd, "card_id"), "Card"), required(text(fd, "parallel_id"), "Parallel"),
       checked(fd, "is_autograph"), checked(fd, "is_relic"), int(fd, "print_run"), me],
    );
    return "Variant added.";
  });
}

// ── Collection ──────────────────────────────────────────────

export async function addCopy(fd: FormData) {
  await act(fd, "add_copy", async (db) => {
    const company = text(fd, "grading_company_id");
    const grade = decimal(fd, "grade");
    if ((company === null) !== (grade === null)) throw new UserError("Enter both a grading company and a grade, or neither.");
    const serial = int(fd, "serial_number");
    const details = {
      grading_company_id: company, grade, cert_number: text(fd, "cert_number"),
      condition_notes: text(fd, "condition_notes"), acquired_at: text(fd, "acquired_at"),
      paid_price_cents: cents(fd, "paid_price"),
    };
    const { rows: [{ result }] } = await db.query(
      "select add_copy($1, $2, $3, $4) as result",
      [required(text(fd, "variant_id"), "Card variant"), serial, details, text(fd, "note")],
    );
    if (result.status === "conflict") {
      log.info("serial_conflict_opened", { conflictId: result.conflict_id });
      return `Serial #${serial} is already in another collection, so this was sent to an admin for review.`;
    }
    log.info("copy_added", { copyId: result.copy_id });
    return "Card added to your collection.";
  });
}

async function updateOwnCopy(db: PoolClient, me: string, copyId: string | null, set: string, params: unknown[]) {
  const { rowCount } = await db.query(
    `update copies set ${set} where id = $1 and owner_id = $2`,
    [required(copyId, "Copy"), me, ...params],
  );
  if (!rowCount) throw new UserError("That card isn't in your collection.");
}

export async function setTradeable(fd: FormData) {
  await act(fd, "set_tradeable", async (db, me) => {
    const on = text(fd, "on") === "1";
    await updateOwnCopy(db, me, text(fd, "copy_id"),
      "is_tradeable = $3, tradeable_since = case when $3 then now() end", [on]);
    return on ? "Marked tradeable." : "No longer tradeable (any open offers including it were cancelled).";
  });
}

export async function setListedPrice(fd: FormData) {
  await act(fd, "set_listed_price", async (db, me) => {
    await updateOwnCopy(db, me, text(fd, "copy_id"), "listed_price_cents = $3", [cents(fd, "listed_price")]);
    return "Listed price saved.";
  });
}

export async function markSold(fd: FormData) {
  await act(fd, "mark_sold", async (db, me) => {
    await updateOwnCopy(db, me, text(fd, "copy_id"), "sold_price_cents = $3, sold_at = $4",
      [required(cents(fd, "sold_price"), "Sold price"), text(fd, "sold_at")]);
    return "Marked sold.";
  });
}

export async function undoSale(fd: FormData) {
  await act(fd, "undo_sale", async (db, me) => {
    await updateOwnCopy(db, me, text(fd, "copy_id"), "sold_price_cents = null, sold_at = null", []);
    return "Sale undone; the card is back in your inventory.";
  });
}

export async function deleteCopy(fd: FormData) {
  await act(fd, "delete_copy", async (db, me) => {
    const { rowCount } = await db.query("delete from copies where id = $1 and owner_id = $2", [text(fd, "copy_id"), me]);
    if (!rowCount) throw new UserError("That card isn't in your collection.");
    return "Card deleted.";
  });
}

// ── Wishlist ────────────────────────────────────────────────

export async function addWant(fd: FormData) {
  await act(fd, "add_want", async (db, me) => {
    const [kind, id] = (required(text(fd, "target"), "Card or variant")).split(":");
    const company = text(fd, "min_grading_company_id");
    const grade = decimal(fd, "min_grade");
    await db.query(
      `insert into wants (user_id, card_id, variant_id, min_grading_company_id, min_grade, max_price_cents, notes, is_public)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [me, kind === "card" ? id : null, kind === "variant" ? id : null, company, grade,
       cents(fd, "max_price"), text(fd, "notes"), checked(fd, "is_public")],
    );
    return "Added to your wishlist.";
  });
}

export async function deleteWant(fd: FormData) {
  await act(fd, "delete_want", async (db) => {
    await db.query("delete from wants where id = $1", [text(fd, "want_id")]); // RLS: only your own
    return "Removed from your wishlist.";
  });
}

// ── Trades ──────────────────────────────────────────────────

export async function proposeTrade(fd: FormData) {
  await act(fd, "propose_trade", async (db) => {
    const { rows: [{ id }] } = await db.query(
      "select propose_trade($1, $2::uuid[], $3::uuid[], $4, $5) as id",
      [text(fd, "recipient"), all(fd, "mine"), all(fd, "theirs"), text(fd, "message"), text(fd, "replaces")],
    );
    log.info("trade_proposed", { tradeId: id, counter: text(fd, "replaces") !== null });
    return text(fd, "replaces") ? "Counteroffer sent." : "Trade proposed.";
  });
}

export async function respondTrade(fd: FormData) {
  await act(fd, "respond_trade", async (db) => {
    const tradeId = text(fd, "trade_id");
    const { rows: [{ status }] } = await db.query("select respond_trade($1, $2) as status", [tradeId, text(fd, "action")]);
    log.info("trade_status_changed", { tradeId, status });
    return `Trade ${status}.`;
  });
}

export async function completeTrade(fd: FormData) {
  await act(fd, "complete_trade", async (db) => {
    const tradeId = text(fd, "trade_id");
    await db.query("select complete_trade($1)", [tradeId]);
    log.info("trade_completed", { tradeId });
    return "Trade completed. The cards have changed owners.";
  });
}

// ── Admin ───────────────────────────────────────────────────

export async function resolveConflict(fd: FormData) {
  await act(fd, "resolve_conflict", async (db) => {
    const approve = text(fd, "decision") === "approve";
    const conflictId = text(fd, "conflict_id");
    await db.query("select resolve_conflict($1, $2, $3)", [conflictId, approve, text(fd, "note")]);
    log.info("serial_conflict_resolved", { conflictId, approved: approve });
    return approve ? "Approved; the submitted card was added." : "Rejected.";
  });
}

export async function adminUpdateSerial(fd: FormData) {
  await act(fd, "admin_update_serial", async (db) => {
    const { rowCount } = await db.query("update copies set serial_number = $2 where id = $1",
      [text(fd, "copy_id"), int(fd, "serial_number")]); // RLS: admins only for other users' copies
    if (!rowCount) throw new UserError("Copy not found, or you're not an admin.");
    return "Serial number updated.";
  });
}

export async function adminDeleteCopy(fd: FormData) {
  await act(fd, "admin_delete_copy", async (db) => {
    const { rowCount } = await db.query("delete from copies where id = $1", [text(fd, "copy_id")]);
    if (!rowCount) throw new UserError("Copy not found, or you're not an admin.");
    return "Copy deleted.";
  });
}
