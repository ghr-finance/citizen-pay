// Aturan penagihan iuran GHR
// Sistem berjalan mulai Januari 2026.

export const SYSTEM_START_YEAR = 2026;
export const SYSTEM_START_MONTH = 1; // Januari

// Nominal IPL berdasarkan status warga
export const IPL_AMOUNT_ACTIVE = 200_000;
export const IPL_AMOUNT_INACTIVE = 175_000;
// Potongan khusus Januari & Februari
export const IPL_DISCOUNT_MONTHS = new Set([1, 2]);
export const IPL_DISCOUNT_AMOUNT = 20_000;

// Iuran RT hanya ditagihkan ke warga berikut (case-insensitive, match by first name token)
export const RT_RESIDENT_NAMES = ["Zulkarnaen", "Ali", "Wawan"];

const norm = (s: string) => s.trim().toLowerCase();

export function isIPL(duesName: string): boolean {
  return norm(duesName).includes("ipl");
}
export function isRT(duesName: string): boolean {
  const n = norm(duesName);
  return n.includes("rt") || n.includes("rukun tetangga");
}

export function isRTResident(fullName: string): boolean {
  const tokens = norm(fullName).split(/\s+/);
  return RT_RESIDENT_NAMES.some((n) => tokens.includes(norm(n)));
}

/**
 * Hitung nominal tagihan untuk satu warga pada satu periode.
 * Return null jika warga tidak ditagih untuk iuran/periode tersebut.
 */
export function computeBillAmount(input: {
  duesName: string;
  defaultAmount: number;
  residentStatus: "active" | "inactive";
  residentFullName: string;
  year: number;
  month: number;
}): number | null {
  // Sebelum periode awal sistem → tidak ditagih
  if (
    input.year < SYSTEM_START_YEAR ||
    (input.year === SYSTEM_START_YEAR && input.month < SYSTEM_START_MONTH)
  ) {
    return null;
  }

  if (isIPL(input.duesName)) {
    const base =
      input.residentStatus === "active" ? IPL_AMOUNT_ACTIVE : IPL_AMOUNT_INACTIVE;
    const discount = IPL_DISCOUNT_MONTHS.has(input.month) ? IPL_DISCOUNT_AMOUNT : 0;
    return Math.max(0, base - discount);
  }

  if (isRT(input.duesName)) {
    if (!isRTResident(input.residentFullName)) return null;
    return input.defaultAmount;
  }

  // Iuran lain: pakai nominal default, hanya warga aktif
  if (input.residentStatus !== "active") return null;
  return input.defaultAmount;
}

/** Daftar (year, month) dari awal sistem hingga bulan berjalan. */
export function periodsUpToNow(now = new Date()): Array<{ year: number; month: number }> {
  const list: Array<{ year: number; month: number }> = [];
  let y = SYSTEM_START_YEAR;
  let m = SYSTEM_START_MONTH;
  const endY = now.getFullYear();
  const endM = now.getMonth() + 1;
  while (y < endY || (y === endY && m <= endM)) {
    list.push({ year: y, month: m });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return list;
}
