import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";
import { createHmac } from "node:crypto";
import { z } from "zod";

const PasswordSchema = z.object({
  password: z.string().min(1).max(256),
});

function pepper(password: string): string {
  const secret = process.env.PEPPER_SECRET;
  if (!secret) throw new Error("PEPPER_SECRET not configured");
  // HMAC-SHA256(password, PEPPER_SECRET) → base64. Result is what we hand to
  // Supabase Auth. Even with a full DB dump, brute-forcing requires the pepper.
  return createHmac("sha256", secret).update(password, "utf8").digest("base64");
}

/** Pepper-hash a plaintext password. Used by both sign-up and sign-in. */
export const pepperPassword = createServerFn({ method: "POST" })
  .inputValidator((d) => PasswordSchema.parse(d))
  .handler(async ({ data }) => ({ peppered: pepper(data.password) }));

const AttemptSchema = z.object({
  email: z.string().trim().email().max(255),
  succeeded: z.boolean(),
});

/** Log auth attempt + return whether caller IP is blocked. */
export const logAuthAttempt = createServerFn({ method: "POST" })
  .inputValidator((d) => AttemptSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let ip: string | null = null;
    try { ip = getRequestIP({ xForwardedFor: true }) ?? null; } catch { ip = null; }

    await supabaseAdmin.from("auth_attempts").insert({
      email: data.email.toLowerCase(),
      ip,
      succeeded: data.succeeded,
    });

    if (!ip) return { ip: null, blocked: false };
    const { data: row } = await supabaseAdmin
      .from("blocked_ips").select("ip").eq("ip", ip).maybeSingle();
    return { ip, blocked: !!row };
  });

/** Check whether the caller IP is currently blocked (pre-login gate). */
export const checkIpBlocked = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let ip: string | null = null;
  try { ip = getRequestIP({ xForwardedFor: true }) ?? null; } catch { ip = null; }
  if (!ip) return { ip: null, blocked: false };
  const { data } = await supabaseAdmin
    .from("blocked_ips").select("ip").eq("ip", ip).maybeSingle();
  return { ip, blocked: !!data };
});
