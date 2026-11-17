import { Suspense } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useProfile } from "../context/AuthContext";
import { DirectoryProvider } from "../context/DirectoryContext";
import type { Role } from "../types";
import ClockStatus from "./ClockStatus";
import ProfileMenu from "./ProfileMenu";
import VerifyEmailBanner from "./VerifyEmailBanner";
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
              <Link to="/" className="flex shrink-0 items-center gap-2.5">
                {/* Phones show just the icon, so the header still fits next to the clock button. */}
                <img src="/voltauri-mark.png" alt="Voltauri" className="h-7 w-7 sm:hidden" />
                <img src="/voltauri-logo.png" alt="Voltauri" className="hidden h-7 w-auto sm:block" />
                <span className="border-l border-slate-300 pl-2.5 text-sm font-bold uppercase tracking-[0.2em] text-brand-600">Portal</span>
              </Link>
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
              <ProfileMenu />
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
        <VerifyEmailBanner />
        <main className="mx-auto max-w-7xl px-4 py-6">
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </DirectoryProvider>
  );
}
