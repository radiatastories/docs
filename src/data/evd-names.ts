import type { EvdCommand } from './evd-commands';

/**
 * Display-name overrides for opcodes whose recovered name does not convey what
 * the command does.
 *
 * This file is hand-maintained and deliberately separate from the generated
 * evd-commands.ts, so regenerating that file never clobbers these, and so it
 * stays obvious which names were recovered from the game and which are ours.
 *
 * The recovered name is never replaced — it is still shown as "Engine name" on
 * the command page, and is still indexed by search. Only the page title and
 * sidebar label change.
 *
 * Keep these short: they appear in a 138-entry sidebar.
 */
export const EVD_DISPLAY_NAMES: Record<string, string> = {
  // `expr` undersells it: eight operations (copy, add, subtract, multiply,
  // divide, modulo, AND, OR) over most mutable state, and the single
  // most-used opcode in the game at ~12% of all command lines.
  '0x14': 'expr (assign and calculate)',
};

/** The name alone, e.g. "expr (assign and calculate)". */
export function evdName(c: EvdCommand): string {
  return (
    EVD_DISPLAY_NAMES[c.opcode] ?? c.engineNames[0] ?? c.formNames[0] ?? c.label ?? c.key
  );
}

/** Display title for a command, e.g. "0x14 — expr (assign and calculate)". */
export function evdTitle(c: EvdCommand): string {
  const name = evdName(c);
  return name ? `${c.opcode} — ${name}` : c.opcode;
}
