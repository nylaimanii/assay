/**
 * Display-only expression compiler.
 *
 * This mirrors the evaluator's grammar just well enough to draw the best-ever
 * candidate's predicted curve in the readout. It NEVER produces a score — the
 * deterministic Python evaluator is the sole judge. If anything here disagrees
 * with Python at the margins, only a drawn pixel is affected, never a Score.
 *
 * Grammar: x, pi, numeric literals, unary +/-, binary + - * / and ** (power),
 * and the unary functions sin cos exp log sqrt abs. Anything else → null.
 */

type Node = (x: number) => number;

const FUNCS: Record<string, (v: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  exp: Math.exp,
  log: Math.log,
  sqrt: Math.sqrt,
  abs: Math.abs,
};

type Token =
  | { kind: "num"; value: number }
  | { kind: "name"; value: string }
  | { kind: "op"; value: string }
  | { kind: "lparen" }
  | { kind: "rparen" };

function tokenize(src: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === " " || ch === "\t" || ch === "\n") {
      i++;
      continue;
    }
    if (ch === "(") {
      tokens.push({ kind: "lparen" });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ kind: "rparen" });
      i++;
      continue;
    }
    if (ch === "*" && src[i + 1] === "*") {
      tokens.push({ kind: "op", value: "**" });
      i += 2;
      continue;
    }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
      tokens.push({ kind: "op", value: ch });
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i + 1;
      while (j < src.length && /[0-9.eE]/.test(src[j])) {
        // allow exponent sign as part of a number literal
        if ((src[j] === "e" || src[j] === "E") && (src[j + 1] === "+" || src[j + 1] === "-")) {
          j += 2;
          continue;
        }
        j++;
      }
      const value = Number(src.slice(i, j));
      if (Number.isNaN(value)) return null;
      tokens.push({ kind: "num", value });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i + 1;
      while (j < src.length && /[a-zA-Z_0-9]/.test(src[j])) j++;
      tokens.push({ kind: "name", value: src.slice(i, j) });
      i = j;
      continue;
    }
    return null; // unexpected character
  }
  return tokens;
}

/** Recursive-descent parser producing an evaluator closure, or null on failure. */
function parse(tokens: Token[]): Node | null {
  let pos = 0;
  const peek = (): Token | undefined => tokens[pos];

  function parseExpr(): Node | null {
    const left = parseTerm();
    if (!left) return null;
    return parseAddSub(left);
  }

  function parseAddSub(initial: Node): Node | null {
    let left: Node = initial;
    for (;;) {
      const t = peek();
      if (t?.kind === "op" && (t.value === "+" || t.value === "-")) {
        pos++;
        const right = parseTerm();
        if (!right) return null;
        const l = left;
        left =
          t.value === "+"
            ? (x: number) => l(x) + right(x)
            : (x: number) => l(x) - right(x);
      } else {
        return left;
      }
    }
  }

  function parseTerm(): Node | null {
    const first = parseUnary();
    if (!first) return null;
    let left: Node = first;
    for (;;) {
      const t = peek();
      if (t?.kind === "op" && (t.value === "*" || t.value === "/")) {
        pos++;
        const right = parseUnary();
        if (!right) return null;
        const l = left;
        left =
          t.value === "*"
            ? (x: number) => l(x) * right(x)
            : (x: number) => l(x) / right(x);
      } else {
        return left;
      }
    }
  }

  // Unary +/- binds LOOSER than ** (matching Python: -x**2 === -(x**2)).
  function parseUnary(): Node | null {
    const t = peek();
    if (t?.kind === "op" && (t.value === "+" || t.value === "-")) {
      pos++;
      const operand = parseUnary();
      if (!operand) return null;
      return t.value === "-" ? (x: number) => -operand(x) : operand;
    }
    return parsePower();
  }

  function parsePower(): Node | null {
    const base = parseAtom();
    if (!base) return null;
    const t = peek();
    if (t?.kind === "op" && t.value === "**") {
      pos++;
      // Right operand is a unary expr so x**-2 parses; right-associative.
      const exp = parseUnary();
      if (!exp) return null;
      return (x: number) => Math.pow(base(x), exp(x));
    }
    return base;
  }

  function parseAtom(): Node | null {
    const t = peek();
    if (!t) return null;
    if (t.kind === "num") {
      pos++;
      const v = t.value;
      return () => v;
    }
    if (t.kind === "name") {
      pos++;
      if (t.value === "x") return (x: number) => x;
      if (t.value === "pi") return () => Math.PI;
      const fn = FUNCS[t.value];
      if (!fn) return null;
      if (peek()?.kind !== "lparen") return null;
      pos++;
      const arg = parseExpr();
      if (!arg) return null;
      if (peek()?.kind !== "rparen") return null;
      pos++;
      return (x: number) => fn(arg(x));
    }
    if (t.kind === "lparen") {
      pos++;
      const inner = parseExpr();
      if (!inner) return null;
      if (peek()?.kind !== "rparen") return null;
      pos++;
      return inner;
    }
    return null;
  }

  const root = parseExpr();
  if (!root) return null;
  if (pos !== tokens.length) return null; // trailing tokens → reject
  return root;
}

/**
 * Compile an expression string into a numeric function of x for plotting.
 * Returns null if the expression can't be parsed under the display grammar.
 */
export function compileExpression(src: string): ((x: number) => number) | null {
  const tokens = tokenize(src);
  if (!tokens || tokens.length === 0) return null;
  try {
    return parse(tokens);
  } catch {
    return null;
  }
}
