"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PropsWithChildren, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  Bed,
  ClipboardPlus,
  ClipboardSignature,
  Gauge,
  LogOut,
  Menu,
  X,
  TriangleAlert,
  UserRound,
  Users,
  Waves,
} from "lucide-react";
import { AuthSessionProvider } from "@/app/context/AuthSessionContext";
import { useAuthSession } from "@/app/context/AuthSessionContext";
import RoleSwitcher from "@/app/components/RoleSwitcher";
import { getWardsWithPatients } from "@/app/actions/wardActions";
import { Ward } from "@/app/types";
import { ROLE_LABELS } from "@/lib/rbac";
import { UserSession } from "@/app/types";

interface SidebarItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

function formatShiftCountdown(date = new Date()): string {
  const hour = date.getHours();
  let shiftLabel = "Morning";
  const shiftEnd = new Date(date);

  if (hour >= 6 && hour < 14) {
    shiftLabel = "Morning";
    shiftEnd.setHours(14, 0, 0, 0);
  } else if (hour >= 14 && hour < 22) {
    shiftLabel = "Evening";
    shiftEnd.setHours(22, 0, 0, 0);
  } else {
    shiftLabel = "Night";
    if (hour >= 22) {
      shiftEnd.setDate(shiftEnd.getDate() + 1);
    }
    shiftEnd.setHours(6, 0, 0, 0);
  }

  const diffMs = Math.max(0, shiftEnd.getTime() - date.getTime());
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${shiftLabel} · Ends in ${hours}h ${minutes}m`;
}

function AppShellContent({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const { session, setSession } = useAuthSession();
  const [wards, setWards] = useState<Ward[]>([]);
  const [shiftCountdown, setShiftCountdown] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const loadSidebarData = async () => {
      const wardsData = await getWardsWithPatients();
      setWards(wardsData || []);
    };

    void loadSidebarData();
  }, []);

  useEffect(() => {
    const updateShiftCountdown = () => {
      setShiftCountdown(formatShiftCountdown());
    };

    updateShiftCountdown();
    const timer = window.setInterval(updateShiftCountdown, 60000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const activeWardId = session.wardId || wards[0]?.wardId || wards[0]?.id;
  const scopedWards = useMemo(() => {
    if (session.role === "admin") {
      return wards;
    }
    return wards.filter((ward) => (ward.wardId || ward.id) === activeWardId);
  }, [activeWardId, session.role, wards]);

  const availableBeds = scopedWards.reduce(
    (sum, ward) => sum + ward.availableBeds,
    0
  );
  const queueLength = scopedWards.reduce(
    (sum, ward) => sum + ward.patientQueue.length,
    0
  );

  const alerts = useMemo(() => {
    const critical: string[] = [];

    for (const ward of scopedWards) {
      if (ward.availableBeds === 0 && ward.patientQueue.length > 0) {
        critical.push(
          `⚠️ ${ward.name} full - ${ward.patientQueue.length} waiting`
        );
      }
      if (ward.patientQueue.length > 10) {
        critical.push(`⚠️ ${ward.name} queue > 10`);
      }
      if (critical.length >= 2) {
        break;
      }
    }

    return critical.slice(0, 2);
  }, [scopedWards]);

  const navItems: SidebarItem[] = [
    { label: "Dashboard", href: "/", icon: Gauge },
    {
      label: "Wards",
      href: activeWardId ? `/wards/${activeWardId}` : "/",
      icon: Bed,
    },
    {
      label: "Discharges",
      href: activeWardId ? `/wards/${activeWardId}/patients` : "/",
      icon: Activity,
    },
    { label: "Reports", href: "/reports", icon: ClipboardSignature },
  ];

  const isActive = (href: string) => {
    if (href === "/") {
      return pathname === "/";
    }

    if (href.includes("/patients")) {
      return pathname === href;
    }

    if (href.includes("/wards/")) {
      return (
        (pathname === href || pathname.startsWith(`${href}/`)) &&
        !pathname.endsWith("/patients")
      );
    }

    return pathname.startsWith(href);
  };

  const handleSignOut = () => {
    setSession({ role: "admin", displayName: "System Admin" });
    setMobileMenuOpen(false);
  };

  const quickLinks = [
    {
      label: "Register a patient",
      href: activeWardId ? `/wards/${activeWardId}/register` : "/",
      className:
        "bg-teal-500 text-teal-950 hover:bg-teal-400 border-teal-300/20",
    },
    {
      label: "Discharge patient",
      href: activeWardId ? `/wards/${activeWardId}/patients` : "/",
      className:
        "bg-cyan-400 text-slate-900 hover:bg-cyan-300 border-cyan-200/20",
    },
    {
      label: "Assign Bed",
      href: activeWardId ? `/wards/${activeWardId}/beds` : "/",
      className: "bg-white text-slate-900 hover:bg-slate-100 border-white/40",
    },
  ];

  const renderNavLinks = (compact = false, onNavigate?: () => void) =>
    navItems.map((item) => {
      const Icon = item.icon;
      const active = isActive(item.href);

      return (
        <Link
          key={item.label}
          href={item.href}
          onClick={onNavigate}
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
            compact ? "min-w-fit whitespace-nowrap" : ""
          } ${
            active
              ? "bg-teal-400/20 text-white ring-1 ring-teal-200/30"
              : "text-slate-200 hover:bg-white/10 hover:text-white"
          }`}
        >
          <Icon className="h-4 w-4" />
          <span>{item.label}</span>
        </Link>
      );
    });

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-100 via-teal-50 to-cyan-100">
      <div className="mx-auto flex max-w-412.5 flex-col gap-4 p-4 lg:flex-row lg:gap-6 lg:p-6">
        <header className="sticky top-0 z-20 -mx-4 -mt-4 border-b border-teal-900/10 bg-[#0b2b33]/96 px-4 py-3 text-slate-100 shadow-[0_20px_45px_rgba(3,17,26,0.18)] backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold tracking-tight text-white">
                Karapitiya Teaching Hospital
              </h1>
              <p className="truncate text-[11px] font-medium uppercase tracking-[0.18em] text-teal-100/85">
                {session.displayName || "Dr. Anusha Perera"}{" "}
                {ROLE_LABELS[session.role]}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-[12px] sm:text-xs font-semibold text-teal-100">
                {shiftCountdown || "Shift details"}
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen((open) => !open)}
                aria-expanded={mobileMenuOpen}
                aria-label="Toggle menu"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition hover:bg-white/10"
              >
                {mobileMenuOpen ? (
                  <X className="h-5 w-5" />
                ) : (
                  <Menu className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>

          {mobileMenuOpen && (
            <div className="mt-3 rounded-2xl border border-white/10 bg-[#0b2b33] p-4 shadow-[0_16px_35px_rgba(3,17,26,0.22)]">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl border border-white/10 bg-linear-to-b from-teal-900/70 to-teal-950/60 p-3">
                  <p className="text-lg font-bold text-emerald-200">
                    {availableBeds}
                  </p>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-teal-100/80">
                    Available
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-linear-to-b from-cyan-900/70 to-cyan-950/60 p-3">
                  <p className="text-lg font-bold text-cyan-200">
                    {queueLength}
                  </p>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-100/80">
                    In Queue
                  </p>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {quickLinks.map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${item.className}`}
                  >
                    <span>{item.label}</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                ))}
              </div>

              <nav className="mt-3 grid gap-2">
                {renderNavLinks(false, () => setMobileMenuOpen(false))}
              </nav>

              {alerts.length > 0 && (
                <div className="mt-3 rounded-2xl border border-orange-300/30 bg-orange-500/10 p-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-orange-200">
                    Urgent Alerts
                  </p>
                  <div className="space-y-1.5">
                    {alerts.map((alert) => (
                      <p
                        key={alert}
                        className="flex items-start gap-2 text-xs font-medium text-orange-100"
                      >
                        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-orange-300" />
                        {alert}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-white/20 px-2 py-1 text-xs font-semibold text-white hover:bg-white/10"
                  >
                    EN
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-white/20 px-2 py-1 text-xs font-semibold text-white hover:bg-white/10"
                  >
                    සිං
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-white/20 px-2 py-1 text-xs font-semibold text-white hover:bg-white/10"
                  >
                    த
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-slate-200 hover:text-white"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </header>

        <aside className="hidden w-full max-w-[300px] rounded-3xl border border-teal-800/10 bg-[#0b2b33] p-5 text-slate-100 shadow-[0_20px_45px_rgba(3,17,26,0.25)] lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:w-85 lg:overflow-y-auto lg:block xl:max-w-full">
          <div className="border-b border-white/15 pb-4">
            <h1 className="text-xl font-bold tracking-tight text-white">
              Karapitiya National Hospital
            </h1>
            <p className="mt-1 text-xs font-medium uppercase tracking-[0.2em] text-teal-100/90">
              Bed &amp; Queue Management
            </p>
          </div>

          <div className="mt-4 rounded-2xl bg-white/8 px-3 py-3">
            <div className="flex items-center gap-2">
              <UserRound className="h-4 w-4 text-teal-200" />
              <p className="text-sm font-semibold text-white">
                {session.displayName || "Dr. Anusha Perera"}
              </p>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="rounded-full bg-teal-500/25 px-2 py-1 font-semibold text-teal-100">
                {ROLE_LABELS[session.role]}
              </span>
              <span className="text-teal-100/85">
                {shiftCountdown || "Shift details"}
              </span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-linear-to-b from-teal-900/70 to-teal-950/60 p-3">
              <p className="text-2xl font-bold text-emerald-200">
                {availableBeds}
              </p>
              <p className="text-[11px] uppercase tracking-[0.18em] text-teal-100/80">
                Available
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-linear-to-b from-cyan-900/70 to-cyan-950/60 p-3">
              <p className="text-2xl font-bold text-cyan-200">{queueLength}</p>
              <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-100/80">
                In Queue
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-2">
            <Link
              href={activeWardId ? `/wards/${activeWardId}/register` : "/"}
              className="flex w-full items-center justify-between rounded-xl bg-teal-500 px-3 py-2.5 text-sm font-semibold text-teal-950 transition hover:bg-teal-400"
            >
              <span>➕Register a patients</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href={activeWardId ? `/wards/${activeWardId}/patients` : "/"}
              className="flex w-full items-center justify-between rounded-xl bg-cyan-400 px-3 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-cyan-300"
            >
              <span>Discharge patient</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href={activeWardId ? `/wards/${activeWardId}/beds` : "/"}
              className="flex w-full items-center justify-between rounded-xl bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
            >
              <span>🛏️ Assign Bed</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <nav className="mt-5 space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    active
                      ? "bg-teal-400/20 text-white ring-1 ring-teal-200/30"
                      : "text-slate-200 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {alerts.length > 0 && (
            <div className="mt-5 rounded-2xl border border-orange-300/30 bg-orange-500/10 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-orange-200">
                Urgent Alerts
              </p>
              <div className="space-y-1.5">
                {alerts.map((alert) => (
                  <p
                    key={alert}
                    className="flex items-start gap-2 text-sm font-medium text-orange-100"
                  >
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-orange-300" />
                    {alert}
                  </p>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5 border-t border-white/15 pt-4">
            <div className="mb-3 flex items-center gap-2">
              <button
                type="button"
                className="rounded-md border border-white/20 px-2 py-1 text-xs font-semibold text-white hover:bg-white/10"
              >
                EN
              </button>
              <button
                type="button"
                className="rounded-md border border-white/20 px-2 py-1 text-xs font-semibold text-white hover:bg-white/10"
              >
                සිං
              </button>
              <button
                type="button"
                className="rounded-md border border-white/20 px-2 py-1 text-xs font-semibold text-white hover:bg-white/10"
              >
                த
              </button>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-2 text-sm font-semibold text-slate-200 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-4 rounded-2xl border border-teal-200 bg-white/90 p-3 shadow-sm">
            <RoleSwitcher />
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}

export default function AppShell({
  children,
  initialSession,
}: PropsWithChildren & { initialSession?: UserSession }) {
  return (
    <AuthSessionProvider initialSession={initialSession}>
      <AppShellContent>{children}</AppShellContent>
    </AuthSessionProvider>
  );
}
