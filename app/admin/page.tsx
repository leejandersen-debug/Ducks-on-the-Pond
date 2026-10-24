import { adminDeleteCopy, adminUpdateSerial, resolveConflict } from "../actions";
import { Flash, type FlashParams } from "../flash";
import { withUser } from "@/lib/db";
import { dbProblem } from "@/lib/db-status";
import { money } from "@/lib/forms";
import { describeCopy, listProfiles, listVariants, PUBLIC_COPY_COLUMNS } from "@/lib/queries";
import { currentUserId } from "@/lib/session";

const BACK = "/admin";

export default async function AdminPage({ searchParams }: { searchParams: FlashParams }) {
  if (await dbProblem()) return null; // the layout shows the reason
  const sp = await searchParams;
  const me = await currentUserId();
  const data = await withUser(me, async (db) => {
    const profiles = await listProfiles(db);
    if (!profiles.find((p) => p.id === me)?.is_admin) return null;
    const conflicts = (await db.query(
      "select * from serial_conflicts order by status <> 'open', created_at desc limit 50",
    )).rows;
    const existingIds = conflicts.map((k) => k.existing_copy_id).filter(Boolean);
    const existing = (await db.query(
      `select ${PUBLIC_COPY_COLUMNS} from copy_details where copy_id = any($1::uuid[])`, [existingIds],
    )).rows;
    return { profiles, conflicts, existing, variants: await listVariants(db) };
  });
  if (!data) return <main><h1>Admin</h1><p>Admins only. Switch to Carol (admin) to use this page.</p></main>;

  const name = (id: string | null) => data.profiles.find((p) => p.id === id)?.username ?? id;
  const variant = (id: string) => data.variants.find((v) => v.id === id)?.label ?? id;

  return (
    <main>
      <h1>Admin: serial-number conflicts</h1>
      <Flash ok={sp.ok} error={sp.error} />
      <p>
        Someone tried to add a serial number another collection already holds. To approve, first fix
        the existing copy&apos;s serial or delete it, then approve. Admin emails aren&apos;t wired up yet.
      </p>
      {data.conflicts.length === 0 && <p>No conflicts.</p>}
      {data.conflicts.map((k) => {
        const held = data.existing.find((c) => c.copy_id === k.existing_copy_id);
        const pending = k.pending_copy ?? {};
        return (
          <section key={k.id} style={{ border: "1px solid", padding: 8, marginBottom: 8 }}>
            <p><strong>{k.status}</strong>: {variant(k.variant_id)} serial #{k.serial_number}</p>
            <p>
              Submitted by {name(k.submitted_by)} on {new Date(k.created_at).toLocaleString()}
              {k.submitter_note ? `, note: "${k.submitter_note}"` : ""}.
              Their copy: {[pending.grading_company_id && `${pending.grading_company_id} ${pending.grade}`,
                pending.cert_number && `cert ${pending.cert_number}`, pending.condition_notes,
                pending.paid_price_cents != null && `paid ${money(pending.paid_price_cents)}`]
                .filter(Boolean).join(", ") || "no other details"}
            </p>
            <p>
              Existing copy:{" "}
              {held ? `${describeCopy(held)}, owned by ${name(held.owner_id)}`
                : k.existing_copy_id ? "(not visible)" : "deleted"}
            </p>
            {k.status === "open" && (
              <>
                {held && (
                  <div>
                    <form action={adminUpdateSerial} style={{ display: "inline" }}>
                      <input type="hidden" name="back" value={BACK} />
                      <input type="hidden" name="copy_id" value={held.copy_id} />
                      Change existing copy&apos;s serial to <input name="serial_number" type="number" min={1} size={5} required />{" "}
                      <button>Save</button>
                    </form>{" "}
                    or{" "}
                    <form action={adminDeleteCopy} style={{ display: "inline" }}>
                      <input type="hidden" name="back" value={BACK} />
                      <input type="hidden" name="copy_id" value={held.copy_id} />
                      <button>Delete existing copy</button>
                    </form>
                  </div>
                )}
                <form action={resolveConflict}>
                  <input type="hidden" name="back" value={BACK} />
                  <input type="hidden" name="conflict_id" value={k.id} />
                  Note <input name="note" size={40} />{" "}
                  <button name="decision" value="approve">Approve</button>{" "}
                  <button name="decision" value="reject">Reject</button>
                </form>
              </>
            )}
            {k.status !== "open" && (
              <p>Resolved by {name(k.resolved_by)}{k.resolution_note ? `: ${k.resolution_note}` : ""}</p>
            )}
          </section>
        );
      })}
    </main>
  );
}
