# Radiata Stories — documentation

Reverse-engineering reference for the PlayStation 2 game *Radiata Stories*,
built with [Astro](https://astro.build) and
[Starlight](https://starlight.astro.build).

Published at <https://radiatastories.github.io/docs/>.

## Running it

Requires Node 18.20+, 20.3+, or 22+.

```bash
npm install
npm run dev
```

The dev server serves the site under the `/docs` base path, so open
<http://localhost:4321/docs/> rather than the bare origin.

| Command | Does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Static build into `dist/` |
| `npm run preview` | Serve the built output locally |
| `npm run check` | Type-check `.astro`, `.ts` and content collections |

## Layout

```
src/
  content/docs/        The pages. Markdown/MDX; the file path is the URL.
    index.mdx          Landing page (splash template)
    boot-sequence/      The boot chain, five parts
    method.mdx         Evidence markers, builds, address conventions
    rmf/               The RMF message format, six parts
    evd/               The EVD event-script format, five parts
  pages/
    evd/commands/[hex].astro
                       One page per EVD opcode, generated from the dataset
  components/
    AddrRef.astro      Inline symbol name -> per-build address popup
    SymbolTable.astro  Renders the RMF §16 symbol reference
    EvdCommandTable.astro
                       Renders the 138-opcode EVD reference
    FilterTable.astro  Adds a live text filter to a table
    Tag.astro          The confirmed / inferred markers
  data/
    addresses.ts       Per-build addresses for the RMF code path
    evd-commands.ts    The 138 EVD opcodes (generated)
  styles/custom.css    Palette and table/prose styling
```

### Data-driven pages

Two datasets drive everything that would otherwise be transcribed by hand.

`src/data/addresses.ts` is the only place an RMF per-build address should be
written. Both the `<AddrRef>` popups and the symbol reference table read from it,
so they cannot drift apart. An `<AddrRef sym="...">` naming a key that isn't in
that file fails the build rather than rendering a dead reference.

`src/data/evd-commands.ts` holds all 138 EVD opcodes — handler symbol,
signature, per-build addresses, engine calls, bitmasks and per-field
documentation. It drives the opcode reference table, the 138 generated command
pages under `/evd/commands/`, and the sidebar entries for them, so those three
can never disagree. It is generated from the reverse-engineering notes; edit
those and regenerate rather than hand-editing the file.

### Evidence markers

Use `<Tag kind="confirmed" />` for something read out of disassembly or
reproduced against real data, and `<Tag kind="inferred" />` for something the
surrounding code implies but nothing has proven. See
[Method and conventions](src/content/docs/method.mdx).

## Deployment

Pushing to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml),
which builds the site and publishes it to GitHub Pages.

This requires the repository's **Settings → Pages → Source** to be set to
**GitHub Actions** (not "Deploy from a branch").

The pre-Starlight URLs `/docs/BootSequence/`, `/docs/rmf/` and `/docs/evd/`
redirect to their new locations, so existing links keep working.
