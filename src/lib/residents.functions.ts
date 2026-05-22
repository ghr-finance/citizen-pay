import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { query } from "./db.server";
import { readSession } from "./session.server";
import { SYSTEM_START_MONTH, SYSTEM_START_YEAR } from "./billing-rules";

async function requireAuth() {
  const s = await readSession();
  if (!s) throw new Error("Tidak diizinkan");
  return s;
}

export const listResidents = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();
    const rows = await query<{
      id: string;
      nik: string | null;
      full_name: string;
      house_block: string | null;
      house_number: string | null;
      phone: string | null;
      status: string;
      joined_at: string | null;
    }>(
      `SELECT id, nik, full_name, house_block, house_number, phone, status, joined_at
       FROM residents ORDER BY house_block NULLS LAST, house_number NULLS LAST, full_name`,
    );
    return { residents: rows };
  },
);

const ResidentInput = z.object({
  id: z.string().uuid().optional(),
  nik: z.string().trim().max(32).optional().nullable(),
  fullName: z.string().trim().min(1).max(255),
  houseBlock: z.string().trim().max(16).optional().nullable(),
  houseNumber: z.string().trim().max(16).optional().nullable(),
  phone: z.string().trim().max(32).optional().nullable(),
  status: z.enum(["active", "inactive"]).default("active"),
  joinedAt: z.string().optional().nullable(),
  // Bulan mulai berlakunya status (untuk seed riwayat saat create,
  // atau saat status berubah pada update). Default: SYSTEM_START.
  statusEffectiveYear: z.number().int().min(2000).max(2100).optional(),
  statusEffectiveMonth: z.number().int().min(1).max(12).optional(),
});

export const upsertResident = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ResidentInput.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const effYear = data.statusEffectiveYear ?? SYSTEM_START_YEAR;
    const effMonth = data.statusEffectiveMonth ?? SYSTEM_START_MONTH;

    if (data.id) {
      // Cek status lama
      const prev = await query<{ status: "active" | "inactive" }>(
        `SELECT status FROM residents WHERE id=$1`,
        [data.id],
      );
      await query(
        `UPDATE residents SET nik=$1, full_name=$2, house_block=$3, house_number=$4, phone=$5, status=$6, joined_at=$7
         WHERE id=$8`,
        [
          data.nik || null,
          data.fullName,
          data.houseBlock || null,
          data.houseNumber || null,
          data.phone || null,
          data.status,
          data.joinedAt || null,
          data.id,
        ],
      );
      // Bila status berubah, catat perubahan di riwayat
      if (prev.length && prev[0].status !== data.status) {
        await query(
          `INSERT INTO resident_status_history
             (resident_id, status, effective_year, effective_month)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (resident_id, effective_year, effective_month)
             DO UPDATE SET status = EXCLUDED.status`,
          [data.id, data.status, effYear, effMonth],
        );
      }
      return { id: data.id };
    }

    const rows = await query<{ id: string }>(
      `INSERT INTO residents (nik, full_name, house_block, house_number, phone, status, joined_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [
        data.nik || null,
        data.fullName,
        data.houseBlock || null,
        data.houseNumber || null,
        data.phone || null,
        data.status,
        data.joinedAt || null,
      ],
    );
    // Seed riwayat status awal
    await query(
      `INSERT INTO resident_status_history
         (resident_id, status, effective_year, effective_month)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (resident_id, effective_year, effective_month) DO NOTHING`,
      [rows[0].id, data.status, effYear, effMonth],
    );
    return { id: rows[0].id };
  });

export const deleteResident = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    await query(`DELETE FROM residents WHERE id=$1`, [data.id]);
    return { ok: true as const };
  });

// ===== Riwayat status warga =====

export const listStatusHistory = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ residentId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    await requireAuth();
    const rows = await query<{
      id: string;
      status: "active" | "inactive";
      effective_year: number;
      effective_month: number;
      note: string | null;
      created_at: string;
    }>(
      `SELECT id, status, effective_year, effective_month, note, created_at
         FROM resident_status_history
        WHERE resident_id = $1
        ORDER BY effective_year, effective_month`,
      [data.residentId],
    );
    return { history: rows };
  });

const StatusChangeInput = z.object({
  residentId: z.string().uuid(),
  status: z.enum(["active", "inactive"]),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  note: z.string().trim().max(255).optional().nullable(),
});

export const addStatusChange = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => StatusChangeInput.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    await query(
      `INSERT INTO resident_status_history
         (resident_id, status, effective_year, effective_month, note)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (resident_id, effective_year, effective_month)
         DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note`,
      [data.residentId, data.status, data.year, data.month, data.note || null],
    );
    // Sinkronkan status "terkini" pada residents berdasarkan entri terbaru
    await query(
      `UPDATE residents r
          SET status = h.status
         FROM (
           SELECT DISTINCT ON (resident_id) resident_id, status
             FROM resident_status_history
            WHERE resident_id = $1
            ORDER BY resident_id, effective_year DESC, effective_month DESC
         ) h
        WHERE r.id = h.resident_id`,
      [data.residentId],
    );
    return { ok: true as const };
  });

export const deleteStatusChange = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), residentId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    await requireAuth();
    await query(`DELETE FROM resident_status_history WHERE id=$1`, [data.id]);
    await query(
      `UPDATE residents r
          SET status = COALESCE(h.status, r.status)
         FROM (
           SELECT DISTINCT ON (resident_id) resident_id, status
             FROM resident_status_history
            WHERE resident_id = $1
            ORDER BY resident_id, effective_year DESC, effective_month DESC
         ) h
        WHERE r.id = h.resident_id`,
      [data.residentId],
    );
    return { ok: true as const };
  });
