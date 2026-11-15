import Link from "next/link";
import { JoinBox } from "@/components/JoinBox";
import { Logo, Sticker, Ticker } from "@/components/ui";
import { FILLER_HEADLINES } from "@/lib/headlines";

export default function Home() {
  return (
    <div className="grid-bg flex min-h-dvh flex-col">
      <Ticker items={FILLER_HEADLINES} />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-10 px-4 py-12">
        <div className="space-y-5">
          <Logo size="lg" />
          <p className="max-w-xl text-2xl font-semibold sm:text-3xl">
            Bet on your friends. <span className="text-yes">Profit</span> off their <span className="text-no">embarrassment.</span>
          </p>
          <p className="max-w-xl text-muted">
            A prediction market for truth or dare. Everyone gets $1,000 in fake credits. Every truth or dare becomes a YES/NO pot, winners split it, and the richest trader at the closing bell wins.
          </p>
          <Sticker>no real money. just real shame.</Sticker>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Link href="/host" className="group rounded-2xl border border-line bg-card p-6 transition hover:border-yes/60">
            <p className="text-sm text-muted">On the TV or a laptop</p>
            <p className="mt-2 font-display text-4xl tracking-wide group-hover:text-yes">HOST A GAME</p>
            <p className="mt-2 text-sm text-muted">Opens the trading floor with a QR code. Friends scan it with their phones.</p>
          </Link>
          <div className="rounded-2xl border border-line bg-card p-6">
            <p className="text-sm text-muted">On your phone</p>
            <p className="mt-2 font-display text-4xl tracking-wide">JOIN A ROOM</p>
            <JoinBox />
          </div>
        </div>
        <div className="grid gap-4 text-sm text-muted sm:grid-cols-4">
          {[
            ["🎲", "A market opens", "A random friend gets a truth or a dare. The room bets on whether they go through with it."],
            ["📈", "Everyone bets", "Put credits on YES or NO. The odds are each side's share of the pot."],
            ["🎭", "They perform", "They answer or do the dare. The jury votes legit or fraud."],
            ["🚨", "Chaos hits", "SEC raids, flash crashes and bailouts shake up the standings between rounds."],
          ].map(([e, t, d]) => (
            <div key={t} className="rounded-xl border border-line bg-card/60 p-4">
              <div className="text-2xl">{e}</div>
              <div className="mt-1 font-semibold text-ink">{t}</div>
              <p>{d}</p>
            </div>
          ))}
        </div>
      </main>
      <p className="pb-4 text-center text-[11px] text-muted">Fictional currency only. No deposits, withdrawals, crypto or prizes. Not financial advice.</p>
    </div>
  );
}
