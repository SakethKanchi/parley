// Headless screenshot helper for iterating on the Parley web UI.
//   node scripts/shot.mjs <path> <outfile> [width] [height] [fullPage]
// e.g. node scripts/shot.mjs / /tmp/home.png 1440 900 full
import { execFileSync } from 'node:child_process';

const path = process.argv[2] || '/';
const out = process.argv[3] || '/tmp/parley-shot.png';
const w = process.argv[4] || '1440';
const h = process.argv[5] || '900';
const full = process.argv[6] === 'full';
const url = `http://localhost:5173${path}`;

const args = [
  '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  `--window-size=${w},${h}`,
  full ? '--screenshot' : `--screenshot=${out}`,
  '--virtual-time-budget=4500',
  url,
];
// Chrome's full-page flag differs; for simplicity we always use window-size capture.
execFileSync('google-chrome-stable', [`--screenshot=${out}`, ...args.filter(a => !a.startsWith('--screenshot'))], { stdio: 'inherit' });
console.log(`shot: ${url} -> ${out} (${w}x${h})`);
