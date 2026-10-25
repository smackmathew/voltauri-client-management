function cell(value: unknown): string {
  let text = value == null ? "" : String(value);
  // Stop spreadsheets from running text like "=HYPERLINK(...)" as a formula.
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Downloads rows as a CSV file. */
export function downloadCsv(filename: string, header: string[], rows: unknown[][]): void {
  const csv = [header, ...rows].map((row) => row.map(cell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
