export type LatexShortcut = { id: string; command: string; replacement: string };

const builtins: [string, string][] = [
  ["Leftrightarrow", "⇔"], ["Rightarrow", "⇒"], ["Leftarrow", "⇐"], ["longleftrightarrow", "⟷"], ["longrightarrow", "⟶"], ["longleftarrow", "⟵"],
  ["leftrightarrow", "↔"], ["rightarrow", "→"], ["leftarrow", "←"], ["uparrow", "↑"], ["downarrow", "↓"],
  ["alpha", "α"], ["beta", "β"], ["gamma", "γ"], ["delta", "δ"], ["epsilon", "ε"], ["zeta", "ζ"], ["eta", "η"], ["theta", "θ"],
  ["kappa", "κ"], ["lambda", "λ"], ["mu", "μ"], ["nu", "ν"], ["xi", "ξ"], ["pi", "π"], ["rho", "ρ"], ["sigma", "σ"], ["tau", "τ"],
  ["phi", "φ"], ["chi", "χ"], ["psi", "ψ"], ["omega", "ω"], ["Gamma", "Γ"], ["Delta", "Δ"], ["Theta", "Θ"], ["Lambda", "Λ"],
  ["Xi", "Ξ"], ["Pi", "Π"], ["Sigma", "Σ"], ["Phi", "Φ"], ["Psi", "Ψ"], ["Omega", "Ω"], ["infty", "∞"], ["approx", "≈"],
  ["neq", "≠"], ["leq", "≤"], ["geq", "≥"], ["times", "×"], ["pm", "±"], ["cdot", "·"], ["degree", "°"], ["equiv", "≡"], ["propto", "∝"],
  ["in", "∈"], ["notin", "∉"], ["subset", "⊂"], ["supset", "⊃"], ["cap", "∩"], ["cup", "∪"],
];

export const DEFAULT_LATEX_SHORTCUTS: LatexShortcut[] = builtins.map(([command, replacement]) => ({ id: `builtin-${command}`, command, replacement }));

function escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

export function applyLatexShortcuts(value: string, includeEnd = false, shortcuts: LatexShortcut[] = DEFAULT_LATEX_SHORTCUTS) {
  if (!shortcuts.length) return value;
  const names = shortcuts.map((item) => item.command).filter(Boolean).sort((a, b) => b.length - a.length).map(escapeRegExp).join("|");
  if (!names) return value;
  const lookup = new Map(shortcuts.map((item) => [item.command, item.replacement]));
  const boundary = includeEnd ? `(?=$|[\\s.,;:!?()[\\]{}])` : `(?=[\\s.,;:!?()[\\]{}])`;
  return value.replace(new RegExp(`[\\\\₩](${names})${boundary}`, "g"), (_, command: string) => lookup.get(command) ?? command);
}
