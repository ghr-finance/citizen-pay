import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  listResidents,
  upsertResident,
  deleteResident,
  listStatusHistory,
  addStatusChange,
  deleteStatusChange,
} from "@/lib/residents.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/warga")({
  component: WargaPage,
});

type Resident = {
  id: string;
  nik: string | null;
  full_name: string;
  house_block: string | null;
  house_number: string | null;
  phone: string | null;
  status: string;
  joined_at: string | null;
};

type SaveInput = {
  id?: string;
  nik?: string | null;
  fullName: string;
  houseBlock?: string | null;
  houseNumber?: string | null;
  phone?: string | null;
  status: "active" | "inactive";
  joinedAt?: string | null;
  statusEffectiveYear?: number;
  statusEffectiveMonth?: number;
};

const MONTHS = [
  "Januari","Februari","Maret","April","Mei","Juni",
  "Juli","Agustus","September","Oktober","November","Desember",
];

function WargaPage() {
  const fetchList = useServerFn(listResidents);
  const upsertFn = useServerFn(upsertResident);
  const deleteFn = useServerFn(deleteResident);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["residents"],
    queryFn: () => fetchList(),
  });
  const [editing, setEditing] = useState<Resident | null>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const save = useMutation({
    mutationFn: (input: SaveInput) => upsertFn({ data: input }),
    onSuccess: () => {
      toast.success("Tersimpan");
      qc.invalidateQueries({ queryKey: ["residents"] });
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Dihapus");
      qc.invalidateQueries({ queryKey: ["residents"] });
    },
  });

  const residents = (data?.residents ?? []).filter((r) =>
    [r.full_name, r.nik, r.house_block, r.house_number, r.phone]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Data Warga</h1>
          <p className="text-muted-foreground">Kelola data warga dan riwayat status keanggotaan</p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="size-4 mr-2" /> Tambah Warga
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Input
            placeholder="Cari nama / blok / nomor rumah…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm mb-4"
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 pr-4 font-medium">Nama</th>
                  <th className="py-2 pr-4 font-medium">Blok/No</th>
                  <th className="py-2 pr-4 font-medium">Telepon</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">Memuat…</td></tr>
                )}
                {!isLoading && residents.length === 0 && (
                  <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">Belum ada data.</td></tr>
                )}
                {residents.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 hover:bg-accent/40">
                    <td className="py-2 pr-4">
                      <div className="font-medium">{r.full_name}</div>
                      {r.nik && <div className="text-xs text-muted-foreground">NIK {r.nik}</div>}
                    </td>
                    <td className="py-2 pr-4 font-mono">
                      {r.house_block || "-"} / {r.house_number || "-"}
                    </td>
                    <td className="py-2 pr-4">{r.phone || "-"}</td>
                    <td className="py-2 pr-4">
                      <Badge variant={r.status === "active" ? "default" : "secondary"}>
                        {r.status === "active" ? "Aktif" : "Tidak aktif"}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4 text-right">
                      <Button variant="ghost" size="icon" onClick={() => { setEditing(r); setOpen(true); }}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm(`Hapus ${r.full_name}?`)) remove.mutate(r.id);
                        }}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <ResidentDialog
        open={open}
        onOpenChange={setOpen}
        initial={editing}
        onSave={(v) => save.mutate(v)}
        saving={save.isPending}
      />
    </div>
  );
}

function ResidentDialog({
  open, onOpenChange, initial, onSave, saving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: Resident | null;
  onSave: (v: SaveInput) => void;
  saving: boolean;
}) {
  const now = new Date();
  const [fullName, setFullName] = useState(initial?.full_name || "");
  const [nik, setNik] = useState(initial?.nik || "");
  const [houseBlock, setHouseBlock] = useState(initial?.house_block || "");
  const [houseNumber, setHouseNumber] = useState(initial?.house_number || "");
  const [phone, setPhone] = useState(initial?.phone || "");
  const [status, setStatus] = useState<"active" | "inactive">(
    (initial?.status as "active" | "inactive") || "active",
  );
  const [joinedAt, setJoinedAt] = useState(initial?.joined_at?.slice(0, 10) || "");
  const [effYear, setEffYear] = useState<number>(2026);
  const [effMonth, setEffMonth] = useState<number>(1);

  useEffect(() => {
    if (!open) return;
    setFullName(initial?.full_name || "");
    setNik(initial?.nik || "");
    setHouseBlock(initial?.house_block || "");
    setHouseNumber(initial?.house_number || "");
    setPhone(initial?.phone || "");
    setStatus((initial?.status as "active" | "inactive") || "active");
    setJoinedAt(initial?.joined_at?.slice(0, 10) || "");
    setEffYear(now.getFullYear());
    setEffMonth(now.getMonth() + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const statusChanged = !!initial && status !== (initial.status as string);
  const showEffective = !initial || statusChanged;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Warga" : "Tambah Warga"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label>Nama lengkap</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Blok</Label>
              <Input value={houseBlock} onChange={(e) => setHouseBlock(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>No. Rumah</Label>
              <Input value={houseNumber} onChange={(e) => setHouseNumber(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>NIK</Label>
              <Input value={nik} onChange={(e) => setNik(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Telepon</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Bergabung</Label>
              <Input type="date" value={joinedAt} onChange={(e) => setJoinedAt(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as "active" | "inactive")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="inactive">Tidak aktif</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {showEffective && (
            <div className="rounded-md border border-border bg-muted/40 p-3 space-y-2">
              <Label className="text-sm">
                {initial
                  ? "Berlaku sejak (perubahan status akan dicatat)"
                  : "Status awal berlaku sejak"}
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <Select value={String(effMonth)} onValueChange={(v) => setEffMonth(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  value={effYear}
                  onChange={(e) => setEffYear(Number(e.target.value) || 2026)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Status ini akan dipakai saat menghitung tagihan mulai periode tersebut.
                Tagihan sebelum periode ini tetap memakai status lama.
              </p>
            </div>
          )}

          {initial && <StatusHistoryEditor residentId={initial.id} />}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button
            disabled={saving || !fullName.trim()}
            onClick={() =>
              onSave({
                id: initial?.id,
                fullName: fullName.trim(),
                nik: nik.trim() || null,
                houseBlock: houseBlock.trim() || null,
                houseNumber: houseNumber.trim() || null,
                phone: phone.trim() || null,
                status,
                joinedAt: joinedAt || null,
                statusEffectiveYear: showEffective ? effYear : undefined,
                statusEffectiveMonth: showEffective ? effMonth : undefined,
              })
            }
          >
            {saving ? "Menyimpan…" : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusHistoryEditor({ residentId }: { residentId: string }) {
  const listFn = useServerFn(listStatusHistory);
  const addFn = useServerFn(addStatusChange);
  const delFn = useServerFn(deleteStatusChange);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["status-history", residentId],
    queryFn: () => listFn({ data: { residentId } }),
  });

  const now = new Date();
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);

  const add = useMutation({
    mutationFn: () => addFn({ data: { residentId, status, year, month } }),
    onSuccess: () => {
      toast.success("Riwayat ditambahkan");
      qc.invalidateQueries({ queryKey: ["status-history", residentId] });
      qc.invalidateQueries({ queryKey: ["residents"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id, residentId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["status-history", residentId] });
      qc.invalidateQueries({ queryKey: ["residents"] });
    },
  });

  const history = data?.history ?? [];

  return (
    <div className="rounded-md border border-border p-3 space-y-3">
      <div>
        <Label className="text-sm">Riwayat Status</Label>
        <p className="text-xs text-muted-foreground">
          Status pada periode tertentu menentukan nominal tagihan yang dibuat untuk periode itu.
        </p>
      </div>

      <div className="space-y-1">
        {isLoading && <p className="text-xs text-muted-foreground">Memuat…</p>}
        {!isLoading && history.length === 0 && (
          <p className="text-xs text-muted-foreground">Belum ada entri.</p>
        )}
        {history.map((h) => (
          <div
            key={h.id}
            className="flex items-center justify-between rounded border border-border/60 px-2 py-1 text-sm"
          >
            <div className="flex items-center gap-2">
              <Badge variant={h.status === "active" ? "default" : "secondary"}>
                {h.status === "active" ? "Aktif" : "Tidak aktif"}
              </Badge>
              <span className="font-mono">
                {MONTHS[h.effective_month - 1]} {h.effective_year}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (confirm("Hapus entri ini?")) remove.mutate(h.id);
              }}
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as "active" | "inactive")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Aktif</SelectItem>
              <SelectItem value="inactive">Tidak aktif</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Bulan</Label>
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => (
                <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Tahun</Label>
          <Input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value) || now.getFullYear())}
          />
        </div>
        <Button
          variant="secondary"
          disabled={add.isPending}
          onClick={() => add.mutate()}
        >
          <Plus className="size-4 mr-1" /> Tambah
        </Button>
      </div>
    </div>
  );
}
