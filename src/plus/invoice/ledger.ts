/**
 * The invoices this device has kept: the site's library (kit/share/library.ts, kept only while Save in browser is on)
 * read for the Invoicer's documents, each opened from its link and summed. Nothing here is stored of its own: an
 * invoice is in the ledger because the person kept it, and leaves it when they forget it. No DOM.
 */
import { library } from '../../kit/share/library.ts';
import { parseHash } from '../../kit/core/route.ts';
import { decodeDoc } from '../../kit/core/codec.ts';
import { readText, statusOf, totals, type Invoice, type Status } from './model.ts';

export interface Kept {
  id: string;
  /** The link's "#/v1/invoice/…" part. */
  hash: string;
  inv: Invoice;
  total: number;
  status: Status;
}

/** Every invoice kept on this device, newest number first; one sealed with a password is left out (its words cannot be read). */
export function keptInvoices(app: string, on?: string): Kept[] {
  const out: Kept[] = [];
  for (const k of library()) {
    if (k.app !== app) continue;
    const route = parseHash(k.hash);
    if (route.sealed) continue;
    const text = decodeDoc(route.payload);
    if (!text) continue;
    const inv = readText(text);
    out.push({ id: k.id, hash: k.hash, inv, total: totals(inv).total, status: statusOf(inv, on) });
  }
  return out.sort((a, b) => b.inv.date.localeCompare(a.inv.date) || b.inv.number.localeCompare(a.inv.number, undefined, { numeric: true }));
}

/** What is owed across them, and how much of it is late: per currency, as they may differ. */
export function owed(list: Kept[]): { currency: string; open: number; overdue: number }[] {
  const by = new Map<string, { currency: string; open: number; overdue: number }>();
  for (const k of list) {
    if (k.status !== 'open' && k.status !== 'overdue') continue;
    const c = k.inv.currency || '$';
    const row = by.get(c) ?? { currency: c, open: 0, overdue: 0 };
    row.open += k.total;
    if (k.status === 'overdue') row.overdue += k.total;
    by.set(c, row);
  }
  return [...by.values()];
}
