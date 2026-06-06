// Guarded service worker registration — refuses to run in dev / preview / iframe.
const SW_URL = "/sw.js";

function isUnsafeContext(): boolean {
  if (!import.meta.env.PROD) return true;
  if (typeof window === "undefined") return true;
  try {
    if (window.top !== window.self) return true;
  } catch {
    return true;
  }
  const host = window.location.hostname;
  if (
    host.startsWith("id-preview--") ||
    host.startsWith("preview--")
  ) return true;
  if (new URLSearchParams(window.location.search).get("sw") === "off") return true;
  return false;
}

export async function registerPWA(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  if (isUnsafeContext()) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        regs
          .filter((r) => r.active?.scriptURL?.endsWith(SW_URL) || r.installing?.scriptURL?.endsWith(SW_URL) || r.waiting?.scriptURL?.endsWith(SW_URL))
          .map((r) => r.unregister()),
      );
    } catch {
      /* noop */
    }
    return;
  }
  try {
    await navigator.serviceWorker.register(SW_URL, { scope: "/" });
  } catch (e) {
    console.warn("SW register failed", e);
  }
}
