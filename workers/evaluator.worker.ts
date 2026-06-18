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
import ast, json, re
import numpy as np

_ALLOWED_FUNCS = {'sin', 'cos', 'exp', 'log', 'sqrt', 'abs'}
_ALLOWED_NAMES = {'x', 'pi'}
_PARAM_RE = re.compile(r'^C\\d+$')  # free parameters: C0, C1, C2, ...

def _is_param(name):
    return bool(_PARAM_RE.match(name))

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
        if node.id in _ALLOWED_NAMES or node.id in _ALLOWED_FUNCS or _is_param(node.id):
            return
        raise ValueError('name not allowed: ' + node.id)
    if isinstance(node, ast.Constant):
        if isinstance(node.value, bool) or not isinstance(node.value, (int, float)):
            raise ValueError('constant not allowed')
        return
    raise ValueError('syntax not allowed: ' + type(node).__name__)

def _collect_params(tree):
    names = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and _is_param(node.id):
            names.add(node.id)
    return sorted(names, key=lambda s: int(s[1:]))

def _complexity(tree):
    # Counts STRUCTURE; a free parameter (a Name node) counts as ~1, like any leaf,
    # so parsimony pressure still favors simple forms.
    c = 0
    for node in ast.walk(tree):
        if isinstance(node, (ast.BinOp, ast.UnaryOp, ast.Call, ast.Name, ast.Constant)):
            c += 1
    return c

class _SubstParams(ast.NodeTransformer):
    def __init__(self, values):
        self.values = values
    def visit_Name(self, node):
        if node.id in self.values:
            return ast.copy_location(ast.Constant(self.values[node.id]), node)
        return node

def _fitted_expr(genome, rounded):
    t = ast.parse(genome, mode='eval')
    t = _SubstParams(rounded).visit(t)
    ast.fix_missing_locations(t)
    return ast.unparse(t)

_BASE_ENV = {
    'pi': np.pi,
    'sin': np.sin, 'cos': np.cos, 'exp': np.exp,
    'log': np.log, 'sqrt': np.sqrt, 'abs': np.abs,
}

def _eval_with(code, x, param_values):
    env = dict(_BASE_ENV)
    env['x'] = x
    for k, v in param_values.items():
        env[k] = v
    with np.errstate(all='ignore'):
        out = eval(code, {'__builtins__': {}}, env)
    out = np.asarray(out, dtype=float)
    if out.ndim == 0:
        out = np.full_like(x, float(out))
    return out

# parsimony weight: bloated expressions are punished even when r2 is marginally higher
_PENALTY = 0.012

def _finish(genome, tree, x, y, yhat, fitted_expr, params_out):
    yhat = np.asarray(yhat, dtype=float)
    if yhat.shape != x.shape:
        return json.dumps({'valid': False, 'error': 'shape mismatch'})
    if not np.all(np.isfinite(yhat)):
        return json.dumps({'valid': False, 'error': 'non-finite predictions'})

    ss_res = float(np.sum((y - yhat) ** 2))
    ss_tot = float(np.sum((y - np.mean(y)) ** 2))
    r2 = 0.0 if ss_tot <= 1e-12 else 1.0 - ss_res / ss_tot
    rmse = float(np.sqrt(np.mean((y - yhat) ** 2)))
    complexity = _complexity(tree)
    score = max(r2, -1.0) - _PENALTY * complexity

    result = {
        'valid': True,
        'score': score,
        'r2': r2,
        'rmse': rmse,
        'complexity': complexity,
        'fittedExpr': fitted_expr,
        'params': params_out,
    }
    return json.dumps(result)

def _fit_nonlinear(genome, tree, code, x, y, params):
    # scipy is loaded LAZILY on first need; signal the JS side to load it, then retry.
    try:
        from scipy.optimize import least_squares
    except Exception:
        return json.dumps({'valid': False, 'error': '__NEED_SCIPY__'})
    import time

    n = len(params)

    def predict(c):
        d = {params[i]: float(c[i]) for i in range(n)}
        with np.errstate(all='ignore'):
            return _eval_with(code, x, d)

    def resid(c):
        yh = predict(c)
        yh = np.where(np.isfinite(yh), yh, 1.0e6)  # penalize, don't crash
        return yh - y

    # Multi-start to beat the harmonic-lock failure mode: seed a spread of
    # frequency-scale and amplitude-scale guesses across every parameter slot.
    yscale = float(max(np.std(y) * 1.4142, (np.max(y) - np.min(y)) / 2.0, 1.0))
    xspan = float(np.max(x) - np.min(x)) if x.size else 1.0
    base_w = (2.0 * np.pi / xspan) if xspan > 1e-9 else 1.0
    freq_seeds = [base_w * k for k in (0.5, 1.0, 2.0, 3.0, 5.0, 8.0)]

    starts = []
    for f in freq_seeds:
        for i in range(n):
            s = [yscale] * n
            s[i] = f                 # try this freq guess in each parameter slot
            starts.append(s)
    rng = np.random.default_rng(0)   # deterministic judge
    for _ in range(12):
        starts.append([
            float(rng.uniform(-1.0, 1.0)) * (yscale if rng.random() < 0.5 else 6.0)
            for _ in range(n)
        ])

    ss_tot = float(np.sum((y - np.mean(y)) ** 2))
    best = None
    t0 = time.time()
    for s in starts:
        if time.time() - t0 > 1.8:   # hard per-candidate budget across restarts
            break
        try:
            res = least_squares(resid, s, method='lm', max_nfev=2000)
        except Exception:
            continue
        c = res.x
        yh = predict(c)
        if not np.all(np.isfinite(yh)):
            continue
        cost = float(np.sum((yh - y) ** 2))
        if best is None or cost < best[0]:
            best = (cost, np.asarray(c, dtype=float))
        if ss_tot > 1e-12 and (1.0 - best[0] / ss_tot) > 0.999:
            break                    # excellent fit found — stop early

    if best is None:
        return json.dumps({'valid': False, 'error': 'nonlinear fit did not converge'})

    sol = best[1]
    yhat = predict(sol)
    params_out = {params[i]: round(float(sol[i]), 6) for i in range(n)}
    try:
        fitted = _fitted_expr(genome, {params[i]: round(float(sol[i]), 4) for i in range(n)})
    except Exception:
        fitted = genome
    return _finish(genome, tree, x, y, yhat, fitted, params_out)

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

    try:
        code = compile(tree, '<expr>', 'eval')
    except Exception as e:
        return json.dumps({'valid': False, 'error': 'compile error: ' + str(e)})

    params = _collect_params(tree)

    # --- back-compat: no free parameters → score the expression directly --------
    if not params:
        try:
            yhat = _eval_with(code, x, {})
        except Exception as e:
            return json.dumps({'valid': False, 'error': 'eval error: ' + str(e)})
        return _finish(genome, tree, x, y, yhat, genome, {})

    # --- fit free parameters by LINEAR least-squares (numpy only) ---------------
    zero = {p: 0.0 for p in params}
    try:
        base = _eval_with(code, x, zero)              # param-free part
    except Exception as e:
        return json.dumps({'valid': False, 'error': 'eval error: ' + str(e)})
    if base.shape != x.shape:
        return json.dumps({'valid': False, 'error': 'shape mismatch'})

    # design matrix: column p = f(C_p = 1, others 0) - base  (the basis for C_p)
    cols = []
    for p in params:
        unit = dict(zero); unit[p] = 1.0
        try:
            col = _eval_with(code, x, unit) - base
        except Exception as e:
            return json.dumps({'valid': False, 'error': 'eval error: ' + str(e)})
        cols.append(col)
    A = np.column_stack(cols)

    # A non-finite basis (e.g. log(x) over negative x) can't be fit — report that
    # honestly, and before the linearity probe so the reason isn't mislabeled.
    if not (np.all(np.isfinite(A)) and np.all(np.isfinite(base))):
        return json.dumps({'valid': False, 'error': 'non-finite basis'})

    # Verify the model really is linear in its parameters: f(C) must equal
    # base + A @ C for arbitrary C. If not (a parameter is inside a function or
    # multiplies another), route to the nonlinear scipy fitter (pass B).
    rng = np.random.default_rng(0)
    is_linear = True
    for _ in range(3):
        test = {p: float(rng.uniform(-3.0, 3.0)) for p in params}
        try:
            actual = _eval_with(code, x, test)
        except Exception:
            is_linear = False; break
        cvec = np.array([test[p] for p in params])
        predicted = base + A @ cvec
        scale = np.maximum(np.abs(actual), 1.0)
        if not np.all(np.isfinite(actual)) or np.max(np.abs(actual - predicted) / scale) > 1e-6:
            is_linear = False; break

    if not is_linear:
        return _fit_nonlinear(genome, tree, code, x, y, params)

    sol, _res, rank, _sv = np.linalg.lstsq(A, y - base, rcond=None)
    if rank < A.shape[1]:
        return json.dumps({'valid': False, 'error': 'singular fit (parameters not identifiable)'})
    if not np.all(np.isfinite(sol)):
        return json.dumps({'valid': False, 'error': 'fit did not converge'})

    yhat = base + A @ sol
    params_out = {p: round(float(sol[i]), 6) for i, p in enumerate(params)}
    try:
        fitted = _fitted_expr(genome, {p: round(float(sol[i]), 4) for i, p in enumerate(params)})
    except Exception:
        fitted = genome
    return _finish(genome, tree, x, y, yhat, fitted, params_out)
`;

let pyodide: Pyodide | null = null;
let scipyLoaded = false;
const datasets = new Map<string, { x: number[]; y: number[] }>();

async function ensurePyodide(): Promise<Pyodide> {
  if (pyodide) return pyodide;
  importScripts(`${PYODIDE_CDN}pyodide.js`);
  const py = await loadPyodide({ indexURL: PYODIDE_CDN });
  await py.loadPackage("numpy"); // scipy is NOT loaded here — keeps warm-up fast
  await py.runPythonAsync(PY_SETUP);
  pyodide = py;
  return py;
}

/** Load scipy on first need (the nonlinear fit path), then cache it. */
async function ensureScipy(py: Pyodide): Promise<void> {
  if (scipyLoaded) return;
  await py.loadPackage("scipy");
  scipyLoaded = true;
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
      let out = await py.runPythonAsync("evaluate_expr(genome, x_json, y_json)");
      let payload = JSON.parse(out as string) as EvalPayload;
      // Nonlinear candidate but scipy not yet loaded → load it once, then retry.
      if (!payload.valid && payload.error === "__NEED_SCIPY__") {
        await ensureScipy(py);
        out = await py.runPythonAsync("evaluate_expr(genome, x_json, y_json)");
        payload = JSON.parse(out as string) as EvalPayload;
      }
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
