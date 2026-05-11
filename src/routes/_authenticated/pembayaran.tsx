import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listPayments } from "@/lib/payments.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatRupiah, formatTanggal, BULAN_ID } from "@/lib/format";
import { Printer } from "lucide-react";

export const Route = createFileRoute("/_authenticated/pembayaran")({
  component: PembayaranPage,
});

function PembayaranPage() {
  const fetchList = useServerFn(listPayments);
  const now = new Date();
  const [year, setYear] = useState<number | null>(now.getFullYear());
  const [month, setMonth] = useState<number | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["payments", year, month],
    queryFn: () => fetchList({ data: { year, month } }),
  });

  const total = (data?.payments ?? []).reduce((s, p) => s + Number(p.amount), 0);

  const printReceipt = async (p: NonNullable<typeof data>["payments"][number]) => {
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "mm", format: [80, 140] });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("GHR PAYMENT SYSTEM", 40, 10, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("Kwitansi Iuran Warga", 40, 14, { align: "center" });
    doc.line(4, 17, 76, 17);

    doc.setFontSize(9);
    let y = 22;
    const row = (k: string, v: string) => {
      doc.setFont("helvetica", "normal");
      doc.text(k, 4, y);
      doc.setFont("helvetica", "bold");
      doc.text(v, 76, y, { align: "right" });
      y += 5;
    };
    row("No. Kwitansi", p.receipt_no);
    row("Tanggal", formatTanggal(p.paid_at));
    row("Penyetor", p.resident_name);
    row("Iuran", p.dues_name);
    row("Periode", `${BULAN_ID[p.month - 1]} ${p.year}`);
    row("Metode", p.method.toUpperCase());
    doc.line(4, y, 76, y); y += 5;
    doc.setFontSize(11);
    row("TOTAL", formatRupiah(p.amount));
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    y += 5;
    doc.text(`Dicatat oleh: ${p.recorded_by_name || "-"}`, 4, y);
    y += 4;
    doc.text("Terima kasih atas pembayaran Anda.", 40, y + 4, { align: "center" });
    doc.save(`Kwitansi-${p.receipt_no.replace(/\//g, "-")}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Pembayaran</h1>
        <p className="text-muted-foreground">Riwayat pembayaran dan kwitansi</p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <Label className="text-xs">Bulan</Label>
              <Select value={month ? String(month) : "all"} onValueChange={(v) => setMonth(v === "all" ? null : Number(v))}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua</SelectItem>
                  {BULAN_ID.map((b, i) => <SelectItem key={i} value={String(i + 1)}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tahun</Label>
              <Input
                type="number" className="w-28"
                value={year ?? ""}
                onChange={(e) => setYear(e.target.value ? Number(e.target.value) : null)}
              />
            </div>
            <div className="ml-auto text-right">
              <div className="text-xs text-muted-foreground">Total terfilter</div>
              <div className="font-display text-xl font-bold text-primary">{formatRupiah(total)}</div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 pr-4 font-medium">Tanggal</th>
                  <th className="py-2 pr-4 font-medium">Kwitansi</th>
                  <th className="py-2 pr-4 font-medium">Warga</th>
                  <th className="py-2 pr-4 font-medium">Iuran / Periode</th>
                  <th className="py-2 pr-4 font-medium">Metode</th>
                  <th className="py-2 pr-4 font-medium text-right">Jumlah</th>
                  <th className="py-2 pr-4 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">Memuat…</td></tr>}
                {!isLoading && (data?.payments ?? []).length === 0 && (
                  <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">Belum ada pembayaran.</td></tr>
                )}
                {(data?.payments ?? []).map((p) => (
                  <tr key={p.id} className="border-b border-border/60 hover:bg-accent/40">
                    <td className="py-2 pr-4">{formatTanggal(p.paid_at)}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{p.receipt_no}</td>
                    <td className="py-2 pr-4">{p.resident_name}</td>
                    <td className="py-2 pr-4">
                      <div>{p.dues_name}</div>
                      <div className="text-xs text-muted-foreground">{BULAN_ID[p.month - 1]} {p.year}</div>
                    </td>
                    <td className="py-2 pr-4">
                      <Badge variant="outline" className="uppercase">{p.method}</Badge>
                    </td>
                    <td className="py-2 pr-4 text-right font-mono font-semibold">{formatRupiah(p.amount)}</td>
                    <td className="py-2 pr-4 text-right">
                      <Button size="sm" variant="ghost" onClick={() => printReceipt(p)}>
                        <Printer className="size-3 mr-1" /> Kwitansi
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
