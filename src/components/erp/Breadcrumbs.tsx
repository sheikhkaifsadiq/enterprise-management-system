import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronRight, Home } from "lucide-react";

export function Breadcrumbs() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const segments = pathname.split("/").filter(Boolean);

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
      <Link to="/dashboard" className="flex items-center gap-1 hover:text-foreground">
        <Home className="h-3.5 w-3.5" />
      </Link>
      {segments.map((seg, i) => {
        const href = "/" + segments.slice(0, i + 1).join("/");
        const last = i === segments.length - 1;
        return (
          <span key={href} className="flex items-center gap-1.5">
            <ChevronRight className="h-3 w-3 opacity-50" />
            {last ? (
              <span className="font-medium text-foreground capitalize">{decodeURIComponent(seg)}</span>
            ) : (
              <Link to={href as never} className="capitalize hover:text-foreground">
                {decodeURIComponent(seg)}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
