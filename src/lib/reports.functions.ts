import { createServerFn } from "@tanstack/react-start";
import { query } from "./db.server";
import { readSession } from "./session.server";

async function requireAuth() {
  const s = await readSession();
  if (!s) throw new Error("Tidak diizinkan");
  return s;
}

export const dashboardStats = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();
    const [residents, unpaid, paidThisMonth, totalPaidMonth, recent, byMonth] =
      await Promise.all([
        query<{ c: number }>(
          `SELECT COUNT(*)::int AS c FROM residents WHERE status='active'`,
        ),
        query<{ c: number; total: string }>(
          `SELECT COUNT(*)::int AS c, COALESCE(SUM(amount - paid_amount),0)::text AS total
             FROM bills WHERE status IN ('unpaid','partial')`,
        ),
        query<{ c: number }>(
          `SELECT COUNT(*)::int AS c FROM payments
            WHERE date_trunc('month', paid_at) = date_trunc('month', now())`,
        ),
        query<{ total: string }>(
          `SELECT COALESCE(SUM(amount),0)::text AS total FROM payments
            WHERE date_trunc('month', paid_at) = date_trunc('month', now())`,
        ),
        query<{
          id: string;
          receipt_no: string;
          paid_at: string;
          amount: string;
          resident_name: string;
        }>(
          `SELECT p.id, p.receipt_no, p.paid_at, p.amount, r.full_name AS resident_name
             FROM payments p JOIN residents r ON r.id = p.resident_id
             ORDER BY p.paid_at DESC LIMIT 5`,
        ),
        query<{ ym: string; total: string }>(
          `SELECT to_char(date_trunc('month', paid_at), 'YYYY-MM') AS ym,
                  SUM(amount)::text AS total
             FROM payments
             WHERE paid_at >= now() - interval '6 months'
             GROUP BY 1 ORDER BY 1`,
        ),
      ]);
    return {
      activeResidents: residents[0].c,
      unpaidCount: unpaid[0].c,
      unpaidTotal: Number(unpaid[0].total),
      paidThisMonthCount: paidThisMonth[0].c,
      paidThisMonthTotal: Number(totalPaidMonth[0].total),
      recentPayments: recent,
      monthlySeries: byMonth.map((r) => ({ ym: r.ym, total: Number(r.total) })),
    };
  },
);

export const monthlyReport = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => {
    const obj = d as { year: number; month: number };
    return { year: Number(obj.year), month: Number(obj.month) };
  })
  .handler(async ({ data }) => {
    await requireAuth();
    const [payments, byType, arrears] = await Promise.all([
      query<{
        paid_at: string;
        amount: string;
        method: string;
        resident_name: string;
        dues_name: string;
        receipt_no: string;
      }>(
        `SELECT p.paid_at, p.amount, p.method, p.receipt_no,
                r.full_name AS resident_name, dt.name AS dues_name
           FROM payments p
           JOIN bills b ON b.id = p.bill_id
           JOIN residents r ON r.id = p.resident_id
           JOIN dues_periods dp ON dp.id = b.dues_period_id
           JOIN dues_types dt ON dt.id = dp.dues_type_id
          WHERE EXTRACT(YEAR FROM p.paid_at) = $1
            AND EXTRACT(MONTH FROM p.paid_at) = $2
          ORDER BY p.paid_at`,
        [data.year, data.month],
      ),
      query<{ dues_name: string; total: string; count: number }>(
        `SELECT dt.name AS dues_name, SUM(p.amount)::text AS total, COUNT(*)::int AS count
           FROM payments p
           JOIN bills b ON b.id = p.bill_id
           JOIN dues_periods dp ON dp.id = b.dues_period_id
           JOIN dues_types dt ON dt.id = dp.dues_type_id
          WHERE EXTRACT(YEAR FROM p.paid_at) = $1
            AND EXTRACT(MONTH FROM p.paid_at) = $2
          GROUP BY dt.name ORDER BY dt.name`,
        [data.year, data.month],
      ),
      query<{
        resident_name: string;
        house_block: string | null;
        house_number: string | null;
        dues_name: string;
        year: number;
        month: number;
        amount: string;
        paid_amount: string;
      }>(
        `SELECT r.full_name AS resident_name, r.house_block, r.house_number,
                dt.name AS dues_name, dp.year, dp.month, b.amount, b.paid_amount
           FROM bills b
           JOIN residents r ON r.id = b.resident_id
           JOIN dues_periods dp ON dp.id = b.dues_period_id
           JOIN dues_types dt ON dt.id = dp.dues_type_id
          WHERE b.status IN ('unpaid','partial')
          ORDER BY r.house_block, r.house_number, r.full_name`,
      ),
    ]);
    const total = payments.reduce((s, p) => s + Number(p.amount), 0);
    return { payments, byType, arrears, total };
  });
