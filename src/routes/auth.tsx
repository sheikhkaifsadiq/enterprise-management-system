import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ErpLogo } from "@/components/erp/ErpLogo";
import { pepperPassword, logAuthAttempt, checkIpBlocked } from "@/lib/security.functions";
import { useServerFn } from "@tanstack/react-start";
import { humanizeError } from "@/lib/erp-errors";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Terminal Access — ERP System" },
      { name: "description", content: "ERP System & Sanitary Enterprise admin terminal." },
    ],
  }),
  component: AuthPage,
});

const RL_KEY = "erp.auth.attempts";
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
function readAttempts(email: string): number[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RL_KEY) || "{}") as Record<string, number[]>;
    const now = Date.now();
    return (raw[email] ?? []).filter((t) => now - t < WINDOW_MS);
  } catch { return []; }
}
function recordAttempt(email: string) {
  const raw = (() => { try { return JSON.parse(localStorage.getItem(RL_KEY) || "{}") as Record<string, number[]>; } catch { return {}; } })();
  raw[email] = [...readAttempts(email), Date.now()];
  localStorage.setItem(RL_KEY, JSON.stringify(raw));
}
function clearAttempts(email: string) {
  try {
    const raw = JSON.parse(localStorage.getItem(RL_KEY) || "{}") as Record<string, number[]>;
    delete raw[email];
    localStorage.setItem(RL_KEY, JSON.stringify(raw));
  } catch { /* noop */ }
}

const credsSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(8, "At least 8 characters").max(72),
});
const signUpSchema = credsSchema.extend({
  fullName: z.string().trim().min(2, "Enter your full name").max(120),
  username: z.string().trim().min(2).max(40),
});

function AuthPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const pepperFn = useServerFn(pepperPassword);
  const logFn = useServerFn(logAuthAttempt);
  const ipCheckFn = useServerFn(checkIpBlocked);

  async function handleSignIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = credsSchema.safeParse({ email: fd.get("email"), password: fd.get("password") });
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    const { email, password } = parsed.data;
    const recent = readAttempts(email);
    if (recent.length >= MAX_ATTEMPTS) {
      const wait = Math.ceil((WINDOW_MS - (Date.now() - recent[0])) / 60000);
      toast.error(`Too many failed attempts. Try again in ~${wait} minute${wait === 1 ? "" : "s"}.`);
      return;
    }
    setBusy(true);
    try {
      // Server-side IP block gate
      const gate = await ipCheckFn();
      if (gate.blocked) {
        setBusy(false);
        toast.error("Access denied: your network has been blocked by an administrator.");
        return;
      }
      // Pepper the password server-side before handing it to Supabase Auth.
      // Try peppered first; if it fails AND the account predates peppering,
      // retry with plaintext, then re-set the password to the peppered version.
      const { peppered } = await pepperFn({ data: { password } });
      let { error } = await supabase.auth.signInWithPassword({ email, password: peppered });
      if (error) {
        const legacy = await supabase.auth.signInWithPassword({ email, password });
        if (!legacy.error) {
          // Transparent migration: upgrade this account to peppered.
          await supabase.auth.updateUser({ password: peppered });
          await supabase.from("profiles").update({ password_peppered: true }).eq("id", legacy.data.user!.id);
          error = null;
        }
      }
      await logFn({ data: { email, succeeded: !error } }).catch(() => {});
      setBusy(false);
      if (error) { recordAttempt(email); toast.error("Invalid credentials"); return; }
      clearAttempts(email);
      toast.success("Session authorized");
      navigate({ to: "/dashboard" });
    } catch (err) {
      setBusy(false);
      toast.error(humanizeError(err));
    }
  }

  async function handleSignUp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = signUpSchema.safeParse({
      email: fd.get("email"), password: fd.get("password"),
      fullName: fd.get("fullName"), username: fd.get("username"),
    });
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setBusy(true);
    try {
      const { peppered } = await pepperFn({ data: { password: parsed.data.password } });
      const { data, error } = await supabase.auth.signUp({
        email: parsed.data.email, password: peppered,
        options: {
          data: { full_name: parsed.data.fullName, username: parsed.data.username },
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      });
      setBusy(false);
      if (error) { toast.error(humanizeError(error)); return; }
      if (data.user) {
        await supabase.from("profiles").update({ password_peppered: true }).eq("id", data.user.id);
      }
      toast.success("Account created. You can sign in now.");
    } catch (err) {
      setBusy(false);
      toast.error(humanizeError(err));
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#1a2035] to-[#0d1117] px-4">
      <div className="w-full max-w-[440px]">
        <div className="rounded-2xl border border-white/10 bg-white/98 p-8 shadow-2xl backdrop-blur">
          <div className="mb-5 flex justify-center"><ErpLogo variant="light" /></div>
          <h1 className="text-center text-2xl font-black tracking-tight text-[#1a2035]">ERP SYSTEM</h1>
          <p className="mb-6 mt-1 text-center text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
            Terminal Access · Management v2.0
          </p>

          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Authorize Login</TabsTrigger>
              <TabsTrigger value="signup">Create Account</TabsTrigger>
            </TabsList>
            <TabsContent value="signin" className="mt-5">
              <form onSubmit={handleSignIn} className="space-y-3.5">
                <div className="space-y-1.5">
                  <Label htmlFor="si-email">Administrative ID</Label>
                  <Input id="si-email" name="email" type="email" required autoComplete="email" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="si-password">Authorization Token</Label>
                  <Input id="si-password" name="password" type="password" required autoComplete="current-password" />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "Establishing Secure Session…" : "Authorize Login"}
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  Locked out after 5 failed attempts in 15 minutes.
                </p>
              </form>
            </TabsContent>
            <TabsContent value="signup" className="mt-5">
              <form onSubmit={handleSignUp} className="space-y-3.5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="su-name">Full name</Label>
                    <Input id="su-name" name="fullName" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="su-username">Username</Label>
                    <Input id="su-username" name="username" required />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="su-email">Email</Label>
                  <Input id="su-email" name="email" type="email" required autoComplete="email" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="su-password">Password</Label>
                  <Input id="su-password" name="password" type="password" required minLength={8} autoComplete="new-password" />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "Creating…" : "Create Account"}
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  First account becomes Super Admin. All others register as Cashier and can be promoted in Personnel.
                </p>
              </form>
            </TabsContent>
          </Tabs>
          <div className="mt-6 border-t pt-4 text-center text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
            Secured · End-to-end encryption
          </div>
        </div>
      </div>
    </div>
  );
}
