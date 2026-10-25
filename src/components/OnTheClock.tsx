import { useProfile } from "../context/AuthContext";
import { entryDuration, TimeApi, toEntry } from "../firebase/time";
import { formatClock, formatTime } from "../lib/format";
import { useLiveQuery, useNow } from "../lib/useLive";
import { Card, Empty, LiveDot } from "./ui";

/** Everyone on the clock right now, within what the viewer may see. Updates the moment anyone punches. */
export default function OnTheClock({ title = "On the clock now" }: { title?: string }) {
  const profile = useProfile();
  const now = useNow();
  const { data, loading, error } = useLiveQuery(TimeApi.openQuery(profile), toEntry, `open:${profile.id}:${profile.role}`);
  const rows = [...data].sort((a, b) => a.clock_in.getTime() - b.clock_in.getTime());

  return (
    <Card title={<span className="flex items-center gap-2">{title} <LiveDot /></span>}>
      {error ? (
        <p className="text-sm text-red-600">{error.message}</p>
      ) : loading ? (
        <div className="h-16 animate-pulse rounded bg-slate-100" />
      ) : rows.length === 0 ? (
        <Empty>Nobody is clocked in right now.</Empty>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((entry) => (
            <li key={entry.id} className="flex items-start justify-between gap-3 py-2.5">
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700">
                  {initials(entry.tech_name)}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800">{entry.tech_name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {entry.client_name} · since {formatTime(entry.clock_in)}
                    {entry.notes && ` · ${entry.notes}`}
                  </p>
                </div>
              </div>
              <span className="shrink-0 font-mono text-sm tabular-nums text-emerald-700">{formatClock(entryDuration(entry, now))}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}
