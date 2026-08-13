/**
 * Runtime EE virtual addresses for the RMF code path, per build.
 *
 *   debug — SLUS-21262 prototype
 *   eng   — USA release
 *   jpn   — SLPM-65800 release
 *
 * Every entry lives in the `step0_00.bin` overlay, whose base vaddr is
 * 0x001B4280 in the debug build and 0x001A2380 in both releases.
 *
 * This file is the single source of truth: the <AddrRef> popups and the
 * symbol reference table on /rmf/reference/ are both rendered from it, so
 * the two can never drift apart.
 *
 * The 24 callback addresses were cross-checked against two independent
 * dumps — each build's 48-entry static initializer, and its runtime
 * ms_pCommandFuncTable — which agree exactly.
 */

export type BuildId = 'debug' | 'eng' | 'jpn';

export const BUILDS: { id: BuildId; label: string; detail: string }[] = [
  { id: 'debug', label: 'Debug', detail: 'SLUS-21262 prototype' },
  { id: 'eng', label: 'ENG', detail: 'USA release' },
  { id: 'jpn', label: 'JPN', detail: 'SLPM-65800 release' },
];

export interface SymbolEntry {
  /** Short lookup key used by <AddrRef sym="..." />. */
  key: string;
  /** Full signature as it should be displayed in the reference table. */
  name: string;
  group: string;
  debug: string | null;
  eng: string | null;
  jpn: string | null;
  /** Plain text; `backticks` become <code> spans. */
  role?: string;
}

export const SYMBOLS: SymbolEntry[] = [
  // ── Container ────────────────────────────────────────────────────────────
  {
    key: 'GetPacketAddress',
    name: 'CTalk::GetPacketAddress(int,int) const',
    group: 'Container',
    debug: '0x0030F400',
    eng: '0x002EB180',
    jpn: '0x002EAE30',
    role: 'Header and offset table (§2).',
  },
  {
    key: 'GetRmfPacketNumber',
    name: 'CTalk::GetRmfPacketNumber(unsigned int)',
    group: 'Container',
    debug: '0x00310140',
    eng: '0x002EBD70',
    jpn: '0x002EB9F0',
    role: 'Packet count query.',
  },
  {
    key: 'RmfExit',
    name: 'CTalk::RmfExit()',
    group: 'Container',
    debug: '0x003101F0',
    eng: '0x002EBE20',
    jpn: '0x002EBAA0',
    role: 'Teardown.',
  },
  {
    key: 'RmfStartSimple',
    name: 'CTalk::RmfStartSimple(uint,int,int,uint)',
    group: 'Container',
    debug: '0x003103C0',
    eng: '0x002EBFB0',
    jpn: '0x002EBC30',
    role: 'Packet layout (§3).',
  },
  {
    key: 'RmfStart',
    name: 'CTalk::RmfStart(uint,uint,bool,bool,uint,uint)',
    group: 'Container',
    debug: '0x00310620',
    eng: '0x002EC180',
    jpn: '0x002EBDF0',
    role: 'Full conversation entry.',
  },
  {
    key: 'FirstCodeProcess',
    name: 'CTalk::FirstCodeProcess(unsigned short*)',
    group: 'Container',
    debug: '0x00310060',
    eng: '0x002EBC90',
    jpn: '0x002EB910',
    role: 'Runs leading `0F 7x` prologue records.',
  },

  // ── Stream walkers ───────────────────────────────────────────────────────
  {
    key: 'PutText',
    name: 'CTextMessage::PutText(unsigned int)',
    group: 'Stream walkers',
    debug: '0x002D50E0',
    eng: '0x002B8D30',
    jpn: '0x002B8CD0',
    role: 'The token loop; owns commands `0x00`–`0x0A`.',
  },
  {
    key: 'WriteCommand',
    name: 'CTextMessage::WriteCommand(u16*,u8,u8,u16,u16)',
    group: 'Stream walkers',
    debug: '0x002D4F50',
    eng: '0x002B8BF0',
    jpn: '0x002B8BF0',
    role: 'Record writer; proves the size rule (§4).',
  },
  {
    key: 'TextOut',
    name: 'CTextMessage::TextOut(const u16*,uint,int)',
    group: 'Stream walkers',
    debug: '0x002D5E30',
    eng: '0x002B99D0',
    jpn: '0x002B97F0',
    role: 'Starts a text run in a slot.',
  },
  {
    key: 'TextCallBackCommand',
    name: 'CTalk::TextCallBackCommand(…)',
    group: 'Stream walkers',
    debug: '0x00317EE0',
    eng: '0x002F3220',
    jpn: '0x002F2C90',
    role: 'Dispatch to the 48-entry table (§7).',
  },
  {
    key: 'SetProper',
    name: 'CTalk::SetProper(u16*, const RMFCOMMAND*)',
    group: 'Stream walkers',
    debug: '0x00314E20',
    eng: '0x002F05A0',
    jpn: '0x002F0200',
    role: 'Name substitution expansion.',
  },
  {
    key: 'SetSprtOutput',
    name: 'CTalk::SetSprtOutput(uint,PR_SPRT***,PR_SPRT***)',
    group: 'Stream walkers',
    debug: '0x0030F1F0',
    eng: '0x002EAF80',
    jpn: '0x002EAC30',
    role: 'Reserves a sentence’s glyph sprites.',
  },
  {
    key: 'SetDefaultTextParam',
    name: 'CTalk::SetDefaultTextParam(_MES_DATA*,bool)',
    group: 'Stream walkers',
    debug: '0x0030F9B0',
    eng: '0x002EB620',
    jpn: '0x002EB2D0',
    role: 'Resets style before a sentence.',
  },
  {
    key: 'GetCharaNo',
    name: 'CTalk::GetCharaNo(…)',
    group: 'Stream walkers',
    debug: '0x00315D10',
    eng: '0x002F12E0',
    jpn: '0x002F0F80',
    role: 'Speaker table entry → runtime bustup slot.',
  },
  {
    key: 'ms_pCommandFuncTable',
    name: 'CTalk::ms_pCommandFuncTable',
    group: 'Stream walkers',
    debug: '0x003B3A80',
    eng: '0x00380C00',
    jpn: '0x00380980',
    role: 'BSS: 48 × 12-byte PTMF.',
  },
  {
    key: 'commandTableInit',
    name: '<command table static initializer>',
    group: 'Stream walkers',
    debug: '0x0037EBD0',
    eng: '0x00351110',
    jpn: '0x00350E90',
    role: '48 × 16-byte source records for the above.',
  },
  {
    key: 'putTextJumpTable',
    name: '<PutText jump table>',
    group: 'Stream walkers',
    debug: '0x003A3540',
    eng: '0x003728B0',
    jpn: '0x00372630',
    role: '11 entries, commands `0x00`–`0x0A`.',
  },

  // ── Command callbacks ────────────────────────────────────────────────────
  { key: '_CbPlaySe', name: 'CTalk::_CbPlaySe', group: 'Command callbacks', debug: '0x00315F10', eng: '0x002F1440', jpn: '0x002F10E0' },
  { key: '_CbJump', name: 'CTalk::_CbJump', group: 'Command callbacks', debug: '0x003160B0', eng: '0x002F1590', jpn: '0x002F1230' },
  { key: '_CbProper', name: 'CTalk::_CbProper', group: 'Command callbacks', debug: '0x00316300', eng: '0x002F1760', jpn: '0x002F1400' },
  { key: '_CbSentence', name: 'CTalk::_CbSentence', group: 'Command callbacks', debug: '0x003163A0', eng: '0x002F1800', jpn: '0x002F14A0' },
  { key: '_CbWaitSelect2', name: 'CTalk::_CbWaitSelect2', group: 'Command callbacks', debug: '0x003168B0', eng: '0x002F1CD0', jpn: '0x002F1750' },
  { key: '_CbProhibitSkip', name: 'CTalk::_CbProhibitSkip', group: 'Command callbacks', debug: '0x00316CA0', eng: '0x002F2040', jpn: '0x002F1AB0' },
  { key: '_CbWaitSelect', name: 'CTalk::_CbWaitSelect', group: 'Command callbacks', debug: '0x00316D10', eng: '0x002F20B0', jpn: '0x002F1B20' },
  { key: '_CbWaitTime', name: 'CTalk::_CbWaitTime', group: 'Command callbacks', debug: '0x00317170', eng: '0x002F2510', jpn: '0x002F1F80' },
  { key: '_CbNameWindow', name: 'CTalk::_CbNameWindow', group: 'Command callbacks', debug: '0x00317430', eng: '0x002F27C0', jpn: '0x002F2230' },
  { key: '_CbBupReleaseCount', name: 'CTalk::_CbBupReleaseCount', group: 'Command callbacks', debug: '0x003176B0', eng: '0x002F2A40', jpn: '0x002F24B0' },
  { key: '_CbSpeakingCycle', name: 'CTalk::_CbSpeakingCycle', group: 'Command callbacks', debug: '0x00317700', eng: '0x002F2A90', jpn: '0x002F2500' },
  { key: '_CbSpeak', name: 'CTalk::_CbSpeak', group: 'Command callbacks', debug: '0x00317760', eng: '0x002F2AF0', jpn: '0x002F2560' },
  { key: '_CbEyeNumber', name: 'CTalk::_CbEyeNumber', group: 'Command callbacks', debug: '0x003177F0', eng: '0x002F2B80', jpn: '0x002F25F0' },
  { key: '_CbEmotion', name: 'CTalk::_CbEmotion', group: 'Command callbacks', debug: '0x00317850', eng: '0x002F2BE0', jpn: '0x002F2650' },
  { key: '_CbEyeMove', name: 'CTalk::_CbEyeMove', group: 'Command callbacks', debug: '0x00317960', eng: '0x002F2CF0', jpn: '0x002F2760' },
  { key: '_CbFace', name: 'CTalk::_CbFace', group: 'Command callbacks', debug: '0x00317A20', eng: '0x002F2DB0', jpn: '0x002F2820' },
  { key: '_CbBupDirection', name: 'CTalk::_CbBupDirection', group: 'Command callbacks', debug: '0x00317AD0', eng: '0x002F2E60', jpn: '0x002F28D0' },
  { key: '_CbBupPosition', name: 'CTalk::_CbBupPosition', group: 'Command callbacks', debug: '0x00317B10', eng: '0x002F2EA0', jpn: '0x002F2910' },
  { key: '_CbBupVisible', name: 'CTalk::_CbBupVisible', group: 'Command callbacks', debug: '0x00317B50', eng: '0x002F2EE0', jpn: '0x002F2950' },
  { key: '_CbSpeaker', name: 'CTalk::_CbSpeaker', group: 'Command callbacks', debug: '0x00317C40', eng: '0x002F2FD0', jpn: '0x002F2A40' },
  { key: '_CbSignal', name: 'CTalk::_CbSignal', group: 'Command callbacks', debug: '0x00317DC0', eng: '0x002F3100', jpn: '0x002F2B70' },
  { key: '_CbEnd', name: 'CTalk::_CbEnd', group: 'Command callbacks', debug: '0x00317DD0', eng: '0x002F3110', jpn: '0x002F2B80' },
  {
    key: '_CbErr',
    name: 'CTalk::_CbErr',
    group: 'Command callbacks',
    debug: '0x00317F80',
    eng: '0x002F32C0',
    jpn: '0x002F2D30',
    role: 'Assertion trap in the debug build; a stub in both releases.',
  },
  {
    key: '_CbNop',
    name: 'CTalk::_CbNop',
    group: 'Command callbacks',
    debug: '0x00317FF0',
    eng: '0x002F32D0',
    jpn: '0x002F2D40',
    role: '`jr $ra`.',
  },

  // ── Debug RMF checker overlay (debug build only) ──────────────────────────
  { key: 'FuncNishiRmfChecker', name: 'CRadiDebug::FuncNishiRmfChecker()', group: 'Debug RMF checker overlay', debug: '0x0046C220', eng: null, jpn: null },
  { key: 'StepRmfCheckerInit', name: 'CNishi::StepRmfCheckerInit()', group: 'Debug RMF checker overlay', debug: '0x0044D400', eng: null, jpn: null },
  { key: 'StepMain', name: 'CDebugRmfChecker::StepMain()', group: 'Debug RMF checker overlay', debug: '0x0044E1D0', eng: null, jpn: null },
  { key: 'StepWaitRmf', name: 'CDebugRmfChecker::StepWaitRmf()', group: 'Debug RMF checker overlay', debug: '0x0044EB30', eng: null, jpn: null },
  { key: 'StepSelect', name: 'CDebugRmfChecker::StepSelect()', group: 'Debug RMF checker overlay', debug: '0x0044EDA0', eng: null, jpn: null },
];

export const SYMBOL_GROUPS = [
  'Container',
  'Stream walkers',
  'Command callbacks',
  'Debug RMF checker overlay',
] as const;

const byKey = new Map(SYMBOLS.map((s) => [s.key, s]));

export function lookup(key: string): SymbolEntry | undefined {
  return byKey.get(key);
}
