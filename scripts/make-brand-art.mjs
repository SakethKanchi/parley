// Generates Parley brand art for the README: banner, square logo, and icon.
// Renders SVG sources -> PNG with sharp. Run: npm run make:art
// (sharp is resolved from the sibling parley-site install via NODE_PATH if absent here.)
import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'assets');
mkdirSync(outDir, { recursive: true });

const BLURPLE = '#5865F2';
const GREEN = '#23A559';
const INK = '#E6E8EE';
const MUTED = '#8A90A2';
const BG = '#0A0B0F';

// --- Banner (1280 x 360) ---
const bcx = 640;
const bHalf = [18, 30, 46, 36, 24, 15, 22];
const bX0 = bcx - 82.5;
const bBars = bHalf
  .map((hh, i) => {
    const x = bX0 + i * 15;
    return `<line x1="${x}" y1="${120 - hh}" x2="${x}" y2="${120 + hh}" stroke="${BLURPLE}" stroke-width="6" stroke-linecap="round"/>`;
  })
  .join('');
const bLine = `<line x1="${bX0 + 105}" y1="120" x2="${bX0 + 165}" y2="120" stroke="${GREEN}" stroke-width="6" stroke-linecap="round"/>`;

const banner = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="360" viewBox="0 0 1280 360">
  <defs>
    <radialGradient id="glow" cx="50%" cy="0%" r="70%">
      <stop offset="0%" stop-color="${BLURPLE}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="${BLURPLE}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1280" height="360" fill="${BG}"/>
  <rect width="1280" height="360" fill="url(#glow)"/>
  <g>${bBars}${bLine}</g>
  <text x="${bcx}" y="238" text-anchor="middle" font-family="Space Grotesk, DejaVu Sans, sans-serif" font-size="94" font-weight="700" letter-spacing="-2" fill="${INK}">Parley</text>
  <text x="${bcx}" y="284" text-anchor="middle" font-family="Inter, DejaVu Sans, sans-serif" font-size="27" fill="${MUTED}">Self-hosted Discord meeting notes</text>
  <text x="${bcx}" y="326" text-anchor="middle" font-family="DejaVu Sans Mono, monospace" font-size="16" letter-spacing="3" fill="#6F7689">PER-SPEAKER TRANSCRIPTS · LOCAL WHISPER · STRUCTURED AI NOTES</text>
</svg>`;

// --- Square logo (512 x 512) ---
const lcx = 256;
const lHalf = [40, 66, 96, 70, 48];
const lX0 = 140;
const lBars = lHalf
  .map((hh, i) => {
    const x = lX0 + i * 34;
    return `<line x1="${x}" y1="${256 - hh}" x2="${x}" y2="${256 + hh}" stroke="${BLURPLE}" stroke-width="14" stroke-linecap="round"/>`;
  })
  .join('');
const lLine = `<line x1="302" y1="256" x2="372" y2="256" stroke="${GREEN}" stroke-width="14" stroke-linecap="round"/>`;

const logo = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect x="6" y="6" width="500" height="500" rx="110" fill="${BG}"/>
  <rect x="6" y="6" width="500" height="500" rx="110" fill="none" stroke="${BLURPLE}" stroke-opacity="0.18" stroke-width="3"/>
  <g>${lBars}${lLine}</g>
</svg>`;

// --- Icon (256 x 256, transparent bg, mark only) ---
const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 512 512">
  <g>${lBars}${lLine}</g>
</svg>`;

const jobs = [
  ['banner', banner],
  ['logo', logo],
  ['icon', icon],
];
for (const [name, svg] of jobs) {
  writeFileSync(join(outDir, `${name}.svg`), svg);
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  writeFileSync(join(outDir, `${name}.png`), png);
  console.log('wrote', `${name}.svg`, '+', `${name}.png`, png.length, 'bytes');
}
