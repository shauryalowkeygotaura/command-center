// Dependency-free SAT math renderer. No KaTeX (about 347 kB of JS plus fonts and
// client reflow) for a static localStorage dashboard whose math is simple:
// exponents, square roots, ratios, plus-or-minus, inequalities. This is a tiny
// recursive tokenizer that emits React nodes so raw carets never reach the page.
//
// Handles:
//   1) Exponents  x^2, b^2, x^(a+b), x^{a+b}  -> real <sup> superscripts
//   2) Radicals   sqrt(b^2-4ac)               -> radical glyph + overlined radicand
//   3) Symbols    +/- >= <= != -> *           -> whitelisted glyph swaps only
// Simple fractions a/b are left inline (legible at SAT scope). KaTeX is reserved
// for a future need (stacked fractions, matrices) behind a lazy import.
//
// No em dashes or en dashes anywhere in the glyph table: minus stays as the
// hyphen-minus character, ranges are spelled with the word "to".

import { type ReactNode } from "react";

// Exact-token symbol swaps. Whitelist only: we never strip unknown characters,
// so arbitrary user text is passed through untouched. Order matters so multi-char
// tokens are replaced before their single-char prefixes could interfere.
function swapSymbols(text: string): string {
  return text
    .replaceAll("+/-", "±") // plus-minus
    .replaceAll(">=", "≥") // greater-or-equal
    .replaceAll("<=", "≤") // less-or-equal
    .replaceAll("!=", "≠") // not-equal
    .replaceAll("->", "→") // right arrow
    .replaceAll("*", "·"); // middle dot for multiplication
}

const EXP_RE = /^(\{[^}]+\}|\([^)]+\)|-?[0-9a-zA-Z]+)/;

// Recursive parse: walk the string, splitting out sqrt(...) groups and ^exponents,
// applying symbol swaps only to the plain-text runs in between.
function parse(input: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let buf = "";
  let i = 0;
  let n = 0;

  const flush = () => {
    if (buf) {
      out.push(<span key={`${keyBase}-t${n++}`}>{swapSymbols(buf)}</span>);
      buf = "";
    }
  };

  while (i < input.length) {
    // Radical: sqrt( ... ) with balanced parens.
    if (input.startsWith("sqrt(", i)) {
      flush();
      const start = i + 5;
      let depth = 1;
      let j = start;
      while (j < input.length && depth > 0) {
        if (input[j] === "(") depth++;
        else if (input[j] === ")") {
          depth--;
          if (depth === 0) break;
        }
        j++;
      }
      const inner = input.slice(start, j);
      out.push(
        <span key={`${keyBase}-r${n++}`} className="inline-flex items-start">
          <span aria-hidden="true" className="leading-none">
            {"√"}
          </span>
          <span className="border-t border-cream/70 pl-0.5">
            {parse(inner, `${keyBase}-ri${n}`)}
          </span>
        </span>,
      );
      i = j + 1; // skip the closing paren
      continue;
    }

    // Exponent: ^ followed by {group}, (group), or a run of alphanumerics.
    if (input[i] === "^") {
      const m = EXP_RE.exec(input.slice(i + 1));
      if (m) {
        flush();
        let g = m[1];
        if (
          (g.startsWith("{") && g.endsWith("}")) ||
          (g.startsWith("(") && g.endsWith(")"))
        ) {
          g = g.slice(1, -1);
        }
        out.push(
          <sup key={`${keyBase}-s${n++}`} className="align-super text-[0.75em]">
            {parse(g, `${keyBase}-si${n}`)}
          </sup>,
        );
        i += 1 + m[1].length;
        continue;
      }
    }

    buf += input[i];
    i++;
  }

  flush();
  return out;
}

/** Render SAT math markup (carets, sqrt, symbol tokens) as real React nodes. */
export function Math({ text }: { text: string }) {
  return <>{parse(text, "m")}</>;
}
