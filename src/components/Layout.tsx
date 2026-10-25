import { Suspense } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth, useProfile } from "../context/AuthContext";
import { DirectoryProvider } from "../context/DirectoryContext";
import { ROLE_LABELS } from "../lib/labels";
import type { Role } from "../types";
import ClockStatus from "./ClockStatus";
import { PageLoader } from "./ui";

const NAV_ITEMS: { to: string; label: string; roles: Role[]; end?: boolean }[] = [
  { to: "/", label: "Dashboard", roles: ["admin", "tech", "client"], end: true },
  { to: "/clock", label: "Time Clock", roles: ["admin", "tech"] },
  { to: "/timesheets", label: "Timesheets", roles: ["admin", "tech", "client"] },
  { to: "/tasks", label: "Tasks", roles: ["admin", "tech", "client"] },
  { to: "/helpdesk", label: "Help Desk", roles: ["admin", "tech", "client"] },
  { to: "/clients", label: "Clients", roles: ["admin", "tech"] },
  { to: "/billing", label: "Billing", roles: ["admin"] },
  { to: "/invoices", label: "Invoices", roles: ["client"] },
  { to: "/team", label: "Team", roles: ["admin"] },
];

export default function Layout() {
  const { logout } = useAuth();
  const profile = useProfile();
  const items = NAV_ITEMS.filter((item) => item.roles.includes(profile.role));

  const link = (mobile: boolean) =>
    ({ isActive }: { isActive: boolean }) =>
      `${mobile ? "whitespace-nowrap " : ""}rounded-md px-3 py-1.5 text-sm font-medium ${
        isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"
      }`;

  return (
    <DirectoryProvider>
      <div className="min-h-screen bg-slate-50">
        <header className="no-print sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
            <div className="flex items-center gap-6">
              <span className="flex items-center gap-2 text-lg font-semibold text-brand-700">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">T</span>
                Tauri
              </span>
              <nav className="hidden gap-1 lg:flex">
                {items.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.end} className={link(false)}>
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </div>
            <div className="flex items-center gap-3">
              {profile.role !== "client" && <ClockStatus />}
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium text-slate-700">{profile.full_name}</p>
                <p className="text-xs text-slate-400">{ROLE_LABELS[profile.role]}</p>
              </div>
              <button onClick={logout} className="text-sm font-medium text-slate-500 hover:text-slate-800">
                Sign out
              </button>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-4 py-2 lg:hidden">
            {items.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={link(true)}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </DirectoryProvider>
  );
}
