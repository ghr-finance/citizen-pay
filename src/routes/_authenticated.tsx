import {
  createFileRoute,
  redirect,
  Outlet,
  Link,
  useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { me, logout } from "@/lib/auth.functions";
import {
  LayoutDashboard,
  Users,
  Receipt,
  FileText,
  Wallet,
  ClipboardList,
  UserCog,
  LogOut,
  ArrowLeftRight,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    const { user } = await me();
    if (!user) throw redirect({ to: "/login" });
    return { user };
  },
  component: AuthLayout,
});

const NAV: Array<{ to: string; label: string; icon: typeof LayoutDashboard; end?: boolean }> = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/warga", label: "Warga", icon: Users },
  { to: "/iuran", label: "Jenis Iuran", icon: ClipboardList },
  { to: "/tagihan", label: "Tagihan", icon: Receipt },
  { to: "/pembayaran", label: "Pembayaran", icon: Wallet },
  { to: "/transaksi", label: "Transaksi", icon: ArrowLeftRight },
  { to: "/petugas", label: "Petugas", icon: ShieldCheck },
  { to: "/laporan", label: "Laporan", icon: FileText },
];

function AuthLayout() {
  const { user } = Route.useRouteContext();
  const router = useRouter();
  const logoutFn = useServerFn(logout);

  const onLogout = async () => {
    await logoutFn({});
    await router.invalidate();
    router.navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="hidden md:flex md:w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <div className="px-6 py-6 flex items-center gap-3">
          <div className="size-10 rounded-xl bg-sidebar-primary text-sidebar-primary-foreground grid place-items-center">
            <Wallet className="size-5" />
          </div>
          <div>
            <div className="font-display font-bold leading-tight">GHR</div>
            <div className="text-xs text-sidebar-foreground/70">Payment System</div>
          </div>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: !!item.end }}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/85 hover:bg-sidebar-accent transition"
              activeProps={{
                className:
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm bg-sidebar-accent text-sidebar-foreground font-medium",
              }}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
          {user?.role === "admin" && (
            <Link
              to="/pengguna"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/85 hover:bg-sidebar-accent transition"
              activeProps={{
                className:
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm bg-sidebar-accent text-sidebar-foreground font-medium",
              }}
            >
              <UserCog className="size-4" />
              Pengguna
            </Link>
          )}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <div className="px-3 py-2 mb-2">
            <div className="text-sm font-medium">{user?.fullName}</div>
            <div className="text-xs text-sidebar-foreground/70 capitalize">{user?.role}</div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            onClick={onLogout}
          >
            <LogOut className="size-4 mr-2" /> Keluar
          </Button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <header className="md:hidden flex items-center justify-between border-b border-border bg-card px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-primary text-primary-foreground grid place-items-center">
              <Wallet className="size-4" />
            </div>
            <span className="font-display font-bold">GHR Payment</span>
          </div>
          <Button variant="ghost" size="sm" onClick={onLogout}>
            <LogOut className="size-4" />
          </Button>
        </header>
        <nav className="md:hidden flex overflow-x-auto border-b border-border bg-card px-2 py-1 gap-1">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: !!item.end }}
              className="px-3 py-1.5 rounded-md text-xs whitespace-nowrap text-muted-foreground"
              activeProps={{
                className:
                  "px-3 py-1.5 rounded-md text-xs whitespace-nowrap bg-primary text-primary-foreground font-medium",
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-6 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
