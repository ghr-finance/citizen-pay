export const formatRupiah = (n: number | string) => {
  const num = typeof n === "string" ? Number(n) : n;
  if (!isFinite(num)) return "Rp 0";
  return "Rp " + num.toLocaleString("id-ID");
};

export const BULAN_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export const formatTanggal = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()} ${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
};
