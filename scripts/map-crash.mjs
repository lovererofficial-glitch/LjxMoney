#!/usr/bin/env node
/**
 * Crash coordinate mapper for the iOS build source map.
 *
 * Usage:
 *   node scripts/map-crash.mjs --from-bundle <line> <col>
 *     Map a minified jsbundle coordinate (from a crash log) to original source.
 *   node scripts/map-crash.mjs --from-source <source-substring> <line>
 *     Find the minified jsbundle coordinate(s) for an original source position.
 *   Options: --map <path> (default: sourcemap-artifact/LjxMoney.main.jsbundle.map)
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const CHAR_TO_INT = new Map([...BASE64].map((c, i) => [c, i]));

function decodeVlq(segment) {
  const values = [];
  let value = 0;
  let shift = 0;
  for (const char of segment) {
    const digit = CHAR_TO_INT.get(char);
    if (digit === undefined) throw new Error(`Invalid base64 VLQ character: ${char}`);
    value += (digit & 31) << shift;
    if (digit & 32) {
      shift += 5;
      continue;
    }
    const negative = value & 1;
    value >>= 1;
    values.push(negative ? (value === 0 ? -0x80000000 : -value) : value);
    value = 0;
    shift = 0;
  }
  return values;
}

/** Decode "mappings" into per-generated-line segments:
 *  [genCol, srcIdx, srcLine0, srcCol0] (sorted by genCol). */
function decodeMappings(mappings) {
  let srcIdx = 0;
  let srcLine = 0;
  let srcCol = 0;
  let nameIdx = 0;
  const lines = [];
  for (const lineStr of mappings.split(';')) {
    let genCol = 0;
    const segments = [];
    for (const segStr of lineStr.split(',')) {
      if (!segStr) continue;
      const fields = decodeVlq(segStr);
      genCol += fields[0];
      if (fields.length >= 4) {
        srcIdx += fields[1];
        srcLine += fields[2];
        srcCol += fields[3];
        if (fields.length >= 5) nameIdx += fields[4];
        segments.push([genCol, srcIdx, srcLine, srcCol]);
      }
    }
    segments.sort((a, b) => a[0] - b[0]);
    lines.push(segments);
  }
  return lines;
}

function parseArgs(argv) {
  const args = { mode: null, map: null, positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--from-bundle' || arg === '--from-source') args.mode = arg;
    else if (arg === '--map') args.map = argv[++i];
    else args.positional.push(arg);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const mapPath = path.resolve(
  args.map ?? path.join('sourcemap-artifact', 'LjxMoney.main.jsbundle.map'),
);
if (!fs.existsSync(mapPath)) {
  console.error(`Source map not found: ${mapPath}`);
  process.exit(1);
}
if (!args.mode) {
  console.error('Missing mode: --from-bundle <line> <col> | --from-source <src> <line>');
  process.exit(1);
}

const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
const sources = map.sources ?? [];
const contents = map.sourcesContent ?? [];
const decoded = decodeMappings(map.mappings);

if (args.mode === '--from-bundle') {
  const line = Number(args.positional[0]);
  const col = Number(args.positional[1]);
  if (!Number.isInteger(line) || !Number.isInteger(col)) {
    console.error('Usage: --from-bundle <line> <col> (1-based, as printed in crash logs)');
    process.exit(1);
  }
  const segments = decoded[line - 1] ?? [];
  let match = null;
  for (const seg of segments) {
    if (seg[0] <= col) match = seg;
    else break;
  }
  if (!match) {
    console.log(`No mapping for jsbundle:${line}:${col}.`);
    process.exit(2);
  }
  const [, srcIdx, srcLine, srcCol] = match;
  console.log(`jsbundle:${line}:${col}`);
  console.log(`  -> ${sources[srcIdx]}:${srcLine + 1}:${srcCol + 1}`);
  const content = contents[srcIdx];
  if (content) {
    const srcLines = content.split('\n');
    console.log(`     ${srcLine + 1} | ${srcLines[srcLine] ?? ''}`);
  }
  const idx = segments.indexOf(match);
  if (idx > 0) {
    const prev = segments[idx - 1];
    console.log(`  (previous segment on line: ${sources[prev[1]]}:${prev[2] + 1} @ genCol ${prev[0]})`);
  }
  process.exit(0);
}

const [sourceSub, lineStr] = args.positional;
const line = Number(lineStr);
if (!sourceSub || !Number.isInteger(line)) {
  console.error('Usage: --from-source <source-substring> <line>');
  process.exit(1);
}
const targetIdx = sources.findIndex((s) => s.includes(sourceSub));
if (targetIdx < 0) {
  console.error(`No source path matches "${sourceSub}".`);
  process.exit(2);
}
const hits = [];
decoded.forEach((segments, genLine0) => {
  for (const seg of segments) {
    if (seg[1] === targetIdx && seg[2] === line - 1) {
      hits.push({ genLine: genLine0 + 1, genCol: seg[0], srcCol: seg[3] + 1 });
    }
  }
});
console.log(`${sources[targetIdx]}:${line}`);
if (hits.length === 0) {
  console.log('  No generated mapping found for that line.');
  process.exit(2);
}
for (const hit of hits) {
  console.log(`  -> jsbundle:${hit.genLine}:${hit.genCol} (source col ${hit.srcCol})`);
}
