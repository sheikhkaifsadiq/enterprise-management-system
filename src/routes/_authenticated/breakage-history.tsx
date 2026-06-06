import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/erp/AppShell";
import { TableSkeleton } from "@/components/erp/TableSkeleton";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/breakage-history")({
  head: () => ({ meta: [{ title: "Damage Logs — ERP System" }] }),
  component: BreakageHistoryPage,
});

type Log = {
  id: number; quantity: number; reason: string | null; logged_at: string;
  product_name: string; unit: string; batch_id: string | null; staff_name: string | null;
};

function BreakageHistoryPage() {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["breakage"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("breakage_logs")
        .select("id,quantity,reason,logged_at,product:products(name,unit,batch_id),staff:profiles!breakage_logs_staff_id_fkey(full_name)")
        .order("logged_at", { ascending: false })
        .limit(500);
      if (error) {
        // Fallback without nested staff join if FK alias not found
        const { data: simple } = await supabase
          .from("breakage_logs")
          .select("id,quantity,reason,logged_at,product:products(name,unit,batch_id)")
          .order("logged_at", { ascending: false })
          .limit(500);
        type SimpleRow = {
          id: number; quantity: number; reason: string | null; logged_at: string;
          product: { name: string; unit: string; batch_id: string | null } | null;
        };
        return ((simple ?? []) as unknown as SimpleRow[]).map((r) => ({
          id: r.id, quantity: r.quantity, reason: r.reason, logged_at: r.logged_at,
          product_name: r.product?.name ?? "—", unit: r.product?.unit ?? "",
          batch_id: r.product?.batch_id ?? null, staff_name: null,
        }));
      }
      type FullRow = {
        id: number; quantity: number; reason: string | null; logged_at: string;
        product: { name: string; unit: string; batch_id: string | null } | null;
        staff: { full_name: string | null } | null;
      };
      return ((data ?? []) as unknown as FullRow[]).map((r) => ({
        id: r.id, quantity: r.quantity, reason: r.reason, logged_at: r.logged_at,
        product_name: r.product?.name ?? "—", unit: r.product?.unit ?? "",
        batch_id: r.product?.batch_id ?? null, staff_name: r.staff?.full_name ?? null,
      })) as Log[];
    },
  });

  return (
    <AppShell title="Damage Logs" description="Global audit trail for inventory removals and asset breakage events.">
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {isLoading ? <TableSkeleton rows={8} cols={6} /> : (
          <table className="erp-table">
            <thead><tr>
              <th className="erp-th">Timestamp</th><th className="erp-th">Product</th>
              <th className="erp-th">Batch</th><th className="erp-th text-right">Quantity</th>
              <th className="erp-th">Reason</th><th className="erp-th">Logged By</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="erp-row-hover">
                  <td className="erp-td text-muted-foreground">{formatDateTime(r.logged_at)}</td>
                  <td className="erp-td font-medium">{r.product_name}</td>
                  <td className="erp-td font-mono text-[11px] text-muted-foreground">{r.batch_id ?? "—"}</td>
                  <td className="erp-td text-right tabular-nums">{r.quantity} {r.unit}</td>
                  <td className="erp-td text-muted-foreground">{r.reason ?? "—"}</td>
                  <td className="erp-td text-muted-foreground">{r.staff_name ?? "—"}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} className="erp-td text-center text-muted-foreground">No damage events logged.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}
