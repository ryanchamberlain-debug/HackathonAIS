// Bot traders so one person can try the full game, or to pad out a small party.

import { priceYes } from "./lmsr";
import type { GameState, PlayerAction } from "./types";

export const BOT_PROFILES = [
  { name: "Chad (Finance)", avatar: "🦈" },
  { name: "Tiffany CPA", avatar: "💅" },
  { name: "Crypto Kevin", avatar: "🪙" },
  { name: "Diamond Dave", avatar: "💎" },
  { name: "Margaret (HR)", avatar: "📋" },
  { name: "Intern Josh", avatar: "☕" },
  { name: "Hedge Fund Hal", avatar: "🎩" },
  { name: "Meme Lord Mo", avatar: "🐸" },
];

export function nextBotProfile(s: GameState) {
  const taken = new Set(s.players.map((p) => p.name));
  return BOT_PROFILES.find((b) => !taken.has(b.name)) ?? null;
}

function hash01(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

export function botActions(s: GameState, now: number): { pid: string; a: PlayerAction }[] {
  const out: { pid: string; a: PlayerAction }[] = [];
  const m = s.market;
  if (!m || m.result) return out;

  for (const bot of s.players) {
    if (!bot.isBot) continue;
    const isSubject = m.subjectId === bot.id;

    if (s.phase === "trading") {
      if (isSubject && m.card.kind === "truth" && !m.truthLocked && Math.random() < 0.35) {
        out.push({ pid: bot.id, a: { t: "truth", answer: Math.random() < 0.5 ? "YES" : "NO" } });
      }
      if (Math.random() > 0.2) continue;
      // Each bot holds a private belief about this market and trades toward it.
      let belief = 0.15 + hash01(m.id + bot.id) * 0.7;
      if (isSubject && m.truthLocked && m.truthAnswer) belief = m.truthAnswer === "YES" ? 0.95 : 0.05;
      const p = priceYes(m.qYes, m.qNo, m.b);
      const position = m.positions[bot.id];
      if (position && Math.random() < 0.18) {
        const side = position.yes >= position.no ? "YES" : "NO";
        const held = side === "YES" ? position.yes : position.no;
        if (held > 2) out.push({ pid: bot.id, a: { t: "trade", side, kind: "sell", shares: held * 0.5 } });
        continue;
      }
      const side = belief > p ? "YES" : "NO";
      const amount = Math.min(bot.cash, Math.round(15 + Math.random() * 110));
      if (amount >= 5) out.push({ pid: bot.id, a: { t: "trade", side, kind: "buy", amount } });
    } else if (s.phase === "performing" && isSubject) {
      if (m.card.kind === "truth" && !m.truthLocked) {
        out.push({ pid: bot.id, a: { t: "truth", answer: Math.random() < 0.5 ? "YES" : "NO" } });
      } else if (m.card.kind === "dare" && !m.dareDone && now - (m.closedAt ?? now) > 4000) {
        out.push({ pid: bot.id, a: Math.random() < 0.85 ? { t: "dareDone" } : { t: "chicken" } });
      }
    } else if (s.phase === "voting" && !isSubject && m.votes[bot.id] === undefined && Math.random() < 0.3) {
      out.push({ pid: bot.id, a: { t: "vote", legit: Math.random() < 0.72 } });
    }
  }
  return out;
}
