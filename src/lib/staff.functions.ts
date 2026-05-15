import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { query } from "./db.server";
import { readSession } from "./session.server";

async function requireAuth() {
  const s = await readSession();
  if (!s) throw new Error("Tidak diizinkan");
  return s;
}

export const STAFF_POSITIONS = [
  { value: "keamanan", label: "Keamanan" },
  { value: "kebersihan", label: "Kebersihan" },
  { value: "dkm", label: "DKM" },
  { value: "ketua", label: "Ketua" },
  { value: "bendahara", label: "Bendahara" },
] as const;

export type StaffPosition = (typeof STAFF_POSITIONS)[number]["value"];

export type StaffRow = {
  id: string;
  resident_id: string | null;
  full_name: string;
  phone: string | null;
  position: StaffPosition;
  source: "warga" | "eksternal";
  note: string | null;
  active: boolean;
  joined_at: string | null;
  created_at: string;
};

export const listStaff = createServerFn({ method: "GET" }).handler(async () => {
  await requireAuth();
  const rows = await query<StaffRow>(
    `SELECT id, resident_id, full_name, phone, position, source, note, active, joined_at, created_at
     FROM staff ORDER BY position, full_name`,
  );
  return { staff: rows };
});

const StaffInput = z.object({
  id: z.string().uuid().optional(),
  residentId: z.string().uuid().optional().nullable(),
  fullName: z.string().trim().min(1).max(255),
  phone: z.string().trim().max(32).optional().nullable(),
  position: z.enum(["keamanan", "kebersihan", "dkm", "ketua", "bendahara"]),
  source: z.enum(["warga", "eksternal"]).default("warga"),
  note: z.string().trim().max(500).optional().nullable(),
  active: z.boolean().default(true),
  joinedAt: z.string().optional().nullable(),
});

export const upsertStaff = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => StaffInput.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    if (data.id) {
      await query(
        `UPDATE staff SET resident_id=$1, full_name=$2, phone=$3, position=$4,
         source=$5, note=$6, active=$7, joined_at=$8 WHERE id=$9`,
        [
          data.residentId || null,
          data.fullName,
          data.phone || null,
          data.position,
          data.source,
          data.note || null,
          data.active,
          data.joinedAt || null,
          data.id,
        ],
      );
      return { id: data.id };
    }
    const rows = await query<{ id: string }>(
      `INSERT INTO staff (resident_id, full_name, phone, position, source, note, active, joined_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [
        data.residentId || null,
        data.fullName,
        data.phone || null,
        data.position,
        data.source,
        data.note || null,
        data.active,
        data.joinedAt || null,
      ],
    );
    return { id: rows[0].id };
  });

export const deleteStaff = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    await query(`DELETE FROM staff WHERE id=$1`, [data.id]);
    return { ok: true as const };
  });
