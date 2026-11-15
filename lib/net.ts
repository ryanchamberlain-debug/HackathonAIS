"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { botActions } from "./bots";
import { applyAction, publicState, tick } from "./engine";
import { uid } from "./format";
import type { GameState, PlayerAction, WireMsg } from "./types";

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL;
export const liveAvailable = Boolean(BACKEND || (SB_URL && SB_KEY));

let client: SupabaseClient | null = null;
function supabase() {
  if (!SB_URL || !SB_KEY) return null;
  client ??= createClient(SB_URL, SB_KEY);
  return client;
}

/** backend = our Node WebSocket server, live = Supabase Realtime, local = one-browser demo. */
export type NetMode = "backend" | "live" | "local";
export function netMode(): NetMode {
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("local") === "1") return "local";
  if (BACKEND) return "backend";
  return SB_URL && SB_KEY ? "live" : "local";
}

function backendUrl() {
  if (BACKEND === "auto") return `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:3001`;
  return BACKEND!;
}

export interface Transport {
  code: string;
  send(m: WireMsg): void;
  listen(fn: (m: WireMsg) => void): void;
  close(): void;
}

function simpleTransport(code: string): Transport {
  let handler: (m: WireMsg) => void = () => {};
  if (netMode() === "live") {
    const sb = supabase()!;
    const ch = sb.channel(`darestreet-${code}`, { config: { broadcast: { self: false, ack: false } } });
    ch.on("broadcast", { event: "m" }, ({ payload }) => handler(payload as WireMsg));
    ch.subscribe();
    return {
      code,
      send: (m) => void ch.send({ type: "broadcast", event: "m", payload: m }),
      listen: (fn) => (handler = fn),
      close: () => void sb.removeChannel(ch),
    };
  }
  const bc = new BroadcastChannel(`darestreet-${code}`);
  bc.onmessage = (e) => handler(e.data as WireMsg);
  return { code, send: (m) => bc.postMessage(m), listen: (fn) => (handler = fn), close: () => bc.close() };
}

/**
 * Connects to the backend (backend/src). The host creates (or reconnects to) a room
 * and gets its code; phones join it. Game messages travel as RELAY events.
 */
export function connectBackend(opts: { code?: string; host: boolean }): Promise<Transport> {
  const store = opts.host ? localStorage : sessionStorage;
  const credKey = (code: string) => `darestreet:backend:${opts.host ? "host" : "player"}:${code}`;
  let handler: (m: WireMsg) => void = () => {};
  let ws: WebSocket | null = null;
  let closed = false;
  let code = opts.code ?? "";

  const handshake = (sock: WebSocket) =>
    new Promise<string>((resolve, reject) => {
      const pending = new Map<string, (ev: { type: string; payload: Record<string, unknown> }) => void>();
      sock.onmessage = (e) => {
        const ev = JSON.parse(e.data as string);
        if (ev.requestId && pending.has(ev.requestId)) {
          pending.get(ev.requestId)!(ev);
          pending.delete(ev.requestId);
        }
        if (ev.type === "RELAY" && ev.payload?.msg) handler(ev.payload.msg as WireMsg);
      };
      const request = (type: string, payload: object) =>
        new Promise<Record<string, unknown>>((res, rej) => {
          const requestId = uid("r");
          pending.set(requestId, (ev) => (ev.type === "ERROR" ? rej(new Error(String(ev.payload.message))) : res(ev.payload)));
          sock.send(JSON.stringify({ type, requestId, payload }));
        });
      (async () => {
        const saved = code ? store.getItem(credKey(code)) : null;
        let joined: Record<string, unknown> | null = null;
        if (saved) {
          const c = JSON.parse(saved);
          joined = await request("RECONNECT", { roomCode: code, playerId: c.playerId, reconnectToken: c.reconnectToken }).catch(() => null);
        }
        if (!joined && opts.host) joined = await request("CREATE_ROOM", { username: "Host Screen" });
        if (!joined && !opts.host) joined = await request("JOIN_ROOM", { roomCode: code, username: "Trader" });
        if (!joined) throw new Error("Could not join the room.");
        code = String(joined.roomCode);
        store.setItem(credKey(code), JSON.stringify({ playerId: joined.playerId, reconnectToken: joined.reconnectToken }));
        resolve(code);
      })().catch(reject);
    });

  const open = () =>
    new Promise<string>((resolve, reject) => {
      const sock = new WebSocket(backendUrl());
      ws = sock;
      sock.onopen = () => handshake(sock).then(resolve, reject);
      sock.onerror = () => reject(new Error("Can't reach the game backend."));
      sock.onclose = () => {
        if (closed || ws !== sock) return;
        setTimeout(() => !closed && open().catch(() => {}), 1500);
      };
    });

  return open().then((c) => ({
    code: c,
    send: (m) => {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "RELAY", requestId: uid("r"), payload: { msg: m } }));
    },
    listen: (fn) => (handler = fn),
    close: () => {
      closed = true;
      ws?.close();
    },
  }));
}

export function openTransport(code: string, host: boolean): Promise<Transport> {
  if (netMode() === "backend") return connectBackend({ code, host });
  return Promise.resolve(simpleTransport(code));
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
export function useHost(initial: GameState, transport: Transport) {
  const [state, setState] = useState(initial);
  const ref = useRef(initial);
  const lastSent = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef(0);

  const broadcast = useCallback(() => {
    const send = () => {
      lastSent.current = Date.now();
      timer.current = null;
      transport.send({ k: "state", s: publicState(ref.current, Date.now()) });
      if (Date.now() - lastSaved.current > 1500) {
        lastSaved.current = Date.now();
        saveRoom(ref.current);
      }
    };
    const wait = 120 - (Date.now() - lastSent.current);
    if (wait <= 0) send();
    else timer.current ??= setTimeout(send, wait);
  }, [transport]);

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
    transport.listen((m) => {
      if (m.k === "hello") broadcast();
      else if (m.k === "act") commit((d, now) => applyAction(d, m.pid, m.a, now));
    });
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
      saveRoom(ref.current);
    };
  }, [transport, broadcast, commit]);

  return { state, commit };
}

// ---------- player ----------
export function usePlayer(code: string, pid: string) {
  const [state, setState] = useState<GameState | null>(null);
  const [offset, setOffset] = useState(0);
  const [lastSeen, setLastSeen] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const tRef = useRef<Transport | null>(null);
  const cur = useRef<GameState | null>(null);

  useEffect(() => {
    let cancelled = false;
    let iv: ReturnType<typeof setInterval> | undefined;
    openTransport(code, false).then(
      (t) => {
        if (cancelled) return t.close();
        tRef.current = t;
        t.listen((m) => {
          if (m.k !== "state" || m.s.code !== code) return;
          const prev = cur.current;
          if (prev && m.s.version < prev.version && m.s.hostNow - prev.hostNow < 5000) return;
          cur.current = m.s;
          setState(m.s);
          setOffset(m.s.hostNow - Date.now());
          setLastSeen(Date.now());
        });
        const hello = () => t.send({ k: "hello", pid });
        hello();
        iv = setInterval(() => {
          if (!cur.current) hello();
        }, 2000);
      },
      (e: Error) => !cancelled && setError(e.message.includes("Room not found") ? `Room ${code} doesn't exist. Check the code on the host screen.` : e.message),
    );
    return () => {
      cancelled = true;
      if (iv) clearInterval(iv);
      tRef.current?.close();
      tRef.current = null;
    };
  }, [code, pid]);

  const act = useCallback((a: PlayerAction) => tRef.current?.send({ k: "act", pid, a }), [pid]);
  return { state, offset, lastSeen, act, error };
}

export function useNow(intervalMs = 250) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(iv);
  }, [intervalMs]);
  return now;
}
