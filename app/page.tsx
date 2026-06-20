import Link from "next/link";
import { ArrowRight, ChevronRight, Lock, FlaskConical } from "lucide-react";
import { HeroFit } from "@/components/home/HeroFit";
import { LoopDiagram } from "@/components/home/LoopDiagram";
import { ProofCard } from "@/components/home/ProofCard";

function LaunchButton({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/run"
      className={`group inline-flex items-center gap-2 rounded-lg bg-[#4f95d6] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_2px_10px_rgba(79,149,214,0.35)] transition-all hover:bg-[#3f86cb] hover:shadow-[0_4px_16px_rgba(79,149,214,0.45)] active:translate-y-px ${className}`}
    >
      Launch the engine
      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* nav */}
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-3.5">
          <div className="flex items-baseline gap-2.5">
            <span className="font-mono text-base font-bold tracking-[0.22em] text-foreground">ASSAY</span>
            <span className="hidden font-mono text-[10px] tracking-wide text-muted-foreground/70 sm:inline">
              discovery engine
            </span>
          </div>
          <nav className="flex items-center gap-5">
            <Link href="#loop" className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline">
              How it works
            </Link>
            <Link href="#proof" className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline">
              Results
            </Link>
            <LaunchButton className="!px-4 !py-2 !text-[13px]" />
          </nav>
        </div>
      </header>

      {/* hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_70%_0%,rgba(127,181,230,0.10),transparent)]" />
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-6 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
          <div className="flex flex-col items-start gap-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#cfe3f6] bg-signal-tint px-3 py-1 font-mono text-[11px] font-medium text-[#2f6fb0]">
              <span className="size-1.5 animate-pulse rounded-full bg-signal" />
              closed-loop · self-improving · deterministic judge
            </span>
            <h1 className="text-4xl font-bold leading-[1.08] tracking-tight text-foreground sm:text-5xl lg:text-[3.4rem]">
              It rediscovers the
              <br />
              equations hidden in data.
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-slate-600">
              ASSAY is a closed-loop discovery engine. <span className="font-semibold text-foreground">The AI proposes the structure.</span>{" "}
              <span className="font-semibold text-foreground">Deterministic math fits the constants.</span> The AI never grades itself.
            </p>
            <div className="flex flex-wrap items-center gap-4 pt-1">
              <LaunchButton />
              <Link
                href="#loop"
                className="inline-flex items-center gap-1 text-sm font-medium text-[#2f6fb0] transition-colors hover:text-[#1f5a93]"
              >
                See how it works
                <ChevronRight className="size-4" />
              </Link>
            </div>
            <p className="font-mono text-[11px] tabular-nums text-muted-foreground/80">
              recovered live: <span className="text-slate-500">6.04/x²</span> · <span className="text-slate-500">2.01x²−3.24</span> ·{" "}
              <span className="text-slate-500">1.99·sin(1.49x)</span>
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground/70">fit · live</span>
              <span className="font-mono text-[10px] tabular-nums text-[#2f6fb0]">R² → 0.99</span>
            </div>
            <HeroFit className="w-full" />
          </div>
        </div>
      </section>

      {/* the loop */}
      <section id="loop" className="border-y border-border/70 bg-white/50">
        <div className="mx-auto w-full max-w-6xl px-6 py-16 lg:py-20">
          <div className="mb-10 max-w-2xl">
            <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">One loop, run to convergence</h2>
            <p className="mt-3 text-base leading-relaxed text-slate-600">
              ASSAY runs a tight design→make→test→analyze cycle. A language model proposes candidate{" "}
              <em>forms</em>; deterministic math fits their constants; a sandboxed judge scores each one and feeds the
              results back. Because the judge is separate math — not the model — <span className="font-semibold text-foreground">the engine
              can&apos;t talk itself into a wrong answer.</span>
            </p>
          </div>

          <LoopDiagram className="mb-8" />

          <details className="group mt-4 rounded-xl border border-border bg-card px-5 py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-foreground">
              <span className="inline-flex items-center gap-2">
                <FlaskConical className="size-4 text-[#4f95d6]" />
                Technical details
              </span>
              <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
            </summary>
            <div className="mt-4 grid gap-4 border-t border-border/70 pt-4 text-sm leading-relaxed text-slate-600 sm:grid-cols-2">
              <p>
                <span className="font-mono text-[13px] font-semibold text-[#2f6fb0]">propose</span> — the LLM (Groq,
                Llama-3.3-70B) returns parameterized forms like <span className="font-mono text-[12px]">C0·sin(C1·x + C2)</span>,
                never guessed numeric constants. It only ever sees how prior candidates scored.
              </p>
              <p>
                <span className="font-mono text-[13px] font-semibold text-[#2f6fb0]">fit</span> — least-squares recovers
                the constants from the data: closed-form <span className="font-mono text-[12px]">numpy.linalg.lstsq</span>{" "}
                for linear params, <span className="font-mono text-[12px]">scipy</span> multi-start for nonlinear ones.
                Constants come from math, not the model.
              </p>
              <p>
                <span className="font-mono text-[13px] font-semibold text-[#2f6fb0]">judge</span> — a sandboxed Pyodide
                evaluator scores the fitted prediction: <span className="font-mono text-[12px]">R² − 0.012·complexity</span>.
                It is the <span className="font-semibold text-foreground">only</span> source of score. The namespace is
                restricted; invalid candidates fail honestly.
              </p>
              <p>
                <span className="font-mono text-[13px] font-semibold text-[#2f6fb0]">analyze</span> — the best fits and
                the real failure reasons feed the next proposal. The hidden law is never shown to the engine — it must be
                recovered from the noisy data alone.
              </p>
            </div>
          </details>
        </div>
      </section>

      {/* proof */}
      <section id="proof" className="mx-auto w-full max-w-6xl px-6 py-16 lg:py-20">
        <div className="mb-10 max-w-2xl">
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Three laws, rediscovered</h2>
          <p className="mt-3 text-base leading-relaxed text-slate-600">
            Real results from the engine — recovered from noisy data, with the answer hidden from it the whole time.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          <ProofCard
            name="Inverse-square"
            hiddenLaw="y = 6 / x²"
            recovered="6.04 / x²"
            r2="0.99"
            xRange={[0.5, 4]}
            noiseAmp={0.5}
            lawFn={(x) => 6 / (x * x)}
            recoveredFn={(x) => 6.04 / (x * x)}
          />
          <ProofCard
            name="Quadratic"
            hiddenLaw="y = 2x² − 3"
            recovered="2.01x² − 3.24"
            r2="0.94"
            xRange={[-3, 3]}
            noiseAmp={1.4}
            lawFn={(x) => 2 * x * x - 3}
            recoveredFn={(x) => 2.01 * x * x - 3.24}
          />
          <ProofCard
            name="Sine"
            hiddenLaw="y = 2·sin(1.5x)"
            recovered="1.99·sin(1.49x)"
            r2="0.95"
            xRange={[-6, 6]}
            noiseAmp={0.34}
            lawFn={(x) => 2 * Math.sin(1.5 * x)}
            recoveredFn={(x) => 1.99 * Math.sin(1.49 * x)}
          />
        </div>
      </section>

      {/* why it's different */}
      <section className="border-y border-border/70 bg-white/50">
        <div className="mx-auto w-full max-w-4xl px-6 py-16 text-center lg:py-20">
          <Lock className="mx-auto mb-5 size-7 text-[#4f95d6]" strokeWidth={1.6} />
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">A judge that can&apos;t be fooled</h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-slate-600">
            Most AI research tools are copilots — they suggest, a human decides. ASSAY closes the loop: it proposes,
            tests, and improves on its own, with a deterministic judge that scores every candidate by hard math. The model
            can&apos;t reward itself, and it never sees the answer it&apos;s trying to find.
          </p>
        </div>
      </section>

      {/* cta footer */}
      <section className="mx-auto w-full max-w-6xl px-6 py-20 text-center">
        <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Watch it discover.</h2>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-slate-600">
          Pick a dataset and press start — then swap the target mid-run and watch the loop abandon the old law and
          rediscover the new one, live.
        </p>
        <div className="mt-8 flex justify-center">
          <LaunchButton />
        </div>
        <p className="mx-auto mt-6 max-w-md font-mono text-[11px] leading-relaxed text-muted-foreground/80">
          proposals by Groq · the math runs in your browser via Pyodide (numpy + scipy) · no answer keys, no faked scores
        </p>
      </section>

      <footer className="border-t border-border/70">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
          <span className="font-mono text-[11px] tracking-[0.18em] text-muted-foreground/80">ASSAY</span>
          <span className="font-mono text-[10px] text-muted-foreground/60">propose · fit · judge · adapt</span>
        </div>
      </footer>
    </div>
  );
}
