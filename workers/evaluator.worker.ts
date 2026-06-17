/**
 * ASSAY — Pyodide symbolic-regression evaluator worker.
 *
 * Runs Python + numpy in WASM, off the main thread. Loads Pyodide ONCE from the
 * official CDN and caches it. The Python scoring routine is the sole, deterministic
 * judge: it parses a candidate expression under a restricted AST whitelist, evaluates
 * it over a dataset's x, and reports fit metrics. The hidden ground-truth law never
 * reaches this worker — only the noisy (x, y) samples do.
 */

import type { EvalPayload, WorkerIn, WorkerOut } from "../lib/worker-protocol";

declare function importScripts(...urls: string[]): void;

interface Pyodide {
  loadPackage(names: string | string[]): Promise<void>;
  runPythonAsync(code: string): Promise<unknown>;
  globals: { set(name: string, value: unknown): void };
}

declare function loadPyodide(config: { indexURL: string }): Promise<Pyodide>;

const PYODIDE_VERSION = "v0.26.4";
const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/`;

const ctx = self as unknown as {
  postMessage(data: WorkerOut): void;
  onmessage: ((e: MessageEvent<WorkerIn>) => void) | null;
};

/**
 * The judge, in Python. Restricted-namespace evaluation + honest scoring.
 * Returns a JSON string so the JS side never touches a Python proxy.
 */
const PY_SETUP = `
import ast, json
import numpy as np

_ALLOWED_FUNCS = {'sin', 'cos', 'exp', 'log', 'sqrt', 'abs'}
_ALLOWED_NAMES = {'x', 'pi'}

def _validate(node):
    if isinstance(node, ast.Expression):
        return _validate(node.body)
    if isinstance(node, ast.BinOp):
        if not isinstance(node.op, (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Pow)):
            raise ValueError('operator not allowed')
        _validate(node.left); _validate(node.right); return
    if isinstance(node, ast.UnaryOp):
        if not isinstance(node.op, (ast.UAdd, ast.USub)):
            raise ValueError('unary operator not allowed')
        _validate(node.operand); return
    if isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name) or node.func.id not in _ALLOWED_FUNCS:
            raise ValueError('function not allowed')
        if len(node.args) != 1 or node.keywords:
            raise ValueError('bad call arity')
        _validate(node.args[0]); return
    if isinstance(node, ast.Name):
        if node.id not in _ALLOWED_NAMES and node.id not in _ALLOWED_FUNCS:
            raise ValueError('name not allowed: ' + node.id)
        return
    if isinstance(node, ast.Constant):
        if isinstance(node.value, bool) or not isinstance(node.value, (int, float)):
            raise ValueError('constant not allowed')
        return
    raise ValueError('syntax not allowed: ' + type(node).__name__)

def _complexity(tree):
    c = 0
    for node in ast.walk(tree):
        if isinstance(node, (ast.BinOp, ast.UnaryOp, ast.Call, ast.Name, ast.Constant)):
            c += 1
    return c

# parsimony weight: bloated expressions are punished even when r2 is marginally higher
_PENALTY = 0.012

def evaluate_expr(genome, x_json, y_json):
    try:
        tree = ast.parse(genome, mode='eval')
    except Exception as e:
        return json.dumps({'valid': False, 'error': 'parse error: ' + str(e)})
    try:
        _validate(tree)
    except ValueError as e:
        return json.dumps({'valid': False, 'error': str(e)})

    x = np.asarray(json.loads(x_json), dtype=float)
    y = np.asarray(json.loads(y_json), dtype=float)

    env = {
        'x': x, 'pi': np.pi,
        'sin': np.sin, 'cos': np.cos, 'exp': np.exp,
        'log': np.log, 'sqrt': np.sqrt, 'abs': np.abs,
    }
    try:
        code = compile(tree, '<expr>', 'eval')
        with np.errstate(all='ignore'):
            yhat = eval(code, {'__builtins__': {}}, env)
    except Exception as e:
        return json.dumps({'valid': False, 'error': 'eval error: ' + str(e)})

    yhat = np.asarray(yhat, dtype=float)
    if yhat.ndim == 0:
        yhat = np.full_like(x, float(yhat))
    if yhat.shape != x.shape:
        return json.dumps({'valid': False, 'error': 'shape mismatch'})
    if not np.all(np.isfinite(yhat)):
        return json.dumps({'valid': False, 'error': 'non-finite predictions'})

    ss_res = float(np.sum((y - yhat) ** 2))
    ss_tot = float(np.sum((y - np.mean(y)) ** 2))
    # When the data is flat, r2 is undefined; define it as 0 (no explanatory power).
    r2 = 0.0 if ss_tot <= 1e-12 else 1.0 - ss_res / ss_tot
    rmse = float(np.sqrt(np.mean((y - yhat) ** 2)))
    complexity = _complexity(tree)

    # Negative r2 (worse than predicting the mean) is clamped to -1 so a single
    # wild candidate can't dominate the fitness scale; score stays "higher = better".
    r2_clamped = max(r2, -1.0)
    score = r2_clamped - _PENALTY * complexity

    return json.dumps({
        'valid': True,
        'score': score,
        'r2': r2,
        'rmse': rmse,
        'complexity': complexity,
    })
`;

let pyodide: Pyodide | null = null;
const datasets = new Map<string, { x: number[]; y: number[] }>();

async function ensurePyodide(): Promise<Pyodide> {
  if (pyodide) return pyodide;
  importScripts(`${PYODIDE_CDN}pyodide.js`);
  const py = await loadPyodide({ indexURL: PYODIDE_CDN });
  await py.loadPackage("numpy");
  await py.runPythonAsync(PY_SETUP);
  pyodide = py;
  return py;
}

ctx.onmessage = async (e: MessageEvent<WorkerIn>) => {
  const msg = e.data;

  if (msg.type === "init") {
    try {
      await ensurePyodide();
      ctx.postMessage({ type: "ready" });
    } catch (err) {
      ctx.postMessage({ type: "init-error", error: String(err) });
    }
    return;
  }

  if (msg.type === "dataset") {
    datasets.set(msg.datasetId, { x: msg.x, y: msg.y });
    ctx.postMessage({ type: "dataset-ok", requestId: msg.requestId });
    return;
  }

  if (msg.type === "evaluate") {
    const { requestId, genome, datasetId } = msg;
    try {
      const py = await ensurePyodide();
      const ds = datasets.get(datasetId);
      if (!ds) {
        ctx.postMessage({
          type: "result",
          requestId,
          payload: { valid: false, error: `dataset not loaded: ${datasetId}` },
        });
        return;
      }
      py.globals.set("genome", genome);
      py.globals.set("x_json", JSON.stringify(ds.x));
      py.globals.set("y_json", JSON.stringify(ds.y));
      const out = await py.runPythonAsync("evaluate_expr(genome, x_json, y_json)");
      const payload = JSON.parse(out as string) as EvalPayload;
      ctx.postMessage({ type: "result", requestId, payload });
    } catch (err) {
      ctx.postMessage({
        type: "result",
        requestId,
        payload: { valid: false, error: `worker error: ${String(err)}` },
      });
    }
    return;
  }
};
