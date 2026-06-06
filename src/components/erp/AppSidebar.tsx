import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard, BarChart3, Package, FolderTree, Boxes, History,
  ShoppingCart, Ticket, Users, UserCog, Settings, LogOut, User, Shield,
  Warehouse, ArrowRightLeft, ScrollText,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarFooter, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { ErpLogo } from "./ErpLogo";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

type Item = { title: string; url: string; icon: React.ComponentType<{ className?: string }> };

const core: Item[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
];
const catalog: Item[] = [
  { title: "Products", url: "/products", icon: Package },
  { title: "Categories", url: "/categories", icon: FolderTree },
  { title: "Stock Control", url: "/inventory", icon: Boxes },
  { title: "Warehouses", url: "/warehouses", icon: Warehouse },
  { title: "Transfers", url: "/transfers", icon: ArrowRightLeft },
  { title: "Damage Logs", url: "/breakage-history", icon: History },
];
const sales: Item[] = [
  { title: "Orders", url: "/orders", icon: ShoppingCart },
  { title: "Checkout (POS)", url: "/checkout", icon: ShoppingCart },
  { title: "Promotions", url: "/discounts", icon: Ticket },
  { title: "Customers", url: "/customers", icon: Users },
];
const personal: Item[] = [
  { title: "My Profile", url: "/profile", icon: User },
];
const admin: Item[] = [
  { title: "Personnel", url: "/staff", icon: UserCog },
  { title: "Audit Log", url: "/audit-log", icon: ScrollText },
  { title: "Security", url: "/security", icon: Shield },
  { title: "System Config", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isSuperAdmin, profile } = useAuth();
  const isActive = (url: string) => pathname === url || pathname.startsWith(url + "/");

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const groups: Array<{ label: string; items: Item[] }> = [
    { label: "Core Operations", items: core },
    { label: "Inventory & Catalog", items: catalog },
    { label: "Sales & CRM", items: sales },
    { label: "Account", items: personal },
  ];
  if (isSuperAdmin) groups.push({ label: "Administration", items: admin });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className={`border-b border-sidebar-border ${collapsed ? "px-1.5 py-2.5 flex justify-center" : "px-3 py-3"}`}>
        <ErpLogo showLabel={!collapsed} />
      </SidebarHeader>

      <SidebarContent className={collapsed ? "px-1 py-2" : "px-1.5"}>
        {groups.map((g, gi) => (
          <SidebarGroup key={g.label} className={collapsed ? "py-1" : ""}>
            <AnimatePresence initial={false}>
              {!collapsed && (
                <motion.div
                  key="label"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <SidebarGroupLabel className="text-[9px] uppercase tracking-[0.22em] text-sidebar-foreground/45 font-semibold px-3 mb-1">
                    {g.label}
                  </SidebarGroupLabel>
                </motion.div>
              )}
            </AnimatePresence>
            {collapsed && gi > 0 && (
              <div className="mx-auto mb-1 h-px w-6 bg-sidebar-border/60" />
            )}
            <SidebarGroupContent>
              <SidebarMenu className={collapsed ? "gap-1" : ""}>
                {g.items.map((item, i) => {
                  const active = isActive(item.url);
                  return (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.title}
                        className={collapsed
                          ? "h-9 w-9 mx-auto justify-center rounded-sm transition-colors data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground"
                          : "h-8 rounded-sm transition-colors text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:font-medium"}
                      >
                        <Link to={item.url} className={collapsed ? "flex items-center justify-center" : "flex items-center gap-3 pl-3"}>
                          <motion.span
                            initial={false}
                            whileHover={{ scale: collapsed ? 1.1 : 1 }}
                            whileTap={{ scale: 0.92 }}
                            transition={{ type: "spring", stiffness: 400, damping: 22 }}
                            className="flex shrink-0 items-center justify-center"
                          >
                            <item.icon className="h-[15px] w-[15px] opacity-75" />
                          </motion.span>
                          <AnimatePresence initial={false}>
                            {!collapsed && (
                              <motion.span
                                initial={{ opacity: 0, x: -6 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -6 }}
                                transition={{ duration: 0.12, delay: i * 0.01 }}
                                className="text-[13px] tracking-tight"
                              >
                                {item.title}
                              </motion.span>
                            )}
                          </AnimatePresence>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className={`border-t border-sidebar-border ${collapsed ? "px-1 py-2" : "px-3 py-3"}`}>
        <AnimatePresence initial={false}>
          {!collapsed && profile && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-3 px-1 pb-3 text-[11px]"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pale-sky text-navy" style={{ fontFamily: "'DM Serif Display', serif", fontSize: 14 }}>
                {(profile.full_name ?? profile.email ?? "?").slice(0,1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-medium text-sidebar-foreground/90">{profile.full_name ?? profile.email}</div>
                <div className="truncate text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/55">{profile.role}</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={signOut}
              tooltip="Sign out"
              className={collapsed
                ? "h-9 w-9 mx-auto justify-center rounded-sm text-destructive hover:bg-destructive/10"
                : "h-8 rounded-sm pl-3 text-destructive hover:bg-destructive/10 hover:text-destructive"}
            >
              <LogOut className="h-[15px] w-[15px]" />
              {!collapsed && <span className="text-[13px]">Sign out</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

