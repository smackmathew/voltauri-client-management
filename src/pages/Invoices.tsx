import { Card, LiveDot, PageHeader, StatCard } from "../components/ui";
import { useProfile } from "../context/AuthContext";
import { useDirectory } from "../context/DirectoryContext";
import { InvoicesApi, toInvoice } from "../firebase/invoices";
import { formatMoney } from "../lib/billing";
import { useLiveQuery } from "../lib/useLive";
import { InvoiceTable } from "./Billing";
import { invoiceState } from "./invoiceStatus";

/** A client's view of the invoices Tauri has sent them. */
export default function Invoices() {
  const profile = useProfile();
  const { org } = useDirectory();
  const { data } = useLiveQuery(InvoicesApi.visibleQuery(profile), toInvoice, `my-invoices:${profile.id}`);
  const invoices = [...data].sort((a, b) => b.number - a.number);
  const currency = invoices[0]?.currency ?? org?.currency ?? "USD";
  const due = invoices.filter((i) => i.status === "sent");
  const overdue = due.filter((i) => invoiceState(i) === "overdue");
  const sum = (list: typeof invoices) => list.reduce((s, i) => s + i.total_cents, 0);

  return (
    <div>
      <PageHeader title="Invoices" subtitle={<span className="flex items-center gap-2">Every invoice from {org?.name ?? "Tauri"}, with the time behind it. <LiveDot /></span>} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Balance due" value={formatMoney(sum(due), currency)} hint={`${due.length} unpaid`} />
        <StatCard label="Overdue" value={formatMoney(sum(overdue), currency)} tone={overdue.length ? "negative" : "default"} />
        <StatCard label="Paid to date" value={formatMoney(sum(invoices.filter((i) => i.status === "paid")), currency)} tone="positive" />
      </div>
      <Card title="Your invoices">
        <InvoiceTable invoices={invoices} showClient={false} />
      </Card>
    </div>
  );
}
