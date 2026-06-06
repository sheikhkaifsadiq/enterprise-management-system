import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Download, ChevronRight, Filter, FileSpreadsheet, FileText, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/erp/AppShell";
import { TableSkeleton } from "@/components/erp/TableSkeleton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/erp-errors";
import { formatPKR, formatDateTime } from "@/lib/format";
import { downloadInvoice } from "@/lib/pdfInvoice";
import { exportToExcel, exportToPDF } from "@/lib/exporters";
import { useRealtime } from "@/hooks/useRealtime";

export const Route = createFileRoute("/_authenticated/orders")({
  head: () => ({ meta: [{ title: "Orders — ERP System" }] }),
  component: OrdersPage,
});

type Order = {
  id: number; fullname: string; phone: string | null; total_amount: number;
  discount_amount: number; final_amount: number; status: string; created_at: string;
  customer_name: string | null;
};

const STATUSES = ["Pending", "Confirmed", "Dispatched", "Delivered", "Cancelled"];
const PAGE_SIZE = 50;

function OrdersPage() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkStatus, setBulkStatus] = useState("Confirmed");
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);

  useRealtime("rt-orders", "orders", [["orders"]]);

  const filterArr = Array.from(statusFilter);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["orders", page, filterArr.sort().join(",")],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase
        .from("orders")
        .select("id,fullname,phone,total_amount,discount_amount,final_amount,status,created_at,customer:customers(fullname)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (filterArr.length > 0) q = q.in("status", filterArr);
      const { data, error, count } = await q;
      if (error) throw error;
      type R = Omit<Order, "customer_name"> & { customer: { fullname: string } | null };
      const rows = ((data ?? []) as unknown as R[]).map((r) => ({
        ...r, customer_name: r.customer?.fullname ?? null,
      })) as Order[];
      return { rows, count: count ?? 0 };
    },
  });
  const rows = data?.rows ?? [];
  const total = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const { error } = await supabase.from("orders").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Status synchronized"); qc.invalidateQueries({ queryKey: ["orders"] }); },
    onError: (e) => toast.error(humanizeError(e)),
  });

  const bulkUpdate = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selected);
      const { error } = await supabase.from("orders").update({ status: bulkStatus }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Bulk update synchronized"); setSelected(new Set()); qc.invalidateQueries({ queryKey: ["orders"] }); },
    onError: (e) => toast.error(humanizeError(e)),
  });

  async function handleDownload(o: Order) {
    const [{ data: items }, { data: settings }] = await Promise.all([
      supabase.from("order_items").select("quantity,price,unit,product:products(name)").eq("order_id", o.id),
      supabase.from("settings").select("company_name,whatsapp_number").eq("id", 1).maybeSingle(),
    ]);
    type ItemRow = { quantity: number; price: number; unit: string | null; product: { name: string } | null };
    downloadInvoice(
      {
        id: o.id, customer_name: o.customer_name, fullname: o.fullname, phone: o.phone,
        total_amount: o.total_amount, discount_amount: o.discount_amount,
        final_amount: o.final_amount, created_at: o.created_at,
        items: ((items ?? []) as unknown as ItemRow[]).map((it) => ({
          name: it.product?.name ?? "—", quantity: it.quantity, unit: it.unit, price: it.price,
        })),
      },
      { company_name: settings?.company_name ?? "ERP System", whatsapp_number: settings?.whatsapp_number ?? "N/A" },
    );
  }

  function exportRowsXlsx() {
    exportToExcel(rows.map((o) => ({
      OrderID: `OR-${o.id}`,
      Customer: o.customer_name ?? o.fullname,
      Phone: o.phone ?? "",
      Date: formatDateTime(o.created_at),
      Total: o.total_amount,
      Discount: o.discount_amount,
      Final: o.final_amount,
      Status: o.status,
    })), `orders-page-${page + 1}`);
  }
  function exportRowsPdf() {
    exportToPDF(
      `Orders — Page ${page + 1}`,
      ["Order", "Customer", "Date", "Final", "Status"],
      rows.map((o) => [`OR-${o.id}`, o.customer_name ?? o.fullname, formatDateTime(o.created_at), formatPKR(o.final_amount), o.status]),
      `orders-page-${page + 1}`,
    );
  }

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  }
  function toggleOne(id: number) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }
  function toggleStatusFilter(s: string) {
    const next = new Set(statusFilter);
    if (next.has(s)) next.delete(s); else next.add(s);
    setStatusFilter(next);
    setPage(0);
  }

  return (
    <AppShell
      title="Sales Orders"
      description="Fulfillment queue with itemized ledger, bulk operations, and exports."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                <Filter className="mr-1.5 h-3.5 w-3.5" />
                Status {statusFilter.size > 0 && <Badge variant="secondary" className="ml-1.5 h-4 px-1">{statusFilter.size}</Badge>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" align="end">
              <div className="space-y-1">
                {STATUSES.map((s) => (
                  <label key={s} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[12px] hover:bg-secondary">
                    <Checkbox checked={statusFilter.has(s)} onCheckedChange={() => toggleStatusFilter(s)} />
                    <span>{s}</span>
                  </label>
                ))}
                {statusFilter.size > 0 && (
                  <Button variant="ghost" size="sm" className="mt-1 h-7 w-full text-[11px]"
                    onClick={() => { setStatusFilter(new Set()); setPage(0); }}>Clear</Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="sm" className="h-8" onClick={exportRowsXlsx}>
            <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />Excel
          </Button>
          <Button variant="outline" size="sm" className="h-8" onClick={exportRowsPdf}>
            <FileText className="mr-1.5 h-3.5 w-3.5" />PDF
          </Button>
          {selected.size > 0 && (
            <>
              <span className="text-[12px] text-muted-foreground">{selected.size} selected</span>
              <Select value={bulkStatus} onValueChange={setBulkStatus}>
                <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
              <Button size="sm" onClick={() => bulkUpdate.mutate()} disabled={bulkUpdate.isPending}>Apply Bulk</Button>
            </>
          )}
        </div>
      }
    >
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {isLoading ? <TableSkeleton rows={10} cols={8} /> : (
          <table className="erp-table">
            <thead><tr>
              <th className="erp-th w-8"><Checkbox checked={allSelected} onCheckedChange={toggleAll} /></th>
              <th className="erp-th">Order #</th><th className="erp-th">Customer</th>
              <th className="erp-th">Phone</th><th className="erp-th">Date</th>
              <th className="erp-th text-right">Total</th><th className="erp-th">Status</th>
              <th className="erp-th text-right">Actions</th>
            </tr></thead>
            <tbody>
              {rows.map((o) => (
                <ContractedRow key={o.id} o={o} expanded={expanded === o.id} selected={selected.has(o.id)}
                  onToggleSelect={() => toggleOne(o.id)}
                  onToggleExpand={() => setExpanded(expanded === o.id ? null : o.id)}
                  onStatus={(s) => updateStatus.mutate({ id: o.id, status: s })}
                  onDownload={() => handleDownload(o)}
                />
              ))}
              {rows.length === 0 && <tr><td colSpan={8} className="erp-td text-center text-muted-foreground">No orders in queue.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div className="mt-3 flex items-center justify-between text-[12px] text-muted-foreground">
        <div>
          Showing <span className="font-medium text-foreground">{rows.length === 0 ? 0 : page * PAGE_SIZE + 1}–{page * PAGE_SIZE + rows.length}</span> of <span className="font-medium text-foreground">{total}</span>
          {isFetching && <span className="ml-2 opacity-60">syncing…</span>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-7" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="tabular-nums">Page {page + 1} / {totalPages}</span>
          <Button variant="outline" size="sm" className="h-7" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </AppShell>
  );
}

function ContractedRow({
  o, expanded, selected, onToggleSelect, onToggleExpand, onStatus, onDownload,
}: {
  o: Order; expanded: boolean; selected: boolean;
  onToggleSelect: () => void; onToggleExpand: () => void;
  onStatus: (s: string) => void; onDownload: () => void;
}) {
  return (
    <>
      <tr className="erp-row-hover">
        <td className="erp-td"><Checkbox checked={selected} onCheckedChange={onToggleSelect} /></td>
        <td className="erp-td">
          <button onClick={onToggleExpand} className="flex items-center gap-1 font-mono text-[12px]">
            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} />
            OR-{o.id}
          </button>
        </td>
        <td className="erp-td font-medium">{o.customer_name ?? o.fullname}</td>
        <td className="erp-td text-muted-foreground">{o.phone ?? "—"}</td>
        <td className="erp-td text-muted-foreground">{formatDateTime(o.created_at)}</td>
        <td className="erp-td text-right tabular-nums">{formatPKR(o.final_amount)}</td>
        <td className="erp-td">
          <Select value={o.status} onValueChange={onStatus}>
            <SelectTrigger className="h-7 w-32 text-[12px]"><SelectValue /></SelectTrigger>
            <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </td>
        <td className="erp-td text-right">
          <Button variant="outline" size="sm" className="h-7" onClick={onDownload}><Download className="mr-1 h-3.5 w-3.5" />Invoice</Button>
        </td>
      </tr>
      {expanded && (
        <tr><td colSpan={8} className="bg-secondary/30 px-12 py-3"><OrderItems orderId={o.id} order={o} /></td></tr>
      )}
    </>
  );
}

function OrderItems({ orderId, order }: { orderId: number; order: Order }) {
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["order-items", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("id,quantity,price,unit,product:products(name)")
        .eq("order_id", orderId);
      if (error) throw error;
      type R = { id: number; quantity: number; price: number; unit: string | null; product: { name: string } | null };
      return ((data ?? []) as unknown as R[]).map((r) => ({ id: r.id, quantity: r.quantity, price: r.price, unit: r.unit, name: r.product?.name ?? "—" }));
    },
  });
  if (isLoading) return <div className="text-[12px] text-muted-foreground">Loading items…</div>;
  return (
    <div className="space-y-2">
      <table className="erp-table">
        <thead><tr><th className="erp-th">Item</th><th className="erp-th">Qty</th><th className="erp-th">Unit</th><th className="erp-th text-right">Rate</th><th className="erp-th text-right">Line Total</th></tr></thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id}><td className="erp-td font-medium">{it.name}</td><td className="erp-td">{it.quantity}</td><td className="erp-td">{it.unit ?? "—"}</td><td className="erp-td text-right tabular-nums">{formatPKR(it.price)}</td><td className="erp-td text-right tabular-nums">{formatPKR(Number(it.price) * Number(it.quantity))}</td></tr>
          ))}
        </tbody>
      </table>
      <div className="flex justify-end gap-6 text-[12px]">
        <div>Gross: <span className="font-medium tabular-nums">{formatPKR(order.total_amount)}</span></div>
        <div>Markdown: <Badge variant="secondary">-{formatPKR(order.discount_amount)}</Badge></div>
        <div className="font-bold">Final: <span className="tabular-nums">{formatPKR(order.final_amount)}</span></div>
      </div>
    </div>
  );
}
