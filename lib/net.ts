"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { botActions } from "./bots";
import { applyAction, publicState, tick } from "./engine";
import type { GameState, PlayerAction, WireMsg } from "./types";

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const liveAvailable = Boolean(SB_URL && SB_KEY);

let client: SupabaseClient | null = null;
function supabase() {
  if (!liveAvailable) return null;
  client ??= createClient(SB_URL!, SB_KEY!);
  return client;
}

export type NetMode = "live" | "local";
export function netMode(): NetMode {
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("local") === "1") return "local";
  return liveAvailable ? "live" : "local";
}

interface Transport {
  send(m: WireMsg): void;
  close(): void;
}

function openTransport(code: string, onMsg: (m: WireMsg) => void): Transport {
  if (netMode() === "live") {
    const sb = supabase()!;
    const ch = sb.channel(`darestreet-${code}`, { config: { broadcast: { self: false, ack: false } } });
    ch.on("broadcast", { event: "m" }, ({ payload }) => onMsg(payload as WireMsg));
    ch.subscribe();
    return {
      send: (m) => void ch.send({ type: "broadcast", event: "m", payload: m }),
      close: () => void sb.removeChannel(ch),
    };
  }
  const bc = new BroadcastChannel(`darestreet-${code}`);
  bc.onmessage = (e) => onMsg(e.data as WireMsg);
  return { send: (m) => bc.postMessage(m), close: () => bc.close() };
}

// ---------- persistence (host refresh recovery) ----------
let remoteOff = false;
export function saveRoom(s: GameState) {
  try {
    localStorage.setItem(`darestreet:room:${s.code}`, JSON.stringify(s));
  } catch {}
  const sb = supabase();
  if (sb && !remoteOff && netMode() === "live") {
    void sb
      .from("dare_rooms")
      .upsert({ code: s.code, state: s, updated_at: new Date().toISOString() })
      .then(({ error }) => {
        if (error) remoteOff = true;
      });
  }
}
export async function loadRoom(code: string): Promise<GameState | null> {
  try {
    const raw = localStorage.getItem(`darestreet:room:${code}`);
    if (raw) return JSON.parse(raw) as GameState;
  } catch {}
  const sb = supabase();
  if (sb && netMode() === "live") {
    const { data } = await sb.from("dare_rooms").select("state").eq("code", code).maybeSingle();
    if (data?.state) return data.state as GameState;
  }
  return null;
}

// ---------- host ----------
export function useHost(initial: GameState) {
  const [state, setState] = useState(initial);
  const ref = useRef(initial);
  const tRef = useRef<Transport | null>(null);
  const lastSent = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef(0);

  const broadcast = useCallback(() => {
    const send = () => {
      lastSent.current = Date.now();
      timer.current = null;
      tRef.current?.send({ k: "state", s: publicState(ref.current, Date.now()) });
      if (Date.now() - lastSaved.current > 1500) {
        lastSaved.current = Date.now();
        saveRoom(ref.current);
      }
    };
    const wait = 120 - (Date.now() - lastSent.current);
    if (wait <= 0) send();
    else timer.current ??= setTimeout(send, wait);
  }, []);

  const commit = useCallback(
    (fn: (d: GameState, now: number) => boolean | void) => {
      const now = Date.now();
      const draft = structuredClone(ref.current);
      if (fn(draft, now) === false) return;
      draft.version += 1;
      draft.hostNow = now;
      ref.current = draft;
      setState(draft);
      broadcast();
    },
    [broadcast],
  );

  useEffect(() => {
    const t = openTransport(initial.code, (m) => {
      if (m.k === "hello") broadcast();
      else if (m.k === "act") commit((d, now) => applyAction(d, m.pid, m.a, now));
    });
    tRef.current = t;
    broadcast();
    const tickIv = setInterval(() => {
      const s = ref.current;
      if (s.phaseEndsAt !== null && Date.now() >= s.phaseEndsAt) commit((d, now) => tick(d, now));
    }, 200);
    const botIv = setInterval(() => {
      const acts = botActions(ref.current, Date.now());
      if (acts.length) commit((d, now) => acts.forEach(({ pid, a }) => applyAction(d, pid, a, now)));
    }, 900);
    const beat = setInterval(broadcast, 2500);
    return () => {
      clearInterval(tickIv);
      clearInterval(botIv);
      clearInterval(beat);
      t.close();
      saveRoom(ref.current);
    };
  }, [initial.code, broadcast, commit]);

  return { state, commit };
}

// ---------- player ----------
export function usePlayer(code: string, pid: string) {
  const [state, setState] = useState<GameState | null>(null);
  const [offset, setOffset] = useState(0);
  const [lastSeen, setLastSeen] = useState(0);
  const tRef = useRef<Transport | null>(null);
  const cur = useRef<GameState | null>(null);

  useEffect(() => {
    const t = openTransport(code, (m) => {
      if (m.k !== "state" || m.s.code !== code) return;
      const prev = cur.current;
      if (prev && m.s.version < prev.version && m.s.hostNow - prev.hostNow < 5000) return;
      cur.current = m.s;
      setState(m.s);
      setOffset(m.s.hostNow - Date.now());
      setLastSeen(Date.now());
    });
    tRef.current = t;
    const hello = () => t.send({ k: "hello", pid });
    hello();
    const iv = setInterval(() => {
      if (!cur.current || Date.now() - (cur.current.hostNow - 0) > 6000) hello();
    }, 2000);
    return () => {
      clearInterval(iv);
      t.close();
    };
  }, [code, pid]);

  const act = useCallback((a: PlayerAction) => tRef.current?.send({ k: "act", pid, a }), [pid]);
  return { state, offset, lastSeen, act };
}

export function useNow(intervalMs = 250) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(iv);
  }, [intervalMs]);
  return now;
}
