const { randomUUID } = require('node:crypto');
const { touch, leaderboard } = require('./rooms');

const CHALLENGES = [
  { type: 'truth', text: 'Share an embarrassing but harmless story.' },
  { type: 'dare', text: 'Do your best impression of someone in the room.' },
  { type: 'prediction', text: 'Predict the next song the group will hear.' },
  { type: 'dare', text: 'Speak in an accent of your choice for one minute.' }
];

function startChallenge(room, player, payload) {
  assertHost(room, player);
  if (room.activeChallenge && room.activeChallenge.status !== 'resolved') throw new Error('Resolve the active challenge before starting another.');
  const targetPlayerId = payload.targetPlayerId;
  if (!room.players.has(targetPlayerId)) throw new Error('Target player must be in this room.');
  const selected = payload.text ? { text: payload.text, type: payload.challengeType } : CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)];
  const text = String(selected.text || '').trim();
  const type = selected.type;
  if (!text || text.length > 500) throw new Error('Challenge text must be between 1 and 500 characters.');
  if (!['truth', 'dare', 'prediction'].includes(type)) throw new Error('Challenge type must be truth, dare, or prediction.');
  const duration = Number(payload.bettingDurationSeconds ?? 60);
  if (!Number.isInteger(duration) || duration < 5 || duration > 3600) throw new Error('Betting duration must be between 5 and 3600 seconds.');
  room.activeChallenge = { id: randomUUID(), targetPlayerId, text, type, status: 'betting', bettingDeadline: Date.now() + duration * 1000, pools: { YES: 0, NO: 0 }, bets: [], timer: null };
  touch(room);
  return room.activeChallenge;
}

function assertHost(room, player) { if (room.hostId !== player.id) throw new Error('Only the room host can do that.'); }

function activeBetting(room) {
  const challenge = room.activeChallenge;
  if (!challenge) throw new Error('There is no active challenge.');
  if (challenge.status !== 'betting') throw new Error('Betting is not open.');
  if (Date.now() >= challenge.bettingDeadline) throw new Error('The betting deadline has passed.');
  return challenge;
}

function placeBet(room, player, payload) {
  const challenge = activeBetting(room);
  if (challenge.targetPlayerId === player.id) throw new Error('The target player cannot bet on their own challenge.');
  const side = payload.side;
  const amount = payload.amount;
  if (!['YES', 'NO'].includes(side)) throw new Error('Bet side must be YES or NO.');
  if (!Number.isSafeInteger(amount) || amount < 10) throw new Error('Bet amount must be a whole number of at least 10 credits.');
  if (amount > player.balance) throw new Error('Bet amount exceeds your available balance.');
  player.balance -= amount;
  challenge.pools[side] += amount;
  const bet = { id: randomUUID(), playerId: player.id, side, amount, placedAt: Date.now() };
  challenge.bets.push(bet);
  touch(room);
  return bet;
}

function lockBetting(room, player, automatic = false) {
  if (!automatic) assertHost(room, player);
  const challenge = room.activeChallenge;
  if (!challenge || challenge.status !== 'betting') throw new Error('There is no open market to lock.');
  challenge.status = 'locked';
  if (challenge.timer) clearTimeout(challenge.timer);
  challenge.timer = null;
  touch(room);
  return challenge;
}

function resolveChallenge(room, player, result) {
  assertHost(room, player);
  const challenge = room.activeChallenge;
  if (!challenge || !['betting', 'locked'].includes(challenge.status)) throw new Error('Challenge has already been resolved or does not exist.');
  if (!['YES', 'NO', 'VOID'].includes(result)) throw new Error('Result must be YES, NO, or VOID.');
  if (challenge.status === 'betting') lockBetting(room, player, true);
  challenge.status = 'resolved';
  const totalPool = challenge.pools.YES + challenge.pools.NO;
  const winningBets = result === 'VOID' ? [] : challenge.bets.filter((bet) => bet.side === result);
  let payoutBets;
  if (result === 'VOID' || winningBets.length === 0) payoutBets = challenge.bets.map((bet) => ({ bet, payout: bet.amount }));
  else {
    // Largest-remainder allocation, with original bet order as the deterministic tie-break.
    const allocations = winningBets.map((bet, index) => {
      const exact = totalPool * bet.amount / challenge.pools[result];
      return { bet, index, payout: Math.floor(exact), remainder: exact - Math.floor(exact) };
    });
    let leftover = totalPool - allocations.reduce((sum, item) => sum + item.payout, 0);
    [...allocations].sort((a, b) => b.remainder - a.remainder || a.index - b.index).slice(0, leftover).forEach((item) => item.payout++);
    payoutBets = allocations.map(({ bet, payout }) => ({ bet, payout }));
  }
  const payouts = [];
  for (const { bet, payout } of payoutBets) {
    const winner = room.players.get(bet.playerId);
    winner.balance += payout;
    payouts.push({ playerId: winner.id, username: winner.username, betId: bet.id, payout, balance: winner.balance });
  }
  const summary = { challengeId: challenge.id, result, totalPool, refunded: result === 'VOID' || winningBets.length === 0, payouts, leaderboard: leaderboard(room) };
  challenge.result = result;
  challenge.settledAt = Date.now();
  challenge.summary = summary;
  room.history.push({ challengeId: challenge.id, text: challenge.text, targetPlayerId: challenge.targetPlayerId, result, settledAt: challenge.settledAt });
  touch(room);
  return summary;
}

module.exports = { startChallenge, placeBet, lockBetting, resolveChallenge, assertHost };
