/**
 * Derives contrast-safe companion shades and checks real foreground/background
 * PAIRS as actually used in components (not just every token against paper).
 *
 * Run: node scripts/derive-safe-shades.mjs
 */

function srgbToLinear(c) {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function luminance(hex) {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return (
    0.2126 * srgbToLinear(r) +
    0.7152 * srgbToLinear(g) +
    0.0722 * srgbToLinear(b)
  );
}
function ratio(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
function toRgb(hex) {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function toHex([r, g, b]) {
  return (
    "#" +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

/** Scale a colour toward black in small steps until it clears `target` on `bg`. */
function darkenUntil(hex, bg, target) {
  const rgb = toRgb(hex);
  for (let f = 100; f >= 0; f--) {
    const candidate = toHex(rgb.map((c) => (c * f) / 100));
    if (ratio(candidate, bg) >= target) return { hex: candidate, factor: f };
  }
  return { hex: "#000000", factor: 0 };
}

const paper = "#EFEDE4";
const paperRaised = "#F7F5EE";

console.log("Deriving text-safe companions (>= 4.5:1 on BOTH paper tones)\n");

for (const [name, hex] of [
  ["slate", "#5B7A8C"],
  ["brass", "#B08D3E"],
]) {
  // For a DARK foreground the harder background is the DARKER one, since
  // contrast grows as the backdrop lightens. --paper is darker than
  // --paper-raised, so clearing --paper clears both.
  const d = darkenUntil(hex, paper, 4.5);
  console.log(`--${name}  ${hex}  ->  ${d.hex}   (${d.factor}% brightness)`);
  console.log(
    `    on paper        ${ratio(d.hex, paper).toFixed(2)}  ` +
      `on paper-raised ${ratio(d.hex, paperRaised).toFixed(2)}`,
  );
}

console.log("\nReal component pairs\n");

const PAIRS = [
  ["paper on ink", "#EFEDE4", "#1B2A3A", 4.5, "primary button label"],
  ["paper on brass", "#EFEDE4", "#B08D3E", 4.5, "primary button label, HOVER"],
  ["paper on brass-deep", "#EFEDE4", "#7D6329", 4.5, "proposed hover fill"],
  ["slate on paper-raised", "#5B7A8C", "#F7F5EE", 4.5, "under-target badge text"],
  ["ledger-red on paper-raised", "#9C3B2E", "#F7F5EE", 4.5, "over-target badge text"],
  ["ink-soft on paper-raised", "#57616E", "#F7F5EE", 4.5, "in-tolerance badge text"],
  ["slate on paper", "#5B7A8C", "#EFEDE4", 3, "focus ring (graphical, 3:1)"],
  ["brass on paper", "#B08D3E", "#EFEDE4", 3, "quarter stamp (graphical, 3:1)"],
  ["rule on paper", "#D9D4C4", "#EFEDE4", 3, "table hairline — decorative"],
];

let fails = 0;
for (const [label, fg, bg, target, note] of PAIRS) {
  const r = ratio(fg, bg);
  const ok = r >= target;
  if (!ok) fails++;
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(28)} ${r.toFixed(2).padStart(5)} ` +
      `(needs ${target})  ${note}`,
  );
}

console.log(
  `\n${fails} pair(s) below threshold. Decorative hairlines are exempt (SC 1.4.11 excludes purely decorative objects).`,
);
