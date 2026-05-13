import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { query } from "./db.server";
import { readSession } from "./session.server";

async function requireAuth() {
  const s = await readSession();
  if (!s) throw new Error("Tidak diizinkan");
  return s;
}

const ListInput = z.object({
  year: z.number().int().optional().nullable(),
  month: z.number().int().optional().nullable(),
  status: z.enum(["unpaid", "paid", "partial", "all"]).default("all"),
});

export const listBills = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ListInput.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (data.year != null) {
      params.push(data.year);
      conditions.push(`dp.year = $${params.length}`);
    }
    if (data.month != null) {
      params.push(data.month);
      conditions.push(`dp.month = $${params.length}`);
    }
    if (data.status !== "all") {
      params.push(data.status);
      conditions.push(`b.status = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = await query<{
      id: string;
      resident_id: string;
      resident_name: string;
      house_block: string | null;
      house_number: string | null;
      dues_name: string;
      year: number;
      month: number;
      amount: string;
      paid_amount: string;
      status: string;
      due_date: string | null;
    }>(
      `SELECT b.id, b.resident_id, r.full_name AS resident_name,
              r.house_block, r.house_number,
              dt.name AS dues_name, dp.year, dp.month,
              b.amount, b.paid_amount, b.status, b.due_date
         FROM bills b
         JOIN residents r ON r.id = b.resident_id
         JOIN dues_periods dp ON dp.id = b.dues_period_id
         JOIN dues_types dt ON dt.id = dp.dues_type_id
         ${where}
         ORDER BY dp.year DESC, dp.month DESC, r.full_name`,
      params,
    );
    return { bills: rows };
  });

/** Ringkasan tagihan per warga (total, terbayar, sisa, jumlah belum lunas). */
export const listOutstandingByResident = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();
    const rows = await query<{
      resident_id: string;
      full_name: string;
      house_block: string | null;
      house_number: string | null;
      status: string;
      total_amount: string;
      total_paid: string;
      outstanding: string;
      unpaid_count: number;
      bill_count: number;
    }>(
      `SELECT r.id AS resident_id, r.full_name, r.house_block, r.house_number, r.status,
              COALESCE(SUM(b.amount),0) AS total_amount,
              COALESCE(SUM(b.paid_amount),0) AS total_paid,
              COALESCE(SUM(b.amount - b.paid_amount),0) AS outstanding,
              COALESCE(SUM(CASE WHEN b.status <> 'paid' THEN 1 ELSE 0 END),0)::int AS unpaid_count,
              COUNT(b.id)::int AS bill_count
         FROM residents r
         LEFT JOIN bills b ON b.resident_id = r.id
         GROUP BY r.id
         ORDER BY r.house_block NULLS LAST, r.house_number NULLS LAST, r.full_name`,
    );
    return { residents: rows };
  },
);

/** Detail tagihan satu warga (untuk surat tagihan). */
export const getResidentBills = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ residentId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    await requireAuth();
    const resident = await query<{
      id: string;
      full_name: string;
      house_block: string | null;
      house_number: string | null;
      phone: string | null;
      status: string;
    }>(
      `SELECT id, full_name, house_block, house_number, phone, status
         FROM residents WHERE id=$1 LIMIT 1`,
      [data.residentId],
    );
    if (!resident.length) throw new Error("Warga tidak ditemukan");

    const bills = await query<{
      id: string;
      dues_name: string;
      year: number;
      month: number;
      amount: string;
      paid_amount: string;
      status: string;
      due_date: string | null;
    }>(
      `SELECT b.id, dt.name AS dues_name, dp.year, dp.month,
              b.amount, b.paid_amount, b.status, b.due_date
         FROM bills b
         JOIN dues_periods dp ON dp.id = b.dues_period_id
         JOIN dues_types dt ON dt.id = dp.dues_type_id
         WHERE b.resident_id = $1
         ORDER BY dp.year, dp.month, dt.name`,
      [data.residentId],
    );
    return { resident: resident[0], bills };
  });
