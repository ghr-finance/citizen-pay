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

import {
  computeBillAmount,
  periodsUpToNow,
  SYSTEM_START_YEAR,
  SYSTEM_START_MONTH,
} from "./billing-rules";

const GenerateInput = z.object({
  duesTypeId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  dueDate: z.string().optional().nullable(),
});

async function generateBillsForPeriod(opts: {
  duesTypeId: string;
  year: number;
  month: number;
  dueDate?: string | null;
}): Promise<{ periodId: string; inserted: number }> {
  if (
    opts.year < SYSTEM_START_YEAR ||
    (opts.year === SYSTEM_START_YEAR && opts.month < SYSTEM_START_MONTH)
  ) {
    return { periodId: "", inserted: 0 };
  }
  // Upsert period + ambil info dues_type
  const periodRows = await query<{
    id: string;
    amount_default: string;
    name: string;
  }>(
    `WITH ins AS (
       INSERT INTO dues_periods (dues_type_id, year, month)
       VALUES ($1, $2, $3)
       ON CONFLICT (dues_type_id, year, month) DO NOTHING
       RETURNING id
     )
     SELECT COALESCE((SELECT id FROM ins),
            (SELECT id FROM dues_periods WHERE dues_type_id=$1 AND year=$2 AND month=$3)) AS id,
            (SELECT amount_default FROM dues_types WHERE id=$1) AS amount_default,
            (SELECT name FROM dues_types WHERE id=$1) AS name`,
    [opts.duesTypeId, opts.year, opts.month],
  );
  const periodId = periodRows[0].id;
  const defaultAmount = Number(periodRows[0].amount_default);
  const duesName = periodRows[0].name;

  const residents = await query<{
    id: string;
    full_name: string;
    status: "active" | "inactive";
  }>(`SELECT id, full_name, status FROM residents`);

  let inserted = 0;
  for (const r of residents) {
    const amt = computeBillAmount({
      duesName,
      defaultAmount,
      residentStatus: r.status,
      residentFullName: r.full_name,
      year: opts.year,
      month: opts.month,
    });
    if (amt == null) continue;
    const out = await query<{ id: string }>(
      `INSERT INTO bills (resident_id, dues_period_id, amount, due_date)
         VALUES ($1, $2, $3, $4)
       ON CONFLICT (resident_id, dues_period_id) DO NOTHING
       RETURNING id`,
      [r.id, periodId, amt, opts.dueDate || null],
    );
    if (out.length) inserted += 1;
  }
  return { periodId, inserted };
}

export const generateMonthlyPeriod = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => GenerateInput.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    return generateBillsForPeriod(data);
  });

/** Generate semua tagihan untuk semua iuran aktif dari Jan 2026 → bulan berjalan. */
export const generateAllPending = createServerFn({ method: "POST" }).handler(
  async () => {
    await requireAuth();
    const types = await query<{ id: string; name: string }>(
      `SELECT id, name FROM dues_types WHERE active = true AND period = 'monthly'`,
    );
    const periods = periodsUpToNow();
    let totalInserted = 0;
    for (const t of types) {
      for (const p of periods) {
        const r = await generateBillsForPeriod({
          duesTypeId: t.id,
          year: p.year,
          month: p.month,
        });
        totalInserted += r.inserted;
      }
    }
    return { inserted: totalInserted, periods: periods.length, types: types.length };
  },
);
