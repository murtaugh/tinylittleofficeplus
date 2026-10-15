/**
 * The Invoicer's model: an invoice read from the kernel's document and written back to it, and the sums. No DOM.
 *
 * The document is TLO (docs/tlo.md), so an invoice is a link like every other document:
 *
 *   ---
 *   title: October wash and fold
 *   number: 1042
 *   date: 2026-10-01
 *   due: 2026-10-16
 *   currency: $
 *   tax: 8.875
 *   from: Steinway Suds | 31-05 Steinway St | Astoria, NY 11103
 *   to: Café Brava | 45-10 Broadway | Astoria, NY 11103
 *   email: billing@cafebrava.example
 *   ---
 *   Description | Unit | Qty:number | Rate:money
 *   --- | --- | --- | ---
 *   Wash and fold, table linens | lb | 112 | 1.75
 *
 *   Payment due within 15 days. Thank you!
 *
 * The head holds what an invoice has once (an address's lines are joined by " | ", as the Word Processor's invoice
 * template writes them); the table holds the lines; the words after it are the notes. `paid:` is the day it was paid.
 * Read leniently (a table's columns found by their names, "Item" or "Price" too), written canonically.
 */
import { parse, write, type Block, type Doc, type Op } from '../../doc/index.ts';

export interface Line {
  desc: string;
  unit: string;
  qty: string;
  rate: string;
}

export interface Invoice {
  title: string;
  number: string;
  /** Issued, YYYY-MM-DD. */
  date: string;
  due: string;
  /** The day it was paid; '' while it is owed. */
  paid: string;
  currency: string;
  /** The tax rate in percent, as typed ('' for none). */
  tax: string;
  /** Who sends it: name on the first line, the address after. */
  from: string;
  /** Who pays it. */
  to: string;
  /** Who it is emailed to, comma-separated. */
  email: string;
  lines: Line[];
  notes: string;
}

/** The head keys an invoice writes, in the order it writes them. */
const HEAD = ['title', 'number', 'date', 'due', 'paid', 'currency', 'tax', 'from', 'to', 'email'] as const;
type HeadKey = (typeof HEAD)[number];
/** The fields with lines of their own, kept in one head line. */
const MULTI: HeadKey[] = ['from', 'to'];
const SEP = ' | ';

const COLUMNS = [
  { name: 'Description', type: 'text' as const },
  { name: 'Unit', type: 'text' as const },
  { name: 'Qty', type: 'number' as const },
  { name: 'Rate', type: 'money' as const },
];

/** The units offered for a line; any other word may be typed. */
export const UNITS = ['hours', 'lb', 'load', 'item', 'flat', 'month', 'day'];

export const emptyLine = (): Line => ({ desc: '', unit: '', qty: '1', rate: '' });

/** A head line's text as a field holds it: " | " is a new line. */
const fromHead = (v: string | undefined, multi: boolean) => (multi ? (v ?? '').split(/\s*\|\s*/).join('\n') : (v ?? ''));
/** A field's text as a head line: one line, its line breaks " | ", blank lines dropped. */
const toHead = (v: string, multi: boolean) =>
  multi
    ? v
        .split('\n')
        .map((l) => l.replace(/\|/g, '/').trim())
        .filter(Boolean)
        .join(SEP)
    : v.replace(/\s*\n\s*/g, ' ').trim();

/** Which of a table's columns holds each field: by its name, leniently; a field no name claims takes its place's column, if that is free. */
function columnsOf(names: string[]): Record<keyof Line, number> {
  const named: [keyof Line, RegExp][] = [
    ['desc', /^(desc|description|what|item|service)/i],
    ['unit', /^(unit|units)$/i],
    ['qty', /^(qty|quantity|hours|count)/i],
    ['rate', /^(rate|price|cost|each)/i],
  ];
  const at = Object.fromEntries(named.map(([k, re]) => [k, names.findIndex((n) => re.test(n.trim()))])) as Record<keyof Line, number>;
  const taken = new Set(Object.values(at).filter((i) => i >= 0));
  named.forEach(([k], place) => {
    if (at[k] < 0 && place < names.length && !taken.has(place)) {
      at[k] = place;
      taken.add(place);
    }
  });
  return at;
}

/** The words of a text block, as one string (its line breaks kept). */
const words = (b: Block): string => ('runs' in b ? b.runs.map((r) => r.t).join('') : '');

export function readInvoice(doc: Doc): Invoice {
  const h = doc.head;
  const tableAt = doc.blocks.findIndex((b) => b.k === 'table');
  const lines: Line[] = [];
  if (tableAt >= 0) {
    const t = doc.blocks[tableAt] as Extract<Block, { k: 'table' }>;
    const at = columnsOf(t.cols.map((c) => c.name));
    const cell = (row: string[], i: number) => (i >= 0 ? (row[i] ?? '') : '');
    for (const row of t.rows) {
      const line = { desc: cell(row, at.desc), unit: cell(row, at.unit), qty: cell(row, at.qty), rate: cell(row, at.rate) };
      if (line.desc || line.unit || line.qty || line.rate) lines.push(line);
    }
  }
  const notes = doc.blocks
    .filter((b, i) => i !== tableAt && 'runs' in b)
    .map(words)
    .filter(Boolean)
    .join('\n\n');
  const field = (k: HeadKey) => fromHead(h[k], MULTI.includes(k));
  return {
    title: field('title'),
    number: field('number'),
    date: field('date'),
    due: field('due'),
    paid: field('paid'),
    currency: h.currency || '$',
    tax: field('tax'),
    from: field('from'),
    to: field('to'),
    email: field('email'),
    lines,
    notes,
  };
}

/** The invoice as the kernel's document, canonical: the head in its order, the table, the notes. */
function invoiceDoc(inv: Invoice): Doc {
  const head: Doc['head'] = {};
  for (const k of HEAD) {
    const v = toHead(k === 'currency' ? inv.currency || '$' : inv[k], MULTI.includes(k));
    if (v) head[k] = v;
  }
  const blocks: Block[] = [
    {
      k: 'table',
      cols: COLUMNS.map((c) => ({ ...c })),
      rows: inv.lines.map((l) => [l.desc, l.unit, l.qty, l.rate].map((c) => c.replace(/\s*\n\s*/g, ' ').trim())),
    },
  ];
  const notes = inv.notes.replace(/\s+$/, '');
  if (notes) blocks.push({ k: 'p', runs: [{ t: notes }] });
  return { head, blocks };
}

export const invoiceText = (inv: Invoice): string => write(invoiceDoc(inv));
export const readText = (text: string): Invoice => readInvoice(parse(text));

/**
 * The operations that make `doc` the invoice `next`: a head op for each head key that changed, and the blocks replaced
 * when they differ. The undo log inverts them (kit/core/element.ts), so an undo puts back exactly what was.
 */
export function opsTo(doc: Doc, next: Invoice): Op[] {
  const want = invoiceDoc(next);
  const ops: Op[] = [];
  for (const k of new Set([...Object.keys(doc.head), ...Object.keys(want.head)])) {
    if (!HEAD.includes(k as HeadKey) && k !== 'currency') continue; // a key the invoice does not know (by, created) stays
    if (doc.head[k] !== want.head[k]) ops.push({ op: 'head', key: k, value: want.head[k] });
  }
  if (JSON.stringify(doc.blocks) !== JSON.stringify(want.blocks)) ops.push({ op: 'splice', at: 0, n: doc.blocks.length, blocks: want.blocks });
  return ops;
}

/** A number as a person types it: "1,250.50", "$40", " 3 ". NaN when there is none. */
export function amount(s: string): number {
  const clean = s.replace(/[^\d.\-]/g, '');
  return clean ? Number(clean) : NaN;
}

const cents = (n: number) => Math.round(n * 100) / 100;

export interface Totals {
  /** Each line's amount, in the lines' order. */
  lines: number[];
  subtotal: number;
  /** The rate, a number (0 for none). */
  rate: number;
  tax: number;
  total: number;
}

export function totals(inv: Invoice): Totals {
  const lines = inv.lines.map((l) => {
    const q = amount(l.qty);
    const r = amount(l.rate);
    return cents((isFinite(q) ? q : 0) * (isFinite(r) ? r : 0));
  });
  const subtotal = cents(lines.reduce((a, b) => a + b, 0));
  const rate = isFinite(amount(inv.tax)) ? amount(inv.tax) : 0;
  const tax = cents((subtotal * rate) / 100);
  return { lines, subtotal, rate, tax, total: cents(subtotal + tax) };
}

/** The first line of an address block: a name. */
export const nameOf = (block: string): string => block.split('\n')[0]?.trim() ?? '';

/* ---------- days ---------- */

/** Today on this device, YYYY-MM-DD. */
export function today(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
/** A day some days after another, YYYY-MM-DD; '' when the day is not one. */
export function addDays(day: string, n: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n));
  return d.toISOString().slice(0, 10);
}

export type Status = 'paid' | 'overdue' | 'open' | 'draft';

/** Where an invoice stands on a day: paid, past its due day, owed, or not yet billed to anyone. */
export function statusOf(inv: Invoice, on = today()): Status {
  if (inv.paid) return 'paid';
  if (!nameOf(inv.to) && !inv.lines.length) return 'draft';
  if (inv.due && inv.due < on) return 'overdue';
  return 'open';
}

/* ---------- numbers ---------- */

/** The number after this one: its last run of digits counted up, its width kept ("INV-0099" → "INV-0100"). */
export function nextNumber(n: string): string {
  const m = /^(.*?)(\d+)(\D*)$/.exec(n.trim());
  if (!m) return n.trim() ? `${n.trim()}-2` : '1001';
  return m[1] + String(Number(m[2]) + 1).padStart(m[2].length, '0') + m[3];
}

const split = (n: string) => {
  const m = /^(.*?)(\d+)(\D*)$/.exec(n.trim());
  return m ? { pre: m[1], n: Number(m[2]), post: m[3] } : null;
};

/**
 * The number a new invoice takes: the first number (the business's "start at") or, past it, the one after the
 * highest number already used with the same prefix.
 */
export function numberFor(start: string, used: string[]): string {
  const s = split(start || '1001');
  if (!s) return start;
  let best = start || '1001';
  let high = s.n - 1;
  for (const u of used) {
    const p = split(u);
    if (p && p.pre === s.pre && p.post === s.post && p.n > high) {
      high = p.n;
      best = nextNumber(u);
    }
  }
  return best;
}

/* ---------- the Word Processor's invoice ---------- */

/**
 * The invoice as the Word Processor's own invoice (its template's shape, src/apps/write/templates.ts): the head
 * fields it reads, a title, and a table whose amounts, subtotal, tax and total are formulas, locked.
 */
export function asWrite(inv: Invoice, title: string): string {
  const n = inv.lines.length;
  const rows = inv.lines.map((l, i) => [l.desc, l.qty, l.unit, String(amount(l.rate) || ''), `=B${i + 1}*D${i + 1}`]);
  rows.push(['', '', '', '', '']);
  const sub = n + 2;
  rows.push(['Subtotal', '', '', '', `=SUM(E1:E${n + 1})`]);
  rows.push(['Tax', inv.tax || '0', '%', '', `=E${sub}*B${sub + 1}/100`]);
  rows.push(['Total', '', '', '', `=E${sub}+E${sub + 1}`]);
  const head: Doc['head'] = {};
  const put = (k: string, v: string) => v && (head[k] = v);
  put('from', toHead(inv.from, true));
  put('to', toHead(inv.to, true));
  put('number', inv.number);
  put('date', inv.date);
  put('due', inv.due);
  put('currency', inv.currency);
  const doc: Doc = {
    head,
    blocks: [
      { k: 'h', level: 1, runs: [{ t: inv.title || title }], a: { cls: ['title'] } },
      {
        k: 'table',
        cols: [
          { name: 'What', type: 'text' },
          { name: 'Qty', type: 'number' },
          { name: 'Units', type: 'text' },
          { name: 'Price', type: 'money' },
          { name: 'Amount', type: 'money' },
        ],
        rows,
        a: { kv: { lock: `E1:E${n + 4}` } },
      },
      ...(inv.notes ? [{ k: 'p' as const, runs: [{ t: inv.notes }] }] : []),
    ],
  };
  return write(doc);
}
