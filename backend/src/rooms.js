const { randomBytes, randomUUID } = require('node:crypto');

const STARTING_BALANCE = 1000;
const ROOM_TTL_MS = Number(process.env.ROOM_TTL_MS) || 6 * 60 * 60 * 1000;
const rooms = new Map();
const playerRooms = new Map();

function roomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from(randomBytes(6), (byte) => alphabet[byte % alphabet.length]).join('');
  } while (rooms.has(code));
  return code;
}

function createRoom(username, ws) {
  const code = roomCode();
  const player = createPlayer(username, ws, true);
  const room = { code, hostId: player.id, players: new Map([[player.id, player]]), activeChallenge: null, history: [], createdAt: Date.now(), lastActivityAt: Date.now() };
  rooms.set(code, room);
  playerRooms.set(player.id, code);
  return { room, player };
}

function createPlayer(username, ws, isHost = false) {
  return { id: randomUUID(), token: randomBytes(32).toString('hex'), username, balance: STARTING_BALANCE, connected: true, ws, isHost, joinedAt: Date.now() };
}

function findRoom(code) { return rooms.get(String(code || '').toUpperCase()); }

function joinRoom(code, username, ws) {
  const room = findRoom(code);
  if (!room) throw new Error('Room not found. Check the room code and try again.');
  const player = createPlayer(username, ws);
  room.players.set(player.id, player);
  playerRooms.set(player.id, room.code);
  touch(room);
  return { room, player };
}

function reconnect(code, playerId, token, ws) {
  const room = findRoom(code);
  const player = room && room.players.get(playerId);
  if (!player || !token || player.token !== token) throw new Error('Invalid reconnect credentials.');
  if (player.ws && player.ws !== ws) player.ws.close(4001, 'Session reconnected elsewhere');
  player.ws = ws;
  player.connected = true;
  touch(room);
  return { room, player };
}

function touch(room) { room.lastActivityAt = Date.now(); }

function leaderboard(room) {
  return [...room.players.values()].map(({ id, username, balance, connected }) => ({ id, username, balance, connected }))
    .sort((a, b) => b.balance - a.balance || a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
}

function publicPlayer(player) { return { id: player.id, username: player.username, balance: player.balance, connected: player.connected, isHost: player.isHost }; }

function publicRoom(room, viewerId) {
  const challenge = room.activeChallenge;
  return {
    code: room.code,
    hostId: room.hostId,
    players: [...room.players.values()].map((p) => publicPlayer(p)),
    leaderboard: leaderboard(room),
    challenge: challenge ? {
      id: challenge.id, targetPlayerId: challenge.targetPlayerId, text: challenge.text, type: challenge.type,
      status: challenge.status, bettingDeadline: challenge.bettingDeadline,
      pools: { YES: challenge.pools.YES, NO: challenge.pools.NO }, totalWagered: challenge.pools.YES + challenge.pools.NO,
      odds: odds(challenge), yourBets: challenge.bets.filter((bet) => bet.playerId === viewerId).map(({ side, amount }) => ({ side, amount }))
    } : null,
    recentResults: room.history.slice(-10)
  };
}

function odds(challenge) {
  const total = challenge.pools.YES + challenge.pools.NO;
  if (!total) return { YES: 0.5, NO: 0.5 };
  return { YES: challenge.pools.YES / total, NO: challenge.pools.NO / total };
}

module.exports = { STARTING_BALANCE, ROOM_TTL_MS, rooms, playerRooms, createRoom, joinRoom, reconnect, findRoom, touch, leaderboard, publicRoom, odds };
