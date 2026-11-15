# Party Betting Backend

An in-memory Node.js backend for a multiplayer truth-or-dare prediction game. Credits are virtual, have no real-world monetary value, cannot be purchased, and cannot be redeemed. Room state is lost when the server process stops.

## Start

```sh
cd backend
npm install
npm start
```

The server listens on port `3001` by default. Set `PORT` to change it. `ROOM_TTL_MS` controls inactive room cleanup (default: six hours); `MAX_MESSAGE_BYTES` sets the WebSocket message size limit (default: 16 KiB).

HTTP endpoints:

- `GET /health` returns `{ "status": "ok", "uptimeSeconds": 12 }`.
- `GET /rooms/:code` returns public room state, or 404 if it does not exist. It never returns reconnect tokens.

## WebSocket protocol

Connect to `ws://localhost:3001`. Every request has a unique `requestId`, a `type`, and an object `payload`. Responses echo the request ID. Errors use `{ "type": "ERROR", "payload": { "message": "..." }, "requestId": "..." }`. The server rejects malformed requests, requests over the size limit, and connections sending more than 60 messages per 10 seconds.

### Client events

| Event | Payload | Notes |
| --- | --- | --- |
| `CREATE_ROOM` | `{ "username": "Ari" }` | Creates a room; sender becomes host. |
| `JOIN_ROOM` | `{ "roomCode": "AB23CD", "username": "Sam" }` | Joins an existing room. |
| `RECONNECT` | `{ "roomCode": "AB23CD", "playerId": "…", "reconnectToken": "…" }` | Restores a session. Store credentials privately on the client. |
| `GET_STATE` | `{}` | Returns current room state, with the caller's own bets only. |
| `START_CHALLENGE` | `{ "targetPlayerId": "…", "text": "Tell a story", "challengeType": "truth", "bettingDurationSeconds": 60 }` | Host only. `text` and `challengeType` may both be omitted to select a predefined prompt. Duration is 5–3600 seconds. |
| `PLACE_BET` | `{ "side": "YES", "amount": 50 }` | Minimum 10 whole credits; target cannot bet. Multiple bets are allowed. |
| `LOCK_BETTING` | `{}` | Host only; deadline locks automatically. |
| `RESOLVE_CHALLENGE` | `{ "result": "YES" }` | Host only; result is `YES`, `NO`, or `VOID`. Can only settle once. |

Example request:

```json
{"type":"CREATE_ROOM","requestId":"req-1","payload":{"username":"Ari"}}
```

Example private response (save the reconnect token securely; never share it):

```json
{"type":"ROOM_JOINED","requestId":"req-1","payload":{"roomCode":"AB23CD","playerId":"player-uuid","reconnectToken":"private-random-token","balance":1000,"isHost":true}}
```

`START_CHALLENGE` broadcasts `CHALLENGE_STARTED` with challenge details, current pools, odds, and deadline. `PLACE_BET` returns `BET_PLACED` privately, broadcasts `MARKET_UPDATED`, and sends the new balance to the bettor. `LOCK_BETTING` broadcasts `BETTING_LOCKED`. `RESOLVE_CHALLENGE` broadcasts `CHALLENGE_RESOLVED` and `LEADERBOARD_UPDATED`, and sends `BALANCE_UPDATED` to players who receive a payout or refund. `ROOM_STATE` is broadcast on joins, disconnects, and game state changes. Public player lists contain IDs, usernames, balances, connection status, and host status; private reconnect tokens are never included.

Markets use pari-mutuel pools. Odds are pool fractions (0–1) and default to 0.5 each when empty. Winning players split the total pool in proportion to their winning stakes; payouts include the original stake. Whole-credit remainders go to the largest fractional remainders, with bet order breaking ties. If no one backed the result, all stakes are refunded. `VOID` refunds all stakes. These rules preserve the total credits in play.

### Server events

| Event | Contents |
| --- | --- |
| `ROOM_JOINED` | Private room code, player ID, reconnect token, balance, and host flag. |
| `ROOM_STATE` | Current room, players, leaderboard, active market, and recent results. The active market includes only the recipient's own bets. |
| `CHALLENGE_STARTED` | New challenge text/type/target and market state. |
| `BET_PLACED` | Private accepted bet and bettor's balance. |
| `MARKET_UPDATED` | YES/NO pools, total wagered, odds, status, and deadline. |
| `BETTING_LOCKED` | Market closed and final pools. |
| `CHALLENGE_RESOLVED` | Result, settlement payouts/refunds, and leaderboard. |
| `BALANCE_UPDATED` | Private current balance. |
| `LEADERBOARD_UPDATED` | Room rankings by current balance. |
| `ERROR` | Descriptive validation or authorization failure. |

## Browser example

```js
const ws = new WebSocket('ws://localhost:3001');
const pending = new Map();

ws.addEventListener('message', ({ data }) => {
  const event = JSON.parse(data);
  if (event.requestId && pending.has(event.requestId)) {
    pending.get(event.requestId)(event);
    pending.delete(event.requestId);
  }
  if (event.type === 'ROOM_STATE') renderRoom(event.payload);
  if (event.type === 'MARKET_UPDATED') renderMarket(event.payload);
});

function request(type, payload = {}) {
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    pending.set(requestId, (event) => event.type === 'ERROR'
      ? reject(new Error(event.payload.message))
      : resolve(event.payload));
    ws.send(JSON.stringify({ type, requestId, payload }));
  });
}

// Create a room after the socket opens:
// const session = await request('CREATE_ROOM', { username: 'Ari' });
// Keep session.playerId and session.reconnectToken in private client storage.
// await request('PLACE_BET', { side: 'YES', amount: 50 });
```
