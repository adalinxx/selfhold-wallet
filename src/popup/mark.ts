// The Selfhold mark (docs/brand/guidebook.md §2), drawn inline so it takes the
// text color: light, dark and high contrast alike. Its geometry is the master's,
// public/assets/selfhold-mark.svg, which a test holds it to.
export const MARK_GEOMETRY = [
  ["path", { d: "M100 32H216Q234 32 248 46L286 80Q300 94 300 116Q300 136 280 136H166C158 118 140 106 120 106C92 106 70 128 70 156Q70 165 72 172C42 164 20 138 20 108C20 66 56 32 100 32Z" }],
  ["path", { d: "M48 194H82C92 202 106 208 120 208C142 208 160 194 166 168H218V194Q218 200 224 200H244Q250 200 250 194V168H264C286 172 302 194 302 218C302 258 268 286 228 286H98Q80 286 68 274L30 238Q20 228 20 216Q20 194 48 194Z" }],
  ["circle", { cx: "120", cy: "156", r: "21" }],
] as const;

/** The mark at one of its sizes (18, 56 or 96 px). Decorative unless `label` names it. */
export function brandMark(size: 18 | 56 | 96, label?: string): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  for (const [key, value] of Object.entries({
    class: "mark", viewBox: "0 0 320 320", width: String(size), height: String(size), fill: "currentColor", focusable: "false",
    ...(label ? { role: "img", "aria-label": label } : { "aria-hidden": "true" }),
  })) svg.setAttribute(key, value);
  for (const [tag, attributes] of MARK_GEOMETRY) {
    const shape = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attributes)) shape.setAttribute(key, value);
    svg.append(shape);
  }
  return svg;
}
