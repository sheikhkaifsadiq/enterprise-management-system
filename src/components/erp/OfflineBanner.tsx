import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WifiOff, CloudUpload, CheckCircle2 } from "lucide-react";
import { getQueue, flushQueue } from "@/lib/offline-store";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export function OfflineBanner() {
  const { user } = useAuth();
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [queued, setQueued] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [justSynced, setJustSynced] = useState(false);

  useEffect(() => {
    const refresh = async () => setQueued((await getQueue()).length);
    refresh();
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    window.addEventListener("erp:queue-changed", refresh as EventListener);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener("erp:queue-changed", refresh as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!online || queued === 0 || syncing) return;
    setSyncing(true);
    flushQueue(user?.id ?? null)
      .then(({ synced, failed }) => {
        if (synced > 0) {
          toast.success(`Synced ${synced} queued order${synced > 1 ? "s" : ""}`);
          setJustSynced(true);
          setTimeout(() => setJustSynced(false), 2500);
        }
        if (failed > 0) toast.error(`${failed} queued order${failed > 1 ? "s" : ""} failed to sync`);
      })
      .finally(() => setSyncing(false));
  }, [online, queued, syncing, user?.id]);

  const show = !online || queued > 0 || syncing || justSynced;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: -24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -24, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className={
            !online
              ? "flex items-center gap-2 border-b border-warning/40 bg-warning/15 px-4 py-1.5 text-[12px] font-medium text-warning-foreground"
              : justSynced
                ? "flex items-center gap-2 border-b border-emerald-500/40 bg-emerald-500/10 px-4 py-1.5 text-[12px] font-medium text-emerald-700 dark:text-emerald-300"
                : "flex items-center gap-2 border-b border-primary/30 bg-primary/10 px-4 py-1.5 text-[12px] font-medium text-foreground"
          }
        >
          {!online ? (
            <>
              <WifiOff className="h-3.5 w-3.5" />
              Offline Mode — POS will queue orders locally and sync when reconnected.
              {queued > 0 && <span className="ml-auto rounded bg-warning/30 px-1.5 py-0.5 text-[10px]">{queued} pending</span>}
            </>
          ) : justSynced ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" />
              All queued orders synced.
            </>
          ) : (
            <>
              <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.6, ease: "linear" }}>
                <CloudUpload className="h-3.5 w-3.5" />
              </motion.span>
              Syncing {queued} queued order{queued > 1 ? "s" : ""}…
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
