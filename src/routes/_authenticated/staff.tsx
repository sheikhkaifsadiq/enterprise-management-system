import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/erp/AppShell";
import { TableSkeleton } from "@/components/erp/TableSkeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/erp-errors";
import { useAuth } from "@/hooks/useAuth";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/staff")({
  head: () => ({ meta: [{ title: "Personnel — ERP System" }] }),
  component: StaffPage,
});

type StaffRow = { id: string; full_name: string | null; username: string | null; email: string | null; role: string; profile_pic: string | null; created_at: string };
const ROLES = ["Super Admin", "Admin", "Manager", "Cashier"];

function StaffPage() {
  const { isSuperAdmin, user } = useAuth();
  const qc = useQueryClient();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["staff"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id,full_name,username,email,role,profile_pic,created_at").order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as StaffRow[];
    },
  });

  const updateRole = useMutation({
    mutationFn: async ({ id, role, targetRole }: { id: string; role: string; targetRole: string }) => {
      // 1:1 port: Hierarchical Guard — can't modify Super Admin unless requester is Super Admin
      if (targetRole === "Super Admin" && !isSuperAdmin) throw new Error("Hierarchy Violation: Cannot modify Root Admin");
      const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Personnel record synchronized"); qc.invalidateQueries({ queryKey: ["staff"] }); },
    onError: (e) => toast.error(humanizeError(e)),
  });

  return (
    <AppShell
      title="Personnel Management"
      description="Hierarchical role assignments. Staff register via the terminal login page; assign roles here."
    >
      {!isSuperAdmin && <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-800">View-only. Super Admin clearance required to modify roles.</div>}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {isLoading ? <TableSkeleton rows={6} cols={5} /> : (
          <table className="erp-table">
            <thead><tr><th className="erp-th">Name</th><th className="erp-th">Username</th><th className="erp-th">Email</th><th className="erp-th">Joined</th><th className="erp-th">Role</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="erp-row-hover">
                  <td className="erp-td font-medium">{r.full_name ?? "—"} {r.id === user?.id && <span className="ml-1 text-[10px] text-muted-foreground">(you)</span>}</td>
                  <td className="erp-td text-muted-foreground">{r.username ?? "—"}</td>
                  <td className="erp-td text-muted-foreground">{r.email ?? "—"}</td>
                  <td className="erp-td text-muted-foreground">{formatDateTime(r.created_at)}</td>
                  <td className="erp-td">
                    {isSuperAdmin && r.id !== user?.id ? (
                      <Select value={r.role} onValueChange={(v) => updateRole.mutate({ id: r.id, role: v, targetRole: r.role })}>
                        <SelectTrigger className="h-7 w-36 text-[12px]"><SelectValue /></SelectTrigger>
                        <SelectContent>{ROLES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : (<span className="text-[12px] font-medium">{r.role}</span>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}
// keep redirect import referenced for tree-shaking safety
export const _r = redirect;
