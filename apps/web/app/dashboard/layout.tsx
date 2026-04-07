"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useState, useEffect } from "react";
import {
  LayoutDashboard, TrendingUp, Package, AlertCircle,
  ClipboardList, Upload, Menu, ChevronRight, LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAlerts } from "@/hooks/useApi";

const NAV = [
  { href: "/dashboard",        label: "Дашборд",   icon: LayoutDashboard, section: "overview" },
  { href: "/dashboard/sales",  label: "Продажи",   icon: TrendingUp,       section: "overview" },
  { href: "/dashboard/debts",  label: "Дебиторка", icon: AlertCircle,      section: "overview" },
  { href: "/dashboard/tmz",    label: "ТМЗ",       icon: Package,          section: "overview" },
  { href: "/dashboard/orders", label: "Заявки",    icon: ClipboardList,    section: "ops" },
  { href: "/dashboard/upload", label: "Загрузка",  icon: Upload,           section: "ops" },
];

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { data: alerts } = useAlerts();
  const criticalCount = alerts?.filter((a) => a.level === "critical").length ?? 0;

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          "fixed top-0 left-0 z-30 h-full w-56 bg-gray-950 flex flex-col transition-transform duration-200",
          "lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="px-5 py-5 border-b border-white/8">
          <div className="text-sm font-black tracking-widest text-white">SAUDA</div>
          <div className="text-[10px] font-mono text-white/30 mt-0.5">ANALYTICS · MVP</div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          <div className="mb-1">
            <div className="px-2 mb-2 text-[9px] font-mono font-semibold text-white/25 uppercase tracking-widest">
              Обзор
            </div>
            {NAV.filter((n) => n.section === "overview").map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              const badge =
                item.href === "/dashboard/debts" && criticalCount > 0
                  ? criticalCount
                  : null;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium mb-0.5 transition-colors",
                    active
                      ? "bg-white/12 text-white"
                      : "text-white/50 hover:text-white/80 hover:bg-white/6"
                  )}
                >
                  <Icon size={15} className="flex-shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {badge && (
                    <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                      {badge}
                    </span>
                  )}
                  {active && <ChevronRight size={12} className="text-white/40" />}
                </Link>
              );
            })}
          </div>

          <div className="mt-4">
            <div className="px-2 mb-2 text-[9px] font-mono font-semibold text-white/25 uppercase tracking-widest">
              Операции
            </div>
            {NAV.filter((n) => n.section === "ops").map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium mb-0.5 transition-colors",
                    active
                      ? "bg-white/12 text-white"
                      : "text-white/50 hover:text-white/80 hover:bg-white/6"
                  )}
                >
                  <Icon size={15} className="flex-shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {active && <ChevronRight size={12} className="text-white/40" />}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Footer */}
        <div className="px-3 py-4 border-t border-white/8">
          <div className="px-3 py-1.5 text-xs text-white/30 font-mono truncate">
            {session?.user?.email ?? ""}
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-2.5 px-3 py-2 w-full rounded-lg text-sm text-white/40 hover:text-white/70 hover:bg-white/6 transition-colors"
          >
            <LogOut size={14} />
            Выйти
          </button>
        </div>
      </aside>
    </>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-400">Загрузка...</div>
      </div>
    );
  }

  if (status === "unauthenticated") return null;

  const pageTitle = {
    "/dashboard": "Дашборд",
    "/dashboard/sales": "Продажи",
    "/dashboard/stock": "Остатки",
    "/dashboard/debts": "Дебиторка",
    "/dashboard/orders": "Заявки",
    "/dashboard/orders/new": "Новая заявка",
    "/dashboard/upload": "Загрузка данных",
  }[pathname] ?? "Dashboard";

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center gap-4 px-6 flex-shrink-0">
          <button
            className="lg:hidden text-gray-500 hover:text-gray-700"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={20} />
          </button>
          <h1 className="text-base font-bold text-gray-900">{pageTitle}</h1>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden sm:block text-xs font-mono text-gray-400 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded">
              {new Date().toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })}
            </span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          {children}
        </main>
      </div>
    </div>
  );
}
