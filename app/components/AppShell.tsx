"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PropsWithChildren, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Bed,
  ChevronDown,
  ChevronRight,
  ClipboardPlus,
  ClipboardSignature,
  Gauge,
  LogOut,
  Menu,
  ScrollText,
  UserPlus,
  UserMinus,
  X,
  TriangleAlert,
  UserRound,
  Users,
  Waves,
  ShieldCheck,
  FileSpreadsheet,
} from "lucide-react";
import { AuthSessionProvider } from "@/app/context/AuthSessionContext";
import { useAuthSession } from "@/app/context/AuthSessionContext";
import { getWardsWithPatients } from "@/app/actions/wardActions";
import { Ward } from "@/app/types";
import { ROLE_LABELS, canRegisterPatient, canAssignOrDischargePatient } from "@/lib/rbac";
import { UserSession } from "@/app/types";
import NotificationPanel from "./NotificationPanel";
import ChatWidget from "./ChatWidget";

interface SidebarItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
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

function RegisterPatientDropdown({
  registerableWards,
  onNavigate,
}: {
  registerableWards: Ward[];
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (registerableWards.length === 0) {
    return (
      <div className="flex w-full items-center justify-between rounded-xl bg-teal-950/40 px-3.5 py-2.5 text-sm font-semibold text-teal-300/40 border border-teal-800/30 cursor-not-allowed select-none">
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4" />
          <span>Register Patient</span>
        </div>
        <span className="text-[11px] font-normal text-teal-400/40">No Access</span>
      </div>
    );
  }

  const handleSelectWard = (wardId: string) => {
    setIsOpen(false);
    onNavigate?.();
    router.push(`/wards/${wardId}/register`);
  };

  // If only 1 ward is registerable, direct button click without dropdown
  if (registerableWards.length === 1) {
    const singleWard = registerableWards[0];
    const wId = singleWard.wardId || singleWard.id;
    return (
      <button
        type="button"
        onClick={() => handleSelectWard(wId)}
        className="flex w-full items-center justify-between rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 px-3.5 py-2.5 text-sm font-bold text-slate-950 transition-all shadow-md active:scale-[0.98]"
      >
        <div className="flex items-center gap-2 min-w-0">
          <UserPlus className="h-4 w-4 shrink-0" />
          <span className="truncate">Register Patient</span>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0" />
      </button>
    );
  }

  return (
    <div className="relative w-full" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 px-3.5 py-2.5 text-sm font-bold text-slate-950 transition-all shadow-md active:scale-[0.98]"
      >
        <div className="flex items-center gap-2 min-w-0">
          <UserPlus className="h-4 w-4 shrink-0" />
          <span className="truncate">Register Patient</span>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-2xl border border-teal-500/25 bg-[#0a272f] p-2 shadow-2xl backdrop-blur-md animate-in fade-in-50 zoom-in-95">
          <p className="px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-teal-300/70 border-b border-white/10 mb-1">
            Select Ward for Registration
          </p>

          <div className="space-y-1 max-h-56 overflow-y-auto custom-scrollbar">
            {registerableWards.map((w) => {
              const wId = w.wardId || w.id;
              return (
                <button
                  key={wId}
                  type="button"
                  onClick={() => handleSelectWard(wId)}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-100 hover:bg-teal-500/20 hover:text-teal-200 transition-all group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Bed className="h-3.5 w-3.5 text-teal-400 shrink-0 group-hover:scale-110 transition-transform" />
                    <span className="truncate">{w.name}</span>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0" />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function DischargePatientDropdown({
  dischargeableWards,
  onNavigate,
}: {
  dischargeableWards: Ward[];
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (dischargeableWards.length === 0) {
    return (
      <div className="flex w-full items-center justify-between rounded-xl bg-teal-950/40 px-3.5 py-2.5 text-sm font-semibold text-teal-300/40 border border-teal-800/30 cursor-not-allowed select-none">
        <div className="flex items-center gap-2">
          <UserMinus className="h-4 w-4" />
          <span>Discharge Patient</span>
        </div>
        <span className="text-[11px] font-normal text-teal-400/40">No Access</span>
      </div>
    );
  }

  const handleSelectWard = (wardId: string) => {
    setIsOpen(false);
    onNavigate?.();
    router.push(`/wards/${wardId}/patients`);
  };

  // If only 1 ward is dischargeable, direct button click without dropdown
  if (dischargeableWards.length === 1) {
    const singleWard = dischargeableWards[0];
    const wId = singleWard.wardId || singleWard.id;
    return (
      <button
        type="button"
        onClick={() => handleSelectWard(wId)}
        className="flex w-full items-center justify-between rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 px-3.5 py-2.5 text-sm font-bold text-white transition-all shadow-md active:scale-[0.98]"
      >
        <div className="flex items-center gap-2 min-w-0">
          <UserMinus className="h-4 w-4 shrink-0" />
          <span className="truncate">Discharge Patient</span>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0" />
      </button>
    );
  }

  return (
    <div className="relative w-full" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 px-3.5 py-2.5 text-sm font-bold text-white transition-all shadow-md active:scale-[0.98]"
      >
        <div className="flex items-center gap-2 min-w-0">
          <UserMinus className="h-4 w-4 shrink-0" />
          <span className="truncate">Discharge Patient</span>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-2xl border border-rose-500/25 bg-[#0a272f] p-2 shadow-2xl backdrop-blur-md animate-in fade-in-50 zoom-in-95">
          <p className="px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-rose-300/70 border-b border-white/10 mb-1">
            Select Ward for Discharge
          </p>

          <div className="space-y-1 max-h-56 overflow-y-auto custom-scrollbar">
            {dischargeableWards.map((w) => {
              const wId = w.wardId || w.id;
              return (
                <button
                  key={wId}
                  type="button"
                  onClick={() => handleSelectWard(wId)}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-100 hover:bg-rose-500/20 hover:text-rose-200 transition-all group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Bed className="h-3.5 w-3.5 text-rose-400 shrink-0 group-hover:scale-110 transition-transform" />
                    <span className="truncate">{w.name}</span>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0" />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}


function AppShellContent({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const { session, setSession, logout } = useAuthSession();
  const [wards, setWards] = useState<Ward[]>([]);
  const [shiftCountdown, setShiftCountdown] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Keep the first server/client render identical, then switch to the auth-page branch after mount.
  const isAuthPage =
    isMounted && (pathname === "/login" || pathname === "/change-password");

  useEffect(() => {
    if (!isMounted || isAuthPage) return;
    const loadSidebarData = async () => {
      const wardsData = await getWardsWithPatients();
      setWards(wardsData || []);
    };

    void loadSidebarData();
  }, [isAuthPage, isMounted]);

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
    const assignedIds = session.wardIds && session.wardIds.length > 0 
      ? session.wardIds 
      : [activeWardId];
    return wards.filter((ward) => {
      const id = ward.wardId || ward.id;
      return assignedIds.includes(id);
    });
  }, [activeWardId, session.role, session.wardIds, wards]);

  const registerableWards = useMemo(() => {
    return wards.filter((ward) => {
      const wId = ward.wardId || ward.id;
      return canRegisterPatient(session, wId);
    });
  }, [wards, session]);

  const dischargeableWards = useMemo(() => {
    return wards.filter((ward) => {
      const wId = ward.wardId || ward.id;
      return canAssignOrDischargePatient(session, wId);
    });
  }, [wards, session]);

  const availableBeds = scopedWards.reduce(
    (sum, ward) => sum + ward.availableBeds,
    0
  );
  const queueLength = scopedWards.reduce(
    (sum, ward) => sum + ward.patientQueue.length,
    0
  );

  const navItems: SidebarItem[] = [
    { label: "Dashboard", href: "/", icon: Gauge },
    {
      label: "Wards",
      href: activeWardId ? `/wards/${activeWardId}` : "/",
      icon: Bed,
    },
    { label: "Reports", href: "/reports", icon: ClipboardSignature },
    { label: "User Management", href: "/admin/users", icon: Users, adminOnly: true },
    { label: "Role Management", href: "/admin/roles", icon: ShieldCheck, adminOnly: true },
    { label: "Ward Management", href: "/admin/wards", icon: Bed, adminOnly: true },
    { label: "User Logs", href: "/admin/logs", icon: ScrollText, adminOnly: true },
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

  const handleSignOut = async () => {
    setMobileMenuOpen(false);
    await logout();
  };

  if (!isMounted) {
    return <>{children}</>;
  }

  const renderNavLinks = (compact = false, onNavigate?: () => void) =>
    navItems.map((item) => {
      const Icon = item.icon;
      const active = isActive(item.href);
      const disabled = item.adminOnly && session.role !== "admin";

      if (disabled) {
        return (
          <span
            key={item.label}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium cursor-not-allowed opacity-40 select-none ${
              compact ? "min-w-fit whitespace-nowrap" : ""
            } text-slate-400`}
          >
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
          </span>
        );
      }

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

  // Auth pages render without the shell chrome
  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-100 via-teal-50 to-cyan-100 print:min-h-0 print:bg-white">
      <div className="mx-auto flex max-w-412.5 flex-col gap-4 p-4 lg:flex-row lg:gap-6 lg:p-6 print:block print:max-w-none print:gap-0 print:p-0">
        <header className="sticky top-0 z-20 -mx-4 -mt-4 border-b border-teal-900/10 bg-[#0b2b33]/96 px-4 py-3 text-slate-100 shadow-[0_20px_45px_rgba(3,17,26,0.18)] backdrop-blur print:hidden lg:hidden">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-bold tracking-tight text-white">
                Karapitiya Teaching Hospital
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="truncate text-[11px] font-medium uppercase tracking-[0.18em] text-teal-100/85">
                  {session.displayName || "Dr. Anusha Perera"}{" "}
                  {ROLE_LABELS[session.role]}
                </p>
                <NotificationPanel session={session} />
              </div>
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
                <RegisterPatientDropdown
                  registerableWards={registerableWards}
                  onNavigate={() => setMobileMenuOpen(false)}
                />
                <DischargePatientDropdown
                  dischargeableWards={dischargeableWards}
                  onNavigate={() => setMobileMenuOpen(false)}
                />
                <Link
                  href={activeWardId ? `/wards/${activeWardId}/beds` : "/"}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex w-full items-center justify-between rounded-xl bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 shadow-sm active:scale-[0.98]"
                >
                  <span>🛏️ Assign Bed</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              <nav className="mt-3 grid gap-2">
                {renderNavLinks(false, () => setMobileMenuOpen(false))}
              </nav>

              <div className="mt-3 flex items-center justify-end gap-3 border-t border-white/10 pt-3">
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

        <aside className="sidebar-scroll hidden w-full max-w-[300px] rounded-3xl border border-teal-800/10 bg-[#0b2b33] p-5 text-slate-100 shadow-[0_20px_45px_rgba(3,17,26,0.25)] print:hidden lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:w-85 lg:overflow-y-auto lg:block xl:max-w-full">
          <div className="border-b border-white/15 pb-4">
            <h1 className="text-xl font-bold tracking-tight text-white">
              Karapitiya National Hospital
            </h1>
            <p className="mt-1 text-xs font-medium uppercase tracking-[0.2em] text-teal-100/90">
              Bed &amp; Queue Management
            </p>
          </div>

          <div className="mt-4 rounded-2xl bg-white/8 px-3 py-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <UserRound className="h-4 w-4 text-teal-200 shrink-0" />
                <p className="text-sm font-semibold text-white truncate">
                  {session.displayName || "Dr. Anusha Perera"}
                </p>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs flex-wrap">
                <span className="rounded-full bg-teal-500/25 px-2 py-1 font-semibold text-teal-100">
                  {ROLE_LABELS[session.role]}
                </span>
                <span className="text-teal-100/85 truncate">
                  {shiftCountdown || "Shift details"}
                </span>
              </div>
            </div>
            <NotificationPanel session={session} />
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
            <RegisterPatientDropdown
              registerableWards={registerableWards}
            />
            <DischargePatientDropdown
              dischargeableWards={dischargeableWards}
            />
            <Link
              href={activeWardId ? `/wards/${activeWardId}/beds` : "/"}
              className="flex w-full items-center justify-between rounded-xl bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 shadow-sm active:scale-[0.98]"
            >
              <span>🛏️ Assign Bed</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <nav className="mt-5 space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              const disabled = item.adminOnly && session.role !== "admin";

              if (disabled) {
                return (
                  <span
                    key={item.label}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium cursor-not-allowed opacity-40 select-none text-slate-400"
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </span>
                );
              }

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



          <div className="mt-5 border-t border-white/15 pt-4">
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

        <main className="min-w-0 flex-1 print:block">
          {children}
        </main>
      </div>

      {/* Floating chat widget — always visible on authenticated pages */}
      <ChatWidget session={session} />
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
