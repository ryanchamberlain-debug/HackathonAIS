// Host-authoritative game engine. Every function mutates a draft GameState;
// the host clones state, applies one of these, then broadcasts the result.

import { BASE_DECK, marketQuestion } from "./cards";
import { rollEvent } from "./events";
import { pick, round2, shuffle, uid } from "./format";
import { FILLER_HEADLINES, templateHeadline } from "./headlines";
import { liquidityFor, priceYes, proceedsForSell, sharesForSpend } from "./lmsr";
import type {
  Award,
  Card,
  CardKind,
  GameState,
  Market,
  Player,
  PlayerAction,
  PlayerStats,
  Position,
  Side,
} from "./types";
import { CHICKEN_TAX, SEC_FINE, STARTING_CASH } from "./types";

export const MAX_PLAYERS = 16;

export const PHASE_MS = {
  intro: 6000,
  performingDare: 60000,
  performingTruth: 7000,
  truthWait: 15000,
  voting: 20000,
  resolution: 11000,
  event: 8000,
  leaderboard: 8000,
};

const COLORS = [
  "#42D98C", "#F1646C", "#FFB547", "#5BC0FF", "#B98CFF", "#FF7AD9",
  "#7CF2E4", "#F7E26B", "#FF9F5A", "#9BE15D", "#6E8BFF", "#FF5E8A",
  "#4FE3B0", "#E0A6FF", "#FFD36E", "#8FD3FF",
];

export const AVATARS = ["🦈", "🐂", "🐻", "🦊", "🐸", "🦄", "🐙", "🦁", "🐼", "🐵", "🦩", "🐺", "🤑", "😎", "🤡", "👽"];

export function emptyStats(): PlayerStats {
  return { trades: 0, sells: 0, wins: 0, biggestWin: 0, biggestLoss: 0, insiderTrades: 0, insiderBusts: 0, chickens: 0, daresDone: 0 };
}

export function createGame(code: string, now: number): GameState {
  return {
    code,
    version: 0,
    phase: "lobby",
    phaseEndsAt: null,
    hostNow: now,
    settings: { rounds: 6, tradingSeconds: 40 },
    players: [],
    round: 0,
    market: null,
    pastMarkets: [],
    event: null,
    headlines: shuffle(FILLER_HEADLINES).slice(0, 4),
    subjectQueue: [],
    usedCards: [],
    customCards: [],
    prevRanks: {},
    awards: [],
    lastKinds: [],
  };
}

export const playerById = (s: GameState, id: string | undefined | null) =>
  id ? s.players.find((p) => p.id === id) : undefined;

export function ranks(s: GameState): Record<string, number> {
  const sorted = [...s.players].sort((a, b) => b.cash - a.cash);
  return Object.fromEntries(sorted.map((p, i) => [p.id, i + 1]));
}

export function currentYes(m: Market) {
  return priceYes(m.qYes, m.qNo, m.b);
}

function pos(m: Market, pid: string): Position {
  m.positions[pid] ??= { yes: 0, no: 0, yesCost: 0, noCost: 0 };
  return m.positions[pid];
}

function cleanName(name: string) {
  return name.replace(/\s+/g, " ").trim().slice(0, 16) || "Anonymous";
}

export function addPlayer(
  s: GameState,
  p: { id: string; name: string; avatar: string; isBot?: boolean },
  now: number,
) {
  const existing = playerById(s, p.id);
  if (existing) {
    existing.name = cleanName(p.name);
    existing.avatar = p.avatar || existing.avatar;
    return;
  }
  if (s.players.length >= MAX_PLAYERS) return;
  let name = cleanName(p.name);
  if (s.players.some((x) => x.name.toLowerCase() === name.toLowerCase())) name = `${name.slice(0, 13)} ${s.players.length + 1}`;
  const used = new Set(s.players.map((x) => x.color));
  const color = COLORS.find((c) => !used.has(c)) ?? pick(COLORS);
  const player: Player = {
    id: p.id,
    name,
    avatar: p.avatar || pick(AVATARS),
    color,
    cash: STARTING_CASH,
    isBot: Boolean(p.isBot),
    joinedAt: now,
    stats: emptyStats(),
  };
  s.players.push(player);
  if (s.market && !s.market.result) s.market.startCash[player.id] = player.cash;
  if (s.phase !== "lobby") s.subjectQueue.push(player.id);
}

export function removePlayer(s: GameState, id: string) {
  if (s.phase !== "lobby") return;
  s.players = s.players.filter((p) => p.id !== id);
}

export function updateSettings(s: GameState, patch: Partial<GameState["settings"]>) {
  if (s.phase !== "lobby") return;
  s.settings = { ...s.settings, ...patch };
}

export function startGame(s: GameState, now: number) {
  if (s.phase !== "lobby" || s.players.length < 2) return;
  s.round = 0;
  s.pastMarkets = [];
  s.awards = [];
  s.subjectQueue = shuffle(s.players.map((p) => p.id));
  s.headlines = [`OPENING BELL: ${s.players.length} TRADERS ENTER THE FLOOR`, ...s.headlines].slice(0, 12);
  beginRound(s, now);
}

function nextSubject(s: GameState): string {
  const valid = new Set(s.players.map((p) => p.id));
  const last = s.pastMarkets.at(-1)?.subjectId;
  for (let guard = 0; guard < 3; guard++) {
    while (s.subjectQueue.length) {
      const id = s.subjectQueue.shift()!;
      if (valid.has(id)) return id;
    }
    const fresh = shuffle([...valid]);
    if (fresh.length > 1 && fresh[0] === last) fresh.push(fresh.shift()!);
    s.subjectQueue = fresh;
  }
  return s.players[0].id;
}

function drawCard(s: GameState): Card {
  const unusedCustom = s.customCards.filter((c) => !s.usedCards.includes(c.id));
  if (unusedCustom.length && Math.random() < 0.6) {
    const card = pick(unusedCustom);
    s.usedCards.push(card.id);
    return card;
  }
  const [a, b] = s.lastKinds.slice(-2);
  let kind: CardKind = Math.random() < 0.5 ? "truth" : "dare";
  if (a && a === b) kind = a === "truth" ? "dare" : "truth";
  let pool = BASE_DECK.filter((c) => c.kind === kind && !s.usedCards.includes(c.id));
  if (!pool.length) {
    s.usedCards = s.usedCards.filter((id) => !BASE_DECK.some((c) => c.id === id && c.kind === kind));
    pool = BASE_DECK.filter((c) => c.kind === kind);
  }
  const card = pick(pool);
  s.usedCards.push(card.id);
  return card;
}

function beginRound(s: GameState, now: number) {
  s.round += 1;
  s.prevRanks = ranks(s);
  s.event = null;
  const subjectId = nextSubject(s);
  const subject = playerById(s, subjectId)!;
  const card = drawCard(s);
  s.lastKinds = [...s.lastKinds, card.kind].slice(-4);
  s.market = {
    id: uid("m"),
    round: s.round,
    card,
    subjectId,
    question: marketQuestion(card, subject.name),
    b: liquidityFor(s.players.length),
    qYes: 0,
    qNo: 0,
    history: [{ t: 0, yes: 0.5 }],
    trades: [],
    positions: {},
    startCash: Object.fromEntries(s.players.map((p) => [p.id, p.cash])),
    openedAt: null,
    closedAt: null,
    truthAnswer: null,
    truthLocked: false,
    dareDone: false,
    chickened: false,
    votes: {},
    result: null,
  };
  s.phase = "intro";
  s.phaseEndsAt = now + PHASE_MS.intro;
}

function openTrading(s: GameState, now: number) {
  const m = s.market!;
  m.openedAt = now;
  s.phase = "trading";
  s.phaseEndsAt = now + s.settings.tradingSeconds * 1000;
}

function closeTrading(s: GameState, now: number) {
  const m = s.market!;
  m.closedAt = now;
  m.history.push({ t: now - (m.openedAt ?? now), yes: currentYes(m) });
  s.phase = "performing";
  if (m.card.kind === "dare") s.phaseEndsAt = now + PHASE_MS.performingDare;
  else s.phaseEndsAt = now + (m.truthLocked ? PHASE_MS.performingTruth : PHASE_MS.truthWait);
}

function startVoting(s: GameState, now: number) {
  s.phase = "voting";
  s.phaseEndsAt = now + PHASE_MS.voting;
}

function resolve(s: GameState, now: number) {
  const m = s.market!;
  const subject = playerById(s, m.subjectId);
  const name = subject?.name ?? "Someone";
  const closingYes = currentYes(m);

  let outcome: Side;
  let reason: string;
  if (m.card.kind === "truth" && !m.truthLocked) m.chickened = true;
  if (m.chickened) {
    outcome = "NO";
    reason = `${name} chickened out`;
  } else if (m.card.kind === "truth") {
    outcome = m.truthAnswer ?? "NO";
    reason = `${name} answered ${outcome}`;
  } else {
    const votes = Object.values(m.votes);
    const legit = votes.filter(Boolean).length;
    const fraud = votes.length - legit;
    if (!votes.length) {
      outcome = m.dareDone ? "YES" : "NO";
      reason = m.dareDone ? "No jury showed up. Benefit of the doubt." : "Ran out the clock";
    } else {
      outcome = legit >= fraud ? "YES" : "NO";
      reason = `Jury voted ${legit} legit, ${fraud} fraud`;
    }
  }

  for (const p of s.players) {
    const position = m.positions[p.id];
    if (!position) continue;
    p.cash = round2(p.cash + (outcome === "YES" ? position.yes : position.no));
  }

  if (subject && m.chickened) {
    subject.cash = Math.max(0, round2(subject.cash - CHICKEN_TAX));
    subject.stats.chickens += 1;
  }
  if (subject && m.card.kind === "dare" && outcome === "YES") subject.stats.daresDone += 1;

  const pnl: Record<string, number> = {};
  for (const p of s.players) pnl[p.id] = round2(p.cash - (m.startCash[p.id] ?? p.cash));

  const secBusts: string[] = [];
  const insiderWalked: string[] = [];
  if (subject && m.trades.some((t) => t.insider) && pnl[subject.id] > 0) {
    if (Math.random() < 0.5) {
      subject.cash = Math.max(0, round2(subject.cash - pnl[subject.id] - SEC_FINE));
      pnl[subject.id] = round2(subject.cash - (m.startCash[subject.id] ?? subject.cash));
      subject.stats.insiderBusts += 1;
      secBusts.push(subject.id);
    } else insiderWalked.push(subject.id);
  }

  for (const p of s.players) {
    const v = pnl[p.id];
    if (v > 0.5) p.stats.wins += 1;
    p.stats.biggestWin = Math.max(p.stats.biggestWin, v);
    p.stats.biggestLoss = Math.min(p.stats.biggestLoss, v);
  }

  const movers = Object.entries(pnl).filter(([, v]) => Math.abs(v) >= 1).sort((a, b) => b[1] - a[1]);
  const topWinner = movers[0] && movers[0][1] > 0 ? { id: movers[0][0], pnl: movers[0][1] } : null;
  const last = movers.at(-1);
  const topLoser = last && last[1] < 0 ? { id: last[0], pnl: last[1] } : null;

  const { headline, subhead } = templateHeadline({
    kind: m.card.kind,
    name,
    prompt: m.card.text,
    outcome,
    chickened: m.chickened,
    closingYes,
    secBusted: secBusts.length > 0,
    topWinner: topWinner ? playerById(s, topWinner.id)?.name : undefined,
    topLoser: topLoser ? playerById(s, topLoser.id)?.name : undefined,
  });

  m.result = { outcome, chickened: m.chickened, reason, headline, subhead, pnl, secBusts, insiderWalked, closingYes };
  s.pastMarkets.push({
    round: m.round,
    kind: m.card.kind,
    subjectId: m.subjectId,
    question: m.question,
    prompt: m.card.text,
    outcome,
    closingYes,
    headline,
    topWinner,
    topLoser,
  });
  s.headlines = [headline, ...s.headlines].slice(0, 12);
  s.phase = "resolution";
  s.phaseEndsAt = now + PHASE_MS.resolution;
}

function applyEvent(s: GameState, now: number): boolean {
  const ev = rollEvent(s);
  if (!ev) return false;
  for (const [id, delta] of Object.entries(ev.deltas)) {
    const p = playerById(s, id);
    if (p) p.cash = Math.max(0, round2(p.cash + delta));
  }
  s.event = ev;
  s.headlines = [`${ev.emoji} ${ev.title}`, ...s.headlines].slice(0, 12);
  s.phase = "event";
  s.phaseEndsAt = now + PHASE_MS.event;
  return true;
}

function showLeaderboard(s: GameState, now: number) {
  s.phase = "leaderboard";
  s.phaseEndsAt = now + PHASE_MS.leaderboard;
}

function finish(s: GameState) {
  s.phase = "final";
  s.phaseEndsAt = null;
  s.awards = computeAwards(s);
  const winner = [...s.players].sort((a, b) => b.cash - a.cash)[0];
  if (winner) s.headlines = [`CLOSING BELL: ${winner.name.toUpperCase()} IS THE WOLF OF DARE STREET`, ...s.headlines].slice(0, 12);
}

export function advance(s: GameState, now: number) {
  const m = s.market;
  switch (s.phase) {
    case "intro":
      openTrading(s, now);
      break;
    case "trading":
      closeTrading(s, now);
      break;
    case "performing":
      if (!m) break;
      if (m.card.kind === "dare" && !m.chickened) startVoting(s, now);
      else resolve(s, now);
      break;
    case "voting":
      resolve(s, now);
      break;
    case "resolution":
      if (s.round < s.settings.rounds && Math.random() < 0.4 && applyEvent(s, now)) break;
      showLeaderboard(s, now);
      break;
    case "event":
      showLeaderboard(s, now);
      break;
    case "leaderboard":
      if (s.round >= s.settings.rounds) finish(s);
      else beginRound(s, now);
      break;
    default:
      break;
  }
}

export function tick(s: GameState, now: number): boolean {
  if (s.phaseEndsAt !== null && now >= s.phaseEndsAt) {
    advance(s, now);
    return true;
  }
  return false;
}

export function endGameNow(s: GameState) {
  if (s.phase === "lobby" || s.phase === "final") return;
  finish(s);
}

export function playAgain(s: GameState) {
  for (const p of s.players) {
    p.cash = STARTING_CASH;
    p.stats = emptyStats();
  }
  s.phase = "lobby";
  s.phaseEndsAt = null;
  s.round = 0;
  s.market = null;
  s.pastMarkets = [];
  s.event = null;
  s.awards = [];
  s.usedCards = [];
  s.prevRanks = {};
  s.lastKinds = [];
}

export function applyAction(s: GameState, pid: string, a: PlayerAction, now: number) {
  if (a.t === "join") {
    addPlayer(s, { id: pid, name: a.name, avatar: a.avatar }, now);
    return;
  }
  if (a.t === "submitCard") {
    const text = a.text.replace(/\s+/g, " ").trim().slice(0, 160);
    if (text.length < 6 || s.customCards.length >= 60) return;
    s.customCards.push({ id: uid("c"), kind: a.kind, text, custom: true });
    return;
  }

  const player = playerById(s, pid);
  const m = s.market;
  if (!player || !m || m.result) return;
  const isSubject = m.subjectId === pid;

  switch (a.t) {
    case "trade": {
      if (s.phase !== "trading") return;
      const position = pos(m, pid);
      let shares = 0;
      let amount = 0;
      if (a.kind === "buy") {
        amount = round2(Math.min(Math.max(0, a.amount), player.cash));
        if (amount < 1) return;
        shares = sharesForSpend(m.qYes, m.qNo, m.b, a.side, amount);
        if (a.side === "YES") {
          m.qYes += shares;
          position.yes += shares;
          position.yesCost += amount;
        } else {
          m.qNo += shares;
          position.no += shares;
          position.noCost += amount;
        }
        player.cash = round2(player.cash - amount);
      } else {
        const held = a.side === "YES" ? position.yes : position.no;
        shares = Math.min(Math.max(0, a.shares), held);
        if (shares < 0.01) return;
        amount = round2(proceedsForSell(m.qYes, m.qNo, m.b, a.side, shares));
        const frac = held > 0 ? shares / held : 1;
        if (a.side === "YES") {
          m.qYes -= shares;
          position.yes -= shares;
          position.yesCost *= 1 - frac;
        } else {
          m.qNo -= shares;
          position.no -= shares;
          position.noCost *= 1 - frac;
        }
        player.cash = round2(player.cash + amount);
        player.stats.sells += 1;
      }
      const priceAfter = currentYes(m);
      player.stats.trades += 1;
      if (isSubject && a.kind === "buy") player.stats.insiderTrades += 1;
      m.trades.push({
        id: uid("tr"),
        playerId: pid,
        side: a.side,
        kind: a.kind,
        shares,
        amount,
        priceAfter,
        at: now,
        insider: isSubject,
      });
      if (m.trades.length > 250) m.trades.splice(0, m.trades.length - 250);
      m.history.push({ t: now - (m.openedAt ?? now), yes: priceAfter });
      if (m.history.length > 400) m.history.splice(1, m.history.length - 400);
      return;
    }
    case "truth": {
      if (!isSubject || m.card.kind !== "truth" || m.truthLocked) return;
      if (!["intro", "trading", "performing"].includes(s.phase)) return;
      m.truthAnswer = a.answer;
      m.truthLocked = true;
      if (s.phase === "performing") s.phaseEndsAt = now + PHASE_MS.performingTruth;
      return;
    }
    case "dareDone": {
      if (!isSubject || m.card.kind !== "dare" || s.phase !== "performing" || m.chickened) return;
      m.dareDone = true;
      startVoting(s, now);
      return;
    }
    case "chicken": {
      if (!isSubject || s.phase !== "performing") return;
      m.chickened = true;
      resolve(s, now);
      return;
    }
    case "vote": {
      if (isSubject || s.phase !== "voting") return;
      m.votes[pid] = a.legit;
      const jurors = s.players.filter((p) => p.id !== m.subjectId);
      if (jurors.every((p) => m.votes[p.id] !== undefined)) {
        s.phaseEndsAt = Math.min(s.phaseEndsAt ?? now, now + 1500);
      }
      return;
    }
  }
}

/** Copy of the state that is safe to send to every phone (hides the secret truth answer). */
export function publicState(s: GameState, now: number): GameState {
  const out: GameState = { ...s, hostNow: now };
  if (s.market) out.market = { ...s.market, truthAnswer: s.market.result ? s.market.truthAnswer : null };
  return out;
}

export function computeAwards(s: GameState): Award[] {
  const ps = s.players;
  if (!ps.length) return [];
  const awards: Award[] = [];
  const best = (f: (p: Player) => number, min = 0.5) => {
    const sorted = [...ps].sort((a, b) => f(b) - f(a));
    return sorted[0] && f(sorted[0]) >= min ? sorted[0] : null;
  };
  const rich = [...ps].sort((a, b) => b.cash - a.cash)[0];
  awards.push({ id: "wolf", emoji: "🐺", title: "The Wolf of Dare Street", playerId: rich.id, detail: `Closed the night with $${Math.round(rich.cash).toLocaleString()}` });
  const diamond = best((p) => p.stats.biggestWin, 1);
  if (diamond) awards.push({ id: "diamond", emoji: "💎", title: "Diamond Hands", playerId: diamond.id, detail: `Biggest single round: +$${Math.round(diamond.stats.biggestWin).toLocaleString()}` });
  const bag = best((p) => -p.stats.biggestLoss, 1);
  if (bag) awards.push({ id: "bag", emoji: "🛍️", title: "Bagholder of the Year", playerId: bag.id, detail: `Lost $${Math.round(-bag.stats.biggestLoss).toLocaleString()} in one round` });
  const sec = best((p) => p.stats.insiderBusts * 10 + p.stats.insiderTrades);
  if (sec) awards.push({ id: "sec", emoji: "🕵️", title: "Most Wanted by the SEC", playerId: sec.id, detail: `${sec.stats.insiderTrades} insider trades, ${sec.stats.insiderBusts} busts` });
  const chicken = best((p) => p.stats.chickens);
  if (chicken) awards.push({ id: "chicken", emoji: "🐔", title: "Chicken Little", playerId: chicken.id, detail: `Chickened out ${chicken.stats.chickens}x` });
  const daredevil = best((p) => p.stats.daresDone);
  if (daredevil) awards.push({ id: "daredevil", emoji: "🔥", title: "No Shame Award", playerId: daredevil.id, detail: `Completed ${daredevil.stats.daresDone} dare${daredevil.stats.daresDone === 1 ? "" : "s"}` });
  const day = best((p) => p.stats.trades);
  if (day) awards.push({ id: "day", emoji: "📈", title: "Day Trader", playerId: day.id, detail: `${day.stats.trades} trades` });
  const paper = best((p) => p.stats.sells);
  if (paper) awards.push({ id: "paper", emoji: "🧻", title: "Paper Hands", playerId: paper.id, detail: `Panic-sold ${paper.stats.sells}x` });
  return awards;
}
