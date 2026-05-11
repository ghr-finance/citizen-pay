import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listUsers, createUser, deleteUser, me } from "@/lib/auth.functions";
import { Card, CardContent } from "@/components/ui/card";
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
import { Plus, Trash2 } from "lucide-react";
import { formatTanggal } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/pengguna")({
  beforeLoad: async () => {
    const { user } = await me();
    if (!user || user.role !== "admin") throw redirect({ to: "/" });
  },
  component: PenggunaPage,
});

function PenggunaPage() {
  const fetchList = useServerFn(listUsers);
  const createFn = useServerFn(createUser);
  const deleteFn = useServerFn(deleteUser);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => fetchList(),
  });
  const [open, setOpen] = useState(false);
  const create = useMutation({
    mutationFn: (v: { email: string; password: string; fullName: string; role: "admin" | "bendahara" }) => createFn({ data: v }),
    onSuccess: () => { toast.success("Pengguna dibuat"); qc.invalidateQueries({ queryKey: ["users"] }); setOpen(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { toast.success("Dihapus"); qc.invalidateQueries({ queryKey: ["users"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Gagal"),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Pengguna</h1>
          <p className="text-muted-foreground">Kelola admin dan bendahara</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="size-4 mr-2" /> Tambah</Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 pr-4 font-medium">Nama</th>
                  <th className="py-2 pr-4 font-medium">Email</th>
                  <th className="py-2 pr-4 font-medium">Role</th>
                  <th className="py-2 pr-4 font-medium">Dibuat</th>
                  <th className="py-2 pr-4 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">Memuat…</td></tr>}
                {(data?.users ?? []).map((u) => (
                  <tr key={u.id} className="border-b border-border/60">
                    <td className="py-2 pr-4 font-medium">{u.full_name}</td>
                    <td className="py-2 pr-4">{u.email}</td>
                    <td className="py-2 pr-4">
                      <Badge variant={u.role === "admin" ? "default" : "secondary"}>{u.role}</Badge>
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">{formatTanggal(u.created_at)}</td>
                    <td className="py-2 pr-4 text-right">
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => { if (confirm(`Hapus ${u.email}?`)) remove.mutate(u.id); }}
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

      <CreateUserDialog open={open} onOpenChange={setOpen} onCreate={(v) => create.mutate(v)} saving={create.isPending} />
    </div>
  );
}

function CreateUserDialog({
  open, onOpenChange, onCreate, saving,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  onCreate: (v: { email: string; password: string; fullName: string; role: "admin" | "bendahara" }) => void;
  saving: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"admin" | "bendahara">("bendahara");

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (o) { setEmail(""); setPassword(""); setFullName(""); setRole("bendahara"); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tambah Pengguna</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label>Nama lengkap</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Kata sandi (min 6)</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="bendahara">Bendahara</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button
            disabled={saving || !email || password.length < 6 || !fullName}
            onClick={() => onCreate({ email, password, fullName, role })}
          >
            {saving ? "Menyimpan…" : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
