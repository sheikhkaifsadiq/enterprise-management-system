import { useEffect, useRef } from "react";
import bwipjs from "bwip-js/browser";

/**
 * Renders a Code128 barcode for a product SKU into a canvas.
 * Used in the Products table + POS to speed up scanner-based checkout.
 */
export function Barcode({ value, height = 40, scale = 2 }: { value: string; height?: number; scale?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      bwipjs.toCanvas(ref.current, {
        bcid: "code128",
        text: value,
        scale,
        height,
        includetext: true,
        textxalign: "center",
        textsize: 8,
        backgroundcolor: "FFFFFF",
      });
    } catch {
      /* invalid SKU — render nothing */
    }
  }, [value, height, scale]);
  return <canvas ref={ref} aria-label={`Barcode ${value}`} />;
}
