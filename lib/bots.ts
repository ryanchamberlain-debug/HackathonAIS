// Bot traders so one person can try the full game, or to pad out a small party.

import { MIN_BET, odds } from "./parimutuel";
import type { GameState, PlayerAction } from "./types";

// The crew: auto-traders who place bets on their own. Add them from the host lobby.
export const BOT_PROFILES = [
  { name: "Payton", avatar: "🦈" },
  { name: "Varun", avatar: "🐂" },
  { name: "Rose", avatar: "🌹" },
  { name: "Ryan", avatar: "😎" },
  { name: "Inesh", avatar: "🦊" },
  { name: "Hamza", avatar: "🦁" },
  { name: "Marshall", avatar: "🐻" },
  { name: "Alex", avatar: "🐸" },
  { name: "Jin", avatar: "🐼" },
  { name: "Kassem", avatar: "🐺" },
  { name: "Thu", avatar: "🦄" },
  { name: "Eshmom", avatar: "🐙" },
]

export function nextBotProfile(s: GameState) {
  const taken = new Set(s.players.map((p) => p.name.toLowerCase()));
  return BOT_PROFILES.find((b) => !taken.has(b.name.toLowerCase())) ?? null;
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
      if (isSubject || Math.random() > 0.2) continue; // targets can't bet (backend rule)
      // Each bot holds a private belief and backs the side the pot is underrating.
      const belief = 0.15 + hash01(m.id + bot.id) * 0.7;
      const side = belief > odds(m.pools).YES ? "YES" : "NO";
      const amount = Math.min(Math.floor(bot.cash), 10 + Math.floor(Math.random() * 11) * 10);
      if (amount >= MIN_BET) out.push({ pid: bot.id, a: { t: "bet", side, amount } });
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
