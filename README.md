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
| `lib/evaluator.ts` | `Evaluator` interface + `stub-quadratic`. **The judge.** Deterministic in the genome. |
| `lib/proposer.ts` | `Proposer` interface + `StubProposer` (seed → mutate best + explore). No LLM. |
| `lib/engine.ts` | The closed loop: `runCycle`, `runLoop`, best-ever tracking. Pure-ish. |
| `store/useRunStore.ts` | Zustand store driving the loop, committing each cycle live. |
| `components/assay/*` | Lab-instrument UI: control panel, evolution feed, readout, fitness curve. |

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
