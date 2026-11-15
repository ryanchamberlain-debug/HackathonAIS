import { pick } from "./format";
import type { CardKind, Side } from "./types";

export interface HeadlineInput {
  kind: CardKind;
  name: string;
  prompt: string;
  outcome: Side;
  chickened: boolean;
  closingYes: number;
  topWinner?: string;
  topLoser?: string;
}

export function templateHeadline(h: HeadlineInput): { headline: string; subhead: string } {
  const odds = Math.round((h.outcome === "YES" ? h.closingYes : 1 - h.closingYes) * 100);
  const upset = odds < 30;

  let headline: string;
  if (h.chickened) {
    headline = pick([
      `${h.name.toUpperCase()} CHICKENS OUT. CHICKEN TAX LEVIED.`,
      `${h.name.toUpperCase()} FLEES THE TRADING FLOOR. COURAGE FUTURES COLLAPSE.`,
      `BAWK: ${h.name.toUpperCase()} REFUSES. POULTRY STOCKS SURGE.`,
    ]);
  } else if (h.kind === "dare" && h.outcome === "YES") {
    headline = pick([
      `${h.name.toUpperCase()} COMPLETES THE DARE. DIGNITY FUTURES PLUNGE.`,
      `BREAKING: ${h.name.toUpperCase()} ACTUALLY DID IT. ANALYSTS STUNNED.`,
      `${h.name.toUpperCase()} DELIVERS. SHORT SELLERS WEEP OPENLY.`,
    ]);
  } else if (h.kind === "dare") {
    headline = pick([
      `JURY RULES ${h.name.toUpperCase()}'S DARE A FRAUD. TRADING HALTED.`,
      `${h.name.toUpperCase()} PERFORMANCE DEEMED "NOT IT". REFUNDS DENIED.`,
    ]);
  } else if (h.outcome === "YES") {
    headline = pick([
      `${h.name.toUpperCase()} ADMITS IT. THE ROOM GASPS.`,
      `CONFESSION: ${h.name.toUpperCase()} SAYS YES. LAWYERS FURIOUS.`,
      `${h.name.toUpperCase()} COMES CLEAN. INVESTORS DEMAND DETAILS.`,
    ]);
  } else {
    headline = pick([
      `${h.name.toUpperCase()} DENIES EVERYTHING. NOBODY BELIEVES THEM.`,
      `"ABSOLUTELY NOT": ${h.name.toUpperCase()} SAYS NO. MARKETS SKEPTICAL.`,
    ]);
  }

  const bits: string[] = [];
  if (upset) bits.push(`Historic upset: only ${odds}% of the pot backed it.`);
  else bits.push(`${odds}% of the pot saw it coming.`);
  if (h.topWinner) bits.push(`${h.topWinner} cashes in.`);
  if (h.topLoser) bits.push(`${h.topLoser} is down bad.`);
  return { headline, subhead: bits.join(" ") };
}

export const FILLER_HEADLINES = [
  "DARESTREET INDEX +4.20% ON NOTHING IN PARTICULAR",
  "ANALYSTS DOWNGRADE THE SNACK TABLE TO 'SELL'",
  "FED CHAIR SPOTTED DOING THE WORM, MARKETS RALLY",
  "THE POT IS THE PRICE: PARI-MUTUEL MARKETS UP BIG",
  "EMBARRASSMENT REMAINS THE ROOM'S #1 EXPORT",
  "SHORT SELLERS CIRCLE THE BIRTHDAY PERSON",
  "REPORT: 9 OUT OF 10 TRADERS HAVE NO IDEA WHAT THEY'RE DOING",
  "CHICKEN FUTURES VOLATILE AHEAD OF NEXT DARE",
  "BREAKING: SOMEONE IS HOLDING THE AUX CORD HOSTAGE",
  "THIS IS NOT FINANCIAL ADVICE. THIS IS NOT EVEN FINANCE.",
];
