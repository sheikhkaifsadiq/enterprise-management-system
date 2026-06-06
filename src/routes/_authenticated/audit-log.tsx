import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/erp/AppShell";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/audit-log")({
  head: () => ({ meta: [{ title: "Audit Log — ERP System" }] }),
  component: AuditLogPage,
});

const PAGE_SIZE = 50;
const ENTITY_OPTIONS = ["all", "orders", "products", "inventory", "inventory_transfers", "warehouses"] as const;
const ACTION_COLORS: Record<string, string> = {
  INSERT: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  UPDATE: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  DELETE: "bg-red-500/15 text-red-700 dark:text-red-300",
};

function AuditLogPage() {
  const { isAdmin, loading, profile } = useAuth();
  const [page, setPage] = useState(0);
  const [entity, setEntity] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data, isFetching } = useQuery({
    queryKey: ["audit-log", page, entity, search],
    queryFn: async () => {
      let q = supabase.from("audit_logs").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (entity !== "all") q = q.eq("entity", entity);
      if (search.trim()) q = q.or(`user_email.ilike.%${search.trim()}%,entity_id.eq.${search.trim()}`);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
    enabled: isAdmin,
  });

  // Wait for both session AND profile to load before deciding access —
  // profile holds the role; without it isAdmin is falsely false.
  if (loading || !profile) return null;
  if (!isAdmin) return <Navigate to="/dashboard" />;

  const total = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AppShell title="Audit Log" description="Immutable history of every change to orders, products, inventory, transfers, and warehouses.">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input placeholder="Search by user email or entity ID…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="h-9 max-w-xs" />
        <Select value={entity} onValueChange={(v) => { setEntity(v); setPage(0); }}>
          <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
          <SelectContent>{ENTITY_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o === "all" ? "All entities" : o}</SelectItem>)}</SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" /> {total} events · page {page + 1} / {totalPages}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>ID</TableHead>
              <TableHead>Diff</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.rows ?? []).map((row) => (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap text-xs tabular-nums">{new Date(row.created_at).toLocaleString()}</TableCell>
                <TableCell className="text-xs">{row.user_email ?? "—"}</TableCell>
                <TableCell><Badge variant="outline" className="text-[10px]">{row.user_role ?? "system"}</Badge></TableCell>
                <TableCell><Badge className={ACTION_COLORS[row.action] ?? ""}>{row.action}</Badge></TableCell>
                <TableCell className="font-mono text-xs">{row.entity}</TableCell>
                <TableCell className="font-mono text-xs">{row.entity_id ?? "—"}</TableCell>
                <TableCell>
                  <details className="text-[11px]">
                    <summary className="cursor-pointer text-muted-foreground">view</summary>
                    <pre className="mt-1 max-h-64 overflow-auto rounded bg-muted p-2 text-[10px]">{JSON.stringify({ before: row.before_data, after: row.after_data }, null, 2)}</pre>
                  </details>
                </TableCell>
              </TableRow>
            ))}
            {(data?.rows ?? []).length === 0 && (
              <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">{isFetching ? "Loading…" : "No events match the filter."}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Previous</Button>
        <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
      </div>
    </AppShell>
  );
}
