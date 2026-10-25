import { Link } from "react-router-dom";
import { useProfile } from "../context/AuthContext";
import { entryDuration } from "../firebase/time";
import { formatClock } from "../lib/format";
import { useActiveEntry } from "../lib/useActiveEntry";
import { useNow } from "../lib/useLive";

/** Header pill: a running timer while on the clock, otherwise a shortcut to clock in. */
export default function ClockStatus() {
  const { data: entry } = useActiveEntry();
  const now = useNow();
  const profile = useProfile();
  if (!entry && profile.active_entry_id) {
    return (
      <Link to="/clock" className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
        On the clock
      </Link>
    );
  }
  if (!entry) {
    return (
      <Link to="/clock" className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">
        Off the clock · Clock in
      </Link>
    );
  }
  return (
    <Link
      to="/clock"
      className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
    >
      <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
      <span className="tabular-nums">{formatClock(entryDuration(entry, now))}</span>
      <span className="hidden max-w-[10rem] truncate md:inline">· {entry.client_name}</span>
    </Link>
  );
}
