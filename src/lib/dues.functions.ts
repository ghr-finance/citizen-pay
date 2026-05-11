import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { query } from "./db.server";
import { readSession } from "./session.server";

async function requireAuth() {
  const s = await readSession();
  if (!s) throw new Error("Tidak diizinkan");
  return s;
}

export const listDuesTypes = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();
    const rows = await query<{
      id: string;
      name: string;
      amount_default: string;
      period: string;
      active: boolean;
    }>(
      `SELECT id, name, amount_default, period, active FROM dues_types ORDER BY created_at DESC`,
    );
    return { duesTypes: rows };
  },
);

const DuesTypeInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(255),
  amountDefault: z.number().min(0),
  period: z.enum(["monthly", "one_time"]),
  active: z.boolean(),
});

export const upsertDuesType = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => DuesTypeInput.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    if (data.id) {
      await query(
        `UPDATE dues_types SET name=$1, amount_default=$2, period=$3, active=$4 WHERE id=$5`,
        [data.name, data.amountDefault, data.period, data.active, data.id],
      );
      return { id: data.id };
    }
    const rows = await query<{ id: string }>(
      `INSERT INTO dues_types (name, amount_default, period, active)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [data.name, data.amountDefault, data.period, data.active],
    );
    return { id: rows[0].id };
  });

export const deleteDuesType = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    await query(`DELETE FROM dues_types WHERE id=$1`, [data.id]);
    return { ok: true as const };
  });

const GenerateInput = z.object({
  duesTypeId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  dueDate: z.string().optional().nullable(),
});

export const generateMonthlyPeriod = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => GenerateInput.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    // upsert period
    const periodRows = await query<{ id: string; amount_default: string }>(
      `WITH ins AS (
         INSERT INTO dues_periods (dues_type_id, year, month)
         VALUES ($1, $2, $3)
         ON CONFLICT (dues_type_id, year, month) DO NOTHING
         RETURNING id
       )
       SELECT COALESCE((SELECT id FROM ins),
              (SELECT id FROM dues_periods WHERE dues_type_id=$1 AND year=$2 AND month=$3)) AS id,
              (SELECT amount_default FROM dues_types WHERE id=$1) AS amount_default`,
      [data.duesTypeId, data.year, data.month],
    );
    const periodId = periodRows[0].id;
    const amount = Number(periodRows[0].amount_default);

    const result = await query<{ inserted: number }>(
      `WITH ins AS (
         INSERT INTO bills (resident_id, dues_period_id, amount, due_date)
         SELECT r.id, $1, $2, $3 FROM residents r WHERE r.status='active'
         ON CONFLICT (resident_id, dues_period_id) DO NOTHING
         RETURNING id
       )
       SELECT COUNT(*)::int AS inserted FROM ins`,
      [periodId, amount, data.dueDate || null],
    );
    return { periodId, inserted: result[0].inserted };
  });
