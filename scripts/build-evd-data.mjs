// Merge the EVD sources into one typed data file:
//   - opcode / handler symbol / per-build addresses   (legacy commands.json)
//   - proven + traced handler behaviour               (evd_script_notes.md tables)
//   - per-command forms, signatures, engine calls,
//     bitmasks and parameter tables                   (evd_source_forms.md)
import { readFileSync, writeFileSync } from 'node:fs';

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

/**
 * The reverse-engineering tree is not part of this repository. Point at it with
 * either:
 *   node scripts/build-evd-data.mjs --rs-elf "D:/path/to/rs_elf"
 *   RS_ELF="D:/path/to/rs_elf" node scripts/build-evd-data.mjs
 */
const argIdx = process.argv.indexOf('--rs-elf');
const RS_ELF =
  (argIdx !== -1 ? process.argv[argIdx + 1] : undefined) ??
  process.env.RS_ELF ??
  'J:/Radiata Stories/rs_elf';

const NOTES = join(RS_ELF, 'docs/evd_script_notes.md');
const FORMS = join(RS_ELF, 'docs/evd_source_forms.md');
const MAPS = {
  debug: join(RS_ELF, 'debug/radiata.MAP'),
  eng: join(RS_ELF, 'eng/radiata.MAP'),
  jpn: join(RS_ELF, 'jpn/radiata.MAP'),
};
const TOOL_PATH = join(RS_ELF, 'tools/evd_tool.py');
// Checked in: it affects the output, so it must not depend on a local scratch
// directory. Recovered from history with
//   git show 2e47330:evd/commands.json > scripts/inputs/legacy-opcode-table.json
const LEGACY = join(HERE, 'inputs/legacy-opcode-table.json');
const OUT = join(ROOT, 'src/data/evd-commands.ts');

// Every input below changes the generated data, so a missing one is a hard
// error. Warning and carrying on silently produces a different dataset that
// still passes the gates.
const REQUIRED = { NOTES, FORMS, TOOL: TOOL_PATH, LEGACY, ...MAPS };
const missing = Object.entries(REQUIRED).filter(([, p]) => !existsSync(p));
if (missing.length) {
  console.error('cannot generate: required input(s) not found');
  for (const [k, p] of missing) console.error(`  ${k.padEnd(6)} ${p}`);
  console.error(
    `\nreference tree resolved to: ${RS_ELF}` +
      `\npass --rs-elf <path> or set RS_ELF to override.`
  );
  process.exit(1);
}

const notes = readFileSync(NOTES, 'utf8');
const forms = readFileSync(FORMS, 'utf8');

// Extra engine-call lists and short labels from the pre-Starlight opcode table
// (checked in under scripts/inputs/). Its `funcs` field puts the handler's own
// symbol first, so that entry is dropped below.
const legacyCalls = new Map();
const legacyLabels = new Map();
for (const e of JSON.parse(readFileSync(LEGACY, 'utf8').replace(/^﻿/, ''))) {
  const hex = e.opcode.slice(2).toLowerCase();
  const self = `CRadiScript::Command_${hex}`;
  legacyCalls.set(
    hex,
    (e.funcs || []).filter((fn) => fn !== self)
  );
  // Short labels are the only name some opcodes have.
  if (e.name) legacyLabels.set(hex, e.name);
}

// ── symbol maps ──────────────────────────────────────────────────────────────
// "  002CC180 0000069C .text    CRadiScript::Command_14(int,...)\t(r_script_run0.cpp)"
const MAP_RE =
  /^\s*([0-9A-Fa-f]{8})\s+([0-9A-Fa-f]{8})\s+\.(\w+)\s+(CRadiScript::Command_([0-9a-f]{2})\([^)]*\))\s*(?:\(([^)]+)\))?/gm;

const maps = {};
for (const [build, path] of Object.entries(MAPS)) {
  const m = new Map();
  for (const r of readFileSync(path, 'utf8').matchAll(MAP_RE)) {
    m.set(r[5].toLowerCase(), {
      addr: '0x' + r[1].toUpperCase(),
      size: parseInt(r[2], 16),
      sig: r[4],
      file: r[6] ?? null,
    });
  }
  maps[build] = m;
}

// The debug map is the complete one and drives the opcode list.
const opcodeHexes = [...maps.debug.keys()].sort(
  (a, b) => parseInt(a, 16) - parseInt(b, 16)
);

// ── behaviour tables from the notes ──────────────────────────────────────────
const behavior = new Map();
function harvest(section, evidence) {
  const re = /^\|\s*`([0-9A-Fa-f]{2})`\s*\|\s*`(Command_[0-9a-f]{2})`\s*\|\s*(.+?)\s*\|\s*$/gm;
  let m;
  while ((m = re.exec(section))) {
    const op = '0x' + m[1].toUpperCase();
    if (!behavior.has(op)) behavior.set(op, { text: m[3].trim(), evidence });
  }
}
const tracedStart = notes.indexOf('The installed handlers below were not reached');
harvest(notes.slice(0, tracedStart), 'proven');
harvest(notes.slice(tracedStart), 'traced');

/**
 * Opcodes no shipped script executes.
 *
 * This CANNOT be taken from which table an opcode appears in in the notes:
 * those tables describe the original loose corpus only, and a later archive
 * extraction found real uses for many of them. It also cannot be taken from a
 * linear decode of the corpus, which desyncs on embedded data and invents
 * opcodes (it "finds" all 138, and reports impossible condition bases above
 * 0x13 as proof of the desync).
 *
 * This set comes from a control-flow reachability walk over all three corpora
 * (7,462 files) — seeded from the entry point and every marker-table target,
 * following branch targets and stopping at end-of-script — which reaches 123
 * of the 138 installed opcodes and yields no out-of-range condition bases.
 */
const UNSAMPLED = new Set([
  '0x0E', '0x1D', '0x1F', '0x2C', '0x2E', '0x38', '0x49', '0x80',
  '0x81', '0x88', '0xA1', '0xC2', '0xC6', '0xC7', '0xD6',
]);

// Four opcodes are traced in prose rather than in either table.
for (const [op, text] of Object.entries({
  '0x0D':
    'Marker seek. Selector bits in the handler argument choose where the marker index comes from — a direct operand, a run of config/event flags, an event value, or the in-game clock. The marker is located through `GetMarkerAddress` and the resolved address is written to `SCR_DATA+0x0C`.',
  '0x4A':
    'Position-vibration parameter command: a direct `CVibrationVector::SetParam` wrapper. Selector bits and the first control word are named where the handler trace proves them; the remaining branch payload is preserved byte-exact.',
  '0x7A':
    'Sound-effect stack push/pop. Maps to `CRadiSound::PushAllSe` and `CRadiSound::PopAllSe`.',
  '0x8B':
    'Talk bustup display. Argument bit `0` selects either the current script character at `SCR_DATA+0x10`/`+0x12` or an explicit stream word, resolves it through `GetAbstractionCharacterNumber`, calls `CCharacterManager::GetCharacterClass2`, then dispatches `CTalkBustupTotalControl::BustupDisp`.',
})) {
  behavior.set(op, { text, evidence: 'proven' });
}

// ── per-command sections from the source-form reference ──────────────────────
const formsBody = forms.slice(forms.indexOf('\n## Commands'));
const sections = formsBody.split(/\n(?=### )/).filter((s) => s.startsWith('### '));

const perOpcode = new Map(); // "0x17" -> { forms:[], signature, address, sourceFile, calls:Set, masks:Set, params:Map }

for (const sec of sections) {
  const head = sec.match(/^###\s+`([^`]+)`(?:\s*\(engine name `([^`]+)`\))?\s*—\s*opcode\s*`(0x[0-9A-Fa-f]{2})`/);
  if (!head) continue;
  const op = '0x' + head[3].slice(2).toUpperCase();
  const formName = head[1];
  const engineName = head[2] || null;

  if (!perOpcode.has(op)) {
    perOpcode.set(op, {
      forms: [],
      signature: null,
      address: null,
      sourceFile: null,
      calls: new Set(),
      masks: new Set(),
      params: new Map(),
    });
  }
  const rec = perOpcode.get(op);

  const body = sec.slice(sec.indexOf('\n') + 1);

  // Description: the prose before "Handler:" / "Decompiled from".
  const stop = body.search(/^(Handler:|Decompiled from|Bit masks used|\| Parameter)/m);
  let desc = (stop === -1 ? body : body.slice(0, stop)).trim();
  // Drop fenced examples — they are a textual rendering, not part of the format.
  desc = desc.replace(/```[\s\S]*?```/g, '').trim();
  const descLines = desc.split('\n').map((l) => l.trim()).filter(Boolean);

  // "Decompiled from `SIG` at `0xADDR` (file.cpp)."
  const dec = body.match(/Decompiled from `([^`]+)` at `(0x[0-9A-Fa-f]+)`(?:\s*\(([^)]+)\))?/);
  if (dec) {
    rec.signature ??= dec[1];
    rec.address ??= dec[2];
    rec.sourceFile ??= dec[3] ?? null;
  }

  // "It calls:" bullet list. The list is separated from the sentence by a blank
  // line, and some entries wrap, so match the whole run of bullets after it.
  const callsAt = body.indexOf('It calls:');
  if (callsAt !== -1) {
    const after = body.slice(callsAt + 'It calls:'.length);
    const end = after.search(/\n\s*\n\s*(?!-)/);
    const block = end === -1 ? after : after.slice(0, end);
    for (const c of block.matchAll(/^\s*-\s*`([^`]+)`/gm)) rec.calls.add(c[1]);
  }

  // "Bit masks used by the handler: `0x00FF`, `0x0F`."
  const maskLine = body.match(/Bit masks used by the handler:([^\n]+)/);
  if (maskLine) {
    for (const m of maskLine[1].matchAll(/`([^`]+)`/g)) rec.masks.add(m[1]);
  }

  // Parameter table.
  for (const row of body.matchAll(/^\|\s*`([^`]+)`\s*\|\s*(input|derived|output)\s*\|\s*(.+?)\s*\|\s*$/gm)) {
    if (!rec.params.has(row[1])) {
      rec.params.set(row[1], { role: row[2], meaning: row[3].trim() });
    }
  }

  // Key by the emitted directive name. Several opcodes are documented under
  // one shared engine form (0x14 is documented ten times under `expr`), and
  // keying by the engine name alone produced ten identical rows.
  if (!rec.forms.some((f) => f.name === formName)) {
    rec.forms.push({
      name: formName,
      engineName,
      summary: descLines[0] ?? '',
      notes: descLines.slice(1),
    });
  }
}

/**
 * The two call sources spell the same function differently — one bare
 * ("CRadiScript::CheckCondition"), one with its full signature. Keep the
 * signatured spelling and drop the bare duplicate.
 */
function dedupeCalls(list) {
  const all = [...new Set(list)];
  const withSig = all.filter((s) => s.includes('('));
  const bases = new Set(withSig.map((s) => s.slice(0, s.indexOf('('))));
  return all.filter((s) => s.includes('(') || !bases.has(s)).sort();
}

// ── form index recovered from the reference implementation ───────────────────
// The source-form document does not carry every form: several commands are
// documented there only under a shared heading, and a few not at all. The
// reference decoder's own form tables are the complete list, so they are read
// directly rather than transcribed.
const TOOL = TOOL_PATH;
const tool = readFileSync(TOOL, 'utf8');

/** Pull a `NAME: dict[...] = { "k": v, ... }` literal as raw text. */
function pyDictBody(name) {
  const re = new RegExp(`^${name}[^=]*=\\s*\\{([\\s\\S]*?)^\\}`, 'm');
  return tool.match(re)?.[1] ?? '';
}
/** "key": <int> */
function pyIntMap(name) {
  const out = new Map();
  for (const m of pyDictBody(name).matchAll(/^\s*"([^"]+)":\s*(\d+)/gm)) {
    out.set(m[1], Number(m[2]));
  }
  return out;
}
/** "key": "value" or "key": ( "a" "b" ) — concatenated string literals. */
function pyStrMap(name) {
  const body = pyDictBody(name);
  const out = new Map();
  const re = /^\s*"([^"]+)":\s*(?:\(([\s\S]*?)\)|"((?:[^"\\]|\\.)*)")\s*,/gm;
  for (const m of body.matchAll(re)) {
    const val = m[2] !== undefined
      ? [...m[2].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => x[1]).join('')
      : m[3];
    out.set(m[1], val.replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim());
  }
  return out;
}

const exprOps = pyIntMap('EXPR_HEAD_OPS');
const exprFlagOps = pyIntMap('EXPR_FLAG_HEAD_OPS');
const exprSummaries = pyStrMap('EXPR_HEAD_SUMMARIES');
const friendly = pyStrMap('FRIENDLY_FORM_NAMES');

// `and_value` / `or_value` are accepted aliases of the printed names, so they
// are not separate forms.
const EXPR_ALIASES = new Set(['and_value', 'or_value']);
const EXPR_FORMS = [...exprOps, ...exprFlagOps]
  .filter(([name]) => !EXPR_ALIASES.has(name))
  .map(([name]) => [
    name,
    // The summaries mention the retired `and_value` / `or_value` spellings to
    // explain the rename; that context does not survive out of the reference
    // implementation, so drop the aside rather than rewrite it into nonsense.
    (exprSummaries.get(name) ?? '')
      .replace(/\s*Was called `(?:and_value|or_value)`\.\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  ]);

// NEW_FORM_BUILDERS: "form_name": (0xNN, build_fn)
const builderForms = [];
for (const m of pyDictBody('NEW_FORM_BUILDERS').matchAll(
  /^\s*"([^"]+)":\s*\((0x[0-9A-Fa-f]{2}),\s*(\w+)\)/gm
)) {
  builderForms.push({ engineName: m[1], opcode: '0x' + m[2].slice(2).toUpperCase(), fn: m[3] });
}

/** Docstring and recognised field names for one builder function. */
function builderDetail(fn) {
  const start = tool.indexOf(`def ${fn}(`);
  if (start === -1) return { summary: '', fields: [] };
  const rest = tool.slice(start);
  const end = rest.slice(1).search(/^def /m);
  const body = end === -1 ? rest : rest.slice(0, end + 1);
  const summary = (body.match(/"""([\s\S]*?)"""/)?.[1] ?? '').replace(/\s+/g, ' ').trim();
  const fields = new Set();
  for (const f of body.matchAll(/fields(?:\.get)?[(\[]"([a-z0-9_]+)"/g)) fields.add(f[1]);
  for (const r of body.matchAll(/require_fields\(fields,\s*\{([^}]*)\}/g)) {
    for (const n of r[1].matchAll(/"([a-z0-9_]+)"/g)) fields.add(n[1]);
  }
  for (const r of body.matchAll(/named\s*=\s*\{([^}]*)\}/g)) {
    for (const n of r[1].matchAll(/"([a-z0-9_]+)"/g)) fields.add(n[1]);
  }
  fields.delete('arg');
  return { summary, fields: [...fields].sort() };
}

// The 0xF0 family is dispatched by directive name rather than a builder table.
// Every 0xF0 form also carries the standard flags suffix, so `yield` applies
// to all of them just as it does to any other command.
const F0_FORMS = [
  ['marker', 'A labelled point. Inert when executed; marker seeks and the marker table jump to it.', ['id', 'yield']],
  ['anim_frame_trigger', 'Fires the commands at this marker when the playing animation reaches the given frame.', ['frame', 'yield']],
  ['set_schedule_percent', 'Calls SetSchedulePercent with the 20-bit value.', ['percent', 'yield']],
  ['anim_script_end', 'The 0xF00000F0 end-of-animation-script sentinel.', ['yield']],
  ['special_f0', 'Any 0xF0 shape with no named form; the raw header word is preserved.', ['raw', 'yield']],
];

/** opcode -> extra forms and fields recovered from the reference decoder. */
const toolForms = new Map();
const toolParams = new Map();
function addToolForm(opcode, name, engineName, summary, fields) {
  if (!toolForms.has(opcode)) toolForms.set(opcode, []);
  if (!toolForms.get(opcode).some((f) => f.name === name)) {
    toolForms.get(opcode).push({ name, engineName, summary });
  }
  if (!toolParams.has(opcode)) toolParams.set(opcode, new Set());
  for (const f of fields) toolParams.get(opcode).add(f);
}
for (const b of builderForms) {
  const d = builderDetail(b.fn);
  addToolForm(b.opcode, friendly.get(b.engineName) ?? b.engineName, b.engineName, d.summary, d.fields);
}
for (const [name, summary, fields] of F0_FORMS) {
  addToolForm('0xF0', name, null, summary, fields);
}

/** Shared meanings for fields recovered from the decoder rather than the doc. */
const FIELD_FALLBACKS = {
  yield:
    'Pause the script here for one game frame; the next command runs on the following update. Lines without it keep running immediately.',
  id: 'Identifier for the thing this command acts on.',
  frame: 'Signed animation frame at which this marker fires.',
  percent: 'The 20-bit value passed to the schedule call.',
  raw: 'The complete header word, preserved verbatim.',
  name: 'Object or animation name, read as a NUL-terminated string.',
  character: 'The packed 32-bit character selector word.',
  action: 'Which action this command performs, read from its mode or control bits.',
  selector: 'Sub-selector choosing which variant of the behaviour runs.',
  to_event: 'Event value id the result is written to.',
  mode: 'Handler path selector taken from the argument byte.',
};

function buildParams(f, op) {
  const out = new Map();
  if (f) {
    for (const [name, v] of f.params) {
      out.set(name, {
        name,
        role: v.role,
        // The source phrasing points at notes no generated page carries, and
        // the behaviour summary does not always map selectors to paths, so
        // neither destination can be promised.
        meaning: v.meaning
          .replace(/;?\s*see the opcode notes for the paths it chooses\.?/i, '.')
          // `and_value` / `or_value` are retired spellings; the printed heads
          // are `keep_only_bits` / `turn_on_bits`.
          .replace(/\band_value\b/g, 'keep_only_bits')
          .replace(/\bor_value\b/g, 'turn_on_bits'),
      });
    }
  }
  for (const name of toolParams.get(op) ?? []) {
    if (!out.has(name)) {
      out.set(name, {
        name,
        role: 'input',
        meaning: FIELD_FALLBACKS[name] ?? `Operand field \`${name}\`.`,
      });
    }
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// ── families ─────────────────────────────────────────────────────────────────
function family(opNum) {
  if (opNum >= 0xf0) return 'Markers and return';
  if (opNum >= 0xa0) return 'Person, battle and effects';
  if (opNum >= 0x80) return 'Vibration, dialogue and text';
  if (opNum >= 0x60) return 'Primitives, textures, sound and movies';
  if (opNum >= 0x40) return 'Background, map, landscape and camera';
  if (opNum >= 0x20) return 'Characters';
  return 'Script control, flags and values';
}
const FAMILIES = [
  'Script control, flags and values',
  'Characters',
  'Background, map, landscape and camera',
  'Primitives, textures, sound and movies',
  'Vibration, dialogue and text',
  'Person, battle and effects',
  'Markers and return',
];

const rows = opcodeHexes.map((hex) => {
  const op = '0x' + hex.toUpperCase();
  const n = parseInt(hex, 16);
  const b = behavior.get(op);
  const f = perOpcode.get(op);
  const d = maps.debug.get(hex);

  // Forms: the documented ones, plus anything only the reference decoder has.
  // 0x14 is special-cased because the source document spells all ten of its
  // heads `set_value`.
  let forms =
    op === '0x14'
      ? EXPR_FORMS.map(([name, summary]) => ({ name, engineName: 'expr', summary }))
      : [];
  // Documented forms next — for 0x14 this restores the raw `eval_int_expression`
  // escape hatch that the ten operation heads do not cover.
  for (const x of f ? f.forms : []) {
    if (!forms.some((y) => y.name === x.name)) {
      forms.push({ name: x.name, engineName: x.engineName, summary: x.summary });
    }
  }
  for (const extra of toolForms.get(op) ?? []) {
    const existing = forms.find((x) => x.name === extra.name);
    if (!existing) forms.push(extra);
    // The document sometimes carries the name with no description.
    else if (!existing.summary && extra.summary) existing.summary = extra.summary;
  }

  const engineNames = [
    ...new Set([...forms.map((x) => x.engineName).filter(Boolean)]),
  ].sort();
  // Derived from the final form records, so the two can never disagree.
  const formNames = [...new Set(forms.map((x) => x.name))].sort();

  return {
    opcode: op,
    hex,
    num: n,
    key: `Command_${hex}`,
    handler: `CRadiScript::Command_${hex}`,
    label: legacyLabels.get(hex) ?? '',
    engineNames,
    formNames,
    // The debug map is authoritative for all 138; the per-command reference
    // only recovered 103 signatures.
    signature: d?.sig ?? f?.signature ?? null,
    sourceFile: d?.file ?? f?.sourceFile ?? null,
    size: d?.size ?? null,
    debug: maps.debug.get(hex)?.addr ?? null,
    eng: maps.eng.get(hex)?.addr ?? null,
    jpn: maps.jpn.get(hex)?.addr ?? null,
    calls: dedupeCalls([...(f ? f.calls : []), ...(legacyCalls.get(hex) ?? [])]),
    masks: f ? [...f.masks] : [],
    params: buildParams(f, op),
    forms,
    // "Fully branch-traced below" and friends point at a section of the
    // source notes that does not exist on a generated page.
    behavior: (b ? b.text : '')
      .replace(/\s*Fully branch-traced below\.?/g, '')
      .replace(/\s*See "[^"]*"\.?/g, '')
      .trim(),
    evidence: UNSAMPLED.has(op) ? 'traced' : 'proven',
    family: family(n),
  };
});
rows.sort((a, b) => a.num - b.num);

// ── report ───────────────────────────────────────────────────────────────────
const counts = rows.reduce((a, r) => ((a[r.evidence] = (a[r.evidence] || 0) + 1), a), {});
console.log('opcodes           :', rows.length);
console.log('behaviour source  :', counts);
console.log('with engine names :', rows.filter((r) => r.engineNames.length).length);
console.log('with signature    :', rows.filter((r) => r.signature).length);
console.log('with source file  :', rows.filter((r) => r.sourceFile).length);
console.log('with handler size :', rows.filter((r) => r.size).length);
console.log('addresses debug   :', rows.filter((r) => r.debug).length);
console.log('addresses eng     :', rows.filter((r) => r.eng).length);
console.log('addresses jpn     :', rows.filter((r) => r.jpn).length);
console.log('with parameters   :', rows.filter((r) => r.params.length).length);
console.log('with engine calls :', rows.filter((r) => r.calls.length).length);
console.log('total param rows  :', rows.reduce((a, r) => a + r.params.length, 0));
console.log('with any name     :', rows.filter((r) => r.engineNames.length || r.formNames.length || r.label).length);
console.log('no behaviour text :', rows.filter((r) => !r.behavior).map((r) => r.opcode).join(' ') || '(none)');

// ── validation gates ─────────────────────────────────────────────────────────
const problems = [];
const tracedRows = rows.filter((r) => r.evidence === 'traced');
if (tracedRows.length !== UNSAMPLED.size) {
  problems.push(`traced count ${tracedRows.length} != unsampled count ${UNSAMPLED.size}`);
}
for (const r of rows) {
  const shouldBeTraced = UNSAMPLED.has(r.opcode);
  if (shouldBeTraced !== (r.evidence === 'traced')) {
    problems.push(`${r.opcode} evidence "${r.evidence}" disagrees with corpus reachability`);
  }
  const names = r.forms.map((f) => f.name);
  if (new Set(names).size !== names.length) {
    problems.push(`${r.opcode} has duplicate form names: ${names.join(', ')}`);
  }
  if (/branch-traced below|see the opcode notes/i.test(r.behavior)) {
    problems.push(`${r.opcode} behaviour has an orphaned cross-reference`);
  }
  for (const p of r.params) {
    if (/see the opcode notes|behaviour above lists/i.test(p.meaning)) {
      problems.push(`${r.opcode} field "${p.name}" promises detail the page lacks`);
    }
  }
  const fn = [...r.formNames].sort().join('|');
  const fromForms = [...new Set(r.forms.map((f) => f.name))].sort().join('|');
  if (fn !== fromForms) {
    problems.push(`${r.opcode} formNames and forms describe different heads`);
  }
  if (!r.debug) problems.push(`${r.opcode} has no debug address`);
}
if (problems.length) {
  console.error('\nVALIDATION FAILED:');
  for (const p of problems) console.error('  -', p);
  process.exit(1);
}
console.log('validation        : all gates passed');

const esc = (s) => JSON.stringify(s);
const arr = (a) => `[${a.map(esc).join(', ')}]`;

const ts = `/**
 * The 138 opcodes installed in CRadiScript::pfnTable.
 *
 * GENERATED from the symbol maps and the reverse-engineering notes — do not
 * hand-edit. Merged from two kinds of source:
 *   - the per-build linker maps, for addresses, full handler signatures,
 *     handler sizes and translation units
 *   - the notes, for handler behaviour, engine calls, bitmasks and per-field
 *     documentation
 *
 * Address coverage differs by build. The debug map is a real linker map and
 * covers all 138 handlers. The ENG and JPN maps are derived, and their
 * confirmation policy omits any function whose body does not match the
 * reference build, so each confirms 85. A null means "not confirmed in that
 * build's map", not "does not exist".
 *
 * \`evidence\` records how the behaviour line was established:
 *   proven — handler traced AND exercised by at least one shipped script
 *   traced — handler traced, but no shipped script uses the opcode
 */

export type EvdEvidence = 'proven' | 'traced';

export interface EvdParam {
  name: string;
  role: string;
  meaning: string;
}

export interface EvdForm {
  name: string;
  engineName: string | null;
  summary: string;
}

export interface EvdCommand {
  /** "0x14" */
  opcode: string;
  /** "14" — the URL slug */
  hex: string;
  num: number;
  /** "Command_14" */
  key: string;
  /** "CRadiScript::Command_14" */
  handler: string;
  /** Short label. */
  label: string;
  /** Names the engine itself uses, where recovered. */
  engineNames: string[];
  /** Names the command is documented under. */
  formNames: string[];
  /** Full C++ signature of the handler, from the debug linker map. */
  signature: string | null;
  /** Original translation unit, from the debug linker map. */
  sourceFile: string | null;
  /** Handler size in bytes, from the debug linker map. */
  size: number | null;
  debug: string | null;
  eng: string | null;
  jpn: string | null;
  /** Engine functions the handler calls. */
  calls: string[];
  /** Bit masks the handler applies. */
  masks: string[];
  /** Documented operand fields. */
  params: EvdParam[];
  /** Distinct documented forms of this command. */
  forms: EvdForm[];
  /** Plain text; \`backticks\` render as code. */
  behavior: string;
  evidence: EvdEvidence;
  family: string;
}

export const EVD_FAMILIES = ${JSON.stringify(FAMILIES, null, 2)} as const;

export const EVD_COMMANDS: EvdCommand[] = [
${rows
  .map(
    (r) => `  {
    opcode: ${esc(r.opcode)},
    hex: ${esc(r.hex)},
    num: ${r.num},
    key: ${esc(r.key)},
    handler: ${esc(r.handler)},
    label: ${esc(r.label)},
    engineNames: ${arr(r.engineNames)},
    formNames: ${arr(r.formNames)},
    signature: ${r.signature ? esc(r.signature) : 'null'},
    sourceFile: ${r.sourceFile ? esc(r.sourceFile) : 'null'},
    size: ${r.size ?? 'null'},
    debug: ${r.debug ? esc(r.debug) : 'null'},
    eng: ${r.eng ? esc(r.eng) : 'null'},
    jpn: ${r.jpn ? esc(r.jpn) : 'null'},
    calls: ${arr(r.calls)},
    masks: ${arr(r.masks)},
    params: [${r.params
      .map((p) => `\n      { name: ${esc(p.name)}, role: ${esc(p.role)}, meaning: ${esc(p.meaning)} },`)
      .join('')}${r.params.length ? '\n    ' : ''}],
    forms: [${r.forms
      .map(
        (f) =>
          `\n      { name: ${esc(f.name)}, engineName: ${f.engineName ? esc(f.engineName) : 'null'}, summary: ${esc(f.summary)} },`
      )
      .join('')}${r.forms.length ? '\n    ' : ''}],
    behavior: ${esc(r.behavior)},
    evidence: ${esc(r.evidence)},
    family: ${esc(r.family)},
  },`
  )
  .join('\n')}
];

const byOpcode = new Map(EVD_COMMANDS.map((c) => [c.opcode, c]));
const byHex = new Map(EVD_COMMANDS.map((c) => [c.hex, c]));

export function evdCommand(opcode: string): EvdCommand | undefined {
  return byOpcode.get(opcode) ?? byHex.get(opcode.toLowerCase());
}

// Display titles live in evd-names.ts — hand-maintained, so regenerating this
// file does not clobber them.
`;

writeFileSync(OUT, ts);
console.log('wrote', OUT);
