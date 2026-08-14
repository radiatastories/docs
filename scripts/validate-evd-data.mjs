#!/usr/bin/env node
/**
 * Invariant checks for src/data/evd-commands.ts.
 *
 * Runs against the checked-in dataset alone — no corpora, no reference tree —
 * so it is reproducible in CI. Corpus-derived facts are pinned here as
 * constants with a note on how they were established; if the corpora are
 * re-scanned and a constant changes, this file changes with it.
 *
 *   npm run validate:evd
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Exported so the negative-test harness can validate mutated copies. */
export function validate(src) {
  const problems = [];
  const fail = (m) => problems.push(m);
  const records = parseRecords(src);
  runGates(records, fail);
  return { records, problems };
}

/**
 * Opcodes no shipped script executes.
 *
 * Established by control-flow reachability over all three corpora (7,462
 * files), seeded from each file's entry point and every marker-table target,
 * following branch targets and stopping at end-of-script. That walk reaches
 * 123 of the 138 installed opcodes. A linear walk must not be used: it
 * desynchronises on embedded script blobs and reports all 138 as reached.
 */
const UNSAMPLED = [
  '0x0E', '0x1D', '0x1F', '0x2C', '0x2E', '0x38', '0x49', '0x80',
  '0x81', '0x88', '0xA1', '0xC2', '0xC6', '0xC7', '0xD6',
];

const INSTALLED_COUNT = 138;

/** Phrases that point somewhere a generated page does not go. */
const BAD_PHRASES = [
  /branch-traced below/i,
  /see the opcode notes/i,
  /behaviour above lists/i,
  /\band_value\b/,
  /\bor_value\b/,
];

/** Every value `evidence` is allowed to hold. */
const EVIDENCE_VALUES = ['proven', 'traced'];

// ── parse the dataset into records without executing it ──────────────────────
function parseRecords(src) {
  const records = [];
  for (const block of src.split('\n  {').slice(1)) {
    const body = block.slice(0, block.indexOf('\n  },'));
    const str = (k) => body.match(new RegExp(`\\b${k}: "((?:[^"\\\\]|\\\\.)*)"`))?.[1] ?? null;
    const arr = (k) => {
      const m = body.match(new RegExp(`\\b${k}: \\[([^\\]]*)\\]`));
      return m ? [...m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => x[1]) : [];
    };
    const opcode = str('opcode');
    if (!opcode) continue;
    records.push({
      opcode,
      num: Number(body.match(/\bnum: (\d+)/)?.[1] ?? NaN),
      debug: str('debug'),
      evidence: str('evidence'),
      behavior: str('behavior') ?? '',
      formNames: arr('formNames'),
      formHeads: [...body.matchAll(/\{ name: "([^"]+)", engineName:/g)].map((m) => m[1]),
      // Form summaries are scanned for disallowed phrases too — a retired name
      // is just as wrong in a summary as in a parameter description.
      formSummaries: [...body.matchAll(/summary: "((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]),
      paramText: [
        ...body.matchAll(/\{ name: "[^"]+", role: "[^"]+", meaning: "((?:[^"\\]|\\.)*)"/g),
      ].map((m) => m[1]),
    });
  }
  return records;
}

// ── gates ────────────────────────────────────────────────────────────────────
function runGates(records, fail) {
  if (records.length !== INSTALLED_COUNT) {
    fail(`expected ${INSTALLED_COUNT} opcode records, found ${records.length}`);
  }

  const seen = new Set();
  let prev = -1;
  for (const r of records) {
    if (seen.has(r.opcode)) fail(`${r.opcode} appears more than once`);
    seen.add(r.opcode);
    if (r.num <= prev) fail(`${r.opcode} is out of numeric order`);
    prev = r.num;

    if (!r.debug) fail(`${r.opcode} has no debug address`);

    // Assert the exact expected value, not merely "not traced" — otherwise a
    // typo or an invented third value slips through.
    if (!EVIDENCE_VALUES.includes(r.evidence)) {
      fail(`${r.opcode} has invalid evidence "${r.evidence}"`);
    } else {
      const expected = UNSAMPLED.includes(r.opcode) ? 'traced' : 'proven';
      if (r.evidence !== expected) {
        fail(
          `${r.opcode} is marked "${r.evidence}" but corpus reachability says "${expected}"`
        );
      }
    }

    // Check duplicates on both sides *before* any set conversion, or a repeated
    // entry vanishes into the comparison.
    for (const [label, list] of [
      ['formNames', r.formNames],
      ['forms', r.formHeads],
    ]) {
      if (new Set(list).size !== list.length) {
        fail(`${r.opcode} has duplicate entries in ${label}: ${list.join(', ')}`);
      }
    }

    const a = [...new Set(r.formNames)].sort().join('|');
    const b = [...new Set(r.formHeads)].sort().join('|');
    if (a !== b) fail(`${r.opcode} formNames and forms describe different heads`);

    for (const text of [r.behavior, ...r.paramText, ...r.formSummaries]) {
      for (const re of BAD_PHRASES) {
        if (re.test(text)) fail(`${r.opcode} text matches disallowed phrase ${re}`);
      }
    }
  }

  const traced = records.filter((r) => r.evidence === 'traced');
  if (traced.length !== UNSAMPLED.length) {
    fail(`${traced.length} traced records, expected ${UNSAMPLED.length}`);
  }
}

// ── entry point ──────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('validate-evd-data.mjs')) {
  const src = readFileSync(join(root, 'src/data/evd-commands.ts'), 'utf8');
  const { records, problems } = validate(src);

  if (problems.length) {
    console.error(`evd-commands.ts: ${problems.length} problem(s)`);
    for (const p of problems) console.error('  -', p);
    process.exit(1);
  }

  const traced = records.filter((r) => r.evidence === 'traced').length;
  console.log(
    `evd-commands.ts OK — ${records.length} opcodes, ` +
      `${traced} traced, ${records.length - traced} proven, ` +
      `no duplicate or divergent forms, no orphaned text`
  );
}
