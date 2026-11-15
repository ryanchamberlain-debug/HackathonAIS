// Logarithmic market scoring rule (LMSR), the automated market maker used by
// real prediction markets. Each share pays $1 if its side wins.

import type { Side } from "./types";

function lse(a: number, b: number) {
  const m = Math.max(a, b);
  return m + Math.log(Math.exp(a - m) + Math.exp(b - m));
}

export function cost(qYes: number, qNo: number, b: number) {
  return b * lse(qYes / b, qNo / b);
}

export function priceYes(qYes: number, qNo: number, b: number) {
  const a = qYes / b;
  const c = qNo / b;
  const m = Math.max(a, c);
  const ey = Math.exp(a - m);
  const en = Math.exp(c - m);
  return ey / (ey + en);
}

export function priceOf(side: Side, qYes: number, qNo: number, b: number) {
  const p = priceYes(qYes, qNo, b);
  return side === "YES" ? p : 1 - p;
}

/** Shares received for spending `amount` dollars on `side`. */
export function sharesForSpend(qYes: number, qNo: number, b: number, side: Side, amount: number) {
  if (amount <= 0) return 0;
  const target = cost(qYes, qNo, b) + amount;
  const other = side === "YES" ? qNo : qYes;
  const mine = side === "YES" ? qYes : qNo;
  const next = target + b * Math.log1p(-Math.exp((other - target) / b));
  return Math.max(0, next - mine);
}

/** Dollars received for selling `shares` of `side` back to the market maker. */
export function proceedsForSell(qYes: number, qNo: number, b: number, side: Side, shares: number) {
  if (shares <= 0) return 0;
  const before = cost(qYes, qNo, b);
  const after = side === "YES" ? cost(qYes - shares, qNo, b) : cost(qYes, qNo - shares, b);
  return Math.max(0, before - after);
}

/** Liquidity scales with the room so one player can't pin the odds alone. */
export function liquidityFor(playerCount: number) {
  return Math.max(320, 110 * playerCount);
}
