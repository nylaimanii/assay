import type {
  DatasetMeta,
  HistoryEntry,
  HistoryInvalid,
  ProposeRequest,
  ProposeResponse,
} from "@/lib/propose-shared";

/**
 * ASSAY — server-side Groq proposer call. Runs in Node; GROQ_API_KEY never
 * reaches the browser. Takes scored history (never the hidden law) and returns
 * a strict-JSON batch of candidate expressions. On any failure it returns an
 * empty batch with a REAL reason so the client proposer can top up with
 * explorers — it NEVER fabricates candidates and NEVER touches scores.
 *
 * Every field of the incoming body is normalized before use: a missing or
 * misshapen datasetMeta / history must not throw (that was the `.name` crash).
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

// Allow room for backoff sleeps without the platform killing the function.
export const maxDuration = 30;

const MAX_RETRIES = 3;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_BACKOFF_MS = 10_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exponential backoff (1s, 2s, 4s) with small jitter, for attempt 0,1,2. */
function backoffMs(attempt: number): number {
  const base = 1000 * 2 ** attempt;
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(base + jitter, MAX_BACKOFF_MS);
}

/** Parse a Retry-After header: seconds (possibly fractional) or an HTTP date. */
function retryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const secs = Number(header);
  if (Number.isFinite(secs)) return Math.min(Math.max(0, secs * 1000), MAX_BACKOFF_MS);
  const when = Date.parse(header);
  if (!Number.isNaN(when)) return Math.min(Math.max(0, when - Date.now()), MAX_BACKOFF_MS);
  return null;
}

type GroqAttempt =
  | { ok: true; res: Response; throttled: boolean }
  | { ok: false; throttled: boolean; error: string };

/**
 * Call Groq with retry-on-throttle. Retries only 429 + transient 5xx (honoring
 * Retry-After when present), backing off otherwise. Other errors fail fast with
 * the honest reason. If retries exhaust, returns ok:false so the caller can
 * degrade to explorers — it never throws and never fabricates.
 */
async function callGroqWithRetry(payloadBody: string, apiKey: string): Promise<GroqAttempt> {
  let throttled = false;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: payloadBody,
      });
    } catch (err) {
      // Network/transport error — treat as transient and back off.
      const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      if (attempt < MAX_RETRIES) {
        await sleep(backoffMs(attempt));
        continue;
      }
      return { ok: false, throttled, error: `groq request failed: ${reason}` };
    }

    if (res.ok) return { ok: true, res, throttled };

    if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_RETRIES) {
      if (res.status === 429) throttled = true;
      const wait = retryAfterMs(res.headers.get("retry-after")) ?? backoffMs(attempt);
      await res.text().catch(() => ""); // drain body so the socket frees
      console.error(`[propose] groq ${res.status} — backing off ${wait}ms (attempt ${attempt + 1})`);
      await sleep(wait);
      continue;
    }

    // Non-retryable, or retries exhausted: surface the real status + message.
    const detail = await res.text().catch(() => "");
    console.error("[propose] groq http error", res.status, detail.slice(0, 500));
    return {
      ok: false,
      throttled,
      error: `groq http ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
    };
  }

  return { ok: false, throttled, error: "groq retries exhausted" };
}

const SYSTEM_PROMPT = `You are a symbolic-regression search engine. You propose the STRUCTURE of math expressions in x that fit noisy data. A deterministic least-squares fitter assigns the numeric constants for you — your job is the FORM, not the numbers.
Use named free parameters C0, C1, C2, … for EVERY constant that should be fit. Examples: "C0 / x**2", "C0*x**2 + C1", "C0*x + C1", "C0*sin(x) + C1". Do NOT write numeric coefficients like 2.5 or 6 — write a Cn parameter and let the system fit it.
You are given how previous candidates scored (score = R² minus a small complexity penalty), the FITTED form of each (constants filled in by the fitter), and which candidates failed and why. Refine the structures that scored well, vary the form, and avoid the failure modes you are shown.
SCOPE: each Cn must appear LINEARLY — a parameter may multiply a function of x (C0*sin(x)) but must NOT appear inside a function or multiply another parameter. Forms like "C0*sin(C1*x)" are rejected as unsupported this pass; prefer linear-in-parameter forms.
Allowed tokens ONLY: the variable x, parameters C0..C9, the operators + - * / **, the functions sin cos exp log sqrt abs, and the constant pi. Nothing else.
Prefer simple forms: a clean low-complexity fit beats a bloated one with marginally higher R².
Return ONLY a JSON object of the form {"candidates": ["form1", "form2", ...]} with no prose and no markdown fences.`;

/* --- defensive normalization of the request body -------------------------- */

function toFiniteNumber(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function normalizeDatasetMeta(raw: unknown): DatasetMeta {
  const dm = (raw ?? {}) as Partial<DatasetMeta>;
  const xr = dm.xRange;
  const xRange: [number, number] =
    Array.isArray(xr) && xr.length === 2
      ? [toFiniteNumber(xr[0]), toFiniteNumber(xr[1])]
      : [0, 1];
  return {
    name: typeof dm.name === "string" && dm.name.length > 0 ? dm.name : "unknown dataset",
    xRange,
    n: toFiniteNumber(dm.n),
    noiseSigma: toFiniteNumber(dm.noiseSigma),
  };
}

function normalizeTop(raw: unknown): HistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((h): h is Record<string, unknown> => !!h && typeof h === "object")
    .map((h) => ({
      genome: typeof h.genome === "string" ? h.genome : "",
      score: toFiniteNumber(h.score),
      r2: toFiniteNumber(h.r2),
      complexity: toFiniteNumber(h.complexity),
      fittedExpr: typeof h.fittedExpr === "string" ? h.fittedExpr : undefined,
    }))
    .filter((h) => h.genome.length > 0)
    .slice(0, 6); // top-k cap — keeps each call small to stay under the TPM window
}

function normalizeInvalid(raw: unknown): HistoryInvalid[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((h): h is Record<string, unknown> => !!h && typeof h === "object")
    .map((h) => ({
      genome: typeof h.genome === "string" ? h.genome : "",
      error: typeof h.error === "string" ? h.error : "invalid",
    }))
    .filter((h) => h.genome.length > 0)
    .slice(0, 3); // a few notable failures is enough signal; don't resend them all
}

function normalizeBody(raw: unknown): ProposeRequest {
  const body = (raw ?? {}) as Partial<ProposeRequest>;
  const populationSize = Math.max(1, Math.min(64, Math.floor(toFiniteNumber(body.populationSize, 8))));
  const requestCount = Math.max(
    1,
    Math.min(64, Math.floor(toFiniteNumber(body.requestCount, populationSize))),
  );
  return {
    objective:
      typeof body.objective === "string" && body.objective.length > 0
        ? body.objective
        : "Fit an expression in x to the noisy data.",
    datasetMeta: normalizeDatasetMeta(body.datasetMeta),
    populationSize,
    cycle: Math.max(0, Math.floor(toFiniteNumber(body.cycle))),
    requestCount,
    history: {
      top: normalizeTop(body.history?.top),
      invalid: normalizeInvalid(body.history?.invalid),
    },
  };
}

function buildUserPrompt(body: ProposeRequest): string {
  const { objective, datasetMeta, requestCount, cycle, history } = body;
  const lines: string[] = [];
  lines.push(`Objective: ${objective}`);
  lines.push(
    `Data: "${datasetMeta.name}", ${datasetMeta.n} noisy points over x in [${datasetMeta.xRange[0]}, ${datasetMeta.xRange[1]}], gaussian noise sigma≈${datasetMeta.noiseSigma}. The true law is hidden from you.`,
  );
  lines.push(`Cycle: ${cycle}`);

  if (history.top.length > 0) {
    lines.push("");
    lines.push("Best forms so far (higher score is better; fitted = constants the fitter assigned):");
    for (const h of history.top) {
      const fitted = h.fittedExpr && h.fittedExpr !== h.genome ? `  [fitted: ${h.fittedExpr}]` : "";
      lines.push(
        `  ${h.genome}${fitted}  → score ${h.score.toFixed(3)}, R² ${h.r2.toFixed(3)}, complexity ${h.complexity}`,
      );
    }
  } else {
    lines.push("");
    lines.push("No scored candidates yet — propose diverse, simple starting expressions in x.");
  }

  if (history.invalid.length > 0) {
    lines.push("");
    lines.push("Recent FAILED candidates (avoid these failure modes):");
    for (const inv of history.invalid) {
      lines.push(`  ${inv.genome}  → ${inv.error}`);
    }
  }

  lines.push("");
  lines.push(
    `Propose ${requestCount} NEW expressions that should score higher. Return ONLY {"candidates": [...]} with exactly ${requestCount} strings.`,
  );
  return lines.join("\n");
}

/** Strip markdown fences and pull a candidates array out of model content, defensively. */
function extractCandidates(content: string): string[] {
  let text = content.trim();
  // remove ```json ... ``` or ``` ... ``` fences if the model added them
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) text = fence[1].trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }

  let arr: unknown;
  if (Array.isArray(parsed)) {
    arr = parsed;
  } else if (parsed && typeof parsed === "object" && "candidates" in parsed) {
    arr = (parsed as { candidates: unknown }).candidates;
  } else {
    return [];
  }
  if (!Array.isArray(arr)) return [];

  return arr
    .filter((v): v is string => typeof v === "string")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 200);
}

function json(body: ProposeResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return json({ candidates: [], error: "GROQ_API_KEY not set" });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ candidates: [], error: "bad request body: not JSON" }, 400);
  }

  const body = normalizeBody(raw);

  const payloadBody = JSON.stringify({
    model: GROQ_MODEL,
    temperature: 0.85,
    max_tokens: 1024,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(body) },
    ],
  });

  const attempt = await callGroqWithRetry(payloadBody, apiKey);
  if (!attempt.ok) {
    return json({ candidates: [], error: attempt.error, throttled: attempt.throttled });
  }

  // Parse the success body defensively — it may not be JSON, or may carry an error.
  const data = (await attempt.res.json().catch(() => null)) as {
    error?: { message?: string };
    choices?: { message?: { content?: string | null } }[];
  } | null;

  if (data?.error?.message) {
    console.error("[propose] groq returned error field", data.error.message);
    return json({ candidates: [], error: `groq error: ${data.error.message}`, throttled: attempt.throttled });
  }

  const content = data?.choices?.[0]?.message?.content ?? "";
  const candidates = extractCandidates(content).slice(0, body.requestCount);

  if (candidates.length === 0) {
    console.error("[propose] no usable candidates; raw content:", content.slice(0, 300));
    return json({
      candidates: [],
      error: "groq returned no usable candidates (empty or unparseable content)",
      throttled: attempt.throttled,
    });
  }
  return json({ candidates, throttled: attempt.throttled });
}
