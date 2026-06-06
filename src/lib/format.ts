export function formatPKR(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  return `Rs. ${v.toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;
}

export function formatNumber(n: number | string | null | undefined): string {
  return Number(n ?? 0).toLocaleString("en-PK", { maximumFractionDigits: 2 });
}

export function formatDateTime(s: string | Date | null | undefined): string {
  if (!s) return "—";
  return new Date(s).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" });
}
