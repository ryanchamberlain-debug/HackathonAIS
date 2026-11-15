export function money(n: number, opts: { sign?: boolean; cents?: boolean } = {}) {
  const abs = Math.abs(n);
  const body = abs.toLocaleString("en-US", {
    minimumFractionDigits: opts.cents ? 2 : 0,
    maximumFractionDigits: opts.cents ? 2 : 0,
  });
  if (opts.sign) return `${n >= 0 ? "+" : "-"}$${body}`;
  return `${n < 0 ? "-" : ""}$${body}`;
}

export function cents(p: number) {
  return `${Math.round(p * 100)}¢`;
}

export function pct(p: number) {
  return `${Math.round(p * 100)}%`;
}

export function shares(n: number) {
  return n >= 100 ? Math.round(n).toLocaleString("en-US") : n.toFixed(1);
}

export function uid(prefix = "") {
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export function roomCode() {
  let s = "";
  for (let i = 0; i < 4; i++) s += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
  return s;
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}
