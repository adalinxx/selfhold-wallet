// Selfhold's icon vocabulary (docs/brand/guidebook.md §5): Lucide 1.61.0
// geometry (ISC, THIRD_PARTY_NOTICES.md) on its 24-unit grid. One icon, one
// meaning; nothing outside this list is drawn.
type Shape = readonly ["path", { d: string }] | readonly ["circle", Record<"cx" | "cy" | "r", string>]
  | readonly ["rect", Record<string, string>] | readonly ["line", Record<"x1" | "x2" | "y1" | "y2", string>];

export const ICONS = {
  copy: { lucide: "copy", meaning: "Copy a value", shapes: [
    ["rect", { width: "14", height: "14", x: "8", y: "8", rx: "2", ry: "2" }],
    ["path", { d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" }]] },
  refresh: { lucide: "refresh-cw", meaning: "Read again", shapes: [
    ["path", { d: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" }], ["path", { d: "M21 3v5h-5" }],
    ["path", { d: "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" }], ["path", { d: "M8 16H3v5" }]] },
  edit: { lucide: "pencil", meaning: "Rename", shapes: [
    ["path", { d: "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" }],
    ["path", { d: "m15 5 4 4" }]] },
  sent: { lucide: "arrow-up-right", meaning: "Sent", shapes: [["path", { d: "M7 7h10v10" }], ["path", { d: "M7 17 17 7" }]] },
  received: { lucide: "arrow-down-left", meaning: "Received", shapes: [["path", { d: "M17 7 7 17" }], ["path", { d: "M17 17H7V7" }]] },
  pending: { lucide: "clock", meaning: "Pending", shapes: [["circle", { cx: "12", cy: "12", r: "10" }], ["path", { d: "M12 6v6l4 2" }]] },
  failed: { lucide: "x", meaning: "Failed", shapes: [["path", { d: "M18 6 6 18" }], ["path", { d: "m6 6 12 12" }]] },
  confirmed: { lucide: "check", meaning: "Confirmed", shapes: [["path", { d: "M20 6 9 17l-5-5" }]] },
  warning: { lucide: "triangle-alert", meaning: "Warning", shapes: [
    ["path", { d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" }], ["path", { d: "M12 9v4" }], ["path", { d: "M12 17h.01" }]] },
  locked: { lucide: "lock", meaning: "Locked", shapes: [
    ["rect", { width: "18", height: "11", x: "3", y: "11", rx: "2", ry: "2" }], ["path", { d: "M7 11V7a5 5 0 0 1 10 0v4" }]] },
  external: { lucide: "external-link", meaning: "Opens outside", shapes: [
    ["path", { d: "M15 3h6v6" }], ["path", { d: "M10 14 21 3" }], ["path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" }]] },
  show: { lucide: "eye", meaning: "Show", shapes: [
    ["path", { d: "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" }], ["circle", { cx: "12", cy: "12", r: "3" }]] },
  hide: { lucide: "eye-off", meaning: "Hide", shapes: [
    ["path", { d: "M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" }],
    ["path", { d: "M14.084 14.158a3 3 0 0 1-4.242-4.242" }],
    ["path", { d: "M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" }], ["path", { d: "m2 2 20 20" }]] },
  node: { lucide: "server", meaning: "Node", shapes: [
    ["rect", { width: "20", height: "8", x: "2", y: "2", rx: "2", ry: "2" }], ["rect", { width: "20", height: "8", x: "2", y: "14", rx: "2", ry: "2" }],
    ["line", { x1: "6", x2: "6.01", y1: "6", y2: "6" }], ["line", { x1: "6", x2: "6.01", y1: "18", y2: "18" }]] },
} as const satisfies Record<string, { lucide: string; meaning: string; shapes: readonly Shape[] }>;

export type IconName = keyof typeof ICONS;

/** The guidebook's two icon sizes: inline and in buttons, and empty states. */
export type IconSize = 16 | 32;

/** Always exactly 1 px: the 24-unit grid scaled to `size`. */
export const strokeFor = (size: IconSize) => 24 / size;

/** An icon beside its word, so hidden from screen readers; the word, or the button's label, names it. */
export function icon(name: IconName, size: IconSize = 16): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  for (const [key, value] of Object.entries({
    class: "icon", viewBox: "0 0 24 24", width: String(size), height: String(size), fill: "none", stroke: "currentColor",
    "stroke-width": String(strokeFor(size)), "stroke-linecap": "round", "stroke-linejoin": "round",
    "aria-hidden": "true", focusable: "false",
  })) svg.setAttribute(key, value);
  for (const [tag, attributes] of ICONS[name].shapes) {
    const shape = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attributes)) shape.setAttribute(key, value);
    svg.append(shape);
  }
  return svg;
}
