import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/erp/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/erp-errors";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "My Profile — ERP System" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { profile, user } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [pic, setPic] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? "");
      setEmail(profile.email ?? "");
      setPic(profile.profile_pic);
    }
  }, [profile]);

  const save = useMutation({
    mutationFn: async (input: { full_name: string; profile_pic: string | null; password?: string }) => {
      if (!user) throw new Error("Not authenticated");
      const { error: p1 } = await supabase.from("profiles").update({ full_name: input.full_name, profile_pic: input.profile_pic }).eq("id", user.id);
      if (p1) throw p1;
      if (input.password && input.password.trim()) {
        const { error: p2 } = await supabase.auth.updateUser({ password: input.password });
        if (p2) throw p2;
      }
    },
    onSuccess: () => toast.success("Identity record synchronized"),
    onError: (e) => toast.error(humanizeError(e)),
  });

  async function handlePic(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { toast.error("Image must be under 2MB"); return; }
    const r = new FileReader();
    r.onload = () => setPic(String(r.result ?? ""));
    r.readAsDataURL(f);
  }

  return (
    <AppShell title="My Profile" description="Manage identity, contact, and authorization credentials.">
      <div className="max-w-2xl rounded-lg border border-border bg-card p-5">
        <form onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          save.mutate({ full_name: fullName, profile_pic: pic, password: String(fd.get("password") ?? "") });
        }} className="grid grid-cols-2 gap-4">
          <div className="col-span-2 flex items-center gap-4">
            {pic ? <img src={pic} className="h-16 w-16 rounded-full object-cover" alt="" /> : <div className="h-16 w-16 rounded-full bg-muted" />}
            <Input type="file" accept="image/*" onChange={handlePic} className="max-w-xs" />
          </div>
          <div><Label>Full Name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} required /></div>
          <div><Label>Email</Label><Input value={email} disabled /></div>
          <div className="col-span-2"><Label>New Password (optional)</Label><Input name="password" type="password" placeholder="Leave blank to keep current" minLength={8} /></div>
          <div className="col-span-2"><Label>Role</Label><div className="rounded-md bg-secondary px-3 py-2 text-[13px] font-medium">{profile?.role ?? "—"}</div></div>
          <div className="col-span-2"><Button type="submit" disabled={save.isPending}>{save.isPending ? "Synchronizing…" : "Save Changes"}</Button></div>
        </form>
      </div>
    </AppShell>
  );
}
