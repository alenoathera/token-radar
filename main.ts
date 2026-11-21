// main.ts — Entrypoint for token-radar-01 (Pre-Token Value Radar)
// Deterministic valuation pipeline: fits category multiples at runtime from snapshot data,
// scores all 289 pre-token protocols, and writes board.json, data.js, dashboard, screenshots & dossier.json.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function getArg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = getArg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: snapshot missing at ${inputFile}: provide --input <path>\n`);
  process.exit(2);
}

const outputDir = getArg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const rawSnapshot = readFileSync(inputFile, 'utf8');
const snapshot = parseSnapshot(rawSnapshot);
const { board, radar, model } = buildRadar(snapshot);

const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: board validation issue: ${issue}\n`);
  process.exit(1);
}

mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(outputDir, 'data.js'), dataScript(radar));

function copyDirFiles(fromDir: string, toDir: string): string[] {
  if (!existsSync(fromDir)) return [];
  mkdirSync(toDir, { recursive: true });
  const copied: string[] = [];
  const entries = readdirSync(fromDir).sort();
  for (const name of entries) {
    if (name.startsWith('.')) continue;
    const srcPath = join(fromDir, name);
    if (!statSync(srcPath).isFile()) continue;
    copyFileSync(srcPath, join(toDir, name));
    copied.push(name);
  }
  return copied;
}

copyDirFiles(join(here, 'dashboard'), join(outputDir, 'dashboard'));
const screenshots = copyDirFiles(join(here, 'screenshots'), join(outputDir, 'screenshots'));

if (screenshots.length < 3) {
  process.stderr.write(`token radar: screenshots/ has ${screenshots.length} images (minimum 3 required)\n`);
  process.exit(1);
}

for (const name of screenshots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: invalid screenshot filename: ${name}\n`);
    process.exit(1);
  }
}

// Scorer dossier generation with text cap
const startTime = Date.now();
const dossier = buildDossier(outputDir, {
  text_max_bytes: TEXT_MAX_BYTES,
  screenshots: SCREENSHOT_CAPS,
  dashboard: { max_files: 400, max_bytes: 4_194_304 },
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
const elapsedMs = Date.now() - startTime;

process.stdout.write(
  `[Pre-Token Value Radar] Processed ${snapshot.protocols.length} total protocols from DefiLlama snapshot (${snapshot.as_of}).\n` +
    `  - Watchlist coverage: ${snapshot.watchlist.length}/${snapshot.watchlist.length} protocols\n` +
    `  - Early pre-token protocols ranked: ${radar.early_size}\n` +
    `  - Total ranked board rows: ${board.length} rows (ranks 1..${board.length})\n` +
    `  - Live-token protocols tracked: ${radar.live_size}\n` +
    `  - Runtime model: ${radar.model_version} (global multiple ${model.global_base_multiple}x, ${Object.keys(model.category_multiples).length} category multiples)\n` +
    `  - Output written to: ${outputDir} (board.json, data.js, dashboard, screenshots, dossier.json) [dossier build: ${elapsedMs}ms]\n`,
);
