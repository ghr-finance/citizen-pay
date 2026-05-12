import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  createTransaction,
  deleteTransaction,
  listTransactions,
  INCOME_CATEGORIES,
  EXPENSE_CATEGORIES,
} from "@/lib/transactions.functions";
import { listResidents } from "@/lib/residents.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatRupiah, formatTanggal, BULAN_ID } from "@/lib/format";
import {
  ArrowDownCircle, ArrowUpCircle, Plus, Trash2, Wallet, TrendingUp, TrendingDown, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const IPL_NOMINALS = [175000, 200000] as const;

export const Route = createFileRoute("/_authenticated/transaksi")({
  component: TransaksiPage,
});

type TxType = "income" | "expense";

function TransaksiPage() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listTransactions);
  const createFn = useServerFn(createTransaction);
  const deleteFn = useServerFn(deleteTransaction);

  const now = new Date();
  const [year, setYear] = useState<number | null>(now.getFullYear());
  const [month, setMonth] = useState<number | null>(now.getMonth() + 1);
  const [filterType, setFilterType] = useState<"all" | TxType>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["transactions", year, month, filterType],
    queryFn: () =>
      fetchList({
        data: {
          year,
          month,
          type: filterType === "all" ? null : filterType,
        },
      }),
  });

  // form state
  const [type, setType] = useState<TxType>("income");
  const [category, setCategory] = useState<string>(INCOME_CATEGORIES[0]);
  const [customCategory, setCustomCategory] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [occurredAt, setOccurredAt] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [method, setMethod] = useState<"cash" | "transfer" | "qris">("cash");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // IPL-specific
  const [iplSource, setIplSource] = useState<"warga" | "lainnya">("warga");
  const [iplResidentId, setIplResidentId] = useState<string>("");
  const [iplNominal, setIplNominal] = useState<number | "lainnya" | null>(175000);

  const isIPL = type === "income" && category === "IPL";
  const residentsQuery = useQuery({
    queryKey: ["residents-ipl"],
    queryFn: () => fetchResidents(),
    enabled: isIPL && iplSource === "warga",
  });

  const categories = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const switchType = (t: TxType) => {
    setType(t);
    const cats = t === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    setCategory(cats[0]);
    setCustomCategory("");
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(amount.replace(/[^\d.-]/g, ""));
    if (!num || num <= 0) {
      toast.error("Nominal tidak valid");
      return;
    }
    const finalCategory =
      category === "Lainnya" && customCategory.trim() ? customCategory.trim() : category;
    setSubmitting(true);
    try {
      await createFn({
        data: {
          type,
          category: finalCategory,
          amount: num,
          occurredAt,
          method,
          description: description || null,
        },
      });
      toast.success("Transaksi tersimpan");
      setAmount("");
      setDescription("");
      setCustomCategory("");
      qc.invalidateQueries({ queryKey: ["transactions"] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm("Hapus transaksi ini?")) return;
    try {
      await deleteFn({ data: { id } });
      toast.success("Transaksi dihapus");
      qc.invalidateQueries({ queryKey: ["transactions"] });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const summary = data?.summary ?? { income: 0, expense: 0, net: 0 };
  const transactions = data?.transactions ?? [];

  const years = useMemo(() => {
    const y = now.getFullYear();
    return [y - 2, y - 1, y, y + 1];
  }, [now]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Transaksi</h1>
          <p className="text-muted-foreground">
            Catat pemasukan & pengeluaran kas warga
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          label="Pemasukan"
          value={summary.income}
          icon={<TrendingUp className="size-5" />}
          tone="income"
        />
        <SummaryCard
          label="Pengeluaran"
          value={summary.expense}
          icon={<TrendingDown className="size-5" />}
          tone="expense"
        />
        <SummaryCard
          label="Saldo Bersih"
          value={summary.net}
          icon={<Wallet className="size-5" />}
          tone={summary.net >= 0 ? "income" : "expense"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        {/* FORM */}
        <Card className="overflow-hidden border-border/60">
          <div className="bg-gradient-to-br from-primary/10 via-transparent to-transparent px-6 pt-6 pb-4 border-b border-border/60">
            <div className="flex items-center gap-2 mb-3">
              <Plus className="size-4 text-primary" />
              <span className="text-sm font-medium text-muted-foreground">
                Tambah Transaksi Baru
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-muted/60">
              <button
                type="button"
                onClick={() => switchType("income")}
                className={cn(
                  "flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition",
                  type === "income"
                    ? "bg-emerald-500 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <ArrowDownCircle className="size-4" /> Pemasukan
              </button>
              <button
                type="button"
                onClick={() => switchType("expense")}
                className={cn(
                  "flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition",
                  type === "expense"
                    ? "bg-rose-500 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <ArrowUpCircle className="size-4" /> Pengeluaran
              </button>
            </div>
          </div>

          <form onSubmit={onSubmit}>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-1.5">
                <Label>Nominal</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                    Rp
                  </span>
                  <Input
                    inputMode="numeric"
                    placeholder="0"
                    value={amount ? Number(amount.replace(/\D/g, "")).toLocaleString("id-ID") : ""}
                    onChange={(e) =>
                      setAmount(e.target.value.replace(/\D/g, ""))
                    }
                    className="pl-9 h-12 text-lg font-semibold"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Kategori Pos</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {category === "Lainnya" && (
                  <Input
                    placeholder="Tulis kategori..."
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    className="mt-2"
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Tanggal</Label>
                  <Input
                    type="date"
                    value={occurredAt}
                    onChange={(e) => setOccurredAt(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Metode</Label>
                  <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Tunai</SelectItem>
                      <SelectItem value="transfer">Transfer</SelectItem>
                      <SelectItem value="qris">QRIS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Keterangan (opsional)</Label>
                <Textarea
                  placeholder="Catatan tambahan..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>

              <Button
                type="submit"
                disabled={submitting}
                className={cn(
                  "w-full h-11",
                  type === "income"
                    ? "bg-emerald-600 hover:bg-emerald-600/90"
                    : "bg-rose-600 hover:bg-rose-600/90",
                )}
              >
                {submitting ? "Menyimpan..." : `Simpan ${type === "income" ? "Pemasukan" : "Pengeluaran"}`}
              </Button>
            </CardContent>
          </form>
        </Card>

        {/* LIST */}
        <Card className="border-border/60">
          <CardContent className="pt-6 space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Tahun</Label>
                <Select
                  value={year != null ? String(year) : "all"}
                  onValueChange={(v) => setYear(v === "all" ? null : Number(v))}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua</SelectItem>
                    {years.map((y) => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Bulan</Label>
                <Select
                  value={month != null ? String(month) : "all"}
                  onValueChange={(v) => setMonth(v === "all" ? null : Number(v))}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua</SelectItem>
                    {BULAN_ID.map((b, i) => (
                      <SelectItem key={b} value={String(i + 1)}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="ml-auto inline-flex rounded-lg bg-muted p-1 text-xs">
                {(["all", "income", "expense"] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setFilterType(k)}
                    className={cn(
                      "px-3 py-1.5 rounded-md font-medium capitalize transition",
                      filterType === k
                        ? "bg-background shadow-sm text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {k === "all" ? "Semua" : k === "income" ? "Pemasukan" : "Pengeluaran"}
                  </button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-border/60 -mx-2">
              {isLoading && (
                <div className="px-2 py-8 text-center text-sm text-muted-foreground">
                  Memuat...
                </div>
              )}
              {!isLoading && transactions.length === 0 && (
                <div className="px-2 py-12 text-center text-sm text-muted-foreground">
                  Belum ada transaksi pada periode ini.
                </div>
              )}
              {transactions.map((t) => {
                const isIncome = t.type === "income";
                return (
                  <div
                    key={t.id}
                    className="group flex items-center gap-3 px-2 py-3 hover:bg-muted/40 rounded-lg transition"
                  >
                    <div
                      className={cn(
                        "size-10 rounded-xl grid place-items-center shrink-0",
                        isIncome
                          ? "bg-emerald-500/10 text-emerald-600"
                          : "bg-rose-500/10 text-rose-600",
                      )}
                    >
                      {isIncome ? <ArrowDownCircle className="size-5" /> : <ArrowUpCircle className="size-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{t.category}</span>
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {t.method}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {formatTanggal(t.occurred_at)}
                        {t.description ? ` · ${t.description}` : ""}
                        {t.recorded_by_name ? ` · oleh ${t.recorded_by_name}` : ""}
                      </div>
                    </div>
                    <div
                      className={cn(
                        "font-semibold tabular-nums",
                        isIncome ? "text-emerald-600" : "text-rose-600",
                      )}
                    >
                      {isIncome ? "+" : "-"} {formatRupiah(t.amount)}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 transition text-muted-foreground hover:text-destructive"
                      onClick={() => onDelete(t.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: "income" | "expense";
}) {
  return (
    <Card className="border-border/60 overflow-hidden relative">
      <div
        className={cn(
          "absolute inset-0 opacity-[0.07]",
          tone === "income"
            ? "bg-gradient-to-br from-emerald-500 to-emerald-300"
            : "bg-gradient-to-br from-rose-500 to-rose-300",
        )}
      />
      <CardContent className="pt-6 relative">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground font-medium">{label}</span>
          <div
            className={cn(
              "size-9 rounded-lg grid place-items-center",
              tone === "income"
                ? "bg-emerald-500/15 text-emerald-600"
                : "bg-rose-500/15 text-rose-600",
            )}
          >
            {icon}
          </div>
        </div>
        <div className="mt-2 text-2xl font-bold font-display tabular-nums">
          {formatRupiah(value)}
        </div>
      </CardContent>
    </Card>
  );
}
