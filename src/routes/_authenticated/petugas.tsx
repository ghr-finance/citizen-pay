import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  listStaff,
  upsertStaff,
  deleteStaff,
  STAFF_POSITIONS,
  type StaffRow,
  type StaffPosition,
} from "@/lib/staff.functions";
import { listResidents } from "@/lib/residents.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/petugas")({
  component: PetugasPage,
});

const POSITION_LABEL: Record<StaffPosition, string> = {
  keamanan: "Keamanan",
  kebersihan: "Kebersihan",
  dkm: "DKM",
  ketua: "Ketua",
  bendahara: "Bendahara",
};

function PetugasPage() {
  const fetchList = useServerFn(listStaff);
  const fetchResidents = useServerFn(listResidents);
  const upsertFn = useServerFn(upsertStaff);
  const deleteFn = useServerFn(deleteStaff);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["staff"],
    queryFn: () => fetchList(),
  });
  const { data: resData } = useQuery({
    queryKey: ["residents"],
    queryFn: () => fetchResidents(),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [search, setSearch] = useState("");

  const save = useMutation({
    mutationFn: (input: Parameters<typeof upsertFn>[0]["data"]) =>
      upsertFn({ data: input }),
    onSuccess: () => {
      toast.success("Tersimpan");
      qc.invalidateQueries({ queryKey: ["staff"] });
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Dihapus");
      qc.invalidateQueries({ queryKey: ["staff"] });
    },
  });

  const staff = (data?.staff ?? []).filter((s) =>
    [s.full_name, s.phone, POSITION_LABEL[s.position]]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Petugas Administrasi</h1>
          <p className="text-muted-foreground">
            Kelola petugas: Keamanan, Kebersihan, DKM, Ketua, Bendahara
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="size-4 mr-2" /> Tambah Petugas
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Input
            placeholder="Cari nama / posisi / telepon…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm mb-4"
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 pr-4 font-medium">Nama</th>
                  <th className="py-2 pr-4 font-medium">Posisi</th>
                  <th className="py-2 pr-4 font-medium">Sumber</th>
                  <th className="py-2 pr-4 font-medium">Telepon</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-muted-foreground">
                      Memuat…
                    </td>
                  </tr>
                )}
                {!isLoading && staff.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-muted-foreground">
                      Belum ada petugas.
                    </td>
                  </tr>
                )}
                {staff.map((s) => (
                  <tr key={s.id} className="border-b border-border/60 hover:bg-accent/40">
                    <td className="py-2 pr-4">
                      <div className="font-medium">{s.full_name}</div>
                      {s.note && (
                        <div className="text-xs text-muted-foreground">{s.note}</div>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <Badge variant="secondary">{POSITION_LABEL[s.position]}</Badge>
                    </td>
                    <td className="py-2 pr-4 capitalize">
                      {s.source === "warga" ? "Warga" : "Eksternal"}
                    </td>
                    <td className="py-2 pr-4">{s.phone || "-"}</td>
                    <td className="py-2 pr-4">
                      <Badge variant={s.active ? "default" : "secondary"}>
                        {s.active ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditing(s);
                          setOpen(true);
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm(`Hapus ${s.full_name}?`)) remove.mutate(s.id);
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

      <StaffDialog
        open={open}
        onOpenChange={setOpen}
        initial={editing}
        residents={resData?.residents ?? []}
        onSave={(v) => save.mutate(v)}
        saving={save.isPending}
      />
    </div>
  );
}

function StaffDialog({
  open,
  onOpenChange,
  initial,
  residents,
  onSave,
  saving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: StaffRow | null;
  residents: Array<{ id: string; full_name: string; phone: string | null }>;
  onSave: (v: {
    id?: string;
    residentId?: string | null;
    fullName: string;
    phone?: string | null;
    position: StaffPosition;
    source: "warga" | "eksternal";
    note?: string | null;
    active: boolean;
    joinedAt?: string | null;
  }) => void;
  saving: boolean;
}) {
  const [source, setSource] = useState<"warga" | "eksternal">("warga");
  const [residentId, setResidentId] = useState<string>("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [position, setPosition] = useState<StaffPosition>("keamanan");
  const [note, setNote] = useState("");
  const [active, setActive] = useState(true);
  const [joinedAt, setJoinedAt] = useState("");

  useEffect(() => {
    if (!open) return;
    setSource((initial?.source as "warga" | "eksternal") || "warga");
    setResidentId(initial?.resident_id || "");
    setFullName(initial?.full_name || "");
    setPhone(initial?.phone || "");
    setPosition((initial?.position as StaffPosition) || "keamanan");
    setNote(initial?.note || "");
    setActive(initial?.active ?? true);
    setJoinedAt(initial?.joined_at?.slice(0, 10) || "");
  }, [open, initial]);

  const onPickResident = (id: string) => {
    setResidentId(id);
    const r = residents.find((x) => x.id === id);
    if (r) {
      setFullName(r.full_name);
      if (r.phone) setPhone(r.phone);
    }
  };

  const canSave =
    !!fullName.trim() && (source === "eksternal" || (source === "warga" && residentId));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Petugas" : "Tambah Petugas"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label>Sumber Petugas</Label>
            <Select
              value={source}
              onValueChange={(v) => {
                const s = v as "warga" | "eksternal";
                setSource(s);
                if (s === "eksternal") {
                  setResidentId("");
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="warga">Warga</SelectItem>
                <SelectItem value="eksternal">Eksternal (yayasan / paruh waktu)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {source === "warga" && (
            <div className="space-y-1">
              <Label>Pilih Warga</Label>
              <Select value={residentId} onValueChange={onPickResident}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih warga…" />
                </SelectTrigger>
                <SelectContent>
                  {residents.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1">
            <Label>Nama lengkap</Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={source === "warga" && !!residentId}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Posisi</Label>
              <Select
                value={position}
                onValueChange={(v) => setPosition(v as StaffPosition)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAFF_POSITIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Telepon</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Mulai bertugas</Label>
              <Input
                type="date"
                value={joinedAt}
                onChange={(e) => setJoinedAt(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <div className="flex items-center gap-2 h-9">
                <Switch checked={active} onCheckedChange={setActive} />
                <span className="text-sm text-muted-foreground">
                  {active ? "Aktif" : "Nonaktif"}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Catatan</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Mis. asal yayasan, jadwal kerja, dll."
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            disabled={saving || !canSave}
            onClick={() =>
              onSave({
                id: initial?.id,
                residentId: source === "warga" ? residentId : null,
                fullName: fullName.trim(),
                phone: phone.trim() || null,
                position,
                source,
                note: note.trim() || null,
                active,
                joinedAt: joinedAt || null,
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
