// The guidebook's specimen sheets (docs/brand/guidebook.md), drawn from the
// master mark and the icon geometry the wallet uses. Deterministic: run
// `npm run specimens` after changing either, never edit the SVGs by hand.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const master = readFileSync('public/assets/selfhold-mark.svg', 'utf8');
const geometry = master.match(/<g id="mark"[^>]*>([\s\S]*?)<\/g>/)[1].trim().replace(/\s*\n\s*/g, '');

// Lucide 1.61.0 (ISC), 24-unit grid. Names are the guidebook's meanings.
export const ICONS = {
  copy: { lucide: 'copy', meaning: 'Copy a value', d: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>' },
  refresh: { lucide: 'refresh-cw', meaning: 'Read again', d: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>' },
  edit: { lucide: 'pencil', meaning: 'Rename', d: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>' },
  sent: { lucide: 'arrow-up-right', meaning: 'Sent', d: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>' },
  received: { lucide: 'arrow-down-left', meaning: 'Received', d: '<path d="M17 7 7 17"/><path d="M17 17H7V7"/>' },
  pending: { lucide: 'clock', meaning: 'Pending', d: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>' },
  failed: { lucide: 'x', meaning: 'Failed', d: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>' },
  confirmed: { lucide: 'check', meaning: 'Confirmed', d: '<path d="M20 6 9 17l-5-5"/>' },
  warning: { lucide: 'triangle-alert', meaning: 'Warning', d: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>' },
  locked: { lucide: 'lock', meaning: 'Locked', d: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>' },
  external: { lucide: 'external-link', meaning: 'Opens outside', d: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>' },
  show: { lucide: 'eye', meaning: 'Show', d: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>' },
  hide: { lucide: 'eye-off', meaning: 'Hide', d: '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>' },
  node: { lucide: 'server', meaning: 'Node', d: '<rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/>' },
};

// The tokens (public/assets/tokens.css), light then dark, and the system sans.
const STYLE = `<style>
.paper{fill:#ffffff}.ink{fill:#0a0a0a}.rule{stroke:#e6e6e6;fill:none}.stroke{stroke:#0a0a0a;fill:none}.inv{fill:#ffffff}.invs{stroke:#ffffff;fill:none}
.guide{stroke:#0a0a0a;stroke-dasharray:3 3;fill:none;opacity:.35}
text{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;fill:#0a0a0a}
text.inv{fill:#ffffff}.caps{letter-spacing:.08em;text-transform:uppercase}.b{font-weight:600}
@media (prefers-color-scheme:dark){.paper{fill:#0a0a0a}.ink{fill:#ededed}.rule{stroke:#1c1c1c}.stroke{stroke:#ededed}.inv{fill:#0a0a0a}.invs{stroke:#0a0a0a}
.guide{stroke:#ededed}text{fill:#ededed}text.inv{fill:#0a0a0a}}
</style>`;
const sheet = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${STYLE}<rect class="paper" width="${w}" height="${h}"/>${body}</svg>\n`;
const text = (x, y, s, { size = 12, anchor = 'start', cls = '' } = {}) => `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" class="${cls}">${s}</text>`;
/** The mark, `size` px square, top-left at x, y. */
const mark = (x, y, size, cls = 'ink') => `<g class="${cls}" transform="translate(${x} ${y}) scale(${size / 320})">${geometry}</g>`;
/** An icon at `size` px, stroked at exactly 1px: 24 / size on the 24 grid. */
const icon = (name, x, y, size = 16, cls = 'stroke') => `<g class="${cls}" transform="translate(${x} ${y}) scale(${size / 24})" stroke-width="${24 / size}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name].d}</g>`;
const box = (x, y, w, h, cls = 'rule') => `<rect class="${cls}" x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${h - 1}"/>`;
const button = (x, y, w, label, filled) => (filled ? `<rect class="ink" x="${x}" y="${y}" width="${w}" height="36"/>` : box(x, y, w, 36)) +
  text(x + w / 2, y + 22, label, { anchor: 'middle', cls: `caps${filled ? ' inv' : ''}` });

// 1. The mark: three sizes, and its clear space.
const marks = sheet(720, 280, [
  ...[[18, 'TOP BAR'], [56, 'UNLOCK'], [96, 'WELCOME · MILESTONES']].map(([size, use], i) => {
    const cx = 100 + i * 180;
    return mark(cx - size / 2, 150 - size / 2, size) + text(cx, 236, `${size} px`, { anchor: 'middle', cls: 'b' }) + text(cx, 254, use, { anchor: 'middle', size: 11, cls: 'caps' });
  }),
  // Clear space: a quarter of the mark's size on every side.
  `<rect class="guide" x="${640 - 48 - 24}" y="${150 - 48 - 24}" width="144" height="144"/>`, mark(640 - 48, 150 - 48, 96),
  text(640, 236, 'CLEAR SPACE', { anchor: 'middle', cls: 'b caps', size: 11 }), text(640, 254, '¼ of its size, every side', { anchor: 'middle', size: 11 }),
  `<line class="rule" x1="${540}" y1="20" x2="${540}" y2="260"/>`,
].join(''));

// 2. Welcome and unlock, as the guidebook draws them: 360 wide.
const frame = (x, title, inner) => text(x, 22, title, { cls: 'b caps', size: 11 }) + box(x, 32, 360, 520) +
  `<line class="rule" x1="${x}" y1="${32 + 40.5}" x2="${x + 360}" y2="${32 + 40.5}"/>` + mark(x + 16, 32 + 11, 18) + inner;
const screens = sheet(800, 572, [
  frame(20, 'Welcome', [
    mark(20 + 180 - 48, 150, 96),
    text(200, 290, 'SELFHOLD', { anchor: 'middle', size: 28, cls: 'b caps' }),
    text(200, 316, 'open-source. self-custodial. your keys, your control.', { anchor: 'middle', size: 12 }),
    button(36, 380, 328, 'Create wallet', true), button(36, 428, 328, 'Restore or import', false),
  ].join('')),
  frame(420, 'Unlock', [
    mark(420 + 180 - 28, 150, 56),
    text(600, 244, 'SELFHOLD', { anchor: 'middle', size: 20, cls: 'b caps' }),
    text(436, 306, 'password', { size: 14, cls: '' }).replace('<text', '<text opacity=".45"'),
    `<line class="stroke" x1="436" y1="320.5" x2="764" y2="320.5"/>`,
    button(436, 344, 328, 'Unlock', true),
  ].join('')),
].join(''));

// 3. The icon vocabulary at 16 and 32 px, each at 1px.
const names = Object.keys(ICONS);
const iconSheet = sheet(720, 60 + Math.ceil(names.length / 2) * 56, names.map((name, i) => {
  const x = 20 + (i % 2) * 360, y = 40 + Math.floor(i / 2) * 56;
  return icon(name, x, y + 8) + icon(name, x + 32, y, 32) + text(x + 80, y + 14, ICONS[name].meaning, { cls: 'b' }) + text(x + 80, y + 32, ICONS[name].lucide, { size: 11 }).replace('<text', '<text opacity=".6"');
}).join('') + text(20, 22, '16 PX AND 32 PX · STROKE 24 ÷ SIZE = 1 PX · LUCIDE 1.61.0', { size: 11, cls: 'b caps' }));

// 4. States: activity rows, then warning tiers.
const tier = (name, message) => `<tspan font-weight="600" letter-spacing=".08em">${name.toUpperCase()}</tspan><tspan dx="12">${message}</tspan>`;
const row = (y, glyph, label, amount, chip) => box(20, y, 680, 48) + icon(glyph, 36, y + 16) +
  text(64, y + 29, label, { cls: 'caps b', size: 12 }) + text(500, y + 29, amount, { anchor: 'end', size: 14 }) +
  (chip ? `<rect class="ink" x="${684 - chip.length * 8 - 16}" y="${y + 12}" width="${chip.length * 8 + 16}" height="24"/>` + text(684 - chip.length * 4 - 8, y + 28, chip, { anchor: 'middle', size: 11, cls: 'caps inv' }) : '');
const states = sheet(720, 600, [
  text(20, 22, 'ACTIVITY · SHAPE, WORD AND SIGN; INVERSION ONLY WHERE THERE IS SOMETHING TO DO', { size: 11, cls: 'b caps' }),
  row(36, 'sent', 'Sent', '−250'), row(84, 'received', 'Received', '+1,000'), row(132, 'pending', 'Pending', '−40', 'Speed up'),
  row(180, 'failed', 'Failed', '−12', 'Retry'),
  box(20, 228, 680, 48) + text(64, 257, 'REPLACED →', { cls: 'caps b', size: 12 }) + text(500, 257, '−40', { anchor: 'end', size: 14 }) + `<line class="stroke" x1="470" y1="252.5" x2="502" y2="252.5"/>`,
  text(20, 316, 'WARNINGS · INK WEIGHT, NEVER COLOR', { size: 11, cls: 'b caps' }),
  box(20, 330, 680, 44) + text(36, 357, tier('Note', 'This site has not connected before.'), { size: 12 }),
  box(20, 386, 680, 44, 'stroke') + icon('warning', 36, 400) + text(64, 413, tier('Warning', 'The fee is below what this node relays.'), { size: 12 }),
  `<rect class="ink" x="20" y="442" width="680" height="56"/>` + icon('warning', 36, 462, 16, 'invs') + text(64, 475, tier('Danger', 'This request pays an address you have never paid.'), { size: 12, cls: 'inv' }),
  button(20, 518, 334, 'Reject', true), button(366, 518, 334, 'Sign anyway', false),
  text(20, 584, 'On danger the safe choice is the filled button; the risky one is outlined.', { size: 11 }),
].join(''));

mkdirSync('docs/brand/specimens', { recursive: true });
for (const [file, svg] of Object.entries({ mark: marks, screens, icons: iconSheet, states })) writeFileSync(`docs/brand/specimens/${file}.svg`, svg);
console.log('Rendered the guidebook specimens.');
