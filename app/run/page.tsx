"use client";

import Link from "next/link";
import { useRunStore } from "@/store/useRunStore";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/assay/StatusPill";
import { ControlPanel } from "@/components/assay/ControlPanel";
import { EvolutionFeed } from "@/components/assay/EvolutionFeed";
import { Readout } from "@/components/assay/Readout";

export default function RunPage() {
  const status = useRunStore((s) => s.run?.status ?? "idle");

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* header */}
      <header className="flex shrink-0 items-center justify-between border-b border-border bg-card px-5 py-3">
        <div className="flex items-baseline gap-3">
          <Link
            href="/"
            className="font-mono text-lg font-bold tracking-[0.2em] text-foreground transition-colors hover:text-[#2f6fb0]"
            title="Back to overview"
          >
            ASSAY
          </Link>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            a closed-loop discovery engine — propose · make · test · analyze
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/#loop"
            className="hidden font-mono text-[10px] tracking-wide text-muted-foreground/70 transition-colors hover:text-[#2f6fb0] md:inline"
          >
            how it works ↗
          </Link>
          <StatusPill status={status} />
        </div>
      </header>

      {/* three-region lab layout */}
      <main className="grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-[320px_minmax(0,1fr)_340px]">
        {/* LEFT — control panel */}
        <Card className="min-h-0 overflow-y-auto p-4">
          <ControlPanel />
        </Card>

        {/* CENTER — evolution feed */}
        <Card className="flex min-h-0 flex-col gap-0 overflow-hidden p-0">
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
            <h1 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Evolution feed
            </h1>
            <span className="font-mono text-[10px] text-muted-foreground/70">
              propose → evaluate → analyze
            </span>
          </div>
          <div className="min-h-0 flex-1">
            <EvolutionFeed />
          </div>
        </Card>

        {/* RIGHT — readout */}
        <Card className="min-h-0 overflow-y-auto p-4">
          <Readout />
        </Card>
      </main>
    </div>
  );
}
