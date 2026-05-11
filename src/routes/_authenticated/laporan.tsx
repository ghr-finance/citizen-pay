import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { monthlyReport } from "@/lib/reports.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatRupiah, formatTanggal, BULAN_ID } from "@/lib/format";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/laporan")({
  component: LaporanPage,
});

function LaporanPage() {
  const fetchReport = useServerFn(monthlyReport);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const report = useMutation({
    mutationFn: (v: { year: number; month: number }) => fetchReport({ data: v }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal"),
  });

  const data = report.data;

  const exportPDF = async () => {
    if (!data) return;
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Laporan Iuran Warga GHR", 14, 16);
    doc.setFontSize(10);
    doc.text(`Periode: ${BULAN_ID[month - 1]} ${year}`, 14, 22);
    doc.text(`Total kas masuk: ${formatRupiah(data.total)}`, 14, 28);

    autoTable(doc, {
      startY: 34,
      head: [["Tanggal", "Kwitansi", "Warga", "Iuran", "Metode", "Jumlah"]],
      body: data.payments.map((p) => [
        formatTanggal(p.paid_at), p.receipt_no, p.resident_name, p.dues_name,
        p.method.toUpperCase(), formatRupiah(p.amount),
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [30, 90, 70] },
    });

    if (data.arrears.length) {
      const lastY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 40;
      doc.text("Daftar Tunggakan", 14, lastY + 10);
      autoTable(doc, {
        startY: lastY + 14,
        head: [["Warga", "Blok/No", "Iuran", "Periode", "Sisa"]],
        body: data.arrears.map((a) => [
          a.resident_name,
          `${a.house_block || "-"}/${a.house_number || "-"}`,
          a.dues_name,
          `${BULAN_ID[a.month - 1]} ${a.year}`,
          formatRupiah(Number(a.amount) - Number(a.paid_amount)),
        ]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [120, 60, 60] },
      });
    }

    doc.save(`Laporan-${year}-${String(month).padStart(2, "0")}.pdf`);
  };

  const exportExcel = async () => {
    if (!data) return;
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(
      data.payments.map((p) => ({
        Tanggal: formatTanggal(p.paid_at),
        Kwitansi: p.receipt_no,
        Warga: p.resident_name,
        Iuran: p.dues_name,
        Metode: p.method,
        Jumlah: Number(p.amount),
      })),
    );
    XLSX.utils.book_append_sheet(wb, ws1, "Pembayaran");
    const ws2 = XLSX.utils.json_to_sheet(
      data.byType.map((b) => ({ Iuran: b.dues_name, Transaksi: b.count, Total: Number(b.total) })),
    );
    XLSX.utils.book_append_sheet(wb, ws2, "Per Jenis");
    const ws3 = XLSX.utils.json_to_sheet(
      data.arrears.map((a) => ({
        Warga: a.resident_name,
        Blok: a.house_block || "",
        No: a.house_number || "",
        Iuran: a.dues_name,
        Periode: `${BULAN_ID[a.month - 1]} ${a.year}`,
        Sisa: Number(a.amount) - Number(a.paid_amount),
      })),
    );
    XLSX.utils.book_append_sheet(wb, ws3, "Tunggakan");
    XLSX.writeFile(wb, `Laporan-${year}-${String(month).padStart(2, "0")}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Laporan</h1>
        <p className="text-muted-foreground">Laporan kas bulanan dan tunggakan</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <Label className="text-xs">Bulan</Label>
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BULAN_ID.map((b, i) => <SelectItem key={i} value={String(i + 1)}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tahun</Label>
              <Input type="number" className="w-28" value={year} onChange={(e) => setYear(Number(e.target.value))} />
            </div>
            <Button onClick={() => report.mutate({ year, month })} disabled={report.isPending}>
              <Download className="size-4 mr-2" /> {report.isPending ? "Memuat…" : "Tampilkan"}
            </Button>
            {data && (
              <div className="ml-auto flex gap-2">
                <Button variant="outline" onClick={exportPDF}><FileText className="size-4 mr-2" /> PDF</Button>
                <Button variant="outline" onClick={exportExcel}><FileSpreadsheet className="size-4 mr-2" /> Excel</Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {data && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Total Kas Masuk</div>
                <div className="font-display text-3xl font-bold text-primary mt-1">{formatRupiah(data.total)}</div>
                <div className="text-xs text-muted-foreground mt-1">{data.payments.length} transaksi</div>
              </CardContent>
            </Card>
            <Card className="md:col-span-2">
              <CardHeader><CardTitle className="font-display text-base">Per Jenis Iuran</CardTitle></CardHeader>
              <CardContent>
                {data.byType.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Tidak ada data.</p>
                ) : (
                  <table className="w-full text-sm">
                    <tbody>
                      {data.byType.map((b) => (
                        <tr key={b.dues_name} className="border-b border-border/60">
                          <td className="py-2">{b.dues_name}</td>
                          <td className="py-2 text-muted-foreground">{b.count}×</td>
                          <td className="py-2 text-right font-mono font-semibold">{formatRupiah(b.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="font-display text-base">Daftar Tunggakan ({data.arrears.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border">
                      <th className="py-2 pr-4 font-medium">Warga</th>
                      <th className="py-2 pr-4 font-medium">Blok/No</th>
                      <th className="py-2 pr-4 font-medium">Iuran</th>
                      <th className="py-2 pr-4 font-medium">Periode</th>
                      <th className="py-2 pr-4 font-medium text-right">Sisa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.arrears.map((a, i) => (
                      <tr key={i} className="border-b border-border/60">
                        <td className="py-2 pr-4">{a.resident_name}</td>
                        <td className="py-2 pr-4 font-mono">{a.house_block || "-"}/{a.house_number || "-"}</td>
                        <td className="py-2 pr-4">{a.dues_name}</td>
                        <td className="py-2 pr-4">{BULAN_ID[a.month - 1]} {a.year}</td>
                        <td className="py-2 pr-4 text-right font-mono">{formatRupiah(Number(a.amount) - Number(a.paid_amount))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
