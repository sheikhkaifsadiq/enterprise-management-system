interface Props { variant?: "light" | "dark"; showLabel?: boolean }

export function ErpLogo({ variant = "dark", showLabel = true }: Props) {
  const isLight = variant === "light";
  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-sm ${
          isLight
            ? "bg-primary text-primary-foreground"
            : "bg-sidebar-primary text-sidebar-primary-foreground"
        }`}
        style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, lineHeight: 1 }}
      >
        E
      </div>
      {showLabel && (
        <div className="leading-tight">
          <div
            className={`text-[15px] tracking-tight ${
              isLight ? "text-foreground" : "text-sidebar-foreground"
            }`}
            style={{ fontFamily: "'DM Serif Display', serif" }}
          >
            ERP System
          </div>
          <div
            className={`text-[9px] uppercase tracking-[0.22em] font-semibold ${
              isLight ? "text-muted-foreground" : "text-sidebar-foreground/55"
            }`}
          >
            Management Suite
          </div>
        </div>
      )}
    </div>
  );
}
