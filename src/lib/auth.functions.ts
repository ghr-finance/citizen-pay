import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { query } from "./db.server";
import {
  createSession,
  readSession,
  clearSessionCookie,
} from "./session.server";

const LoginInput = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(1).max(255),
});

export const login = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => LoginInput.parse(d))
  .handler(async ({ data }) => {
    const rows = await query<{
      id: string;
      email: string;
      password_hash: string;
      full_name: string;
      role: "admin" | "bendahara";
    }>(
      `SELECT id, email, password_hash, full_name, role FROM users WHERE email = $1 LIMIT 1`,
      [data.email],
    );
    const user = rows[0];
    if (!user) throw new Error("Email atau password salah");
    const bcrypt = await import("bcryptjs");
    const ok = await bcrypt.compare(data.password, user.password_hash);
    if (!ok) throw new Error("Email atau password salah");
    await createSession({
      userId: user.id,
      email: user.email,
      role: user.role,
      fullName: user.full_name,
    });
    return { ok: true as const };
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  clearSessionCookie();
  return { ok: true as const };
});

export const me = createServerFn({ method: "GET" }).handler(async () => {
  const s = await readSession();
  return { user: s };
});

const CreateUserInput = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(6).max(255),
  fullName: z.string().trim().min(1).max(255),
  role: z.enum(["admin", "bendahara"]),
});

export const createUser = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => CreateUserInput.parse(d))
  .handler(async ({ data }) => {
    const s = await readSession();
    if (!s || s.role !== "admin") throw new Error("Tidak diizinkan");
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.hash(data.password, 10);
    const rows = await query<{ id: string }>(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [data.email, hash, data.fullName, data.role],
    );
    return { id: rows[0].id };
  });

export const listUsers = createServerFn({ method: "GET" }).handler(async () => {
  const s = await readSession();
  if (!s || s.role !== "admin") throw new Error("Tidak diizinkan");
  const rows = await query<{
    id: string;
    email: string;
    full_name: string;
    role: string;
    created_at: string;
  }>(
    `SELECT id, email, full_name, role, created_at FROM users ORDER BY created_at DESC`,
  );
  return { users: rows };
});

export const deleteUser = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const s = await readSession();
    if (!s || s.role !== "admin") throw new Error("Tidak diizinkan");
    if (s.userId === data.id) throw new Error("Tidak bisa hapus diri sendiri");
    await query(`DELETE FROM users WHERE id = $1`, [data.id]);
    return { ok: true as const };
  });
