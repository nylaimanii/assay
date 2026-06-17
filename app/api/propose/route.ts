import type {
  HistoryEntry,
  HistoryInvalid,
  ProposeRequest,
  ProposeResponse,
} from "@/lib/propose-shared";

/**
 * ASSAY — server-side Groq proposer call. Runs in Node; GROQ_API_KEY never
 * reaches the browser. Takes scored history (never the hidden law) and returns
 * a strict-JSON batch of candidate expressions. On any failure it returns an
 * empty batch with a reason so the client proposer can top up with explorers —
 * it NEVER fabricates candidates and NEVER touches scores.
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

const SYSTEM_PROMPT = `You are a symbolic-regression search engine. You propose math expressions in x that fit noisy data.
You are given how previous candidates scored (score = R² minus a small complexity penalty) and which ones failed and why.
Propose NEW candidate expressions that should score higher: refine the ones that scored well, vary their structure, and avoid the failure modes you are shown.
Allowed tokens ONLY: the variable x, numeric constants, the operators + - * / **, the functions sin cos exp log sqrt abs, and the constant pi. Nothing else — no other variables, no other functions, no assignment, no calls besides those listed.
Prefer simple expressions: a clean low-complexity fit beats a bloated one with marginally higher R².
Return ONLY a JSON object of the form {"candidates": ["expr1", "expr2", ...]} with no prose and no markdown fences.`;

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
    lines.push("Best candidates so far (higher score is better):");
    for (const h of history.top) {
      lines.push(
        `  ${h.genome}  → score ${h.score.toFixed(3)}, R² ${h.r2.toFixed(3)}, complexity ${h.complexity}`,
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

  let body: ProposeRequest;
  try {
    body = (await request.json()) as ProposeRequest;
  } catch {
    return json({ candidates: [], error: "bad request body" }, 400);
  }

  const requestCount = Math.max(1, Math.min(64, Math.floor(body.requestCount || 0)));
  // Defensive clamps on the history we forward.
  const safeBody: ProposeRequest = {
    ...body,
    requestCount,
    history: {
      top: (body.history?.top ?? []).slice(0, 8) as HistoryEntry[],
      invalid: (body.history?.invalid ?? []).slice(0, 4) as HistoryInvalid[],
    },
  };

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.85,
        max_tokens: 1024,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(safeBody) },
        ],
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return json({
        candidates: [],
        error: `groq http ${res.status}${detail ? `: ${detail.slice(0, 160)}` : ""}`,
      });
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    const candidates = extractCandidates(content).slice(0, requestCount);

    if (candidates.length === 0) {
      return json({ candidates: [], error: "model returned no usable candidates" });
    }
    return json({ candidates });
  } catch (err) {
    return json({ candidates: [], error: `groq request failed: ${String(err)}` });
  }
}
