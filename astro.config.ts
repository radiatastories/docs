import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { EVD_COMMANDS } from './src/data/evd-commands';
import { evdTitle } from './src/data/evd-names';

// Project page on GitHub Pages: https://radiatastories.github.io/docs/
const SITE = 'https://radiatastories.github.io';
const BASE = '/docs';

export default defineConfig({
  site: SITE,
  base: BASE,
  trailingSlash: 'always',

  redirects: {
    // The pre-Starlight URL, kept alive so existing links do not rot.
    '/BootSequence': '/docs/boot-sequence/disc-and-chain/',
    // The boot doc used to be one page; send it to the first of the five.
    '/boot-sequence': '/docs/boot-sequence/disc-and-chain/',
    // The RMF document used to be one page; send it to the first of the six.
    '/rmf': '/docs/rmf/container/',
    // The EVD opcode table used to be a single standalone page here.
    '/evd': '/docs/evd/format/',
  },

  integrations: [
    starlight({
      title: 'Radiata Stories',
      tagline: 'Reverse-engineering reference for the PS2 game',
      description:
        "Documentation of Radiata Stories' internals — the boot chain, on-disc file " +
        'formats, and the script and text engines — recovered from disassembly of the ' +
        'prototype, USA and Japanese builds.',

      favicon: '/favicon.ico',

      // Nothing outbound yet. Add entries here when there is somewhere to point:
      //   social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/radiatastories' }],

      editLink: {
        baseUrl: 'https://github.com/radiatastories/docs/edit/main/',
      },

      lastUpdated: true,

      customCss: ['./src/styles/custom.css'],

      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },

      sidebar: [
        {
          label: 'Boot sequence',
          items: [
            { label: '1–3 · Disc and boot chain', slug: 'boot-sequence/disc-and-chain' },
            { label: '4 · Bring-up sequence', slug: 'boot-sequence/bring-up' },
            { label: '5 · Segment map', slug: 'boot-sequence/segment-map' },
            { label: '6 · Kernel image and ELFs', slug: 'boot-sequence/kernel-image' },
            { label: '7–8 · Filesystem and TOC', slug: 'boot-sequence/filesystem' },
          ],
        },
        {
          label: 'RMF — message format',
          items: [
            { label: '1–3 · Container', slug: 'rmf/container' },
            { label: '4–5 · Token stream', slug: 'rmf/token-stream' },
            { label: '6–8 · Commands', slug: 'rmf/commands' },
            { label: '9–10 · Messages', slug: 'rmf/messages' },
            { label: '11–13 · Layout and glyphs', slug: 'rmf/layout' },
            { label: '14–16 · Regions and symbols', slug: 'rmf/reference' },
          ],
        },
        {
          label: 'EVD — event script',
          items: [
            { label: 'Container and encoding', slug: 'evd/format' },
            { label: 'Operands and state', slug: 'evd/operands' },
            { label: 'Control flow', slug: 'evd/control-flow' },
            { label: 'Expression command', slug: 'evd/expression' },
            { label: 'Opcode reference', slug: 'evd/opcodes' },
            {
              label: 'Commands',
              collapsed: true,
              // One entry per opcode, generated from the same dataset the pages
              // are. Starlight prefixes `base` onto sidebar links, so these are
              // written without it.
              items: EVD_COMMANDS.map((c) => ({
                label: evdTitle(c),
                link: `/evd/commands/${c.hex}/`,
                badge:
                  c.evidence === 'traced'
                    ? ({ text: 'unused', variant: 'caution' } as const)
                    : undefined,
              })),
            },
          ],
        },
        {
          label: 'About',
          items: [{ label: 'Method and conventions', slug: 'method' }],
        },
      ],
    }),
  ],
});
