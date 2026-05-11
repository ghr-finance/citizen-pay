import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { query } from "./db.server";
import { readSession } from "./session.server";

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
});

export const upsertResident = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ResidentInput.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    if (data.id) {
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
    return { id: rows[0].id };
  });

export const deleteResident = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    await query(`DELETE FROM residents WHERE id=$1`, [data.id]);
    return { ok: true as const };
  });
