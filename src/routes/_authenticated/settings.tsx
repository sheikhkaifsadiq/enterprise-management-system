import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/erp/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/erp-errors";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "System Config — ERP System" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("settings").select("*").eq("id", 1).maybeSingle();
      if (error) throw error;
      return data ?? { company_name: "ERP System & Sanitary", whatsapp_number: "" };
    },
  });
  const [company, setCompany] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  useEffect(() => { if (data) { setCompany(data.company_name ?? ""); setWhatsapp(data.whatsapp_number ?? ""); } }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("settings").update({ company_name: company, whatsapp_number: whatsapp }).eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Infrastructure synchronized"); qc.invalidateQueries({ queryKey: ["settings"] }); },
    onError: (e) => toast.error(humanizeError(e)),
  });

  return (
    <AppShell title="System Configuration" description="Corporate identity and master CRM redirection parameters.">
      <div className="max-w-xl rounded-lg border border-border bg-card p-5">
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
          <div><Label>Company Name</Label><Input value={company} onChange={(e) => setCompany(e.target.value)} disabled={!isAdmin} /></div>
          <div><Label>WhatsApp Number</Label><Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} disabled={!isAdmin} placeholder="+92..." /></div>
          {isAdmin ? <Button type="submit" disabled={save.isPending}>{save.isPending ? "Synchronizing…" : "Save Configuration"}</Button>
            : <div className="rounded-md bg-amber-50 p-3 text-[12px] text-amber-800">Admin clearance required to modify.</div>}
        </form>
      </div>
    </AppShell>
  );
}
