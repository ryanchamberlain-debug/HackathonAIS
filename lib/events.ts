import type { ChaosEvent, GameState, Player } from "./types";
import { STARTING_CASH } from "./types";
import { pick, shuffle, uid } from "./format";

type Maker = (players: Player[], state: GameState) => ChaosEvent | null;

const byCash = (ps: Player[]) => [...ps].sort((a, b) => b.cash - a.cash);
const r = (n: number) => Math.round(n);

const makers: Maker[] = [
  (ps) => {
    const top = byCash(ps)[0];
    if (!top || top.cash < 200) return null;
    const fine = r(top.cash * 0.15);
    return {
      id: uid("ev"),
      emoji: "🚨",
      title: "SEC INVESTIGATION",
      body: `Federal agents raid ${top.name}'s group chat. ${top.name} pays a ${fine.toLocaleString()} dollar settlement and admits no wrongdoing.`,
      deltas: { [top.id]: -fine },
    };
  },
  (ps) => {
    const bottom = byCash(ps).at(-1);
    if (!bottom) return null;
    return {
      id: uid("ev"),
      emoji: "🏦",
      title: "GOVERNMENT BAILOUT",
      body: `${bottom.name} is declared too small to fail. Taxpayers send $250 and a strongly worded letter.`,
      deltas: { [bottom.id]: 250 },
    };
  },
  (ps) => {
    const deltas: Record<string, number> = {};
    for (const p of ps) deltas[p.id] = -r(p.cash * 0.1);
    return {
      id: uid("ev"),
      emoji: "📉",
      title: "FLASH CRASH",
      body: "The DareStreet Index drops 4,000 points after someone sneezed on the trading floor. Everyone loses 10%.",
      deltas,
    };
  },
  (ps) => {
    const deltas: Record<string, number> = {};
    for (const p of ps) deltas[p.id] = 75;
    return {
      id: uid("ev"),
      emoji: "🖨️",
      title: "QUANTITATIVE EASING",
      body: "The Fed fires up the money printer for vibes. Everyone gets $75.",
      deltas,
    };
  },
  (ps) => {
    if (ps.length < 3) return null;
    const [a, b] = shuffle(ps);
    const amt = Math.min(150, r(a.cash * 0.5));
    if (amt <= 0) return null;
    return {
      id: uid("ev"),
      emoji: "🔺",
      title: "PONZI SCHEME COLLAPSES",
      body: `${a.name} was secretly running a pyramid scheme. ${b.name} got out early and walks away $${amt} richer.`,
      deltas: { [a.id]: -amt, [b.id]: amt },
    };
  },
  (ps) => {
    const lucky = pick(ps);
    const gain = Math.min(300, r(lucky.cash * 0.25)) || 100;
    return {
      id: uid("ev"),
      emoji: "🚀",
      title: "MEME STOCK SQUEEZE",
      body: `Internet strangers decide ${lucky.name} is the next big thing. Portfolio up $${gain}. Nobody knows why.`,
      deltas: { [lucky.id]: gain },
    };
  },
  (ps) => {
    const deltas: Record<string, number> = {};
    for (const p of ps) if (p.cash > STARTING_CASH) deltas[p.id] = -r((p.cash - STARTING_CASH) * 0.2);
    if (Object.keys(deltas).length === 0) return null;
    return {
      id: uid("ev"),
      emoji: "🧾",
      title: "SURPRISE TAX AUDIT",
      body: "The IRS has questions about your 'party game income'. Everyone in profit pays 20% of their gains.",
      deltas,
    };
  },
  (ps, state) => {
    const last = state.pastMarkets.at(-1);
    const subject = last && ps.find((p) => p.id === last.subjectId);
    if (!subject) return null;
    return {
      id: uid("ev"),
      emoji: "🎤",
      title: "CEO RESIGNS IN DISGRACE",
      body: `After last round's performance, ${subject.name} steps down to 'spend more time with their family'. Reputation damage: $60.`,
      deltas: { [subject.id]: -60 },
    };
  },
  (ps) => {
    const avg = ps.reduce((s, p) => s + p.cash, 0) / Math.max(1, ps.length);
    const deltas: Record<string, number> = {};
    for (const p of ps) if (p.cash < avg) deltas[p.id] = 120;
    if (Object.keys(deltas).length === 0) return null;
    return {
      id: uid("ev"),
      emoji: "💌",
      title: "STIMULUS CHECKS",
      body: "Everyone below the room average gets $120. The economists in the room are furious.",
      deltas,
    };
  },
];

export function rollEvent(state: GameState): ChaosEvent | null {
  const players = state.players;
  if (players.length < 2) return null;
  for (const make of shuffle(makers)) {
    const ev = make(players, state);
    if (ev) return ev;
  }
  return null;
}
