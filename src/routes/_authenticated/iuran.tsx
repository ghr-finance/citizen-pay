import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  listDuesTypes,
  upsertDuesType,
  deleteDuesType,
  generateMonthlyPeriod,
} from "@/lib/dues.functions";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Pencil, Trash2, CalendarPlus } from "lucide-react";
import { formatRupiah, BULAN_ID } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/iuran")({
  component: IuranPage,
});

type DT = { id: string; name: string; amount_default: string; period: string; active: boolean };

function IuranPage() {
  const fetchList = useServerFn(listDuesTypes);
  const upsertFn = useServerFn(upsertDuesType);
  const deleteFn = useServerFn(deleteDuesType);
  const genFn = useServerFn(generateMonthlyPeriod);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["dues-types"],
    queryFn: () => fetchList(),
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DT | null>(null);
  const [genOpen, setGenOpen] = useState(false);

  const save = useMutation({
    mutationFn: (v: Parameters<typeof upsertFn>[0]["data"]) => upsertFn({ data: v }),
    onSuccess: () => { toast.success("Tersimpan"); qc.invalidateQueries({ queryKey: ["dues-types"] }); setOpen(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { toast.success("Dihapus"); qc.invalidateQueries({ queryKey: ["dues-types"] }); },
  });
  const generate = useMutation({
    mutationFn: (v: Parameters<typeof genFn>[0]["data"]) => genFn({ data: v }),
    onSuccess: (r) => { toast.success(`${r.inserted} tagihan dibuat`); setGenOpen(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal"),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Jenis Iuran</h1>
          <p className="text-muted-foreground">Atur jenis iuran dan generate tagihan bulanan</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setGenOpen(true)}>
            <CalendarPlus className="size-4 mr-2" /> Generate Tagihan
          </Button>
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="size-4 mr-2" /> Tambah Iuran
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading && <p className="text-muted-foreground">Memuat…</p>}
        {(data?.duesTypes ?? []).map((d) => (
          <Card key={d.id}>
            <CardHeader className="pb-3 flex flex-row items-start justify-between">
              <div>
                <CardTitle className="font-display text-base">{d.name}</CardTitle>
                <div className="text-xs text-muted-foreground mt-1">
                  {d.period === "monthly" ? "Bulanan" : "Sekali"} · {d.active ? "Aktif" : "Nonaktif"}
                </div>
              </div>
              <Badge variant={d.active ? "default" : "secondary"}>
                {d.active ? "Aktif" : "Nonaktif"}
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="font-display text-2xl font-bold text-primary">
                {formatRupiah(d.amount_default)}
              </div>
              <div className="flex gap-1 mt-3">
                <Button variant="ghost" size="sm" onClick={() => { setEditing(d); setOpen(true); }}>
                  <Pencil className="size-3 mr-1" /> Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { if (confirm(`Hapus ${d.name}?`)) remove.mutate(d.id); }}
                >
                  <Trash2 className="size-3 mr-1 text-destructive" /> Hapus
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <DuesDialog open={open} onOpenChange={setOpen} initial={editing} onSave={(v) => save.mutate(v)} saving={save.isPending} />
      <GenerateDialog
        open={genOpen}
        onOpenChange={setGenOpen}
        types={data?.duesTypes ?? []}
        onGenerate={(v) => generate.mutate(v)}
        running={generate.isPending}
      />
    </div>
  );
}

function DuesDialog({
  open, onOpenChange, initial, onSave, saving,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; initial: DT | null;
  onSave: (v: { id?: string; name: string; amountDefault: number; period: "monthly" | "one_time"; active: boolean }) => void;
  saving: boolean;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("0");
  const [period, setPeriod] = useState<"monthly" | "one_time">("monthly");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name || "");
    setAmount(initial?.amount_default || "0");
    setPeriod((initial?.period as "monthly" | "one_time") || "monthly");
    setActive(initial?.active ?? true);
  }, [open, initial]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Iuran" : "Tambah Iuran"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label>Nama iuran</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mis. Iuran Keamanan" />
          </div>
          <div className="space-y-1">
            <Label>Nominal default</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Periode</Label>
              <Select value={period} onValueChange={(v) => setPeriod(v as "monthly" | "one_time")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Bulanan</SelectItem>
                  <SelectItem value="one_time">Sekali bayar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={active ? "1" : "0"} onValueChange={(v) => setActive(v === "1")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Aktif</SelectItem>
                  <SelectItem value="0">Nonaktif</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button
            disabled={saving || !name.trim()}
            onClick={() => onSave({
              id: initial?.id, name: name.trim(),
              amountDefault: Number(amount) || 0, period, active,
            })}
          >
            {saving ? "Menyimpan…" : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GenerateDialog({
  open, onOpenChange, types, onGenerate, running,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; types: DT[];
  onGenerate: (v: { duesTypeId: string; year: number; month: number; dueDate?: string | null }) => void;
  running: boolean;
}) {
  const now = new Date();
  const [duesTypeId, setDuesTypeId] = useState("");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [dueDate, setDueDate] = useState("");

  useEffect(() => {
    if (!open) return;
    setDuesTypeId(types.find((t) => t.active)?.id || "");
    setYear(now.getFullYear());
    setMonth(now.getMonth() + 1);
    setDueDate("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate Tagihan Bulanan</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label>Jenis iuran</Label>
            <Select value={duesTypeId} onValueChange={setDuesTypeId}>
              <SelectTrigger><SelectValue placeholder="Pilih iuran" /></SelectTrigger>
              <SelectContent>
                {types.filter((t) => t.active).map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name} — {formatRupiah(t.amount_default)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Bulan</Label>
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BULAN_ID.map((b, i) => (
                    <SelectItem key={i} value={String(i + 1)}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Tahun</Label>
              <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Jatuh tempo (opsional)</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            Tagihan akan dibuat untuk semua warga aktif. Jika tagihan periode ini sudah ada, akan dilewati.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button
            disabled={!duesTypeId || running}
            onClick={() => onGenerate({ duesTypeId, year, month, dueDate: dueDate || null })}
          >
            {running ? "Memproses…" : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
