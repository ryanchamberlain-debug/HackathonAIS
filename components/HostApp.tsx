"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bot, ExternalLink, Users, FastForward, Play, RotateCcw, Square, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { use, useEffect, useState } from "react";
import { browser } from "react-dom";
import { nextBotProfile } from "@/lib/bots";
import { MAX_PLAYERS, addPlayer, advance, createGame, hostResolve, endGameNow, playAgain, playerById, removePlayer, startGame, updateSettings } from "@/lib/engine";
import { money, roomCode, uid } from "@/lib/format";
import { connectBackend, liveAvailable, loadRoom, netMode, openTransport, useHost, useNow, type Transport } from "@/lib/net";
import type { GameState } from "@/lib/types";
import { JoinOverlay } from "./JoinQR";
import { Avatar, Countdown, KindBadge, Leaderboard, Logo, PHASE_LABEL, PnL, PriceChart, Stamp, Sticker, Ticker, TradeFeed, TugOfWar } from "./ui";

export default function HostApp() {
  use(browser("The host screen keeps game state in this browser."));
  const [boot, setBoot] = useState<{ initial: GameState; transport: Transport } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const asked = params.get("code")?.toUpperCase();
    let transport: Transport | null = null;
    let cancelled = false;
    (async () => {
      let code = asked && /^[A-Z0-9]{4,6}$/.test(asked) ? asked : roomCode();
      if (netMode() === "backend") {
        // The backend owns room codes: reconnect to ours, or create a fresh room.
        transport = await connectBackend({ code: asked, host: true });
        code = transport.code;
      }
      const saved = await loadRoom(code);
      const initial = saved ?? createGame(code, Date.now());
      transport ??= await openTransport(code, true);
      if (cancelled) return transport.close();
      params.set("code", code);
      window.history.replaceState(null, "", `/host?${params.toString()}`);
      setBoot({ initial, transport });
    })().catch((e: Error) => !cancelled && setError(`${e.message} Start it with: cd backend && npm start`));
    return () => {
      cancelled = true;
      transport?.close();
    };
  }, []);

  if (error) return <div className="p-10 text-no">{error}</div>;
  if (!boot) return <div className="p-10 text-muted">Opening the exchange…</div>;
  return <HostScreen initial={boot.initial} transport={boot.transport} />;
}

function HostScreen({ initial, transport }: { initial: GameState; transport: Transport }) {
  const { state: s, commit } = useHost(initial, transport);
  const [showQR, setShowQR] = useState(false);
  const now = useNow();
  const mode = netMode();
  const joinUrl = `${window.location.origin}/play?code=${s.code}${mode === "local" && liveAvailable ? "&local=1" : ""}`;
  const m = s.market;
  const subject = playerById(s, m?.subjectId);

  const addBot = () =>
    commit((d, t) => {
      const prof = nextBotProfile(d);
      if (!prof) return false;
      addPlayer(d, { id: uid("bot"), name: prof.name, avatar: prof.avatar, isBot: true }, t);
    });

  const addCrew = () =>
    commit((d, t) => {
      for (let prof = nextBotProfile(d); prof && d.players.length < MAX_PLAYERS; prof = nextBotProfile(d)) {
        addPlayer(d, { id: uid("bot"), name: prof.name, avatar: prof.avatar, isBot: true }, t);
      }
    });

  return (
    <div className="grid-bg flex min-h-dvh flex-col">
      <header className="flex flex-wrap items-center gap-4 border-b border-line bg-bg/90 px-5 py-3">
        <Logo size="sm" />
        <span className="rounded bg-card px-2 py-1 font-mono text-xs text-muted">
          Room <span className="text-ink">{s.code}</span>
        </span>
        <span className={`rounded px-2 py-1 font-mono text-xs ${mode !== "local" ? "bg-yes/15 text-yes" : "bg-gold/15 text-gold"}`}>
          {mode === "local" ? "Demo: this browser only" : "Live: phones can join"}
        </span>
        {s.phase !== "lobby" && (
          <>
            <span className="font-mono text-xs text-muted">
              Round <span className="text-ink">{s.round} of {s.settings.rounds}</span>
            </span>
            <span className="rounded bg-no/15 px-2 py-1 font-mono text-xs font-bold text-no">
              {s.phase === "performing" ? <span className="blink">● </span> : null}
              {PHASE_LABEL[s.phase]}
            </span>
            <Countdown endsAt={s.phaseEndsAt} now={now} total={s.phase === "trading" ? s.settings.tradingSeconds * 1000 : undefined} />
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          {s.phase !== "lobby" && s.phase !== "final" && (
            <>
              {s.phase !== "performing" && (
                <button onClick={() => commit((d, t) => advance(d, t))} className="flex items-center gap-1 rounded-md border border-line px-3 py-1.5 text-sm hover:bg-card">
                  <FastForward className="size-4" /> Skip
                </button>
              )}
              <button onClick={() => confirm("End the game now?") && commit((d) => endGameNow(d))} className="flex items-center gap-1 rounded-md border border-line px-3 py-1.5 text-sm text-no hover:bg-card">
                <Square className="size-4" /> End
              </button>
            </>
          )}
          <button onClick={() => setShowQR(true)} className="flex items-center gap-2 rounded-md border border-line px-3 py-1.5 text-sm hover:bg-card" aria-label="Show the join QR code full screen">
            <QRCodeSVG value={joinUrl} size={28} bgColor="#0B1015" fgColor="#E8EEF2" /> Join QR
          </button>
        </div>
      </header>

      <main className="flex-1 p-5">
        <AnimatePresence mode="wait">
          <motion.div key={s.phase + s.round} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }}>
            {s.phase === "lobby" && <Lobby s={s} joinUrl={joinUrl} mode={mode} addBot={addBot} addCrew={addCrew} commit={commit} />}
            {m && subject && ["intro", "trading", "performing", "voting"].includes(s.phase) && (
              <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
                <section className="rounded-2xl border border-line bg-card p-6">
                  <div className="mb-4 flex items-center gap-3">
                    <Avatar p={subject} size={52} />
                    <div>
                      <div className="flex items-center gap-2">
                        <KindBadge kind={m.card.kind} />
                        {m.card.custom && <Sticker color="bg-hot" rotate="rotate-2">player submitted</Sticker>}
                      </div>
                      <h1 className="mt-1 text-3xl font-bold sm:text-4xl">{m.question}</h1>
                    </div>
                  </div>
                  <blockquote className="mb-5 rounded-xl border-l-4 border-gold bg-bg/60 p-4 text-xl leading-snug">{m.card.text}</blockquote>
                  {s.phase === "intro" ? (
                    <div className="py-10 text-center">
                      <p className="font-display text-5xl tracking-wide text-gold">NEW MARKET INCOMING</p>
                      <p className="mt-3 text-muted">Betting opens in a few seconds. Phones out.</p>
                    </div>
                  ) : (
                    <>
                      <TugOfWar market={m} />
                      <div className="mt-3 flex justify-between text-sm text-muted">
                        <span>
                          Pot <span className="num text-ink">{money(m.pools.YES + m.pools.NO)}</span> from <span className="num text-ink">{m.trades.length}</span> bets
                        </span>
                        <span>Winners split the whole pot</span>
                      </div>
                      <div className="mt-4">
                        <PriceChart market={m} height={150} />
                      </div>
                    </>
                  )}
                  {s.phase === "performing" && (
                    <div className="mt-5 rounded-xl border border-gold/40 bg-gold/5 p-5">
                      <p className="text-center text-lg">
                        <span className="blink text-no">● Live.</span> Betting is closed.{" "}
                        {m.card.kind === "dare" ? (
                          <>
                            <b>{subject.name}</b>, do the dare.{m.dareDone && <span className="text-yes"> They say they did it.</span>}
                          </>
                        ) : (
                          <>
                            <b>{subject.name}</b>, answer out loud.
                          </>
                        )}
                      </p>
                      <p className="mt-4 text-center text-sm text-muted">Host, call the result:</p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-3">
                        <button onClick={() => commit((d, t) => hostResolve(d, "YES", t))} className="rounded-xl bg-yes py-4 text-lg font-bold text-bg">
                          {m.card.kind === "dare" ? "They did it: YES" : "They said yes: YES"}
                        </button>
                        <button onClick={() => commit((d, t) => hostResolve(d, "NO", t))} className="rounded-xl bg-no py-4 text-lg font-bold text-bg">
                          {m.card.kind === "dare" ? "They didn't: NO" : "They said no: NO"}
                        </button>
                        <button onClick={() => commit((d, t) => hostResolve(d, "VOID", t))} className="rounded-xl border border-line py-4 text-lg font-semibold text-muted hover:text-ink">
                          Void and refund everyone
                        </button>
                      </div>
                    </div>
                  )}
                </section>
                <aside className="space-y-5">
                  <div className="rounded-2xl border border-line bg-card p-4">
                    <h2 className="mb-3 text-sm font-semibold text-muted">Live bets</h2>
                    <TradeFeed state={s} limit={9} />
                  </div>
                  <div className="rounded-2xl border border-line bg-card p-4">
                    <h2 className="mb-2 text-sm font-semibold text-muted">Richest on the floor</h2>
                    <Leaderboard state={s} compact limit={8} />
                  </div>
                </aside>
              </div>
            )}
            {s.phase === "resolution" && m?.result && subject && (
              <div className="mx-auto max-w-4xl text-center">
                <div className="mb-3 inline-block bg-no px-3 py-1 font-display text-xl tracking-widest">BREAKING NEWS</div>
                <div className="relative">
                  <h1 className="font-display text-4xl leading-tight tracking-wide sm:text-6xl">{m.result.headline}</h1>
                  <div className="absolute -right-2 -top-10 sm:-right-10">
                    <Stamp text={m.result.chickened ? "BAWK" : m.result.outcome === "VOID" ? "VOID" : m.result.outcome === "YES" ? "DID IT" : "REKT"} tone={m.result.outcome === "YES" ? "yes" : "no"} />
                  </div>
                </div>
                <p className="mt-4 text-lg text-muted">{m.result.subhead}</p>
                <div className="mt-8 inline-flex items-center gap-4 rounded-2xl border border-line bg-card px-6 py-4">
                  <span className="text-muted">Market resolved</span>
                  <span className={`font-display text-5xl ${m.result.outcome === "YES" ? "text-yes" : m.result.outcome === "NO" ? "text-no" : "text-muted"}`}>{m.result.outcome}</span>
                  <span className="text-sm text-muted">{m.result.reason}</span>
                </div>
                <p className="mt-5 text-lg text-muted">
                  Pot <span className="num text-ink">{money(m.result.totalPool)}</span>
                  {m.result.outcome === "VOID" ? " refunded to everyone" : m.result.refunded ? ". Nobody backed the winner, so all stakes were refunded" : " split among the winners by stake"}
                </p>
                <div className="mx-auto mt-8 grid max-w-3xl gap-2 sm:grid-cols-2">
                  {Object.entries(m.result.pnl)
                    .filter(([, v]) => Math.abs(v) >= 1)
                    .sort((a, b) => b[1] - a[1])
                    .map(([id, v]) => {
                      const p = playerById(s, id);
                      return (
                        <div key={id} className="flex items-center gap-3 rounded-lg border border-line bg-card px-3 py-2">
                          <Avatar p={p} size={28} />
                          <span className="flex-1 truncate text-left">{p?.name}</span>
                          <PnL value={v} />
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
            {s.phase === "event" && s.event && (
              <div className="mx-auto max-w-3xl py-10 text-center">
                <motion.div initial={{ scale: 0.6, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} className="text-8xl">
                  {s.event.emoji}
                </motion.div>
                <div className="mt-4 inline-block bg-gold px-3 py-1 font-display text-xl tracking-widest text-bg">MARKET EVENT</div>
                <h1 className="mt-4 font-display text-6xl tracking-wide">{s.event.title}</h1>
                <p className="mt-4 text-xl text-ink/85">{s.event.body}</p>
              </div>
            )}
            {s.phase === "leaderboard" && (
              <div className="mx-auto max-w-2xl">
                <h1 className="mb-1 font-display text-5xl tracking-wide">STANDINGS</h1>
                <p className="mb-5 text-muted">
                  After round {s.round} of {s.settings.rounds}. {s.round >= s.settings.rounds ? "Closing bell next." : "Next IPO loading…"}
                </p>
                <Leaderboard state={s} />
              </div>
            )}
            {s.phase === "final" && <Final s={s} again={() => commit((d) => playAgain(d))} />}
          </motion.div>
        </AnimatePresence>
      </main>
      {showQR && <JoinOverlay url={joinUrl} code={s.code} onClose={() => setShowQR(false)} />}
      <Ticker items={s.headlines} />
      <p className="py-1.5 text-center text-[11px] text-muted">Fictional money only. No deposits, no withdrawals, no real wagering. Nothing here is financial advice.</p>
    </div>
  );
}

function Lobby({ s, joinUrl, mode, addBot, addCrew, commit }: { s: GameState; joinUrl: string; mode: string; addBot: () => void; addCrew: () => void; commit: ReturnType<typeof useHost>["commit"] }) {
  const seg = (vals: number[], cur: number, set: (v: number) => void, fmt: (v: number) => string) => (
    <div className="flex gap-1">
      {vals.map((v) => (
        <button key={v} onClick={() => set(v)} className={`rounded-md px-3 py-1.5 font-mono text-sm ${cur === v ? "bg-ink text-bg" : "bg-card2 text-muted hover:text-ink"}`}>
          {fmt(v)}
        </button>
      ))}
    </div>
  );
  return (
    <div className="grid gap-8 lg:grid-cols-[420px_1fr]">
      <section className="rounded-2xl border border-line bg-card p-6 text-center">
        <p className="text-sm text-muted">Scan to join, or go to</p>
        <p className="mt-1 break-all font-mono text-sm text-gold">{joinUrl.replace(/^https?:\/\//, "")}</p>
        <div className="mx-auto my-5 w-fit rounded-xl bg-ink p-3">
          <QRCodeSVG value={joinUrl} size={220} />
        </div>
        <p className="text-sm text-muted">Room code</p>
        <p className="num text-6xl font-bold tracking-[0.3em]">{s.code}</p>
        {mode === "local" && (
          <div className="mt-4 rounded-lg bg-gold/10 p-3 text-left text-sm text-gold">
            Demo mode: phones can&apos;t reach this room. Open player tabs in this same browser, or add bots.{" "}
            {!liveAvailable && "Add Supabase keys to play on real phones."}
            <a href={joinUrl} target="_blank" className="mt-2 flex items-center gap-1 font-semibold underline">
              <ExternalLink className="size-4" /> Open a player tab
            </a>
          </div>
        )}
      </section>
      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-5xl tracking-wide">TRADING FLOOR</h1>
            <p className="text-muted">
              {s.players.length} trader{s.players.length === 1 ? "" : "s"} in. Everyone starts with $1,000. You need at least 2 to start.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={addCrew} className="flex items-center gap-1.5 rounded-lg border border-line bg-card px-4 py-2.5 text-sm hover:bg-card2">
              <Users className="size-4" /> Add the crew
            </button>
            <button onClick={addBot} className="flex items-center gap-1.5 rounded-lg border border-line bg-card px-4 py-2.5 text-sm hover:bg-card2">
              <Bot className="size-4" /> Add one
            </button>
            <button
              disabled={s.players.length < 2}
              onClick={() => commit((d, t) => startGame(d, t))}
              className="flex items-center gap-1.5 rounded-lg bg-yes px-5 py-2.5 font-bold text-bg disabled:opacity-40"
            >
              <Play className="size-4 fill-bg" /> Ring the opening bell
            </button>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-6 rounded-xl border border-line bg-card p-4">
          <label className="space-y-1.5">
            <span className="block text-xs text-muted">Rounds</span>
            {seg([4, 6, 8, 12], s.settings.rounds, (v) => commit((d) => updateSettings(d, { rounds: v })), String)}
          </label>
          <label className="space-y-1.5">
            <span className="block text-xs text-muted">Betting window</span>
            {seg([25, 40, 60], s.settings.tradingSeconds, (v) => commit((d) => updateSettings(d, { tradingSeconds: v })), (v) => `${v}s`)}
          </label>
          <div className="space-y-1.5">
            <span className="block text-xs text-muted">Cards from phones</span>
            <span className="num text-lg">{s.customCards.length}</span>
            
          </div>
        </div>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence>
            {s.players.map((p) => (
              <motion.li key={p.id} layout initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }} className="flex items-center gap-3 rounded-xl border border-line bg-card p-3">
                <Avatar p={p} size={42} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{p.name}</div>
                  <div className="num text-xs text-yes">{money(p.cash)}</div>
                </div>
                {p.isBot && <span className="font-mono text-[10px] text-muted">BOT</span>}
                <button aria-label={`Remove ${p.name}`} onClick={() => commit((d) => removePlayer(d, p.id))} className="text-muted hover:text-no">
                  <X className="size-4" />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
          {s.players.length === 0 && <li className="col-span-full rounded-xl border border-dashed border-line p-10 text-center text-muted">Waiting for traders. Scan the code with your phone.</li>}
        </ul>
        <div className="mt-6 grid gap-3 text-sm text-muted sm:grid-cols-3">
          <p>
            <b className="text-ink">1. IPO.</b> Each round, one player gets a truth or a dare. It becomes a YES/NO market.
          </p>
          <p>
            <b className="text-ink">2. Bet.</b> Put credits on YES or NO. Odds are each side&apos;s share of the pot. Winners split the pot.
          </p>
          <p>
            <b className="text-ink">3. Settle.</b> They answer or perform, the jury votes, and the market pays out. Richest at the bell wins.
          </p>
        </div>
      </section>
    </div>
  );
}

function Final({ s, again }: { s: GameState; again: () => void }) {
  const sorted = [...s.players].sort((a, b) => b.cash - a.cash);
  const podium = sorted.slice(0, 3);
  return (
    <div className="mx-auto max-w-5xl text-center">
      <p className="text-lg text-gold">🔔 Closing bell</p>
      <h1 className="font-display text-6xl tracking-wide sm:text-7xl">{podium[0]?.name.toUpperCase()} WINS DARE STREET</h1>
      <div className="mt-8 flex items-end justify-center gap-4">
        {[podium[1], podium[0], podium[2]].map((p, i) =>
          p ? (
            <motion.div key={p.id} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 * i }} className="w-36">
              <Avatar p={p} size={i === 1 ? 84 : 60} />
              <div className="mt-2 truncate font-semibold">{p.name}</div>
              <div className="num text-yes">{money(p.cash)}</div>
              <div className={`mt-2 rounded-t-lg bg-card2 ${i === 1 ? "h-32" : i === 0 ? "h-20" : "h-14"} flex items-start justify-center pt-2 font-display text-3xl`}>{i === 1 ? 1 : i === 0 ? 2 : 3}</div>
            </motion.div>
          ) : null,
        )}
      </div>
      <div className="mt-10 grid gap-3 text-left sm:grid-cols-2 lg:grid-cols-4">
        {s.awards.map((a) => {
          const p = playerById(s, a.playerId);
          return (
            <div key={a.id} className="rounded-xl border border-line bg-card p-4">
              <div className="text-3xl">{a.emoji}</div>
              <div className="mt-1 font-bold">{a.title}</div>
              <div className="mt-1 flex items-center gap-2">
                <Avatar p={p} size={22} /> <span className="truncate">{p?.name}</span>
              </div>
              <div className="mt-1 text-xs text-muted">{a.detail}</div>
            </div>
          );
        })}
      </div>
      <button onClick={again} className="mt-10 inline-flex items-center gap-2 rounded-lg bg-yes px-6 py-3 font-bold text-bg">
        <RotateCcw className="size-4" /> Run it back (same players)
      </button>
    </div>
  );
}
