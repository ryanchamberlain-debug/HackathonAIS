// Pari-mutuel pricing, ported from backend/src/challenges.js and backend/src/rooms.js
// so the frontend engine and the backend settle markets the same way.
//
// - Every bet goes into a YES or NO pool. Odds are each pool's share of the total
//   (0.5 / 0.5 when empty).
// - Bets are whole credits, minimum 10. Players may bet more than once.
// - Winners split the total pool in proportion to their winning stakes (payout
//   includes the original stake). Whole-credit remainders go to the largest
//   fractional remainders, with bet order as the tie-break.
// - If nobody backed the result (or the market is VOID), every stake is refunded.
// - Total credits in play are preserved.

import type { Side } from "./types";

export const MIN_BET = 10;

export interface Pools {
  YES: number;
  NO: number;
}

export interface Bet {
  id: string;
  playerId: string;
  side: Side;
  amount: number;
}

export function odds(pools: Pools): Pools {
  const total = pools.YES + pools.NO;
  if (!total) return { YES: 0.5, NO: 0.5 };
  return { YES: pools.YES / total, NO: pools.NO / total };
}

/** Estimated payout if `amount` is added to `side` and that side wins (others unchanged). */
export function estimatePayout(pools: Pools, side: Side, amount: number) {
  if (amount <= 0) return 0;
  const total = pools.YES + pools.NO + amount;
  return Math.floor((total * amount) / (pools[side] + amount));
}

export function multiplier(pools: Pools, side: Side) {
  if (!pools[side]) return null;
  return (pools.YES + pools.NO) / pools[side];
}

/** Settlement, identical to backend resolveChallenge(). */
export function settle(bets: Bet[], pools: Pools, result: Side | "VOID") {
  const totalPool = pools.YES + pools.NO;
  const winningBets = result === "VOID" ? [] : bets.filter((b) => b.side === result);
  let payoutBets: { bet: Bet; payout: number }[];
  if (result === "VOID" || winningBets.length === 0) {
    payoutBets = bets.map((bet) => ({ bet, payout: bet.amount }));
  } else {
    const allocations = winningBets.map((bet, index) => {
      const exact = (totalPool * bet.amount) / pools[result];
      return { bet, index, payout: Math.floor(exact), remainder: exact - Math.floor(exact) };
    });
    const leftover = totalPool - allocations.reduce((sum, a) => sum + a.payout, 0);
    [...allocations]
      .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
      .slice(0, leftover)
      .forEach((a) => a.payout++);
    payoutBets = allocations.map(({ bet, payout }) => ({ bet, payout }));
  }
  const refunded = result === "VOID" || winningBets.length === 0;
  return { totalPool, refunded, payoutBets };
}
