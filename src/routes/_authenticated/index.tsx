import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { dashboardStats } from "@/lib/reports.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRupiah, formatTanggal } from "@/lib/format";
import { Users, Receipt, Wallet, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/")({
  component: Dashboard,
});

function Dashboard() {
  const fetchStats = useServerFn(dashboardStats);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => fetchStats(),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Ringkasan kas dan tunggakan warga</p>
      </div>

      {isLoading || !data ? (
        <p className="text-muted-foreground text-sm">Memuat data…</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={Users} label="Warga Aktif" value={String(data.activeResidents)} />
            <StatCard
              icon={Wallet}
              label="Kas Bulan Ini"
              value={formatRupiah(data.paidThisMonthTotal)}
              hint={`${data.paidThisMonthCount} transaksi`}
              accent
            />
            <StatCard
              icon={Receipt}
              label="Tagihan Belum Lunas"
              value={String(data.unpaidCount)}
            />
            <StatCard
              icon={AlertTriangle}
              label="Total Tunggakan"
              value={formatRupiah(data.unpaidTotal)}
              warn
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="font-display">Kas 6 Bulan Terakhir</CardTitle>
              </CardHeader>
              <CardContent>
                <MonthlyBars data={data.monthlySeries} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="font-display">Pembayaran Terbaru</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.recentPayments.length === 0 && (
                  <p className="text-sm text-muted-foreground">Belum ada pembayaran.</p>
                )}
                {data.recentPayments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{p.resident_name}</div>
                      <div className="text-xs text-muted-foreground">{formatTanggal(p.paid_at)} · {p.receipt_no}</div>
                    </div>
                    <div className="font-mono font-semibold text-primary">{formatRupiah(p.amount)}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon, label, value, hint, accent, warn,
}: {
  icon: typeof Users; label: string; value: string; hint?: string;
  accent?: boolean; warn?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-muted-foreground">{label}</span>
          <div
            className={
              "size-9 rounded-lg grid place-items-center " +
              (accent
                ? "bg-primary/10 text-primary"
                : warn
                ? "bg-destructive/10 text-destructive"
                : "bg-accent text-accent-foreground")
            }
          >
            <Icon className="size-4" />
          </div>
        </div>
        <div className="font-display text-2xl font-bold">{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function MonthlyBars({ data }: { data: Array<{ ym: string; total: number }> }) {
  if (!data.length) return <p className="text-sm text-muted-foreground">Belum ada data.</p>;
  const max = Math.max(...data.map((d) => d.total), 1);
  return (
    <div className="flex items-end gap-3 h-48">
      {data.map((d) => {
        const h = (d.total / max) * 100;
        const [, m] = d.ym.split("-");
        const label = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"][Number(m) - 1];
        return (
          <div key={d.ym} className="flex-1 flex flex-col items-center gap-2">
            <div className="text-xs font-mono font-semibold">{formatRupiah(d.total).replace("Rp ", "")}</div>
            <div className="w-full bg-accent rounded-md overflow-hidden flex flex-col-reverse" style={{ height: "140px" }}>
              <div
                className="bg-gradient-to-t from-primary to-primary/70 rounded-md transition-all"
                style={{ height: `${h}%` }}
              />
            </div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        );
      })}
    </div>
  );
}
