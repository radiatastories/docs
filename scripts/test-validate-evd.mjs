#!/usr/bin/env node
/**
 * Negative tests for the EVD dataset validator.
 *
 * Every advertised gate is proven to fail independently: each case mutates a
 * copy of the real dataset in memory and asserts the validator rejects it with
 * a matching message. A gate that stops working shows up here as a test that
 * no longer fails.
 *
 *   npm run test:evd
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validate } from './validate-evd-data.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const good = readFileSync(join(root, 'src/data/evd-commands.ts'), 'utf8');

/** Replace inside one opcode's record only. */
function inRecord(src, opcode, find, replace) {
  const key = `opcode: "${opcode}",`;
  const start = src.indexOf(key);
  if (start === -1) throw new Error(`fixture: ${opcode} not found`);
  const end = src.indexOf('\n  },', start);
  const head = src.slice(0, start);
  const body = src.slice(start, end);
  const tail = src.slice(end);
  const mutated = body.replace(find, replace);
  if (mutated === body) throw new Error(`fixture: no-op mutation for ${opcode} (${find})`);
  return head + mutated + tail;
}

const cases = [
  {
    name: 'sampled opcode flipped to traced',
    mutate: (s) => inRecord(s, '0xA0', /evidence: "proven"/, 'evidence: "traced"'),
    expect: /0xA0 is marked "traced"/,
  },
  {
    name: 'invalid evidence value on a sampled opcode',
    mutate: (s) => inRecord(s, '0xA0', /evidence: "proven"/, 'evidence: "bogus"'),
    expect: /0xA0 has invalid evidence "bogus"/,
  },
  {
    name: 'unsampled opcode flipped to proven',
    mutate: (s) => inRecord(s, '0x1F', /evidence: "traced"/, 'evidence: "proven"'),
    expect: /0x1F is marked "proven"/,
  },
  {
    name: 'duplicate entry inside formNames',
    mutate: (s) =>
      inRecord(s, '0x14', /formNames: \["add_value", /, 'formNames: ["add_value", "add_value", '),
    expect: /0x14 has duplicate entries in formNames/,
  },
  {
    name: 'duplicate entry inside forms',
    mutate: (s) =>
      inRecord(
        s,
        '0x14',
        /\{ name: "add_value", engineName: "expr", summary: "([^"]*)" \},/,
        '{ name: "add_value", engineName: "expr", summary: "$1" },\n      { name: "add_value", engineName: "expr", summary: "$1" },'
      ),
    expect: /0x14 has duplicate entries in forms/,
  },
  {
    name: 'formNames and forms diverge',
    mutate: (s) => inRecord(s, '0x14', /formNames: \["add_value"/, 'formNames: ["zzz_value"'),
    expect: /0x14 formNames and forms describe different heads/,
  },
  {
    name: 'retired name in a parameter description',
    mutate: (s) => inRecord(s, '0x14', /meaning: "/, 'meaning: "implied by and_value. '),
    expect: /0x14 text matches disallowed phrase/,
  },
  {
    name: 'retired name in a form summary',
    mutate: (s) => inRecord(s, '0x14', /summary: "/, 'summary: "Was called or_value. '),
    expect: /0x14 text matches disallowed phrase/,
  },
  {
    name: 'orphaned cross-reference in behaviour',
    mutate: (s) => inRecord(s, '0xA0', /behavior: "/, 'behavior: "Fully branch-traced below. '),
    expect: /0xA0 text matches disallowed phrase/,
  },
  {
    name: 'missing debug address',
    mutate: (s) => inRecord(s, '0xA0', /debug: "0x[0-9A-F]+"/, 'debug: null'),
    expect: /0xA0 has no debug address/,
  },
];

let failed = 0;

// The unmutated dataset must pass, or every negative test below is meaningless.
const baseline = validate(good);
if (baseline.problems.length) {
  console.error('FAIL  baseline dataset does not validate:');
  for (const p of baseline.problems) console.error('        -', p);
  failed++;
} else {
  console.log(`pass  baseline validates (${baseline.records.length} opcodes)`);
}

for (const c of cases) {
  let problems;
  try {
    problems = validate(c.mutate(good)).problems;
  } catch (err) {
    console.error(`FAIL  ${c.name} — fixture error: ${err.message}`);
    failed++;
    continue;
  }
  const hit = problems.some((p) => c.expect.test(p));
  if (hit) {
    console.log(`pass  ${c.name}`);
  } else {
    console.error(`FAIL  ${c.name} — expected ${c.expect}, got:`);
    for (const p of problems) console.error('        -', p);
    if (!problems.length) console.error('        (validator reported no problems)');
    failed++;
  }
}

if (failed) {
  console.error(`\n${failed} of ${cases.length + 1} checks failed`);
  process.exit(1);
}
console.log(`\nall ${cases.length + 1} checks passed`);
