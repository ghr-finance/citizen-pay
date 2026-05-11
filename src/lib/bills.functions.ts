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
