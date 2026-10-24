import type { PoolClient } from "pg";

// Shared reads used by several pages. Every call runs inside withUser(), so RLS applies.

const PLAYER_NAMES = `(select string_agg(pl.full_name, ' / ' order by cp.position)
   from card_players cp join players pl on pl.id = cp.player_id where cp.card_id = k.id)`;

const CARD_LABEL = `s.year || ' ' || s.manufacturer || ' ' || s.name || ' #' || k.card_number
  || coalesce(' ' || coalesce(k.title, ${PLAYER_NAMES}), '')`;

const VARIANT_SUFFIX = `' — ' || p.name || coalesce(' /' || coalesce(v.print_run, p.print_run), '')
  || case when v.is_autograph then ' Auto' else '' end || case when v.is_relic then ' Relic' else '' end`;

export type Option = { id: string; label: string };

export type Profile = { id: string; username: string; display_name: string | null; is_admin: boolean };

export async function listProfiles(db: PoolClient): Promise<Profile[]> {
  // Explicit columns: the app role can't read profiles.email.
  return (await db.query("select id, username, display_name, is_admin from profiles order by username")).rows;
}

export async function listCards(db: PoolClient): Promise<Option[]> {
  const sql = `select k.id, ${CARD_LABEL} as label
    from cards k join sets s on s.id = k.set_id order by s.year desc, s.manufacturer, s.name, k.card_number`;
  return (await db.query(sql)).rows;
}

export async function listVariants(db: PoolClient): Promise<Option[]> {
  const sql = `select v.id, ${CARD_LABEL} || ${VARIANT_SUFFIX} as label
    from card_variants v join cards k on k.id = v.card_id join sets s on s.id = k.set_id
    join parallels p on p.id = v.parallel_id
    order by s.year desc, s.manufacturer, s.name, k.card_number, p.name, v.is_autograph, v.is_relic`;
  return (await db.query(sql)).rows;
}

export async function listGradingCompanies(db: PoolClient): Promise<string[]> {
  return (await db.query("select id from grading_companies order by id")).rows.map((r) => r.id);
}

// One row of copy_details (the view), with a readable label built from it.
export type CopyRow = {
  copy_id: string; owner_id: string; variant_id: string; card_id: string;
  serial_number: number | null; print_run: number | null;
  grading_company_id: string | null; grade: string | null; cert_number: string | null;
  acquired_at: string | null; paid_price_cents: number | null; listed_price_cents: number | null;
  sold_price_cents: number | null; sold_at: string | null; is_sold: boolean; is_tradeable: boolean;
  market_price_cents: number | null; label: string;
};

// Columns other users may see (no paid/listed/sold prices), per the sketch's note on trade screens.
export const PUBLIC_COPY_COLUMNS = `copy_id, owner_id, variant_id, card_id, serial_number, print_run,
  grading_company_id, grade, cert_number, is_tradeable,
  year || ' ' || manufacturer || ' ' || set_name || ' #' || card_number || coalesce(' ' || card_name, '')
  || ' — ' || parallel || case when is_autograph then ' Auto' else '' end
  || case when is_relic then ' Relic' else '' end as label`;

export const OWNER_COPY_COLUMNS = `${PUBLIC_COPY_COLUMNS}, acquired_at, paid_price_cents, listed_price_cents,
  sold_price_cents, sold_at, is_sold, market_price_cents`;

export function describeCopy(c: Pick<CopyRow, "label" | "serial_number" | "print_run" | "grading_company_id" | "grade">) {
  const serial = c.serial_number ? ` #${c.serial_number}${c.print_run ? `/${c.print_run}` : ""}` : "";
  const grade = c.grading_company_id ? ` (${c.grading_company_id} ${Number(c.grade)})` : ""; // "10.0" -> "10"
  return `${c.label}${serial}${grade}`;
}
