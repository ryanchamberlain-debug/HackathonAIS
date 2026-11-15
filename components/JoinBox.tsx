"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function JoinBox() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const go = () => code.length >= 4 && router.push(`/play?code=${code}`);
  return (
    <div className="mt-3 flex gap-2">
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
        onKeyDown={(e) => e.key === "Enter" && go()}
        placeholder="CODE"
        inputMode="text"
        autoCapitalize="characters"
        className="num w-full min-w-0 rounded-xl border border-line bg-bg px-4 py-3 text-2xl tracking-[0.3em] outline-none focus:border-gold"
      />
      <button onClick={go} disabled={code.length < 4} className="rounded-xl bg-yes px-5 font-bold text-bg disabled:opacity-40">
        Join
      </button>
    </div>
  );
}
