import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type StaffRole = "Super Admin" | "Admin" | "Manager" | "Cashier";

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  username: string | null;
  phone: string | null;
  profile_pic: string | null;
  role: StaffRole;
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) { setProfile(null); return; }
    supabase
      .from("profiles")
      .select("id,email,full_name,username,phone,profile_pic,role")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setProfile(data as unknown as Profile | null));
  }, [user]);

  const role = (profile?.role ?? "Cashier") as StaffRole;
  const isSuperAdmin = role === "Super Admin";
  const isAdmin = isSuperAdmin || role === "Admin";
  const isManager = isAdmin || role === "Manager";

  return {
    session,
    user,
    profile,
    role,
    loading,
    isSuperAdmin,
    isAdmin,
    isManager,
    canEditInventory: isManager,
    canSell: isManager || role === "Cashier",
  };
}
