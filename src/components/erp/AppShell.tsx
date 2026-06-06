import type { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { Breadcrumbs } from "./Breadcrumbs";
import { OfflineBanner } from "./OfflineBanner";

interface Props {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function AppShell({ title, description, actions, children }: Props) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-[color-mix(in_oklab,var(--color-linen)_85%,transparent)] px-5 backdrop-blur">
            <SidebarTrigger className="-ml-1 h-7 w-7" />
            <div className="h-4 w-px bg-border" />
            <Breadcrumbs />
          </header>
          <OfflineBanner />
          <main className="flex-1 px-8 py-8">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
              <div>
                <div className="erp-eyebrow text-[color-mix(in_oklab,var(--color-navy)_55%,transparent)] mb-2">Overview</div>
                <h1 className="font-display text-[40px] leading-none tracking-tight text-foreground" style={{ fontFamily: "'DM Serif Display', serif" }}>
                  {title}
                </h1>
                {description && (
                  <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-muted-foreground">{description}</p>
                )}
              </div>
              {actions && <div className="flex items-center gap-2">{actions}</div>}
            </div>
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

