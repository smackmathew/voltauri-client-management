import ClockPanel from "../components/ClockPanel";
import EntryTable from "../components/EntryTable";
import { Card, PageHeader, StatCard } from "../components/ui";
import { useProfile } from "../context/AuthContext";
import { entryDuration, TimeApi, toEntry } from "../firebase/time";
import { addDays, formatHours, isoDay, startOfDay, startOfWeek } from "../lib/format";
import { useLiveQuery, useNow } from "../lib/useLive";

export default function TimeClock() {
  const profile = useProfile();
  const now = useNow(30_000);
  const weekStart = startOfWeek(now);
  // A tech's own entries; admins see their own here too (everyone's is on Timesheets).
  const viewer = { ...profile, role: "tech" as const };
  const { data } = useLiveQuery(TimeApi.rangeQuery(viewer, weekStart, addDays(weekStart, 7)), toEntry, `myweek:${profile.id}:${isoDay(weekStart)}`);
  const entries = [...data].sort((a, b) => b.clock_in.getTime() - a.clock_in.getTime());
  const total = (from: Date) => entries.filter((e) => e.clock_in >= from).reduce((sum, e) => sum + entryDuration(e, now), 0);

  return (
    <div>
      <PageHeader title="Time Clock" subtitle="Clock in when you start work for a client and out when you stop. Tauri and the client see it instantly." />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <ClockPanel />
        </div>
        <div className="space-y-6 lg:col-span-3">
          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Today" value={formatHours(total(startOfDay(now)))} hint="hours" />
            <StatCard label="This week" value={formatHours(total(weekStart))} hint="hours since Monday" />
          </div>
          <Card title="My time this week">
            <EntryTable entries={entries} showTech={false} />
          </Card>
        </div>
      </div>
    </div>
  );
}
