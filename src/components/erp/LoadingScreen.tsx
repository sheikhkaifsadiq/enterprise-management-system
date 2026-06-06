import { motion } from "motion/react";

interface Props {
  label?: string;
  fullscreen?: boolean;
}

export function LoadingScreen({ label = "Loading workspace", fullscreen = false }: Props) {
  return (
    <div
      className={
        fullscreen
          ? "fixed inset-0 z-50 flex items-center justify-center bg-background"
          : "flex min-h-[60vh] w-full items-center justify-center"
      }
    >
      <div className="flex flex-col items-center gap-5">
        <div className="relative h-16 w-16">
          <motion.div
            className="absolute inset-0 rounded-2xl bg-primary/15 blur-xl"
            animate={{ scale: [1, 1.25, 1], opacity: [0.5, 0.9, 0.5] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute inset-0 rounded-2xl border border-primary/25"
            animate={{ rotate: 360 }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          />
          <motion.div
            className="absolute inset-1.5 rounded-xl border-2 border-transparent"
            style={{
              background:
                "conic-gradient(from 0deg, transparent 0deg, hsl(var(--primary)/0.0) 60deg, hsl(var(--primary)) 360deg)",
              WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
              WebkitMaskComposite: "xor",
              maskComposite: "exclude",
              padding: "2px",
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground text-[11px] font-extrabold tracking-tight"
              style={{ letterSpacing: "-0.04em" }}
            >
              ERP
            </div>
          </motion.div>
        </div>

        <div className="text-center">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-[13px] font-semibold tracking-tight text-foreground"
          >
            {label}
          </motion.div>
          <div className="mt-2 flex justify-center gap-1">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="h-1 w-1 rounded-full bg-muted-foreground/70"
                animate={{ opacity: [0.2, 1, 0.2], y: [0, -2, 0] }}
                transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.15 }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
