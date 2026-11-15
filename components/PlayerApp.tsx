"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Plus } from "lucide-react";
import { use, useEffect, useState } from "react";
import { browser } from "react-dom";
import { AVATARS, currentYes, playerById, ranks } from "@/lib/engine";
import { cents, money, uid } from "@/lib/format";
import { estimatePayout, MIN_BET, multiplier } from "@/lib/parimutuel";
import { usePlayer, useNow } from "@/lib/net";
import type { CardKind, GameState, Side } from "@/lib/types";
import { Avatar, Countdown, KindBadge, Logo, OddsBar, PHASE_LABEL, PnL, PositionLine, PriceChart } from "./ui";

export default function PlayerApp() {
  use(browser("Each phone keeps its player ID in this tab."));
  const params = new URLSearchParams(window.location.search);
  const code = (params.get("code") ?? "").toUpperCase();
  const [pid] = useState(() => {
    const key = `darestreet:pid:${code}`;
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const id = uid("p");
    sessionStorage.setItem(key, id);
    return id;
  });
  if (!/^[A-Z0-9]{4,6}$/.test(code)) {
    return (
      <div className="p-8 text-center">
        <p>That room code doesn&apos;t look right.</p>
        <Link href="/" className="text-gold underline">Back to the lobby</Link>
      </div>
    );
  }
  return <Player code={code} pid={pid} />;
}

function Player({ code, pid }: { code: string; pid: string }) {
  const { state: s, offset, lastSeen, act, error } = usePlayer(code, pid);
  const now = useNow();
  const me = s ? playerById(s, pid) : undefined;
  const hostGone = s && now - lastSeen > 9000;

  useEffect(() => {
    if (s?.phase && s.phase !== "lobby") navigator.vibrate?.(40);
  }, [s?.phase]);

  if (!s && error) {
    return (
      <Shell code={code}>
        <div className="py-16 text-center">
          <p className="text-no">{error}</p>
          <Link href="/" className="mt-3 inline-block text-gold underline">Back to the lobby</Link>
        </div>
      </Shell>
    );
  }
  if (!s) {
    return (
      <Shell code={code}>
        <div className="py-16 text-center">
          <p className="blink font-mono text-gold">CONNECTING TO ROOM {code}…</p>
          <p className="mt-3 text-sm text-muted">Make sure the host screen is open. In demo mode, use a tab in the same browser.</p>
        </div>
      </Shell>
    );
  }
  if (!me) return <Shell code={code}><JoinForm s={s} onJoin={(name, avatar) => act({ t: "join", name, avatar })} /></Shell>;

  const m = s.market;
  const subject = playerById(s, m?.subjectId);
  const isSubject = m?.subjectId === pid;
  const rank = ranks(s)[pid];

  return (
    <Shell code={code} me={me} rank={rank} total={s.players.length}>
      {hostGone && <p className="mb-3 rounded-lg bg-no/15 p-2 text-center text-sm text-no">Lost the host screen. Reconnecting…</p>}
      <div className="mb-3 flex items-center justify-between">
        <span className="rounded bg-card px-2 py-1 font-mono text-[11px] tracking-widest text-muted">
          {s.phase === "lobby" ? "PRE-MARKET" : `R${s.round}/${s.settings.rounds} · ${PHASE_LABEL[s.phase]}`}
        </span>
        <Countdown endsAt={s.phaseEndsAt} offset={offset} now={now} />
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={s.phase + s.round} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}>
          {s.phase === "lobby" && <LobbyCard s={s} submit={(kind, text) => act({ t: "submitCard", kind, text })} />}
          {m && subject && ["intro", "trading", "performing", "voting"].includes(s.phase) && (
            <div className="space-y-3">
              <div className="rounded-2xl border border-line bg-card p-4">
                <div className="flex items-center gap-2">
                  <Avatar p={subject} size={30} />
                  <KindBadge kind={m.card.kind} />
                  {isSubject && <span className="ml-auto rounded bg-hot px-2 py-0.5 font-marker text-xs text-bg">THAT&apos;S YOU</span>}
                </div>
                <h2 className="mt-2 text-xl font-bold leading-tight">{m.question}</h2>
                <p className="mt-1 text-sm text-ink/80">{m.card.text}</p>
                {s.phase !== "intro" && (
                  <div className="mt-3">
                    <OddsBar yes={currentYes(m)} />
                    <div className="mt-1 flex justify-between font-mono text-xs">
                      <span className="text-yes">YES {cents(currentYes(m))}</span>
                      <span className="text-no">NO {cents(1 - currentYes(m))}</span>
                    </div>
                  </div>
                )}
              </div>

              {isSubject && m.card.kind === "truth" && !m.truthLocked && ["intro", "trading", "performing"].includes(s.phase) && (
                <div className="rounded-2xl border border-hot/50 bg-hot/10 p-4">
                  <p className="font-semibold">Lock your secret answer</p>
                  <p className="mb-3 text-xs text-muted">Only you know it until the reveal. Be honest. The room will judge.</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(["YES", "NO"] as Side[]).map((a) => (
                      <button key={a} onClick={() => act({ t: "truth", answer: a })} className={`rounded-xl py-3 font-bold text-bg ${a === "YES" ? "bg-yes" : "bg-no"}`}>
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {isSubject && m.card.kind === "truth" && m.truthLocked && s.phase !== "voting" && (
                <p className="rounded-xl bg-card2 p-3 text-center text-sm">🔒 Answer locked. Keep a straight face.</p>
              )}

              {s.phase === "intro" && <p className="py-6 text-center font-display text-3xl tracking-wide text-gold">TRADING OPENS SOON</p>}
              {s.phase === "trading" && <TradePanel s={s} pid={pid} act={act} isSubject={isSubject} />}

              {s.phase === "performing" && isSubject && m.card.kind === "dare" && (
                <div className="space-y-2">
                  <p className="text-center text-sm text-muted">You&apos;re live. Do the dare, then tap below. The room votes on whether it counts.</p>
                  <button onClick={() => act({ t: "dareDone" })} className="w-full rounded-xl bg-yes py-5 text-xl font-bold text-bg">
                    I DID IT
                  </button>
                  <button onClick={() => act({ t: "chicken" })} className="w-full rounded-xl border border-no/60 py-3 font-semibold text-no">
                    🐔 Chicken out (-$100 chicken tax)
                  </button>
                </div>
              )}
              {s.phase === "performing" && isSubject && m.card.kind === "truth" && !m.truthLocked && (
                <button onClick={() => act({ t: "chicken" })} className="w-full rounded-xl border border-no/60 py-3 font-semibold text-no">
                  🐔 Refuse to answer (-$100 chicken tax)
                </button>
              )}
              {s.phase === "performing" && !isSubject && (
                <p className="rounded-xl bg-no/10 p-4 text-center">
                  <span className="blink text-no">● LIVE</span> Market closed. Eyes on <b>{subject.name}</b>.
                </p>
              )}
              {s.phase === "voting" &&
                (isSubject ? (
                  <p className="rounded-xl bg-card2 p-4 text-center">⚖️ The jury is deliberating your fate.</p>
                ) : (
                  <div>
                    <p className="mb-2 text-center text-sm text-muted">Did {subject.name} actually do the dare?</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => act({ t: "vote", legit: true })} className={`rounded-xl py-5 text-lg font-bold ${m.votes[pid] === true ? "bg-yes text-bg" : "border border-yes/60 text-yes"}`}>
                        LEGIT
                      </button>
                      <button onClick={() => act({ t: "vote", legit: false })} className={`rounded-xl py-5 text-lg font-bold ${m.votes[pid] === false ? "bg-no text-bg" : "border border-no/60 text-no"}`}>
                        FRAUD
                      </button>
                    </div>
                  </div>
                ))}
              {s.phase !== "trading" && s.phase !== "intro" && (
                <p className="text-center text-sm text-muted">
                  Your position: <PositionLine market={m} pid={pid} />
                </p>
              )}
            </div>
          )}
          {s.phase === "resolution" && m?.result && (
            <div className="space-y-4 py-4 text-center">
              <p className="font-mono text-xs tracking-widest text-muted">MARKET SETTLED</p>
              <p className={`font-display text-6xl ${m.result.outcome === "YES" ? "text-yes" : "text-no"}`}>{m.result.outcome}</p>
              <p className="text-sm text-muted">{m.result.reason}</p>
              <div className="rounded-2xl border border-line bg-card p-5">
                <p className="text-sm text-muted">Your round</p>
                <PnL value={m.result.pnl[pid] ?? 0} className="text-4xl" />
                {m.result.refunded && <p className="mt-2 text-sm text-muted">Nobody backed the winning side, so every stake was refunded.</p>}
              </div>
              <p className="font-display text-xl leading-snug tracking-wide">{m.result.headline}</p>
            </div>
          )}
          {s.phase === "event" && s.event && (
            <div className="py-8 text-center">
              <div className="text-7xl">{s.event.emoji}</div>
              <h2 className="mt-3 font-display text-4xl tracking-wide">{s.event.title}</h2>
              <p className="mt-2 text-ink/85">{s.event.body}</p>
              {s.event.deltas[pid] ? <PnL value={s.event.deltas[pid]} className="mt-4 block text-3xl" /> : <p className="mt-4 text-sm text-muted">You were spared.</p>}
            </div>
          )}
          {s.phase === "leaderboard" && (
            <div className="py-8 text-center">
              <p className="text-muted">You&apos;re ranked</p>
              <p className="num text-7xl font-bold">#{rank}</p>
              <p className="text-muted">of {s.players.length} · {money(me.cash)}</p>
              <p className="mt-6 text-sm text-muted">Full standings are on the big screen.</p>
            </div>
          )}
          {s.phase === "final" && (
            <div className="space-y-4 py-6 text-center">
              <p className="font-mono text-xs tracking-widest text-gold">🔔 CLOSING BELL</p>
              <p className="num text-7xl font-bold">#{rank}</p>
              <p className="text-lg">{rank === 1 ? "You are the Wolf of Dare Street." : "Better luck next IPO."}</p>
              <p className="num text-2xl">{money(me.cash)}</p>
              {s.awards
                .filter((a) => a.playerId === pid)
                .map((a) => (
                  <div key={a.id} className="rounded-xl border border-gold/50 bg-gold/10 p-3">
                    {a.emoji} <b>{a.title}</b>
                    <div className="text-xs text-muted">{a.detail}</div>
                  </div>
                ))}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </Shell>
  );
}

function Shell({ code, me, rank, total, children }: { code: string; me?: ReturnType<typeof playerById>; rank?: number; total?: number; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-6">
      <header className="sticky top-0 z-10 -mx-4 mb-4 flex items-center gap-3 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur">
        {me ? (
          <>
            <Avatar p={me} size={34} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{me.name}</div>
              <div className="font-mono text-[11px] text-muted">
                ROOM {code}
                {rank ? ` · #${rank}/${total}` : ""}
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-[10px] text-muted">CASH</div>
              <div className="num text-lg font-bold text-yes">{money(me.cash)}</div>
            </div>
          </>
        ) : (
          <Logo size="sm" />
        )}
      </header>
      <main className="flex-1">{children}</main>
      <p className="mt-6 text-center text-[10px] text-muted">Fictional money. No real wagering. Not financial advice.</p>
    </div>
  );
}

function JoinForm({ s, onJoin }: { s: GameState; onJoin: (name: string, avatar: string) => void }) {
  const [name, setName] = useState(() => localStorage.getItem("darestreet:name") ?? "");
  const [avatar, setAvatar] = useState(() => localStorage.getItem("darestreet:avatar") ?? AVATARS[Math.floor(Math.random() * AVATARS.length)]);
  const [sent, setSent] = useState(false);
  const submit = () => {
    if (!name.trim()) return;
    localStorage.setItem("darestreet:name", name.trim());
    localStorage.setItem("darestreet:avatar", avatar);
    setSent(true);
    onJoin(name.trim(), avatar);
  };
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-4xl tracking-wide">OPEN AN ACCOUNT</h1>
        <p className="text-sm text-muted">
          Room <span className="font-mono text-ink">{s.code}</span> · {s.players.length} traders on the floor · $1,000 starting balance
        </p>
      </div>
      <input
        autoFocus
        value={name}
        maxLength={16}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="Your trader name"
        className="w-full rounded-xl border border-line bg-card px-4 py-3.5 text-lg outline-none focus:border-gold"
      />
      <div className="grid grid-cols-8 gap-1.5">
        {AVATARS.map((a) => (
          <button key={a} onClick={() => setAvatar(a)} className={`aspect-square rounded-lg text-2xl ${a === avatar ? "bg-gold/25 ring-2 ring-gold" : "bg-card"}`}>
            {a}
          </button>
        ))}
      </div>
      <button disabled={!name.trim() || sent} onClick={submit} className="w-full rounded-xl bg-yes py-4 text-lg font-bold text-bg disabled:opacity-50">
        {sent ? "Joining…" : "Join the trading floor"}
      </button>
      {s.phase !== "lobby" && <p className="text-center text-xs text-muted">Game in progress. You&apos;ll jump in with $1,000.</p>}
    </div>
  );
}

function LobbyCard({ s, submit }: { s: GameState; submit: (kind: CardKind, text: string) => void }) {
  const [kind, setKind] = useState<CardKind>("dare");
  const [text, setText] = useState("");
  const [count, setCount] = useState(0);
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line bg-card p-5 text-center">
        <p className="text-4xl">📈</p>
        <p className="mt-2 font-semibold">You&apos;re on the floor.</p>
        <p className="text-sm text-muted">Waiting for the host to ring the opening bell. {s.players.length} traders here.</p>
      </div>
      <div className="rounded-2xl border border-line bg-card p-4">
        <p className="font-semibold">IPO your own card</p>
        <p className="mb-3 text-xs text-muted">Submit a truth (yes/no question) or a dare. It goes into tonight&apos;s deck anonymously. Keep it fun, not cruel.</p>
        <div className="mb-2 flex gap-1">
          {(["dare", "truth"] as CardKind[]).map((k) => (
            <button key={k} onClick={() => setKind(k)} className={`rounded-md px-3 py-1 font-mono text-xs uppercase ${kind === k ? "bg-ink text-bg" : "bg-card2 text-muted"}`}>
              {k}
            </button>
          ))}
        </div>
        <textarea
          value={text}
          maxLength={160}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder={kind === "dare" ? "Do your best impression of…" : "Have you ever…?"}
          className="w-full resize-none rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-gold"
        />
        <button
          disabled={text.trim().length < 6}
          onClick={() => {
            submit(kind, text);
            setText("");
            setCount((c) => c + 1);
          }}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-card2 py-2.5 text-sm font-semibold disabled:opacity-40"
        >
          {count ? <Check className="size-4 text-yes" /> : <Plus className="size-4" />} Submit to the deck {count ? `(${count} sent)` : ""}
        </button>
      </div>
    </div>
  );
}

const CHIPS = [10, 50, 100, 250];

function TradePanel({ s, pid, act, isSubject }: { s: GameState; pid: string; act: ReturnType<typeof usePlayer>["act"]; isSubject: boolean }) {
  const m = s.market!;
  const me = playerById(s, pid)!;
  const [side, setSide] = useState<Side>("YES");
  const [amount, setAmount] = useState(50);
  const [flash, setFlash] = useState<string | null>(null);
  const spend = Math.min(amount, Math.floor(me.cash));
  const est = estimatePayout(m.pools, side, spend);
  const pot = m.pools.YES + m.pools.NO;

  if (isSubject) {
    return (
      <div className="rounded-2xl border border-gold/50 bg-gold/10 p-4 text-center">
        <p className="font-semibold">You&apos;re the target. You can&apos;t bet on yourself.</p>
        <p className="mt-1 text-sm text-muted">
          Pot so far: <span className="num text-ink">{money(pot)}</span>. Watch the room bet on you.
        </p>
      </div>
    );
  }

  const bet = () => {
    if (spend < MIN_BET) return;
    act({ t: "bet", side, amount: spend });
    navigator.vibrate?.(20);
    setFlash(`Bet ${money(spend)} on ${side}`);
    setTimeout(() => setFlash(null), 1200);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {(["YES", "NO"] as Side[]).map((x) => {
          const p = x === "YES" ? currentYes(m) : 1 - currentYes(m);
          const mult = multiplier(m.pools, x);
          const on = side === x;
          const tone = x === "YES" ? (on ? "bg-yes text-bg" : "bg-yes/10 text-yes") : on ? "bg-no text-bg" : "bg-no/10 text-no";
          return (
            <button key={x} onClick={() => setSide(x)} className={`rounded-xl py-3 text-center transition ${tone}`}>
              <div className="text-sm font-semibold">{x}</div>
              <div className="num text-2xl font-bold">{Math.round(p * 100)}%</div>
              <div className="num text-xs opacity-80">{mult ? `pays ${mult.toFixed(2)}x` : "empty pool"}</div>
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {CHIPS.map((c) => (
          <button key={c} onClick={() => setAmount(c)} className={`num rounded-lg py-2 text-sm ${amount === c ? "bg-ink text-bg" : "bg-card2"}`}>
            ${c}
          </button>
        ))}
        <button onClick={() => setAmount(Math.floor(me.cash))} className={`rounded-lg py-2 text-xs font-bold ${amount >= Math.floor(me.cash) ? "bg-hot text-bg" : "bg-card2 text-hot"}`}>
          ALL IN
        </button>
      </div>
      <button disabled={spend < MIN_BET} onClick={bet} className={`w-full rounded-xl py-4 text-lg font-bold text-bg disabled:opacity-40 ${side === "YES" ? "bg-yes" : "bg-no"}`}>
        Bet {money(spend)} {side} · est. {money(est)} back
      </button>
      <p className="text-center text-xs text-muted">
        Pot <span className="num text-ink">{money(pot)}</span>. Winners split the whole pot by stake, so the estimate moves as others bet. Min bet ${MIN_BET}.
      </p>
      <AnimatePresence>
        {flash && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center text-sm text-gold">
            {flash}
          </motion.p>
        )}
      </AnimatePresence>
      <div className="rounded-xl border border-line bg-card p-3">
        <PriceChart market={m} height={110} />
      </div>
      <div className="flex justify-between rounded-xl border border-line bg-card p-3 text-sm">
        <span className="text-muted">Your bets</span>
        <PositionLine market={m} pid={pid} />
      </div>
    </div>
  );
}
