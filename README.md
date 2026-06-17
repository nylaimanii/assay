# ASSAY

A closed-loop discovery engine — **propose · make · test · analyze**.

An LLM (later) proposes candidates; a **deterministic, sandboxed evaluator**
scores them — never the LLM. Results feed back to improve the next batch. The
domain is swappable via the `Evaluator` interface. The flagship demo will be
symbolic regression; this repo is the **skeleton + loop architecture only**,
running end-to-end on a stub evaluator and stub proposer over fake data.

## Core honesty principle

> The evaluator is the **only** thing in the system that produces a score.

The proposer (and the future LLM) never assign a number. Invalid candidates
render honestly as `— invalid` (`value: null`, `valid: false`), never as `0`.

## Architecture

| File | Role |
| --- | --- |
| `lib/types.ts` | Domain types: `Candidate`, `Score`, `Evaluation`, `Cycle`, `Run`. |
| `lib/evaluator.ts` | `Evaluator` interface + registry. **The judge contract.** |
| `lib/evaluator-symbolic.ts` | Real `symbolic-regression` evaluator. Manages the Pyodide worker, queues calls, maps verdicts → `Score`. |
| `workers/evaluator.worker.ts` | Pyodide (Python + numpy) in a web worker. Sandboxed AST-whitelisted scoring. The deterministic judge. |
| `lib/datasets.ts` | Seeded ground-truth datasets (quadratic / sine / inverse-square). `hiddenLaw` is UI-only, never given to evaluator/proposer. |
| `lib/expr.ts` | Display-only expression compiler for the overlay curve. Never scores. |
| `lib/proposer.ts` | `Proposer` interface + `StubProposer` (seed → mutate best + explore). No LLM. |
| `lib/engine.ts` | The closed loop: `runCycle`, `runLoop`, best-ever tracking. Pure-ish. |
| `store/useRunStore.ts` | Zustand store driving the loop, committing each cycle live. |
| `store/useSymbolicStore.ts` | Dataset selection + Python runtime warm-up status (separate from the core store). |
| `components/assay/*` | Lab-instrument UI: control panel, evolution feed, readout, fitness curve, data scatter. |

## Symbolic regression

The flagship domain. Data is generated from a hidden law plus noise; a candidate
genome is a math expression in `x`. Python (numpy, in a web worker) parses it
under a restricted AST whitelist (`x`, `pi`, `+ - * / **`, and `sin cos exp log
sqrt abs` only — anything else is rejected), evaluates it over the data, and
returns `score = R²(clamped) − 0.012·complexity`. Parse failures, non-finite
predictions, shape mismatches, and timeouts all return `valid: false` with a
real reason — never a faked `0`. The hidden law is shown in the UI but is never
passed to the evaluator or proposer.

> Note: with the **stub** proposer (hex-style mutation), only cycle-0 random
> expressions are valid; later mutations read as `invalid`. Meaningful climbing
> arrives with the Groq-backed proposer (next). The evaluator, scoring, datasets,
> and viz are all real now.

### Swap points

`Evaluator` and `Proposer` are clean interfaces. A real Pyodide-backed
evaluator and a real Groq-backed proposer drop in behind them with **zero UI
changes** — the rest of the system only knows the interfaces.

## Develop

```bash
npm run dev     # http://localhost:3000
npm run build   # production build
npm run lint    # eslint
```

Press **Start** to seed a population and run the loop; the feed fills cycle by
cycle, the fitness curve climbs, and best-ever updates live. **Pause / Step /
Reset** all work. Defaults: population 8, 20 cycles.
