// The guidebook's specimen sheets (docs/brand/guidebook.md), drawn from the
// master mark and the icon geometry the wallet uses. Deterministic: run
// `npm run specimens` after changing either, never edit the SVGs by hand.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const master = readFileSync('public/assets/selfhold-mark.svg', 'utf8');
const geometry = master.match(/<g id="mark"[^>]*>([\s\S]*?)<\/g>/)[1].trim().replace(/\s*\n\s*/g, '');

// The interface's own icon vocabulary, so the sheets draw what the wallet draws.
const { ICONS: VOCABULARY, strokeFor } = await import('../src/popup/icons.ts');
const ICONS = Object.fromEntries(Object.entries(VOCABULARY).map(([name, { lucide, meaning, shapes }]) => [name, {
  lucide, meaning, d: shapes.map(([tag, attributes]) => `<${tag} ${Object.entries(attributes).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join(''),
}]));

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
const icon = (name, x, y, size = 16, cls = 'stroke') => `<g class="${cls}" transform="translate(${x} ${y}) scale(${size / 24})" stroke-width="${strokeFor(size)}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name].d}</g>`;
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

// 4. States: activity rows as the Transactions screen draws them, then warning tiers.
const tier = (name, message) => `<tspan font-weight="600" letter-spacing=".08em">${name.toUpperCase()}</tspan><tspan dx="12">${message}</tspan>`;
const row = (y, glyph, status, struck) => box(20, y, 680, 64) + (glyph ? icon(glyph, 36, y + 13) : '') +
  text(64, y + 27, 'Sent', { size: 14 }) + text(668, y + 27, '−40', { anchor: 'end', size: 14 }) +
  (struck ? `<line class="stroke" x1="644" y1="${y + 22.5}" x2="669" y2="${y + 22.5}"/>` : '') +
  text(36, y + 49, 'Nexus', { size: 12 }) + text(668, y + 49, status, { anchor: 'end', size: 12 });
const states = sheet(720, 640, [
  text(20, 22, 'ACTIVITY · A SHAPE ONLY WHEN CERTAIN, ALWAYS THE WORDS AND THE SIGN', { size: 11, cls: 'b caps' }),
  row(36, 'sent', 'included in block 5'), row(100, 'pending', 'pending'),
  row(164, null, 'not included; its nonce was spent by another transaction', true),
  row(228, null, 'unknown to node'),
  box(20, 304, 680, 112) + icon('sent', 36, 320, 32) + text(36, 376, 'NO TRANSACTIONS YET', { size: 12, cls: 'b caps' }) +
    text(36, 396, 'Transactions sent from this wallet appear here.', { size: 12 }),
  text(20, 448, 'WARNINGS · INK WEIGHT, NEVER COLOR', { size: 11, cls: 'b caps' }),
  box(20, 462, 680, 44) + text(36, 489, tier('Note', 'This site has not connected before.'), { size: 12 }),
  box(20, 514, 680, 44, 'stroke') + icon('warning', 36, 528) + text(64, 541, tier('Warning', 'The fee is below what this node relays.'), { size: 12 }),
  `<rect class="ink" x="20" y="566" width="680" height="56"/>` + icon('warning', 36, 586, 16, 'invs') + text(64, 599, tier('Danger', 'This request pays an address you have never paid.'), { size: 12, cls: 'inv' }),
].join(''));

mkdirSync('docs/brand/specimens', { recursive: true });
for (const [file, svg] of Object.entries({ mark: marks, screens, icons: iconSheet, states })) writeFileSync(`docs/brand/specimens/${file}.svg`, svg);
console.log('Rendered the guidebook specimens.');
