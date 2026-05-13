import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { listBills, listOutstandingByResident, getResidentBills } from "@/lib/bills.functions";
import { recordPayment } from "@/lib/payments.functions";
import { generateAllPending } from "@/lib/dues.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatRupiah, BULAN_ID, formatTanggal } from "@/lib/format";
import { Wallet, FileDown, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tagihan")({
  component: TagihanPage,
});

type Bill = Awaited<ReturnType<typeof listBills>>["bills"][number];

function TagihanPage() {
  const fetchList = useServerFn(listBills);
  const fetchByResident = useServerFn(listOutstandingByResident);
  const fetchResidentBills = useServerFn(getResidentBills);
  const payFn = useServerFn(recordPayment);
  const genFn = useServerFn(generateAllPending);
  const qc = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState<number | null>(now.getFullYear());
  const [month, setMonth] = useState<number | null>(now.getMonth() + 1);
  const [status, setStatus] = useState<"unpaid" | "paid" | "partial" | "all">("all");

  const { data, isLoading } = useQuery({
    queryKey: ["bills", year, month, status],
    queryFn: () => fetchList({ data: { year, month, status } }),
  });
  const { data: byResident, isLoading: loadingResident } = useQuery({
    queryKey: ["bills-by-resident"],
    queryFn: () => fetchByResident(),
  });

  const generate = useMutation({
    mutationFn: () => genFn({}),
    onSuccess: (r) => {
      toast.success(`${r.inserted} tagihan baru dibuat untuk ${r.periods} periode × ${r.types} iuran`);
      qc.invalidateQueries({ queryKey: ["bills"] });
      qc.invalidateQueries({ queryKey: ["bills-by-resident"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal"),
  });

  const [payTarget, setPayTarget] = useState<Bill | null>(null);
  const pay = useMutation({
    mutationFn: (v: { billId: string; amount: number; method: "cash" | "transfer" | "qris"; note?: string | null }) => payFn({ data: v }),
    onSuccess: (r) => {
      toast.success(`Pembayaran tersimpan · ${r.receiptNo}`);
      qc.invalidateQueries({ queryKey: ["bills"] });
      qc.invalidateQueries({ queryKey: ["bills-by-resident"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setPayTarget(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal"),
  });

  const total = useMemo(
    () => (data?.bills ?? []).reduce((s, b) => s + Number(b.amount), 0),
    [data],
  );

  const downloadInvoice = async (residentId: string) => {
    try {
      const { resident, bills } = await fetchResidentBills({ data: { residentId } });
      await renderInvoicePDF(resident, bills);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal membuat surat tagihan");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Tagihan</h1>
          <p className="text-muted-foreground">
            Sistem berjalan sejak Januari 2026. Tagihan dihitung otomatis berdasarkan iuran & data warga.
          </p>
        </div>
        <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
          <RefreshCw className={`size-4 mr-2 ${generate.isPending ? "animate-spin" : ""}`} />
          {generate.isPending ? "Memproses…" : "Generate sampai bulan ini"}
        </Button>
      </div>

      <Tabs defaultValue="warga">
        <TabsList>
          <TabsTrigger value="warga">Per Warga</TabsTrigger>
          <TabsTrigger value="periode">Per Periode</TabsTrigger>
        </TabsList>

        <TabsContent value="warga" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border">
                      <th className="py-2 pr-4 font-medium">Warga</th>
                      <th className="py-2 pr-4 font-medium">Status</th>
                      <th className="py-2 pr-4 font-medium text-right">Total Tagihan</th>
                      <th className="py-2 pr-4 font-medium text-right">Terbayar</th>
                      <th className="py-2 pr-4 font-medium text-right">Sisa</th>
                      <th className="py-2 pr-4 font-medium text-center">Belum Lunas</th>
                      <th className="py-2 pr-4 font-medium text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingResident && (
                      <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">Memuat…</td></tr>
                    )}
                    {!loadingResident && (byResident?.residents ?? []).length === 0 && (
                      <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">
                        Belum ada data. Klik <b>Generate sampai bulan ini</b> untuk membuat tagihan.
                      </td></tr>
                    )}
                    {(byResident?.residents ?? []).map((r) => {
                      const outstanding = Number(r.outstanding);
                      return (
                        <tr key={r.resident_id} className="border-b border-border/60 hover:bg-accent/40">
                          <td className="py-2 pr-4">
                            <div className="font-medium">{r.full_name}</div>
                            <div className="text-xs text-muted-foreground font-mono">
                              {r.house_block || "-"}/{r.house_number || "-"}
                            </div>
                          </td>
                          <td className="py-2 pr-4">
                            <Badge variant={r.status === "active" ? "default" : "secondary"}>
                              {r.status === "active" ? "Aktif" : "Nonaktif"}
                            </Badge>
                          </td>
                          <td className="py-2 pr-4 text-right font-mono">{formatRupiah(r.total_amount)}</td>
                          <td className="py-2 pr-4 text-right font-mono">{formatRupiah(r.total_paid)}</td>
                          <td className="py-2 pr-4 text-right font-mono">
                            <span className={outstanding > 0 ? "text-destructive font-semibold" : ""}>
                              {formatRupiah(outstanding)}
                            </span>
                          </td>
                          <td className="py-2 pr-4 text-center">
                            {r.unpaid_count > 0 ? (
                              <Badge variant="outline">{r.unpaid_count} bln</Badge>
                            ) : r.bill_count > 0 ? (
                              <Badge>Lunas</Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </td>
                          <td className="py-2 pr-4 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={r.bill_count === 0}
                              onClick={() => downloadInvoice(r.resident_id)}
                            >
                              <FileDown className="size-3 mr-1" /> Surat Tagihan
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="periode" className="mt-4">
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
                <div>
                  <Label className="text-xs">Status</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua</SelectItem>
                      <SelectItem value="unpaid">Belum bayar</SelectItem>
                      <SelectItem value="partial">Sebagian</SelectItem>
                      <SelectItem value="paid">Lunas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="ml-auto text-right">
                  <div className="text-xs text-muted-foreground">Total tagihan terfilter</div>
                  <div className="font-display text-xl font-bold">{formatRupiah(total)}</div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border">
                      <th className="py-2 pr-4 font-medium">Warga</th>
                      <th className="py-2 pr-4 font-medium">Iuran</th>
                      <th className="py-2 pr-4 font-medium">Periode</th>
                      <th className="py-2 pr-4 font-medium text-right">Nominal</th>
                      <th className="py-2 pr-4 font-medium text-right">Dibayar</th>
                      <th className="py-2 pr-4 font-medium">Status</th>
                      <th className="py-2 pr-4 font-medium text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading && <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">Memuat…</td></tr>}
                    {!isLoading && (data?.bills ?? []).length === 0 && (
                      <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">Belum ada tagihan untuk filter ini.</td></tr>
                    )}
                    {(data?.bills ?? []).map((b) => (
                      <tr key={b.id} className="border-b border-border/60 hover:bg-accent/40">
                        <td className="py-2 pr-4">
                          <div className="font-medium">{b.resident_name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{b.house_block || "-"}/{b.house_number || "-"}</div>
                        </td>
                        <td className="py-2 pr-4">{b.dues_name}</td>
                        <td className="py-2 pr-4">{BULAN_ID[b.month - 1]} {b.year}</td>
                        <td className="py-2 pr-4 text-right font-mono">{formatRupiah(b.amount)}</td>
                        <td className="py-2 pr-4 text-right font-mono">{formatRupiah(b.paid_amount)}</td>
                        <td className="py-2 pr-4">
                          <Badge variant={b.status === "paid" ? "default" : b.status === "partial" ? "secondary" : "outline"}>
                            {b.status === "paid" ? "Lunas" : b.status === "partial" ? "Sebagian" : "Belum"}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4 text-right">
                          {b.status !== "paid" && (
                            <Button size="sm" variant="outline" onClick={() => setPayTarget(b)}>
                              <Wallet className="size-3 mr-1" /> Bayar
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <PayDialog
        bill={payTarget}
        onClose={() => setPayTarget(null)}
        onPay={(v) => pay.mutate(v)}
        running={pay.isPending}
      />
    </div>
  );
}

function PayDialog({
  bill, onClose, onPay, running,
}: {
  bill: Bill | null; onClose: () => void;
  onPay: (v: { billId: string; amount: number; method: "cash" | "transfer" | "qris"; note?: string | null }) => void;
  running: boolean;
}) {
  const remaining = bill ? Number(bill.amount) - Number(bill.paid_amount) : 0;
  const [amount, setAmount] = useState(String(remaining));
  const [method, setMethod] = useState<"cash" | "transfer" | "qris">("cash");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (bill) {
      setAmount(String(Number(bill.amount) - Number(bill.paid_amount)));
      setMethod("cash");
      setNote("");
    }
  }, [bill]);

  return (
    <Dialog open={!!bill} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Catat Pembayaran</DialogTitle>
        </DialogHeader>
        {bill && (
          <div className="space-y-3">
            <div className="rounded-lg bg-accent/50 p-3 text-sm">
              <div className="font-medium">{bill.resident_name}</div>
              <div className="text-muted-foreground">{bill.dues_name} · {BULAN_ID[bill.month - 1]} {bill.year}</div>
              <div className="mt-1 flex justify-between">
                <span>Sisa</span>
                <span className="font-mono font-semibold">{formatRupiah(remaining)}</span>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Jumlah dibayar</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Metode</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Tunai</SelectItem>
                  <SelectItem value="transfer">Transfer</SelectItem>
                  <SelectItem value="qris">QRIS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Catatan</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opsional" />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Batal</Button>
          <Button
            disabled={!bill || running || !Number(amount)}
            onClick={() =>
              bill &&
              onPay({
                billId: bill.id,
                amount: Number(amount),
                method,
                note: note.trim() || null,
              })
            }
          >
            {running ? "Memproses…" : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ResidentInfo = {
  id: string;
  full_name: string;
  house_block: string | null;
  house_number: string | null;
  phone: string | null;
  status: string;
};
type BillRow = {
  id: string;
  dues_name: string;
  year: number;
  month: number;
  amount: string;
  paid_amount: string;
  status: string;
  due_date: string | null;
};

async function renderInvoicePDF(resident: ResidentInfo, bills: BillRow[]) {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("GHR PAYMENT SYSTEM", 105, 18, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Surat Tagihan Iuran Warga", 105, 24, { align: "center" });
  doc.setLineWidth(0.4);
  doc.line(15, 28, 195, 28);

  // Recipient
  doc.setFontSize(10);
  let y = 36;
  doc.text(`Tanggal     : ${formatTanggal(new Date().toISOString())}`, 15, y);
  y += 6;
  doc.text("Kepada Yth.", 15, y); y += 5;
  doc.setFont("helvetica", "bold");
  doc.text(resident.full_name, 15, y); y += 5;
  doc.setFont("helvetica", "normal");
  doc.text(
    `Blok ${resident.house_block || "-"} No. ${resident.house_number || "-"}`,
    15, y,
  ); y += 5;
  if (resident.phone) { doc.text(`Telp: ${resident.phone}`, 15, y); y += 5; }
  doc.text(
    `Status: ${resident.status === "active" ? "Warga Aktif" : "Warga Nonaktif"}`,
    15, y,
  );
  y += 8;

  doc.setFontSize(10);
  doc.text(
    "Bersama ini kami sampaikan rincian tagihan iuran warga sebagai berikut:",
    15, y,
  );
  y += 4;

  // Table
  const rows = bills.map((b) => {
    const sisa = Number(b.amount) - Number(b.paid_amount);
    return [
      `${BULAN_ID[b.month - 1]} ${b.year}`,
      b.dues_name,
      formatRupiah(b.amount),
      formatRupiah(b.paid_amount),
      formatRupiah(sisa),
      b.status === "paid" ? "Lunas" : b.status === "partial" ? "Sebagian" : "Belum",
    ];
  });
  const totalAmount = bills.reduce((s, b) => s + Number(b.amount), 0);
  const totalPaid = bills.reduce((s, b) => s + Number(b.paid_amount), 0);
  const totalSisa = totalAmount - totalPaid;

  autoTable(doc, {
    startY: y + 2,
    head: [["Periode", "Iuran", "Nominal", "Dibayar", "Sisa", "Status"]],
    body: rows,
    foot: [[
      { content: "TOTAL", colSpan: 2, styles: { halign: "right", fontStyle: "bold" } },
      { content: formatRupiah(totalAmount), styles: { fontStyle: "bold" } },
      { content: formatRupiah(totalPaid), styles: { fontStyle: "bold" } },
      { content: formatRupiah(totalSisa), styles: { fontStyle: "bold", textColor: [180, 0, 0] } },
      "",
    ]],
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [16, 122, 87] },
    columnStyles: {
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
    },
  });

  type DocWithAuto = typeof doc & { lastAutoTable?: { finalY: number } };
  const finalY = (doc as DocWithAuto).lastAutoTable?.finalY ?? y + 40;
  let y2 = finalY + 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`Total tagihan belum lunas: ${formatRupiah(totalSisa)}`, 15, y2);
  y2 += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const note =
    "Mohon kesediaan Bapak/Ibu untuk segera menyelesaikan tagihan tersebut. " +
    "Pembayaran dapat dilakukan secara tunai kepada bendahara, transfer bank, atau QRIS. " +
    "Terima kasih atas perhatian dan kerjasamanya.";
  const noteLines = doc.splitTextToSize(note, 180);
  doc.text(noteLines, 15, y2);
  y2 += noteLines.length * 4 + 14;

  doc.text("Hormat kami,", 140, y2); y2 += 18;
  doc.setFont("helvetica", "bold");
  doc.text("Bendahara GHR", 140, y2);

  doc.save(`Surat-Tagihan-${resident.full_name.replace(/\s+/g, "_")}.pdf`);
}
