import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { listBills } from "@/lib/bills.functions";
import { recordPayment } from "@/lib/payments.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatRupiah, BULAN_ID } from "@/lib/format";
import { Wallet } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tagihan")({
  component: TagihanPage,
});

type Bill = Awaited<ReturnType<typeof listBills>>["bills"][number];

function TagihanPage() {
  const fetchList = useServerFn(listBills);
  const payFn = useServerFn(recordPayment);
  const qc = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState<number | null>(now.getFullYear());
  const [month, setMonth] = useState<number | null>(now.getMonth() + 1);
  const [status, setStatus] = useState<"unpaid" | "paid" | "partial" | "all">("all");

  const { data, isLoading } = useQuery({
    queryKey: ["bills", year, month, status],
    queryFn: () => fetchList({ data: { year, month, status } }),
  });

  const [payTarget, setPayTarget] = useState<Bill | null>(null);
  const pay = useMutation({
    mutationFn: (v: Parameters<typeof payFn>[0]["data"]) => payFn({ data: v }),
    onSuccess: (r) => {
      toast.success(`Pembayaran tersimpan · ${r.receiptNo}`);
      qc.invalidateQueries({ queryKey: ["bills"] });
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Tagihan</h1>
        <p className="text-muted-foreground">Daftar tagihan iuran warga</p>
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
