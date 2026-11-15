import { Suspense } from "react";
import PlayerApp from "@/components/PlayerApp";

export const metadata = { title: "DARE STREET · Trade" };

export default function PlayPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center font-mono text-muted">Connecting…</div>}>
      <PlayerApp />
    </Suspense>
  );
}
