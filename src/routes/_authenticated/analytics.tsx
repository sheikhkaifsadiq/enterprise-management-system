import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend,
} from "recharts";
import { Download, TrendingUp, TrendingDown, Filter } from "lucide-react";
import { AppShell } from "@/components/erp/AppShell";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { formatPKR } from "@/lib/format";
import { exportToExcel, exportToPDF } from "@/lib/exporters";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({ meta: [{ title: "Analytics — ERP System" }] }),
  component: AnalyticsPage,
});

type ItemAgg = {
  price: number; quantity: number;
  product: { category: string | null } | null;
  order: { status: string; created_at: string } | null;
};
type OrderAgg = { final_amount: number; created_at: string; customer: { fullname: string } | null };

function AnalyticsPage() {
  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ["analytics-perf-yoy"],
    queryFn: async () => {
      const { data: items } = await supabase
        .from("order_items")
        .select("price,quantity,product:products(category),order:orders!inner(status,created_at)")
        .eq("order.status", "Delivered");
      const { data: orders } = await supabase
        .from("orders")
        .select("final_amount,created_at,customer:customers(fullname)")
        .eq("status", "Delivered");
      return {
        items: (items ?? []) as unknown as ItemAgg[],
        orders: (orders ?? []) as unknown as OrderAgg[],
      };
    },
  });

  const { categorySales, allCategories, monthlyYoY, topCustomers } = useMemo(() => {
    const items = data?.items ?? [];
    const orders = data?.orders ?? [];

    // Category map
    const catMap: Record<string, number> = {};
    items.forEach((it) => {
      const cat = it.product?.category ?? "Uncategorized";
      catMap[cat] = (catMap[cat] ?? 0) + Number(it.price) * Number(it.quantity);
    });
    const allCategories = Object.keys(catMap).sort();
    const filteredCats = selectedCats.size === 0
      ? allCategories
      : allCategories.filter((c) => selectedCats.has(c));
    const categorySales = filteredCats
      .map((c) => ({ category: c, total_sales: catMap[c] ?? 0 }))
      .sort((a, b) => b.total_sales - a.total_sales);

    // YoY monthly comparison
    const now = new Date();
    const thisYear = now.getFullYear();
    const lastYear = thisYear - 1;
    const monthly: Record<string, { month: string; current: number; previous: number }> = {};
    for (let m = 0; m < 12; m++) {
      const label = new Date(2000, m, 1).toLocaleString("en", { month: "short" });
      monthly[label] = { month: label, current: 0, previous: 0 };
    }
    orders.forEach((o) => {
      const d = new Date(o.created_at);
      const label = d.toLocaleString("en", { month: "short" });
      if (!monthly[label]) return;
      if (d.getFullYear() === thisYear) monthly[label].current += Number(o.final_amount);
      else if (d.getFullYear() === lastYear) monthly[label].previous += Number(o.final_amount);
    });
    const monthlyYoY = Object.values(monthly);

    // Customers
    const custMap: Record<string, number> = {};
    orders.forEach((o) => {
      const name = o.customer?.fullname ?? "Walk-in";
      custMap[name] = (custMap[name] ?? 0) + Number(o.final_amount);
    });
    const topCustomers = Object.entries(custMap)
      .map(([fullname, total_spent]) => ({ fullname, total_spent }))
      .sort((a, b) => b.total_spent - a.total_spent)
      .slice(0, 10);

    return { categorySales, allCategories, monthlyYoY, topCustomers };
  }, [data, selectedCats]);

  const currentTotal = monthlyYoY.reduce((s, m) => s + m.current, 0);
  const previousTotal = monthlyYoY.reduce((s, m) => s + m.previous, 0);
  const yoyDelta = previousTotal > 0 ? ((currentTotal - previousTotal) / previousTotal) * 100 : 0;

  function toggleCat(c: string) {
    const next = new Set(selectedCats);
    if (next.has(c)) next.delete(c); else next.add(c);
    setSelectedCats(next);
  }

  function exportCategoriesXlsx() {
    exportToExcel(categorySales.map((r) => ({ Category: r.category, Revenue: r.total_sales })), "category-revenue");
  }
  function exportCategoriesPdf() {
    exportToPDF(
      "Revenue by Category",
      ["Category", "Revenue (PKR)"],
      categorySales.map((r) => [r.category, formatPKR(r.total_sales)]),
      "category-revenue",
    );
  }
  function exportCustomersXlsx() {
    exportToExcel(topCustomers.map((c, i) => ({ Rank: i + 1, Customer: c.fullname, LTV: c.total_spent })), "top-customers");
  }

  return (
    <AppShell
      title="Market Intelligence"
      description="Year-over-year revenue, category dominance and elite customer loyalty."
    >
      <div className="space-y-3">
        {/* YoY KPI */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="grid gap-3 sm:grid-cols-3">
          <KpiCard label={`Revenue ${new Date().getFullYear()}`} value={formatPKR(currentTotal)} />
          <KpiCard label={`Revenue ${new Date().getFullYear() - 1}`} value={formatPKR(previousTotal)} />
          <KpiCard
            label="Year-over-Year"
            value={`${yoyDelta >= 0 ? "+" : ""}${yoyDelta.toFixed(1)}%`}
            trend={yoyDelta >= 0 ? "up" : "down"}
          />
        </motion.div>

        {/* YoY chart */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-bold">Monthly Revenue — YoY</h2>
          <div className="h-72 w-full">
            {isLoading ? <Skeleton className="h-full w-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyYoY}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `Rs.${v}`} />
                  <Tooltip formatter={(v) => formatPKR(Number(v))} />
                  <Legend />
                  <Line type="monotone" dataKey="previous" stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot={false} name={`${new Date().getFullYear() - 1}`} />
                  <Line type="monotone" dataKey="current" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name={`${new Date().getFullYear()}`} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Categories with multi-filter + export */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold">Revenue by Category (Delivered)</h2>
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8">
                    <Filter className="mr-1.5 h-3.5 w-3.5" />
                    Filter {selectedCats.size > 0 && <Badge variant="secondary" className="ml-1.5 h-4 px-1">{selectedCats.size}</Badge>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2" align="end">
                  <div className="max-h-64 space-y-1 overflow-y-auto">
                    {allCategories.length === 0 && <p className="p-2 text-xs text-muted-foreground">No categories yet.</p>}
                    {allCategories.map((c) => (
                      <label key={c} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[12px] hover:bg-secondary">
                        <Checkbox checked={selectedCats.has(c)} onCheckedChange={() => toggleCat(c)} />
                        <span className="truncate">{c}</span>
                      </label>
                    ))}
                    {selectedCats.size > 0 && (
                      <Button variant="ghost" size="sm" className="mt-1 h-7 w-full text-[11px]" onClick={() => setSelectedCats(new Set())}>Clear</Button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              <Button variant="outline" size="sm" className="h-8" onClick={exportCategoriesXlsx}><Download className="mr-1.5 h-3.5 w-3.5" />Excel</Button>
              <Button variant="outline" size="sm" className="h-8" onClick={exportCategoriesPdf}><Download className="mr-1.5 h-3.5 w-3.5" />PDF</Button>
            </div>
          </div>
          <div className="h-72 w-full">
            {isLoading ? <Skeleton className="h-full w-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categorySales}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `Rs.${v}`} />
                  <Tooltip formatter={(v) => formatPKR(Number(v))} />
                  <Bar dataKey="total_sales" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Top customers */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold">Top 10 Customers (Lifetime Value)</h2>
            <Button variant="outline" size="sm" className="h-8" onClick={exportCustomersXlsx}><Download className="mr-1.5 h-3.5 w-3.5" />Excel</Button>
          </div>
          <table className="erp-table">
            <thead><tr><th className="erp-th">#</th><th className="erp-th">Customer</th><th className="erp-th text-right">Total Spent</th></tr></thead>
            <tbody>
              {topCustomers.map((c, i) => (
                <tr key={c.fullname} className="erp-row-hover">
                  <td className="erp-td tabular-nums text-muted-foreground">{i + 1}</td>
                  <td className="erp-td font-medium">{c.fullname}</td>
                  <td className="erp-td text-right tabular-nums">{formatPKR(c.total_spent)}</td>
                </tr>
              ))}
              {topCustomers.length === 0 && <tr><td colSpan={3} className="erp-td text-center text-muted-foreground">No delivered orders yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}

function KpiCard({ label, value, trend }: { label: string; value: string; trend?: "up" | "down" }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-center gap-2">
        <div className="text-xl font-bold tabular-nums">{value}</div>
        {trend === "up" && <TrendingUp className="h-4 w-4 text-emerald-500" />}
        {trend === "down" && <TrendingDown className="h-4 w-4 text-rose-500" />}
      </div>
    </div>
  );
}
