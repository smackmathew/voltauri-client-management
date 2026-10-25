import { entryDuration } from "../firebase/time";
import { formatDate, formatDuration, formatHours, formatTime } from "../lib/format";
import { useNow } from "../lib/useLive";
import type { TimeEntry } from "../types";
import { Badge, Empty } from "./ui";

interface Props {
  entries: TimeEntry[];
  showTech?: boolean;
  showClient?: boolean;
  /** Admins get an edit button per row. */
  onEdit?: (entry: TimeEntry) => void;
}

/** Time entries, newest first, with edit history shown so every change is accounted for. */
export default function EntryTable({ entries, showTech = true, showClient = true, onEdit }: Props) {
  const now = useNow(30_000);
  if (entries.length === 0) return <Empty>No time recorded in this period.</Empty>;
  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <th className="px-4 py-2">Date</th>
            {showTech && <th className="px-4 py-2">Technician</th>}
            {showClient && <th className="px-4 py-2">Client</th>}
            <th className="px-4 py-2">In</th>
            <th className="px-4 py-2">Out</th>
            <th className="px-4 py-2 text-right">Hours</th>
            <th className="px-4 py-2">Notes</th>
            {onEdit && <th className="px-4 py-2" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {entries.map((entry) => (
            <tr key={entry.id} className="align-top hover:bg-slate-50">
              <td className="whitespace-nowrap px-4 py-2 text-slate-700">{formatDate(entry.clock_in)}</td>
              {showTech && <td className="whitespace-nowrap px-4 py-2 font-medium text-slate-800">{entry.tech_name}</td>}
              {showClient && <td className="whitespace-nowrap px-4 py-2 text-slate-700">{entry.client_name}</td>}
              <td className="whitespace-nowrap px-4 py-2 tabular-nums">{formatTime(entry.clock_in)}</td>
              <td className="whitespace-nowrap px-4 py-2 tabular-nums">
                {entry.clock_out ? formatTime(entry.clock_out) : <Badge tone="green">On the clock</Badge>}
              </td>
              <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums" title={formatDuration(entryDuration(entry, now))}>
                {formatHours(entryDuration(entry, now))}
              </td>
              <td className="max-w-xs px-4 py-2 text-slate-600">
                {entry.notes && <p className="line-clamp-2">{entry.notes}</p>}
                {entry.edit_reason && (
                  <p className="mt-1 text-xs text-amber-700">
                    <Badge tone="amber">{entry.original ? "Corrected" : "Added by admin"}</Badge> {entry.edit_reason}
                    {entry.original && (
                      <span className="block text-slate-400">
                        Originally {formatTime(entry.original.clock_in)}–{entry.original.clock_out ? formatTime(entry.original.clock_out) : "open"}
                      </span>
                    )}
                  </p>
                )}
              </td>
              {onEdit && (
                <td className="whitespace-nowrap px-4 py-2 text-right">
                  <button onClick={() => onEdit(entry)} className="text-xs font-medium text-brand-700 hover:text-brand-800">
                    {entry.clock_out ? "Correct" : "Clock out"}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
