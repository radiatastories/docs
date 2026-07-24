---
layout: default
title: Radiata Boot Sequence
description: Reverse Engineering Reference - Claude assisted
---

# Radiata Boot Sequence - Reverse Engineering Reference - Claude assisted

This document consolidates everything established about the game's boot
chain. Facts are marked **Confirmed** (verified against disassembly,
working reference code, or an actual boot log), or **Inferred** (strongly
implied, not independently verified).

Two independent boot logs (USA (proto) `SLUS-21262` and Japan `SLPM-65800`,
captured via PCSX2) are used throughout as ground truth alongside the
static disassembly of (USA (proto) `SLUS-21262`). Additionally, manual verification 
on dumped iso level files was also used to confirm the boot sequence. 

- Analysis of both **release** versions reveals identical `main` ELFs. 
- The `main` ELFs differs between proto and release builds.
- All versions' IOP kernel images are identical.
- All versions' Custom ELFs are identical.

---

## 1. Disc Layout

**Confirmed**, cross-validated across all builds and USA-proto / Japan boot logs:

| Region | Extent | Contents |
|---|---|---|
| ISO9660 root-directory files | Start of disc → end of IOP kernel | `system.cnf`, `main` ELF, `IOPRP300.IMG` kernel v2.2, and dev modules |
| Padding |End of IOP kernel → start of the custom IOP ELFs |  ~900MB |
| Custom ELFs | `0x10000` bytes, immediately before the TOC | Seems to be an unknown custom packed EE ELF section (Section 6.2) |
| File table (TOC) | `0xD800` bytes, resolved to sector 494979 in both regions | Scrambled 3-plane TOC (Section 7) |
| Filesystem | End of file table → end of disc | Remaining game data, including game-specific IOP modules, resolved via the TOC |

`main`'s sector varies by region (USA-proto: 274, Japan: 270), and so does its
size (`0x8D900` vs `0x7E300`) and the disc's total sector count
(2,242,608 vs 2,239,296) — yet **the TOC resolves to the identical
absolute sector (494979) in all builds.** Section 7.1 explains
why.

---

## 2. ISO9660 Root Directory Placement

**Confirmed:** the structure of the root directory is in order: `.`, `..`, `dev9`, `IOPRP300.IMG` (kernel image), remaining dev modules, `system.cnf`, and `main`. `main` is always the **last entry** in the ISO9660 root directory, however it is not the last physical entry. The last physical entry is the kernel image.


---

## 3. Boot Chain — Two Executions of `main`

**Confirmed.** Read the descriptor volume (LBA 16) for the LBA and size of the root directory. Read the root directory and locate `system.cnf`. Read `system.cnf` and locate `main`. `main` (entry point `0x00100008` in all builds) executes **twice**, across two separate EE resets:

```
Simplified Hard reset boot
  -> IOP Kernel 0.9.1 (BIOS default) loads
  -> main ELF loads and executes (1st time)
       -> triggers sceSifRebootIop (loads the custom kernel image)
       -> triggers an EE-side reboot request
  -> "Update rebooting.." / EE/iR5900 Recompiler Reset
  -> main ELF loads and executes AGAIN (2nd time, same entry point)
       -> now running under the custom IOP Kernel 2.2
       -> proceeds into CBios / MakeFileSystem / sound / TOC read
```

The single `main` symbol seen in static disassembly corresponds to two
logical phases sharing one entry point — an early phase whose job is to
kick off the IOP kernel reboot, and a later phase (after that reboot
completes) that performs the actual game bring-up starting with the
filesystem.

**Not yet isolated:** the exact branch/flag distinguishing "first pass,
about to reboot IOP" from "second pass, IOP kernel already upgraded."
The flag byte at `storage+0xD99B` (Section 4.5) is a candidate worth
re-examining specifically for this, since a storage struct freshly
constructed after an EE reset would plausibly read differently than one
still holding pre-reboot state.

**Confirmed:** all builds of the game share the exact same custom kernel image content.

---

## 4. `main()` Bring-up Sequence

*(Primarily describes the second-pass execution from Section 3; steps
now understood to belong to the first pass are noted explicitly.)*

### 4.1 Prologue and boot markers

- Standard N32 stack frame; saves `ra` and `s0`–`s7`.
- `FullAllocAndFree(a0)` runs immediately. **(Inferred: heap sanity/defrag
  pass.)**
- An 8-byte magic value written to `0x01FE0000` — boot-progress marker.
- EE Timer 0's MODE register (`0x10000010`) set to `0x83`. Reused later
  as an RNG seed source.

### 4.2 Core SDK bring-up

```
mwInit()
sceSifInitRpc()
sceCdInit()
```

Followed by the **IOP kernel reboot** — `sceSifRebootIop` with two
fixed string literals (the kernel's path/args), confirmed via
boot log to load a distinct ROM-style image (Section 6) located
immediately after `main` on disc. `sceSifSyncIop` waits for completion;
RPC/filesystem drivers are re-initialized since IOP-side state resets
across the reboot. Thread priority raised via
`ChangeThreadPriority(tid, 0x2D)`.

**Inferred:** this reboot very likely triggers the full EE-side reset
from Section 3 — i.e. this is the *end* of the first-pass execution of
`main`, not a mid-sequence step within one continuous run.

### 4.3 `CStorage::Open` — SIF RPC System Server IDs

**Confirmed:** `CStorage::Open`'s small integer parameter (e.g. `0`, `1`,
`2` as seen at various call sites) is **not** itself a raw SIF System
Server ID — it's `CStorage::Open`'s own internal index, which it
translates to one of the standard PS2 SDK SIF RPC System Server IDs
before issuing the actual RPC:

**Inferred:** this table is inferred based on standard documentation. If the IOP module is custom then the SIF RPC System Server IDs may differ from the standard PS2 SDK values.

(sourced from ps2tek)
| ID | Purpose | Module |
|---|---|---|
| `0x80000001` | File I/O | FILEIO |
| `0x80000003` | IOP Heap Allocation | FILEIO |
| `0x80000006` | Module/ELF Loader | LOADFILE |
| `0x80000100` | Pad | PADMAN |
| `0x80000101` | Pad extension (unconfirmed) | PADMAN |
| `0x80000400` | Memory cards | MCSERV |
| `0x80000592` | CDVD Init | CDVDFSV |
| `0x80000593` | CDVD S commands | CDVDFSV |
| `0x80000595` | CDVD N commands | CDVDFSV |
| `0x80000597` | CDVD SearchFile | CDVDFSV |
| `0x8000059A` | CDVD Disk Ready | CDVDFSV |
| `0x80000701` | LIBSD Remote (not in BIOS) | SDRDRV |
| `0x80000901`–`0x80000905` | MTAP port management (not in BIOS) | MTAPMAN |
| `0x80001400` | EyeToy (not in BIOS) | EYETOY |

### 4.4 Engine (`CBios`) bring-up

```
CBios::GetStorage()      -> CStorage::StorageInit()
CBios::GetStorage()      -> CStorage::MakeFileSystem()   [Section 7]
CBios::GetDecompress()                                    [handle reused throughout boot]
CSif::Init()
```

RNG seeding: live EE Timer0 COUNT register read, multiplied by a fixed
constant, `0xCAD` added, result seeds `InitRandom()`. **Confirmed**,
fully reproducible.

### 4.5 Conditional gate — the shared flag byte

**Confirmed:** a flag byte at `storage + 0xD99B` gates multiple
subsequent decisions. Everywhere it's read: **nonzero means "skip the
real work, return success/no-op immediately."**

**Inferred, revised given Section 3:** given `main` runs twice across an
EE reset, this flag may specifically distinguish first-pass from
second-pass state — worth checking whether it reads differently across
the two executions rather than assuming a generic "dev-mode" meaning.
Alternatively, this flag could be a soft-reset flag.

### 4.6 Game-specific IOP module load (gated by 4.5's flag)

**Confirmed:** The core
OS-level modules (`SYSMEM`, `LOADFILE`, `PADMAN`, `MCSERV`, `CDVDFSV`... see `IOPRP300.IMG`) are already active by this point, provided
by the kernel image from the first pass (Section 4.2). This
loop's 12 modules are **game-specific** IOP
modules, loaded via a `CStorage::Open`/`Read` from the first TOC entry, proven from disk read logs.

Loop mechanics:

1. Buffer read and decompressed via `CDecompress::Decode`.
2. DMA'd into IOP heap memory.
3. **12 modules** loaded in a loop (indices 0–11):
   - Indices **8 and 9** special-cased: `sceSifLoadStartModuleBuffer`
     with argument strings from a fixed string table (likely driver
     args — **inferred**).
   - All other indices: `sceSifLoadModuleBuffer`.

### 4.7 Region setup, graphics, task init

- `CStorage::InitHdd`, `std::set_new_handler`, `sceDmaReset`.
- PAL/NTSC branch, GS display parameters per region.
- `CPSTask::InitTask` — main task/scheduler object.
- 16 iterations of `CPSTask::GsSyncPath`.

### 4.8 Sound init (same gate as 4.5)

```
CSoundManager::InitSoundManager()
CSoundManager::InitSoundMemory(...)
CSoundManager::InitMusicList(...)
CVoiceManager::SetVoiceTable(...)
CSoundManager::InitKeepSE(...)   [conditional on a second flag]
```

### 4.9 Secret key / checksum pass

`CSound::GetSecretKeyCode` fills a buffer, processed by a **VU0
microprogram**, combined with `CStorage::ReadClock`, summed into a byte,
used as a loop bound to burn additional `Random()` calls. **Inferred:**
entropy mixing, not a hard integrity gate.

### 4.10 Overlay segment loader — hand-off to segment #1 (Step0 00)

```
index = 1
loop:
    header = CDecompress::GetCompHeader(decompress_handle, buffer2, index)
    if header == NULL: break
    CBios::DecompressProgramOnly(decompress_handle, header, ...)
    index += 1

CBios::DecompressAndExec(decompress_handle, buffer2, index=1)   # hardcoded
```

**Confirmed:** `buffer2` holds a concatenated table of
compressed segments; `GetCompHeader` is 1-based, returns `NULL` past the
last segment; every segment from index 1 upward is pre-staged via
`DecompressProgramOnly`; once exhausted, `DecompressAndExec` transfers
execution permanently into segment #1. Code after this point is very
likely dead.

**Inferred:** segment #1 almost certainly contains the runtime
overlay-switching logic, since segments 2+ are pre-staged but never
executed from `main()` itself.

---

## 5. `main`'s ELF Program Header / Segment Memory Map

**Confirmed** via byte-exact parse (`e_phnum=18`, `e_phentsize=32`,
`e_phoff=0x34`), cross-checked against the boot logs, and memory map (proto). ex. Load
confirmation (`0 00100000 0008d900`) — `0x8D900` matches `main`'s Phdr
entry 0 `p_filesz` and associated `memsz` of `0x000B4280` exactly, independently derived two different ways.

| # | Type | vaddr | memsz | Name |
|---|---|---|---|---|
| 0 | `NULL` | `0x00100000` | `0x000B4280` | main |
| 1 | `LOAD` | `0x001B4280` | `0x001FFD80` | step0_00.bin |
| 2 | `LOAD` | `0x003B4000` | `0x0001C280` | step1_00.bin |
| 3 | `LOAD` | `0x003B4000` | `0x00043C00` | step1_01.bin |
| 4 | `LOAD` | `0x003B4000` | `0x00099180` | step1_02.bin |
| 5 | `LOAD` | `0x0044D180` | `0x00028E00` | step2_00.bin |
| 6 | `LOAD` | `0x0044D180` | `0x0000D300` | step2_01.bin |
| 7 | `LOAD` | `0x0044D180` | `0x00028700` | step2_99.bin |
| 8 | `LOAD` | `0x0044D180` | `0x00002E00` | hoshi.bin |
| 9 | `LOAD` | `0x0044D180` | `0x00000B80` | kushi.bin |
| 10 | `LOAD` | `0x0044D180` | `0x00002900` | nishi.bin |
| 11 | `LOAD` | `0x0044D180` | `0x0000CE00` | yoko.bin |
| 12 | `LOAD` | `0x0044D180` | `0x00001980` | kame.bin |
| 13 | `LOAD` | `0x0044D180` | `0x00011B00` | RouteEditor.bin |
| 14 | `LOAD` | `0x0044D180` | `0x00015B80` | CharaChecker.bin |
| 15 | `LOAD` | `0x0044D180` | `0x00003080` | RmfChecker.bin |
| 16 | `LOAD` | `0x02000000` | `0x00008480` | T10000.bin |
| 17 | `LOAD` | `0x00475F80` | `0x00000000` | heap |

### Key findings

- `main`'s own Phdr entry is `PT_NULL`; every other entry is `PT_LOAD` —
  likely lets a loader filter on `p_type == PT_LOAD` to skip "myself."
- Only `main` has real file content (`p_offset=0x280`,
  `p_filesz=0x8D900`, ending at `0x8DB80`). **Every other segment shares
  that same `p_offset` with `p_filesz=0`** — the Phdr table records only
  destination/decompressed-size; actual compressed byte boundaries come
  from the `GetCompHeader` chain (Section 4.10). The two are redundant
  descriptions of the same 17-segment layout.
- `p_flags=7` (RWX) for real segments; `heap` uses `p_flags=6`.

---

## 6. Custom Kernel Image & ELFs

**Confirmed.** Kernel image (loaded during the first pass,
Section 4.2; located immediately after `main` on disc) uses the
**standard PS2 BIOS ROM directory format** and prints **IOP Realtime Kernel Ver. 2.2
** this is where the core IOP modules live. 

**Inferred** Ver. 2.2 is suggestive of kernel version 2.2 but not necessarily the actual version.

**Verify** Versions / Collections against contained modules. Modules against known hashes.

### 6.1 `ROMDIR` entry structure

```c
struct RomdirEntry {
    char     name[10];       // null-padded
    uint16_t extinfo_size;
    uint32_t size;
};
```

Confirmed sample (start of the image):

| Name | `extinfo_size` | `size` |
|---|---|---|
| `RESET` | `0x0008` | `0x00000000` |
| `ROMDIR` | `0x0048` | `0x00000140` (self-describing directory table size) |
| `EXTINFO` | `0x0000` | `0x00000258` |
| `SYSMEM` | `0x0028` | `0x00001799` |

`RESET`, `ROMDIR`, `EXTINFO` are always the first three entries in a
standard PS2 ROM image; real modules follow. Expect `LOADFILE` and the
other modules from the System Server ID table (Section 4.3) as further
entries in the same directory, addressed by name.

### 6.2 Custom ELFs

**Confirmed**: The game does not need this section to run. The ELF loads 17 segments the same as `main` ELF.

**Inferred**: Built using the same toolchain as `main` ELF. Based on the weird addressing of the Custom ELF it seems likely to be a developer bootloader specifically in some such structure:

```
PS2 boot
   |
   +-- IOP modules
   |      |
   |      +-- DEV9.IRX
   |      +-- ATAD.IRX
   |
   +-- EE dev ELF @ 0x130000
          |
          +-- host communication
          +-- debug tools
          +-- game loader/runtime
```

This sections is very heavily inferred. On top of that I could not get a `DvdRead` or `CDRead` at these sectors further mistifying the actual module contents/purposes. Meaning that if this section is loaded is would have to be later into runtime or through a different mechanism. There seems to be something going on with ELF markers as terminal markers so even the structures themselves are not yet fully understood.

#### 6.2.1 Entrypoint Plain ELF

Standard, unmodified ELF — 17-segment structure identical in shape to
`main`'s own (Section 5), `e_entry = vaddr + 8`, same "only entry 0 has
real content" sharing pattern. `e_flags` differs from `main`
(`0x33924000` vs. `0x20924000`) — not yet confirmed what this
distinguishes. Several segments show `vaddr != paddr`, with `paddr` in
the `0x30000000` range.

#### 6.2.2 Ciphered or Compressed entry

**Confirmed** b'\00\ELF', followed by a 32 byte header. Can be followed by medium-high entropy payload.

**Inferred** medium-high entropy payload likely compressed.

#### 6.2.3 "Custom" entry (duplicate-with-prefix)

**Confirmed** b'\7E\ELF\7F\ELF' or b'\00\ELF\7F\ELF'

**Inferred** Standard, ELF despite differing header. The first ELF marker may be a terminal marker.

---

## 7. `MakeFileSystem`: TOC Address Derivation, Read, and Descramble

**Confirmed**, cross-validated against working reference code, the
boot log, and used in a custom disk rebuild proof-of-concept. The `0x00078D83` constant is a hardcoded reference to the TOC address.

### 7.2 Gate and disc read

```
if storage[+0xD99B] != 0:
    return SUCCESS

sceCdDiskReady(0)
CStorage::Open(storage, index=0)      # -> SIF SearchFile, see 7.1
buf = operator_new(0xD800)
CStorage::Read(storage, buf, size=0xD800)
```

**Confirmed:** this read is issued as a raw/extended
`DvdRead` (not the standard `CDRead` used for the ELF), in `2064`-byte
blocks rather than `2048`:

```
DvdRead: Reading Sector 0494979 (002 Blocks of Size 2064) at Speed=4x(CAV) SpindleCtrl=83
```

`2064 = 2048 + 16` (raw sector mode, EDC bytes retained). Math checks
out: `27 × 2064 = 55,728`; `55,728 − (27×16) = 55,296 = 0xD800` —
matches the confirmed TOC size exactly once per-sector raw overhead is
stripped. Confirms the TOC is fetched via a distinct, lower-level
raw-read path rather than the standard `CDRead` API used for the ELF.

### 7.3 Second gate + copy

```
if storage[+0xD99B] != 0:
    goto done
memcpy(storage + 0x194, buf, 0xD800)
```

### 7.4 Descramble (in place)

**Confirmed:**

```python
def _scramble(self, flat_toc: list) -> list:
    total = self.params.total_entries          # 0x1200 = 4608
    key = self.params.seed                       # 0x13578642 hardcoded |
    scramble = flat_toc[:]
    for i in range(total):
        scramble[0*total + i] ^= key
        key ^= (key << 1) & 0xFFFFFFFF
        scramble[1*total + i] ^= key
        key ^= (~self.params.seed) & 0xFFFFFFFF
        scramble[2*total + i] ^= key
        key ^= ((key << 2) ^ self.params.seed) & 0xFFFFFFFF
    return scramble
```

| Parameter | Value | Confirmed by |
|---|---|---|
| `seed` | `0x13578642` | Exact match to disassembly constant |
| `signature` | `0x27D51556` | Raw scrambled value expected at TOC index 0 |
| `toc_offset` | `0x3C6C1800` | Matches sector 494979, confirmed in both regional boot logs — see 7.1 for why this is derived, not hardcoded |
| `total_entries` | `0x1200` (4608) | Exact match to disassembly loop bound |
| `sector_size` | `0x800` (2048) | Confirms the `<<11` conversion in 7.5 |

Three parallel planes of 4608 32-bit words each:

| Plane | Struct offset | Contents |
|---|---|---|
| 0 | `storage + 0x194` | LBA |
| 1 | `storage + 0x4994` | Sizes |
| 2 | `storage + 0x9194` | IDs |

### 7.5 TOC entry resolution

**Confirmed** Semaphore-guarded (`storage[+0x18]`). Both offset/size
fields packed `[bits 31-24: reserved][bits 23-0: value]`.

```
if index == 0: return NOT_FOUND
resolved_LBA = LBA_plane[index] & 0x00FFFFFF
storage[+0x54] = resolved_LBA          # used as-is -- **inferred**

if storage[+0xD99D] == 0: return
raw_id = ids_plane[index]
if raw_id == 0: return NOT_FOUND
storage[+0x58] = raw_id - 1

resolved_size = (sizes_plane[index] & 0x00FFFFFF) << 11   # sectors -> bytes
storage[+0x80] = resolved_size
```

Confirmed sentinels: index 0 always reserved; `ids_plane[index]==0`
marks an empty slot.

### 8 Overlay

**Confirmed** Overlay entries are marked as logical id 0 in the TOC.
