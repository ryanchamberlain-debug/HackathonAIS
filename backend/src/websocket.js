const WebSocket = require('ws');
const { createRoom, joinRoom, reconnect, touch, publicRoom, odds } = require('./rooms');
const { startChallenge, placeBet, lockBetting, resolveChallenge } = require('./challenges');

const MAX_MESSAGE_BYTES = Number(process.env.MAX_MESSAGE_BYTES) || 16 * 1024;
const RATE_LIMIT_COUNT = 60;
const RATE_LIMIT_WINDOW_MS = 10_000;

function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server, maxPayload: MAX_MESSAGE_BYTES });
  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.rateWindow = Date.now();
    ws.rateCount = 0;
    ws.responses = new Map();
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', (data) => handleMessage(ws, data));
    ws.on('close', () => markDisconnected(ws));
    ws.on('error', () => markDisconnected(ws));
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30_000);
  heartbeat.unref();
  wss.on('close', () => clearInterval(heartbeat));
  return wss;
}

function send(ws, type, payload = {}, requestId) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, payload, ...(requestId ? { requestId } : {}) }));
}

function broadcast(room, type, payload = {}) {
  for (const player of room.players.values()) if (player.ws) send(player.ws, type, payload);
}

function broadcastState(room) {
  for (const player of room.players.values()) if (player.ws) send(player.ws, 'ROOM_STATE', publicRoom(room, player.id));
}

function marketPayload(challenge) {
  return { challengeId: challenge.id, pools: { ...challenge.pools }, totalWagered: challenge.pools.YES + challenge.pools.NO, odds: odds(challenge), status: challenge.status, bettingDeadline: challenge.bettingDeadline };
}

function markDisconnected(ws) {
  const player = ws.player;
  const room = ws.room;
  if (!player || !room || player.ws !== ws) return;
  player.connected = false;
  player.ws = null;
  touch(room);
  broadcastState(room);
}

function fail(ws, requestId, error) { send(ws, 'ERROR', { message: error.message || 'Request failed.' }, requestId); }

function handleMessage(ws, data) {
  let requestId;
  try {
    if (Date.now() - ws.rateWindow >= RATE_LIMIT_WINDOW_MS) { ws.rateWindow = Date.now(); ws.rateCount = 0; }
    if (++ws.rateCount > RATE_LIMIT_COUNT) throw new Error('Rate limit exceeded. Please slow down.');
    const message = JSON.parse(data.toString());
    if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.type !== 'string' || !message.payload || typeof message.payload !== 'object' || Array.isArray(message.payload)) throw new Error('Message must contain a type and object payload.');
    requestId = message.requestId;
    if (typeof requestId !== 'string' || requestId.length < 1 || requestId.length > 100) throw new Error('A requestId string of 1 to 100 characters is required.');
    if (ws.responses.has(requestId)) { const cached = ws.responses.get(requestId); send(ws, cached.type, cached.payload, requestId); return; }
    const response = dispatch(ws, message.type, message.payload, requestId);
    if (response && response.type) {
      ws.responses.set(requestId, response);
      if (ws.responses.size > 500) ws.responses.delete(ws.responses.keys().next().value);
      send(ws, response.type, response.payload, requestId);
    }
  } catch (error) { fail(ws, requestId, error); }
}

function dispatch(ws, type, payload, requestId) {
  if (type === 'CREATE_ROOM') {
    assertUnbound(ws);
    const username = validUsername(payload.username);
    const { room, player } = createRoom(username, ws);
    bind(ws, room, player);
    const joined = { type: 'ROOM_JOINED', payload: credentials(room, player) };
    ws.responses.set(requestId, joined);
    if (ws.responses.size > 500) ws.responses.delete(ws.responses.keys().next().value);
    send(ws, joined.type, joined.payload, requestId);
    broadcastState(room);
    return null;
  }
  if (type === 'JOIN_ROOM') {
    assertUnbound(ws);
    const username = validUsername(payload.username);
    const { room, player } = joinRoom(payload.roomCode, username, ws);
    bind(ws, room, player);
    const joined = { type: 'ROOM_JOINED', payload: credentials(room, player) };
    ws.responses.set(requestId, joined);
    if (ws.responses.size > 500) ws.responses.delete(ws.responses.keys().next().value);
    send(ws, joined.type, joined.payload, requestId);
    broadcastState(room);
    return null;
  }
  if (type === 'RECONNECT') {
    assertUnbound(ws);
    const { room, player } = reconnect(payload.roomCode, payload.playerId, payload.reconnectToken, ws);
    bind(ws, room, player);
    const joined = credentials(room, player);
    const response = { type: 'ROOM_JOINED', payload: joined };
    ws.responses.set(requestId, response);
    if (ws.responses.size > 500) ws.responses.delete(ws.responses.keys().next().value);
    send(ws, response.type, response.payload, requestId);
    broadcastState(room);
    return null;
  }

  const { room, player } = requireBound(ws);
  switch (type) {
    case 'GET_STATE':
      return { type: 'ROOM_STATE', payload: publicRoom(room, player.id) };
    case 'START_CHALLENGE': {
      const challenge = startChallenge(room, player, payload);
      challenge.timer = setTimeout(() => {
        if (room.activeChallenge !== challenge || challenge.status !== 'betting') return;
        lockBetting(room, player, true);
        broadcast(room, 'BETTING_LOCKED', marketPayload(challenge));
        broadcastState(room);
      }, Math.max(0, challenge.bettingDeadline - Date.now()));
      challenge.timer.unref();
      const info = marketPayload(challenge);
      broadcast(room, 'CHALLENGE_STARTED', { challenge: info, text: challenge.text, type: challenge.type, targetPlayerId: challenge.targetPlayerId });
      broadcastState(room);
      return { type: 'CHALLENGE_STARTED', payload: { challenge: info, text: challenge.text, type: challenge.type, targetPlayerId: challenge.targetPlayerId } };
    }
    case 'PLACE_BET': {
      const bet = placeBet(room, player, payload);
      const confirmation = { challengeId: room.activeChallenge.id, bet: { id: bet.id, side: bet.side, amount: bet.amount }, balance: player.balance };
      send(ws, 'BET_PLACED', confirmation);
      broadcast(room, 'MARKET_UPDATED', marketPayload(room.activeChallenge));
      send(ws, 'BALANCE_UPDATED', { balance: player.balance });
      broadcastState(room);
      return { type: 'BET_PLACED', payload: confirmation };
    }
    case 'LOCK_BETTING': {
      const challenge = lockBetting(room, player);
      if (challenge.timer) clearTimeout(challenge.timer);
      const market = marketPayload(challenge);
      broadcast(room, 'BETTING_LOCKED', market);
      broadcast(room, 'MARKET_UPDATED', market);
      broadcastState(room);
      return { type: 'BETTING_LOCKED', payload: market };
    }
    case 'RESOLVE_CHALLENGE': {
      const summary = resolveChallenge(room, player, payload.result);
      for (const update of summary.payouts) {
        const winner = room.players.get(update.playerId);
        if (winner.ws) send(winner.ws, 'BALANCE_UPDATED', { balance: winner.balance });
      }
      broadcast(room, 'CHALLENGE_RESOLVED', summary);
      broadcast(room, 'LEADERBOARD_UPDATED', { leaderboard: summary.leaderboard });
      broadcastState(room);
      return { type: 'CHALLENGE_RESOLVED', payload: summary };
    }
    default: throw new Error(`Unknown event type: ${type}`);
  }
}

function assertUnbound(ws) { if (ws.player) throw new Error('This connection is already bound to a room.'); }
function requireBound(ws) { if (!ws.player || !ws.room || ws.player.ws !== ws) throw new Error('Join or reconnect to a room first.'); return { room: ws.room, player: ws.player }; }
function bind(ws, room, player) { ws.room = room; ws.player = player; }
function validUsername(value) { const name = typeof value === 'string' ? value.trim() : ''; if (!name || name.length > 24) throw new Error('Username must be between 1 and 24 characters.'); return name; }
function credentials(room, player) { return { roomCode: room.code, playerId: player.id, reconnectToken: player.token, balance: player.balance, isHost: room.hostId === player.id }; }

module.exports = { setupWebSocket };
