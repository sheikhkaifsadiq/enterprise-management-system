import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Boxes, AlertTriangle, ShoppingCart, DollarSign } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { AppShell } from "@/components/erp/AppShell";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { formatPKR } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — ERP System" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [products, orders, low, deliveredRows] = await Promise.all([
        supabase.from("products").select("id", { count: "exact", head: true }).eq("is_archived", false),
        supabase.from("orders").select("id", { count: "exact", head: true }).neq("status", "Cancelled"),
        supabase.rpc as never, // placeholder to keep parallel
        supabase
          .from("orders")
          .select("final_amount, created_at")
          .eq("status", "Delivered")
          .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString())
          .order("created_at", { ascending: true }),
      ]);

      // Low stock: products where stock_count <= low_stock_threshold
      const { data: lowItems } = await supabase
        .from("products")
        .select("id,name,stock_count,unit,low_stock_threshold")
        .eq("is_archived", false)
        .order("stock_count", { ascending: true })
        .limit(50);
      const lowFiltered = (lowItems ?? []).filter(
        (p) => Number(p.stock_count) <= Number(p.low_stock_threshold),
      );

      // Aggregate revenue per day
      const rev = (deliveredRows.data ?? []).reduce<Record<string, number>>((acc, r) => {
        const day = new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "2-digit" });
        acc[day] = (acc[day] ?? 0) + Number(r.final_amount);
        return acc;
      }, {});
      const revenueData = Object.entries(rev).map(([date, amount]) => ({ date, amount }));
      const totalRevenue = revenueData.reduce((s, x) => s + x.amount, 0);

      void low;
      return {
        totalProducts: products.count ?? 0,
        totalOrders: orders.count ?? 0,
        lowStockCount: lowFiltered.length,
        lowStockItems: lowFiltered,
        totalRevenue,
        revenueData,
      };
    },
  });

  const kpis = [
    { label: "Gross Revenue", val: formatPKR(data?.totalRevenue ?? 0), icon: DollarSign, tone: "bg-mint-cream border-light-cyan text-navy", numCls: "text-navy" },
    { label: "Fulfillment Queue", val: String(data?.totalOrders ?? 0), icon: ShoppingCart, tone: "bg-alice-blue border-pale-sky text-navy", numCls: "text-navy" },
    { label: "Catalog Assets", val: String(data?.totalProducts ?? 0), icon: Boxes, tone: "bg-powder-petal border-[color:color-mix(in_oklab,var(--color-ink)_15%,transparent)] text-ink", numCls: "text-ink" },
    { label: "Inventory Risks", val: String(data?.lowStockCount ?? 0), icon: AlertTriangle, tone: "bg-soft-blush border-petal-frost text-destructive", numCls: "text-destructive" },
  ];

  return (
    <AppShell title="Enterprise Overview" description="Real-time showroom performance and liquidity metrics for the current cycle.">
      <div className="grid grid-cols-12 gap-5">
        {kpis.map((s) => (
          <div
            key={s.label}
            className={`col-span-12 sm:col-span-6 lg:col-span-3 flex min-h-[160px] flex-col justify-between border p-6 rounded-sm transition-transform duration-200 hover:-translate-y-0.5 ${s.tone}`}
          >
            <div className="flex items-start justify-between">
              <span className="erp-eyebrow opacity-70">{s.label}</span>
              <s.icon className="h-4 w-4 opacity-50" />
            </div>
            {isLoading ? (
              <Skeleton className="mt-2 h-10 w-32 bg-black/5" />
            ) : (
              <div className={`erp-numeral text-[44px] ${s.numCls}`} style={{ fontFamily: "'DM Serif Display', serif" }}>
                {s.val}
              </div>
            )}
            <div className="text-[11px] opacity-60">Updated just now</div>
          </div>
        ))}

        <div className="col-span-12 lg:col-span-8 border border-border bg-linen p-8 rounded-sm">
          <div className="mb-8 flex items-end justify-between">
            <div>
              <h2 className="text-[22px]" style={{ fontFamily: "'DM Serif Display', serif" }}>Revenue Dynamics</h2>
              <p className="erp-eyebrow mt-1 opacity-60">Last 7 days · Delivered</p>
            </div>
            <div className="flex items-center gap-4 erp-eyebrow opacity-70">
              <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-powder-blue"></span>Delivered</span>
            </div>
          </div>
          <div className="h-72 w-full">
            {isLoading ? <Skeleton className="h-full w-full" /> : (data?.revenueData.length ?? 0) === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground italic">No delivered revenue in this period.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data!.revenueData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2d597a" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#2d597a" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="rgba(54,51,41,0.12)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6b6657", letterSpacing: "0.1em" }} tickLine={false} axisLine={{ stroke: "rgba(54,51,41,0.15)" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#6b6657" }} tickLine={false} axisLine={false} tickFormatter={(v) => `Rs.${v}`} />
                  <Tooltip
                    formatter={(v) => [formatPKR(Number(v)), "Revenue"]}
                    contentStyle={{ background: "#fff1e6", border: "1px solid rgba(45,89,122,0.2)", borderRadius: 2, fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="amount" stroke="#2d597a" strokeWidth={1.75} fill="url(#rev)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 border border-border bg-card p-8 rounded-sm">
          <h2 className="mb-6 text-[22px]" style={{ fontFamily: "'DM Serif Display', serif" }}>Inventory Health</h2>
          {isLoading ? (
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
          ) : (data?.lowStockItems.length ?? 0) === 0 ? (
            <div className="border border-success/30 bg-success/5 p-4 text-[12px] text-success italic rounded-sm">All assets above threshold.</div>
          ) : (
            <ul className="divide-y divide-border">
              {data!.lowStockItems.slice(0, 6).map((p) => (
                <li key={p.id} className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium text-ink">{p.name}</div>
                    <div className="erp-eyebrow opacity-50 mt-0.5">Critical stock</div>
                  </div>
                  <span className="px-2 py-1 bg-soft-blush text-destructive text-[9px] font-bold uppercase tracking-[0.2em] rounded-sm whitespace-nowrap">
                    {p.stock_count} {p.unit}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}

