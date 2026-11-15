const express = require('express');
const http = require('node:http');
const { setupWebSocket } = require('./websocket');
const { rooms, playerRooms, ROOM_TTL_MS, publicRoom } = require('./rooms');

const app = express();
app.disable('x-powered-by');
app.get('/health', (_req, res) => res.json({ status: 'ok', uptimeSeconds: Math.floor(process.uptime()) }));
app.get('/rooms/:code', (req, res) => {
  const room = rooms.get(String(req.params.code).toUpperCase());
  if (!room) return res.status(404).json({ error: 'Room not found.' });
  return res.json(publicRoom(room, null));
});

const server = http.createServer(app);
setupWebSocket(server);

const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.lastActivityAt < ROOM_TTL_MS) continue;
    if (room.activeChallenge?.timer) clearTimeout(room.activeChallenge.timer);
    for (const player of room.players.values()) {
      if (player.ws) player.ws.close(4000, 'Room expired');
      playerRooms.delete(player.id);
      room.players.delete(player.id);
    }
    rooms.delete(code);
  }
}, Math.min(60_000, ROOM_TTL_MS));
cleanup.unref();

const port = Number(process.env.PORT) || 3001;
server.listen(port, () => console.log(`Party betting backend listening on http://localhost:${port}`));

function shutdown() {
  clearInterval(cleanup);
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
