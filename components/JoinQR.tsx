"use client";

import { motion } from "framer-motion";
import { X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useSyncExternalStore } from "react";

const noop = () => () => {};

/** Full-screen join card for late arrivals. Closes on click or Escape. */
export function JoinOverlay({ url, code, onClose }: { url: string; code: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Join this game"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-bg/95 p-6 text-center backdrop-blur"
    >
      <button aria-label="Close" onClick={onClose} className="absolute right-5 top-5 rounded-full border border-line p-2 text-muted hover:text-ink">
        <X className="size-5" />
      </button>
      <p className="font-display text-5xl tracking-wide sm:text-6xl">SCAN TO JOIN</p>
      <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="rounded-2xl bg-ink p-4">
        <QRCodeSVG value={url} size={320} />
      </motion.div>
      <p className="num text-7xl font-bold tracking-[0.25em]">{code}</p>
      <p className="text-lg text-muted">
        or go to <span className="text-gold">{url.replace(/^https?:\/\//, "").replace(/\/play\?code=.*/, "")}</span> and enter the code
      </p>
      <p className="text-sm text-muted">Tap anywhere to close</p>
    </motion.div>
  );
}

/** Home page QR: sends phones straight to the join screen on this site. */
export function SiteQR() {
  const origin = useSyncExternalStore(noop, () => window.location.origin, () => null);
  const url = origin && `${origin}/play`;
  if (!url) return <div className="size-[132px] rounded-xl bg-card2" />;
  return (
    <div className="flex items-center gap-4">
      <div className="rounded-xl bg-ink p-2.5">
        <QRCodeSVG value={url} size={112} />
      </div>
      <p className="max-w-[14rem] text-sm text-muted">Scan with your phone camera to open the join screen, then type the code from the host&apos;s screen.</p>
    </div>
  );
}
