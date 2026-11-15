import { Suspense } from "react";
import HostApp from "@/components/HostApp";

export const metadata = { title: "DARE STREET · Host" };

export default function HostPage() {
  return (
    <Suspense fallback={<div className="p-10 font-mono text-muted">Opening the exchange…</div>}>
      <HostApp />
    </Suspense>
  );
}
