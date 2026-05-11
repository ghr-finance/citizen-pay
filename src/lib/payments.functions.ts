import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { query } from "./db.server";
import { readSession } from "./session.server";

async function requireAuth() {
  const s = await readSession();
  if (!s) throw new Error("Tidak diizinkan");
  return s;
}

const RecordInput = z.object({
  billId: z.string().uuid(),
  amount: z.number().positive(),
  method: z.enum(["cash", "transfer", "qris"]),
  note: z.string().max(500).optional().nullable(),
});

export const recordPayment = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => RecordInput.parse(d))
  .handler(async ({ data }) => {
    const s = await requireAuth();
    // Fetch bill
    const bills = await query<{
      id: string;
      resident_id: string;
      amount: string;
      paid_amount: string;
    }>(
      `SELECT id, resident_id, amount, paid_amount FROM bills WHERE id=$1 LIMIT 1`,
      [data.billId],
    );
    const bill = bills[0];
    if (!bill) throw new Error("Tagihan tidak ditemukan");
    const newPaid = Number(bill.paid_amount) + data.amount;
    const total = Number(bill.amount);
    const status = newPaid >= total ? "paid" : newPaid > 0 ? "partial" : "unpaid";

    // receipt no: GHR/YYMM/seq based on count this month
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const countRows = await query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM payments
       WHERE date_trunc('month', paid_at) = date_trunc('month', now())`,
    );
    const seq = String(countRows[0].c + 1).padStart(4, "0");
    const receiptNo = `GHR/${yy}${mm}/${seq}`;

    const inserted = await query<{ id: string; receipt_no: string }>(
      `INSERT INTO payments (bill_id, resident_id, amount, method, note, receipt_no, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, receipt_no`,
      [
        data.billId,
        bill.resident_id,
        data.amount,
        data.method,
        data.note || null,
        receiptNo,
        s.userId,
      ],
    );
    await query(
      `UPDATE bills SET paid_amount=$1, status=$2 WHERE id=$3`,
      [newPaid, status, data.billId],
    );
    return { id: inserted[0].id, receiptNo: inserted[0].receipt_no };
  });

export const listPayments = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        year: z.number().int().optional().nullable(),
        month: z.number().int().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requireAuth();
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (data.year != null) {
      params.push(data.year);
      conditions.push(`EXTRACT(YEAR FROM p.paid_at) = $${params.length}`);
    }
    if (data.month != null) {
      params.push(data.month);
      conditions.push(`EXTRACT(MONTH FROM p.paid_at) = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = await query<{
      id: string;
      receipt_no: string;
      paid_at: string;
      amount: string;
      method: string;
      note: string | null;
      resident_name: string;
      dues_name: string;
      year: number;
      month: number;
      house_block: string | null;
      house_number: string | null;
      recorded_by_name: string | null;
    }>(
      `SELECT p.id, p.receipt_no, p.paid_at, p.amount, p.method, p.note,
              r.full_name AS resident_name, r.house_block, r.house_number,
              dt.name AS dues_name, dp.year, dp.month,
              u.full_name AS recorded_by_name
         FROM payments p
         JOIN bills b ON b.id = p.bill_id
         JOIN residents r ON r.id = p.resident_id
         JOIN dues_periods dp ON dp.id = b.dues_period_id
         JOIN dues_types dt ON dt.id = dp.dues_type_id
         LEFT JOIN users u ON u.id = p.recorded_by
         ${where}
         ORDER BY p.paid_at DESC`,
      params,
    );
    return { payments: rows };
  });
