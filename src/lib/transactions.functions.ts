import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { query } from "./db.server";
import { readSession } from "./session.server";

async function requireAuth() {
  const s = await readSession();
  if (!s) throw new Error("Tidak diizinkan");
  return s;
}

export const INCOME_CATEGORIES = [
  "IPL",
  "Kegiatan",
  "Donasi",
  "Kesejahteraan Sarana Ibadah",
  "Sewa Fasilitas",
  "Lainnya",
] as const;

export const EXPENSE_CATEGORIES = [
  "Gaji",
  "Listrik",
  "Air",
  "Pemeliharaan",
  "Kegiatan",
  "CSR",
  "ATK & Administrasi",
  "Lainnya",
] as const;

const CreateInput = z.object({
  type: z.enum(["income", "expense"]),
  category: z.string().min(1).max(80),
  amount: z.number().positive(),
  occurredAt: z.string().min(8),
  method: z.enum(["cash", "transfer", "qris"]),
  description: z.string().max(500).optional().nullable(),
});

export const createTransaction = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => CreateInput.parse(d))
  .handler(async ({ data }) => {
    const s = await requireAuth();
    const rows = await query<{ id: string }>(
      `INSERT INTO transactions (type, category, amount, occurred_at, method, description, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [
        data.type,
        data.category,
        data.amount,
        data.occurredAt,
        data.method,
        data.description || null,
        s.userId,
      ],
    );
    return { id: rows[0].id };
  });

export const deleteTransaction = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    await query(`DELETE FROM transactions WHERE id=$1`, [data.id]);
    return { ok: true };
  });

export const listTransactions = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        year: z.number().int().optional().nullable(),
        month: z.number().int().optional().nullable(),
        type: z.enum(["income", "expense"]).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requireAuth();
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (data.year != null) {
      params.push(data.year);
      conditions.push(`EXTRACT(YEAR FROM t.occurred_at) = $${params.length}`);
    }
    if (data.month != null) {
      params.push(data.month);
      conditions.push(`EXTRACT(MONTH FROM t.occurred_at) = $${params.length}`);
    }
    if (data.type) {
      params.push(data.type);
      conditions.push(`t.type = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = await query<{
      id: string;
      type: "income" | "expense";
      category: string;
      amount: string;
      occurred_at: string;
      method: string;
      description: string | null;
      recorded_by_name: string | null;
    }>(
      `SELECT t.id, t.type, t.category, t.amount, t.occurred_at, t.method, t.description,
              u.full_name AS recorded_by_name
         FROM transactions t
         LEFT JOIN users u ON u.id = t.recorded_by
         ${where}
         ORDER BY t.occurred_at DESC, t.created_at DESC`,
      params,
    );
    const income = rows
      .filter((r) => r.type === "income")
      .reduce((s, r) => s + Number(r.amount), 0);
    const expense = rows
      .filter((r) => r.type === "expense")
      .reduce((s, r) => s + Number(r.amount), 0);
    return { transactions: rows, summary: { income, expense, net: income - expense } };
  });
