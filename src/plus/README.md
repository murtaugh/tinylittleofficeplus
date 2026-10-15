# Plus: this fork's own apps

Tiny Little Office Plus is [Tiny Little Office](https://github.com/aboard-io/tinylittleoffice) with apps of its own
added. Those apps live here, in `src/plus/`, so that upstream's changes can keep being merged in without conflicts.

## What touches upstream

**One line.** `src/main.ts` imports `./plus/index.ts` before the shell:

```ts
// This fork's own apps, put in the registry before the shell reads it (src/plus/README.md).
import './plus/index.ts';
```

Nothing else of upstream's is edited: not the registry, the language files, the stylesheet, the budgets, the tests or
the generated guides. Everything else is a new file under `src/plus/`, which upstream never writes to.

## How it works

- **The registry.** Upstream's `apps()` (`src/kit/core/apps.ts`) returns its own list, and `appOf()`, the home page,
  the routes, Download and the library all read that same list. `src/plus/index.ts` pushes the plus apps onto it as the
  page loads. A plus app is then an app of the site like any other: it has a row on the home page with its templates,
  links of the form `#/v1/<id>/…`, the Display Link, print, PDF and PNG, Share, short links, passwords, and Save in
  browser.
- **What doesn't see plus apps.** Upstream's tests, the command line (`packages/doc`), the API (`src/api.ts`), the
  agent guides (`/llms.txt`, the skill) and the build's per-app pages read the registry without `src/main.ts`. So they
  keep seeing upstream's ten apps alone, and none of their checks has to change.
- **Words.** Upstream checks every `t('…')` in `src/` against `src/i18n/en.ts`, so a plus app uses `pt('…')` from its
  own `words.ts` instead, with its dictionaries next to its code (`src/plus/<app>/i18n/<lang>.ts`, named the way
  upstream names its language files). The language is still the site's: `pt` follows the menu's choice and the link's
  `?lang=`. A language with no file shows the English.
- **Style.** A plus app's stylesheet is imported with `?inline` and adopted by the page when its editor loads, so
  upstream's single stylesheet and its size budget never include it. It uses upstream's tokens (`--to-paper`,
  `--to-radius` and so on) inside `@layer apps`, so it follows the theme and the size of everything.
- **Tests.** `src/plus/**/tests/*.unit.test.ts` (node) and `src/plus/**/tests/*.test.ts` (Chromium) are picked up by
  upstream's own `vitest.config.ts` globs, so `npm test` runs them. `src/plus/tests/plus.unit.test.ts` checks the
  registration and that every dictionary has every key, so an upstream change that breaks the hook fails there first.
  Upstream's own lint (`npm run lint`) covers this folder too: its rules on untranslated words, on imports and on dead
  code apply here.

## Merging upstream

```sh
git remote add upstream https://github.com/aboard-io/tinylittleoffice.git   # once
git fetch upstream
git merge upstream/main
npm ci && npm run lint && npm test
```

A conflict can only come from `src/main.ts`'s import block, and resolving it means keeping the `./plus/index.ts`
import above `./kit/core/shell.ts`. If `src/plus/tests/plus.unit.test.ts` fails after a merge, upstream changed how
`apps()` hands out its list, and `src/plus/index.ts` is the one file to adjust.

## Adding another plus app

1. Make `src/plus/<id>/` with a `def.ts` (`defineApp`, as upstream's apps do: see `src/kit/core/app.ts`), an
   `editor.ts` that extends `DocElement`, a `words.ts`, and tests. Pick an `id` upstream doesn't use.
2. Add it to `PLUS_APPS` in `src/plus/index.ts`.
3. Point `keysIn(...)` in `src/plus/tests/plus.unit.test.ts` at its folder as well, so its words are checked.

## The apps

### Invoicer (`invoice`)

Invoices for a small business, modelled on
[Localhost Invoicer](https://github.com/murtaugh/Localhost-Invoicer) and built the Tiny Little Office way: the invoice
is its link.

- **The document.** It's TLO (`docs/tlo.md`). The head holds the title, number, issued, due and paid dates, currency,
  tax rate, from, to and email. A table holds the lines (`Description | Unit | Qty:number | Rate:money`), and the words
  after the table are the notes. See `invoice/model.ts`.
- **Your business and clients.** Your name and address, currency, days to pay, tax rate, default notes and first
  invoice number are kept on this device (`invoice/profile.ts`, through upstream's `kit/core/store.ts`) and filled
  into every new invoice. So are the clients you choose to keep. Like everything else here, they're kept only while
  **Save in browser** is on, and forgotten when it's turned off. **Backup** downloads them as a file, and **Open a
  backup** reads that file back. It also reads Localhost Invoicer's backups.
- **Numbering.** A new invoice takes the next number after the highest one among the invoices kept on this device
  with the same prefix (`INV-0099` → `INV-0100`), or the business's first number. **Duplicate as next** turns the
  invoice on screen into the next one, dated today and unpaid: use it for a monthly account.
- **The bar.** Your business, Invoices (the ledger: everything kept, what's owed and what's late), Duplicate as next,
  Email (a draft in your mail app to the client's address, with the total, the due date and a link to read or print
  the invoice), Mark as paid (stamps it PAID with today's date), Undo and Redo.
- **Paper.** `invoice/view.ts` draws US Letter. The shell turns it into the PDF, PNG, print and Display Link. Lines
  that run past a page continue on the next.
- **Hand-off.** Download → Open in the Word Processor turns it into upstream's invoice template, with the sums as
  formulas.
- **Templates.** A laundromat's wash-and-fold account for a restaurant (no tax line, since New York doesn't tax
  laundering), a freelancer's hours, and a monthly retainer.
- **Languages.** English and Spanish (`invoice/i18n/es.ts`). Others show the English until a file is added.

Not carried over from Localhost Invoicer: **the logo**. A picture would make every invoice's link too long to share,
and nothing in a document here is fetched from another site.
