import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let _sql: NeonQueryFunction<false, false> | null = null;
let _migrated = false;
let _migratingPromise: Promise<void> | null = null;

export function getSql(): NeonQueryFunction<false, false> {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  _sql = neon(url);
  return _sql;
}

const MIGRATIONS = [
  `CREATE EXTENSION IF NOT EXISTS pgcrypto`,
  `CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text UNIQUE NOT NULL,
    password_hash text NOT NULL,
    full_name text NOT NULL,
    role text NOT NULL CHECK (role IN ('admin','bendahara')),
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS residents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nik text,
    full_name text NOT NULL,
    house_block text,
    house_number text,
    phone text,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
    joined_at date,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS dues_types (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    amount_default numeric(14,2) NOT NULL DEFAULT 0,
    period text NOT NULL DEFAULT 'monthly' CHECK (period IN ('monthly','one_time')),
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS dues_periods (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    dues_type_id uuid NOT NULL REFERENCES dues_types(id) ON DELETE CASCADE,
    year int NOT NULL,
    month int NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (dues_type_id, year, month)
  )`,
  `CREATE TABLE IF NOT EXISTS bills (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    resident_id uuid NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
    dues_period_id uuid NOT NULL REFERENCES dues_periods(id) ON DELETE CASCADE,
    amount numeric(14,2) NOT NULL,
    paid_amount numeric(14,2) NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','paid','partial')),
    due_date date,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (resident_id, dues_period_id)
  )`,
  `CREATE INDEX IF NOT EXISTS bills_status_idx ON bills(status)`,
  `CREATE INDEX IF NOT EXISTS bills_due_date_idx ON bills(due_date)`,
  `CREATE TABLE IF NOT EXISTS payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id uuid NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    resident_id uuid NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
    amount numeric(14,2) NOT NULL,
    paid_at timestamptz NOT NULL DEFAULT now(),
    method text NOT NULL DEFAULT 'cash' CHECK (method IN ('cash','transfer','qris')),
    note text,
    receipt_no text UNIQUE,
    recorded_by uuid REFERENCES users(id) ON DELETE SET NULL
  )`,
  `CREATE INDEX IF NOT EXISTS payments_paid_at_idx ON payments(paid_at)`,
];

export async function ensureMigrated(): Promise<void> {
  if (_migrated) return;
  if (_migratingPromise) return _migratingPromise;
  _migratingPromise = (async () => {
    const sql = getSql();
    for (const stmt of MIGRATIONS) {
      // neon() tagged template needs raw query — use unsafe call signature
      await sql(stmt);
    }
    // Seed initial admin
    const email = process.env.INITIAL_ADMIN_EMAIL;
    const password = process.env.INITIAL_ADMIN_PASSWORD;
    if (email && password) {
      const existing = await sql(
        `SELECT id FROM users WHERE email = $1 LIMIT 1`,
        [email],
      );
      if (!existing.length) {
        const bcrypt = await import("bcryptjs");
        const hash = await bcrypt.hash(password, 10);
        await sql(
          `INSERT INTO users (email, password_hash, full_name, role)
           VALUES ($1, $2, $3, 'admin')`,
          [email, hash, "Administrator"],
        );
      }
    }
    _migrated = true;
  })();
  try {
    await _migratingPromise;
  } finally {
    _migratingPromise = null;
  }
}

/** Helper to run a parameterized query after ensuring migrations. */
export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  await ensureMigrated();
  const sql = getSql();
  const rows = (await sql(text, params)) as unknown as T[];
  return rows;
}
