/**
 * The invoice drawn as paper, with no DOM: US Letter at 96 to the inch, the sender and the invoice's number and days
 * at the top, who pays it, the lines, the sums, the notes; a stamp when it is paid. Lines that run past a page go on to
 * the next, under the table's heading again. The kit makes the PDF, the PNG, the print and the thumbnails from this.
 */
import type { Doc } from '../../doc/index.ts';
import type { Page } from '../../kit/core/app.ts';
import { clip, FAINT, INK, LINE, MUTED, rect, SHADE, text, wrapText } from '../../kit/draw/draw.ts';
import { formatMoney } from '../../doc/index.ts';
import { language } from '../../kit/core/i18n.ts';
import { amount, nameOf, readInvoice, totals, type Invoice } from './model.ts';
import { pt } from './words.ts';

const W = 816;
const H = 1056;
const M = 64;
/** The columns' right edges, and the description's width. */
const COL = { unit: 470, qty: 560, rate: 655, amount: W - M };
const DESC_W = 440 - M;
const ACCENT = '#17544f';
const PAID = '#15803d';

/** A day as the reader's language writes it ("Oct 15, 2026"); the text as it was when it is not a day. */
export function dayText(day: string, lang = language()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  try {
    return new Intl.DateTimeFormat(lang, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])));
  } catch {
    return day;
  }
}

/** A number as typed, tidied for print: "1.50" stays, "  2 " is "2". */
const shown = (s: string) => s.trim();

function invoicePages(inv: Invoice, opts: { small?: boolean } = {}): Page[] {
  const sums = totals(inv);
  const money = (n: number) => formatMoney(n, inv.currency || '$');
  const pages: Page[] = [];
  let svg = '';
  let y = 0;
  const alt: string[] = [];

  const tableHead = () => {
    y += 8;
    svg += text(M, y, pt('Description').toUpperCase(), { px: 11, bold: true, fill: MUTED });
    svg += text(COL.unit, y, pt('Unit').toUpperCase(), { px: 11, bold: true, fill: MUTED, anchor: 'end' });
    svg += text(COL.qty, y, pt('Qty').toUpperCase(), { px: 11, bold: true, fill: MUTED, anchor: 'end' });
    svg += text(COL.rate, y, pt('Rate').toUpperCase(), { px: 11, bold: true, fill: MUTED, anchor: 'end' });
    svg += text(COL.amount, y, pt('Amount').toUpperCase(), { px: 11, bold: true, fill: MUTED, anchor: 'end' });
    y += 10;
    svg += `<line x1="${M}" x2="${W - M}" y1="${y}" y2="${y}" stroke="${INK}"/>`;
  };
  const newPage = () => {
    pages.push({ w: W, h: H, svg });
    svg = '';
    y = M;
    svg += text(M, y, clip(`${nameOf(inv.from)}${inv.number ? ` · ${pt('Invoice {number}', { number: inv.number })}` : ''}`, W - 2 * M, 12), { px: 12, fill: MUTED });
    y += 28;
    tableHead();
  };

  // The sender, on the left.
  y = M + 6;
  const from = inv.from.split('\n').filter((l) => l.trim());
  if (from.length) {
    svg += text(M, y, clip(from[0], 420, 22, true), { px: 22, bold: true });
    from.slice(1, 6).forEach((l, i) => (svg += text(M, y + 26 + i * 18, clip(l, 420, 13), { px: 13, fill: MUTED })));
    alt.push(from.join(', '));
  } else svg += text(M, y, pt('Your business'), { px: 22, bold: true, fill: FAINT });
  const leftEnd = y + 26 + Math.max(0, from.length - 1) * 18;

  // The invoice's word, number and days, on the right.
  svg += text(W - M, M + 10, pt('INVOICE'), { px: 32, bold: true, anchor: 'end' });
  const meta: [string, string][] = [
    [pt('Invoice #'), inv.number],
    [pt('Issued'), dayText(inv.date)],
    [pt('Due'), dayText(inv.due)],
  ].filter(([, v]) => v) as [string, string][];
  meta.forEach(([k, v], i) => {
    const my = M + 44 + i * 20;
    svg += text(W - M - 130, my, k.toUpperCase(), { px: 11, bold: true, fill: MUTED, anchor: 'end' });
    svg += text(W - M, my, clip(v, 120, 13), { px: 13, anchor: 'end' });
  });
  alt.push([pt('Invoice {number}', { number: inv.number }), ...meta.slice(1).map(([k, v]) => `${k} ${v}`)].join(', '));
  y = Math.max(leftEnd, M + 44 + meta.length * 20) + 14;
  svg += `<line x1="${M}" x2="${W - M}" y1="${y}" y2="${y}" stroke="${INK}" stroke-width="2"/>`;

  // The title, and who pays.
  y += 34;
  if (inv.title.trim()) {
    svg += text(M, y, clip(inv.title.trim(), W - 2 * M, 20, true), { px: 20, bold: true });
    alt.push(inv.title.trim());
    y += 34;
  }
  svg += text(M, y, pt('Bill to').toUpperCase(), { px: 11, bold: true, fill: MUTED });
  const to = inv.to.split('\n').filter((l) => l.trim());
  y += 22;
  if (to.length) {
    svg += text(M, y, clip(to[0], W - 2 * M, 15, true), { px: 15, bold: true });
    to.slice(1, 6).forEach((l) => {
      y += 19;
      svg += text(M, y, clip(l, W - 2 * M, 13), { px: 13, fill: MUTED });
    });
    alt.push(`${pt('Bill to')}: ${to.join(', ')}`);
  } else svg += text(M, y, pt('Who pays'), { px: 15, fill: FAINT });
  y += 36;

  // The lines.
  tableHead();
  inv.lines.forEach((l, i) => {
    const rows = wrapText(l.desc.trim() || '—', DESC_W, 13);
    const h = 14 + rows.length * 18;
    if (y + h > H - M - 20) {
      if (opts.small) return;
      newPage();
    }
    y += 22;
    rows.forEach((row, k) => (svg += text(M, y + k * 18, row, { px: 13, fill: l.desc.trim() ? INK : FAINT })));
    svg += text(COL.unit, y, clip(l.unit, 80, 13), { px: 13, fill: MUTED, anchor: 'end' });
    svg += text(COL.qty, y, clip(shown(l.qty), 80, 13), { px: 13, anchor: 'end' });
    svg += text(COL.rate, y, clip(l.rate.trim() ? money(amount(l.rate) || 0) : '', 90, 13), { px: 13, anchor: 'end' });
    svg += text(COL.amount, y, money(sums.lines[i]), { px: 13, anchor: 'end' });
    y += (rows.length - 1) * 18 + 10;
    svg += `<line x1="${M}" x2="${W - M}" y1="${y}" y2="${y}" stroke="${LINE}"/>`;
    alt.push(`${l.desc}: ${shown(l.qty)} ${l.unit} × ${l.rate} = ${money(sums.lines[i])}`);
  });
  if (!inv.lines.length) {
    y += 22;
    svg += text(M, y, pt('No lines yet'), { px: 13, fill: FAINT });
    y += 10;
  }

  // The sums, on the right.
  const sumRows: [string, string][] = [[pt('Subtotal'), money(sums.subtotal)]];
  if (sums.rate) sumRows.push([pt('Tax ({rate}%)', { rate: String(sums.rate) }), money(sums.tax)]);
  if (y + 40 + sumRows.length * 22 + 70 > H - M && !opts.small) newPage();
  y += 30;
  sumRows.forEach(([k, v]) => {
    svg += text(COL.rate, y, k, { px: 13, fill: MUTED, anchor: 'end' });
    svg += text(COL.amount, y, v, { px: 13, anchor: 'end' });
    y += 22;
  });
  svg += `<line x1="${COL.unit - 60}" x2="${W - M}" y1="${y - 8}" y2="${y - 8}" stroke="${INK}" stroke-width="2"/>`;
  y += 18;
  svg += text(COL.rate, y, pt('Total due'), { px: 16, bold: true, anchor: 'end' });
  svg += text(COL.amount, y, money(sums.total), { px: 22, bold: true, fill: ACCENT, anchor: 'end' });
  alt.push(`${pt('Total due')}: ${money(sums.total)}`);
  if (inv.due && !inv.paid) {
    y += 22;
    svg += text(COL.rate, y, pt('Pay by').toUpperCase(), { px: 11, bold: true, fill: MUTED, anchor: 'end' });
    svg += text(COL.amount, y, dayText(inv.due), { px: 13, fill: MUTED, anchor: 'end' });
  }

  // Paid: a stamp beside the sums.
  if (inv.paid) {
    const sx = M + 150;
    const sy = y - 40;
    svg += `<g transform="rotate(-8 ${sx} ${sy})" opacity="0.85">${rect(sx - 110, sy - 34, 220, 64, 'none', `stroke="${PAID}" stroke-width="3" rx="8"`)}${text(sx, sy + 2, pt('PAID'), { px: 30, bold: true, fill: PAID, anchor: 'middle' })}${text(sx, sy + 22, dayText(inv.paid), { px: 12, bold: true, fill: PAID, anchor: 'middle' })}</g>`;
    alt.push(`${pt('Paid')} ${dayText(inv.paid)}`);
  }

  // The notes.
  const notes = inv.notes.trim();
  if (notes && !opts.small) {
    const rows = notes.split('\n').flatMap((p) => wrapText(p, W - 2 * M, 12));
    if (y + 50 + rows.length * 17 > H - M) newPage();
    y += 40;
    svg += rect(M, y, W - 2 * M, 1, SHADE);
    y += 26;
    svg += text(M, y, pt('Notes').toUpperCase(), { px: 11, bold: true, fill: MUTED });
    rows.forEach((row) => {
      y += 17;
      if (y > H - M) return;
      svg += text(M, y, row, { px: 12, fill: MUTED });
    });
    alt.push(notes);
  }

  pages.push({ w: W, h: H, svg });
  pages[0].alt = alt.join('. ');
  return opts.small ? pages.slice(0, 1) : pages;
}

export const invoiceView = (doc: Doc, opts: { small?: boolean } = {}): Page[] => invoicePages(readInvoice(doc), opts);
