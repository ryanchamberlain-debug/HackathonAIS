export type Side = "YES" | "NO";
export type CardKind = "truth" | "dare";

export type Phase =
  | "lobby"
  | "intro"
  | "trading"
  | "performing"
  | "voting"
  | "resolution"
  | "event"
  | "leaderboard"
  | "final";

export interface PlayerStats {
  trades: number;
  sells: number;
  wins: number;
  biggestWin: number;
  biggestLoss: number;
  insiderTrades: number;
  insiderBusts: number;
  chickens: number;
  daresDone: number;
}

export interface Player {
  id: string;
  name: string;
  avatar: string;
  color: string;
  cash: number;
  isBot: boolean;
  joinedAt: number;
  stats: PlayerStats;
}

export interface Position {
  yes: number;
  no: number;
  yesCost: number;
  noCost: number;
}

export interface Trade {
  id: string;
  playerId: string;
  side: Side;
  kind: "buy" | "sell";
  shares: number;
  amount: number;
  priceAfter: number;
  at: number;
  insider: boolean;
}

export interface PricePoint {
  t: number;
  yes: number;
}

export interface Card {
  id: string;
  kind: CardKind;
  text: string;
  custom?: boolean;
}

export interface MarketResult {
  outcome: Side;
  chickened: boolean;
  reason: string;
  headline: string;
  subhead: string;
  pnl: Record<string, number>;
  secBusts: string[];
  insiderWalked: string[];
  closingYes: number;
}

export interface Market {
  id: string;
  round: number;
  card: Card;
  subjectId: string;
  question: string;
  b: number;
  qYes: number;
  qNo: number;
  history: PricePoint[];
  trades: Trade[];
  positions: Record<string, Position>;
  startCash: Record<string, number>;
  openedAt: number | null;
  closedAt: number | null;
  /** Secret: the subject's locked truth answer. Stripped before broadcasting. */
  truthAnswer: Side | null;
  truthLocked: boolean;
  dareDone: boolean;
  chickened: boolean;
  votes: Record<string, boolean>;
  result: MarketResult | null;
}

export interface MarketSummary {
  round: number;
  kind: CardKind;
  subjectId: string;
  question: string;
  prompt: string;
  outcome: Side;
  closingYes: number;
  headline: string;
  topWinner: { id: string; pnl: number } | null;
  topLoser: { id: string; pnl: number } | null;
}

export interface ChaosEvent {
  id: string;
  emoji: string;
  title: string;
  body: string;
  deltas: Record<string, number>;
}

export interface Award {
  id: string;
  emoji: string;
  title: string;
  playerId: string;
  detail: string;
}

export interface Settings {
  rounds: number;
  tradingSeconds: number;
}

export interface GameState {
  code: string;
  version: number;
  phase: Phase;
  phaseEndsAt: number | null;
  hostNow: number;
  settings: Settings;
  players: Player[];
  round: number;
  market: Market | null;
  pastMarkets: MarketSummary[];
  event: ChaosEvent | null;
  headlines: string[];
  subjectQueue: string[];
  usedCards: string[];
  customCards: Card[];
  prevRanks: Record<string, number>;
  awards: Award[];
  lastKinds: CardKind[];
}

export type PlayerAction =
  | { t: "join"; name: string; avatar: string }
  | { t: "trade"; side: Side; kind: "buy"; amount: number }
  | { t: "trade"; side: Side; kind: "sell"; shares: number }
  | { t: "truth"; answer: Side }
  | { t: "dareDone" }
  | { t: "chicken" }
  | { t: "vote"; legit: boolean }
  | { t: "submitCard"; kind: CardKind; text: string };

export type WireMsg =
  | { k: "state"; s: GameState }
  | { k: "hello"; pid: string }
  | { k: "act"; pid: string; a: PlayerAction };

export const STARTING_CASH = 1000;
export const CHICKEN_TAX = 100;
export const SEC_FINE = 100;
