# DARE STREET

**Bet on your friends. Profit off their embarrassment.**

A real-time multiplayer party game: Polymarket meets truth or dare. Everyone gets $1,000 in fictional money, each round one player gets a truth or a dare, and the room trades YES/NO shares on whether they'll do it. Richest trader at the closing bell wins.

> Fictional currency only. No crypto, deposits, withdrawals, real-money wagering or cash prizes.

## How to play
1. Open **/host** on a TV or laptop. It shows a room code and QR code.
2. Friends scan the QR (or go to **/play** and enter the code). No accounts.
3. Each round: a market lists (**NEW IPO**), everyone trades on their phones (**MARKET OPEN**), the subject answers or performs (**LIVE**), the room votes legit or fraud on dares (**JURY**), and the market settles. Shares pay $1 if their side wins.
4. Chaos events (SEC raids, flash crashes, bailouts) hit between rounds. The subject can trade their own market, but if they profit the SEC has a 50% chance of seizing it.
5. Players can submit their own truths and dares from the lobby.

## Run it
```bash
npm install
npm run dev        # http://localhost:3000
```

**Demo mode (no setup):** without Supabase keys, the game runs inside one browser. Open `/host`, click **Add bot** a couple of times, and use **Open a player tab** to play from a second tab.

**Live multiplayer (real phones):** create a free Supabase project, copy `.env.example` to `.env.local` and fill in the project URL and anon key. That's all; multiplayer uses Supabase Realtime Broadcast. Optionally run `supabase/schema.sql` so the host can recover a room after a refresh. Add the same two env vars in Vercel to deploy.

## How it works
- **Host-authoritative, Jackbox style.** The host screen runs the game engine (`lib/engine.ts`); phones send actions and receive state snapshots. The secret truth answer is stripped before broadcasting.
- **Real prediction-market pricing.** An LMSR automated market maker (`lib/lmsr.ts`) prices YES/NO shares, so odds move as people trade. Liquidity scales with room size.
- **Transport** (`lib/net.ts`): Supabase Realtime channel per room, or `BroadcastChannel` in demo mode. Same engine either way.
- Stack: Next.js 16 (App Router), TypeScript, Tailwind CSS 4, Framer Motion, Recharts, Supabase, Lucide.
