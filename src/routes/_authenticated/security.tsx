import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { motion } from "motion/react";
import { Shield, Ban, Trash2, Activity } from "lucide-react";
import { AppShell } from "@/components/erp/AppShell";
import { TableSkeleton } from "@/components/erp/TableSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { humanizeError } from "@/lib/erp-errors";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/security")({
  head: () => ({ meta: [{ title: "Security — ERP System" }] }),
  component: SecurityPage,
});

type Attempt = { id: number; email: string; ip: string | null; succeeded: boolean; created_at: string };
type Blocked = { id: string; ip: string; reason: string | null; created_at: string };

function SecurityPage() {
  const { isSuperAdmin, user } = useAuth();
  const qc = useQueryClient();
  const [ipInput, setIpInput] = useState("");
  const [reason, setReason] = useState("");

  const { data: attempts = [], isLoading: lA } = useQuery({
    queryKey: ["auth-attempts"],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("auth_attempts").select("id,email,ip,succeeded,created_at")
        .order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []) as Attempt[];
    },
  });

  const { data: blocked = [], isLoading: lB } = useQuery({
    queryKey: ["blocked-ips"],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blocked_ips").select("id,ip,reason,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Blocked[];
    },
  });

  const blockIp = useMutation({
    mutationFn: async ({ ip, reason }: { ip: string; reason: string }) => {
      const { error } = await supabase.from("blocked_ips").insert({ ip, reason: reason || null, blocked_by: user?.id ?? null });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("IP blocked"); setIpInput(""); setReason(""); qc.invalidateQueries({ queryKey: ["blocked-ips"] }); },
    onError: (e) => toast.error(humanizeError(e)),
  });

  const unblockIp = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("blocked_ips").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("IP unblocked"); qc.invalidateQueries({ queryKey: ["blocked-ips"] }); },
    onError: (e) => toast.error(humanizeError(e)),
  });

  if (!isSuperAdmin) {
    return (
      <AppShell title="Security Dashboard" description="Cryptographic & access audit center.">
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-900">
          Super Admin clearance required.
        </div>
      </AppShell>
    );
  }

  const failed = attempts.filter((a) => !a.succeeded).length;
  const succeeded = attempts.length - failed;
  const uniqueIps = new Set(attempts.map((a) => a.ip).filter(Boolean)).size;

  return (
    <AppShell
      title="Security Dashboard"
      description="HMAC-SHA256 peppered passwords · Login audit trail · Network blocking"
    >
      {/* Crypto banner */}
      <motion.div
        initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
        className="mb-4 flex items-center gap-3 rounded-lg border border-emerald-200 bg-gradient-to-r from-emerald-50 to-white p-3"
      >
        <Shield className="h-5 w-5 text-emerald-600" />
        <div className="text-[12px]">
          <div className="font-semibold text-emerald-900">Salt + Pepper cryptography active</div>
          <div className="text-emerald-700/80">Passwords are HMAC-SHA256 peppered server-side before Supabase Auth applies bcrypt salting.</div>
        </div>
      </motion.div>

      {/* KPIs */}
      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        {[
          { label: "Attempts (24h+)", value: attempts.length, tone: "text-slate-900" },
          { label: "Successful", value: succeeded, tone: "text-emerald-600" },
          { label: "Failed", value: failed, tone: "text-red-600" },
          { label: "Unique IPs", value: uniqueIps, tone: "text-indigo-600" },
        ].map((k) => (
          <div key={k.label} className="rounded-lg border border-border bg-card p-3.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{k.label}</div>
            <div className={`mt-1 text-2xl font-bold ${k.tone}`}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Block IP form */}
      <div className="mb-5 rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold">
          <Ban className="h-4 w-4 text-red-600" /> Block an IP address
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input placeholder="e.g. 203.0.113.42" value={ipInput} onChange={(e) => setIpInput(e.target.value)} className="sm:max-w-[200px]" />
          <Input placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button
            onClick={() => ipInput.trim() && blockIp.mutate({ ip: ipInput.trim(), reason: reason.trim() })}
            disabled={blockIp.isPending || !ipInput.trim()}
            className="bg-red-600 hover:bg-red-700"
          >
            Block IP
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Blocked list */}
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border bg-slate-50 px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-slate-700">
            Blocked IPs ({blocked.length})
          </div>
          {lB ? <TableSkeleton rows={3} cols={3} /> : blocked.length === 0 ? (
            <div className="p-6 text-center text-[12px] text-muted-foreground">No IPs blocked.</div>
          ) : (
            <table className="erp-table">
              <thead><tr><th className="erp-th">IP</th><th className="erp-th">Reason</th><th className="erp-th">Blocked</th><th className="erp-th"></th></tr></thead>
              <tbody>
                {blocked.map((b) => (
                  <tr key={b.id} className="erp-row-hover">
                    <td className="erp-td font-mono text-[12px]">{b.ip}</td>
                    <td className="erp-td text-muted-foreground">{b.reason ?? "—"}</td>
                    <td className="erp-td text-muted-foreground">{formatDateTime(b.created_at)}</td>
                    <td className="erp-td text-right">
                      <Button size="sm" variant="ghost" onClick={() => unblockIp.mutate(b.id)} className="h-7 text-red-600">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent attempts */}
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border bg-slate-50 px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-slate-700">
            <span><Activity className="mr-1 inline h-3.5 w-3.5" /> Recent attempts</span>
            <span className="text-[10px] font-normal text-muted-foreground">last 200</span>
          </div>
          {lA ? <TableSkeleton rows={6} cols={4} /> : attempts.length === 0 ? (
            <div className="p-6 text-center text-[12px] text-muted-foreground">No attempts logged yet.</div>
          ) : (
            <div className="max-h-[480px] overflow-y-auto">
              <table className="erp-table">
                <thead className="sticky top-0 bg-card"><tr><th className="erp-th">Email</th><th className="erp-th">IP</th><th className="erp-th">Status</th><th className="erp-th">When</th></tr></thead>
                <tbody>
                  {attempts.map((a) => (
                    <tr key={a.id} className="erp-row-hover">
                      <td className="erp-td truncate max-w-[160px]">{a.email}</td>
                      <td className="erp-td font-mono text-[11px]">{a.ip ?? "—"}</td>
                      <td className="erp-td">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${a.succeeded ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                          {a.succeeded ? "OK" : "FAIL"}
                        </span>
                      </td>
                      <td className="erp-td text-[11px] text-muted-foreground">{formatDateTime(a.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
