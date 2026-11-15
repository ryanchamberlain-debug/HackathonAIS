"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, YAxis } from "recharts";
import { playerById } from "@/lib/engine";
import { cents, money, shares } from "@/lib/format";
import type { GameState, Market, Player } from "@/lib/types";

export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const cls = size === "lg" ? "text-6xl sm:text-8xl" : size === "sm" ? "text-xl" : "text-3xl";
  return (
    <div className="relative inline-flex items-baseline gap-2 select-none">
      <span className={`font-display tracking-wide ${cls}`}>
        DARE<span className="text-yes">▲</span>STREET
      </span>
      {size !== "sm" && (
        <span className="absolute -right-6 -top-4 rotate-12 rounded bg-hot px-1.5 py-0.5 font-marker text-xs text-bg shadow">
          est. tonight
        </span>
      )}
    </div>
  );
}

export function Sticker({ children, color = "bg-gold", rotate = "-rotate-3" }: { children: React.ReactNode; color?: string; rotate?: string }) {
  return <span className={`inline-block ${rotate} rounded-md ${color} px-2 py-0.5 font-marker text-sm text-bg shadow-lg`}>{children}</span>;
}

export function Ticker({ items }: { items: string[] }) {
  const line = items.length ? items : ["DARESTREET INDEX OPENS FLAT"];
  const row = line.map((h, i) => (
    <span key={i} className="mx-6 whitespace-nowrap">
      <span className="text-gold">●</span> {h}
    </span>
  ));
  return (
    <div className="overflow-hidden border-y border-line bg-card/80 py-1.5 font-mono text-xs uppercase tracking-wider text-ink/80">
      <div className="marquee flex w-max">
        {row}
        {row}
      </div>
    </div>
  );
}

export function Avatar({ p, size = 36 }: { p: Pick<Player, "avatar" | "color"> | undefined; size?: number }) {
  if (!p) return null;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-card2"
      style={{ width: size, height: size, boxShadow: `0 0 0 2px ${p.color}`, fontSize: size * 0.55 }}
    >
      {p.avatar}
    </span>
  );
}

export function Countdown({ endsAt, offset = 0, now, total }: { endsAt: number | null; offset?: number; now: number; total?: number }) {
  if (!endsAt) return null;
  const left = Math.max(0, endsAt - (now + offset));
  const secs = Math.ceil(left / 1000);
  const frac = total ? Math.min(1, left / total) : null;
  return (
    <div className="flex items-center gap-2">
      <span className={`num text-lg font-bold ${secs <= 5 ? "text-no blink" : "text-ink"}`}>
        0:{String(secs).padStart(2, "0")}
      </span>
      {frac !== null && (
        <span className="h-1.5 w-20 overflow-hidden rounded-full bg-line">
          <span className="block h-full bg-gold transition-[width] duration-200" style={{ width: `${frac * 100}%` }} />
        </span>
      )}
    </div>
  );
}

export function OddsBar({ yes }: { yes: number }) {
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-no/70">
      <motion.div className="h-full bg-yes" animate={{ width: `${yes * 100}%` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
    </div>
  );
}

export function PriceChart({ market, height = 220 }: { market: Market; height?: number }) {
  const data = market.history.map((h) => ({ t: h.t, yes: Math.round(h.yes * 1000) / 10 }));
  if (data.length === 1) data.push({ ...data[0], t: data[0].t + 1 });
  const up = (data.at(-1)?.yes ?? 50) >= 50;
  const stroke = up ? "#42D98C" : "#F1646C";
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id={`g-${market.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fill: "#8A9BA8", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
          <ReferenceLine y={50} stroke="#26323B" strokeDasharray="4 4" />
          <Area type="stepAfter" dataKey="yes" stroke={stroke} strokeWidth={2.5} fill={`url(#g-${market.id})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Leaderboard({ state, highlight, compact }: { state: GameState; highlight?: string; compact?: boolean }) {
  const sorted = [...state.players].sort((a, b) => b.cash - a.cash);
  return (
    <ol className="space-y-1.5">
      <AnimatePresence initial={false}>
        {sorted.map((p, i) => {
          const prev = state.prevRanks[p.id];
          const delta = prev ? prev - (i + 1) : 0;
          return (
            <motion.li
              layout
              key={p.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className={`flex items-center gap-2.5 rounded-lg border px-2.5 ${compact ? "py-1.5" : "py-2.5"} ${p.id === highlight ? "border-gold/60 bg-gold/10" : "border-line bg-card"}`}
            >
              <span className="num w-5 text-right text-xs text-muted">{i + 1}</span>
              <Avatar p={p} size={compact ? 24 : 32} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {p.name}
                {p.isBot && <span className="ml-1 text-[10px] text-muted">BOT</span>}
              </span>
              {delta > 0 && <ArrowUp className="size-3.5 text-yes" />}
              {delta < 0 && <ArrowDown className="size-3.5 text-no" />}
              {delta === 0 && !compact && <Minus className="size-3.5 text-line" />}
              <span className="num text-sm font-semibold">{money(p.cash)}</span>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ol>
  );
}

export function TradeFeed({ state, limit = 8 }: { state: GameState; limit?: number }) {
  const trades = [...(state.market?.trades ?? [])].reverse().slice(0, limit);
  if (!trades.length) return <p className="py-6 text-center text-sm text-muted">No trades yet. Somebody be brave.</p>;
  return (
    <ul className="space-y-1">
      <AnimatePresence initial={false}>
        {trades.map((t) => {
          const p = playerById(state, t.playerId);
          return (
            <motion.li key={t.id} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 text-sm">
              <Avatar p={p} size={20} />
              <span className="truncate font-medium">{p?.name}</span>
              <span className="text-muted">{t.kind === "buy" ? "bought" : "sold"}</span>
              <span className={`num font-semibold ${t.side === "YES" ? "text-yes" : "text-no"}`}>
                {money(t.amount)} {t.side}
              </span>
              {t.insider && <span title="Insider trade">🕵️</span>}
              <span className="num ml-auto text-xs text-muted">{cents(t.priceAfter)}</span>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}

export function PositionLine({ market, pid }: { market: Market; pid: string }) {
  const p = market.positions[pid];
  if (!p || (p.yes < 0.01 && p.no < 0.01)) return <span className="text-muted">No position</span>;
  return (
    <span className="num">
      {p.yes >= 0.01 && <span className="text-yes">{shares(p.yes)} YES</span>}
      {p.yes >= 0.01 && p.no >= 0.01 && " · "}
      {p.no >= 0.01 && <span className="text-no">{shares(p.no)} NO</span>}
    </span>
  );
}

export function PnL({ value, className = "" }: { value: number; className?: string }) {
  return <span className={`num font-bold ${value >= 0 ? "text-yes" : "text-no"} ${className}`}>{money(value, { sign: true })}</span>;
}

export function KindBadge({ kind }: { kind: "truth" | "dare" }) {
  return kind === "truth" ? (
    <span className="rounded bg-[#5BC0FF]/15 px-2 py-0.5 font-mono text-xs font-bold tracking-widest text-[#5BC0FF]">TRUTH</span>
  ) : (
    <span className="rounded bg-hot/15 px-2 py-0.5 font-mono text-xs font-bold tracking-widest text-hot">DARE</span>
  );
}

export const PHASE_LABEL: Record<string, string> = {
  lobby: "PRE-MARKET",
  intro: "NEW IPO",
  trading: "MARKET OPEN",
  performing: "LIVE",
  voting: "JURY VOTING",
  resolution: "SETTLED",
  event: "BREAKING",
  leaderboard: "STANDINGS",
  final: "CLOSING BELL",
};
