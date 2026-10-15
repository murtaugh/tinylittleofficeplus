/**
 * What the Invoicer keeps on this device, beside the documents: the business (its name and address, currency, terms,
 * tax, the notes every invoice starts with, the first invoice number) and the clients billed before. Kept through
 * kit/core/store.ts, so it follows the site's privacy switch: written to the browser only while Save in browser is on,
 * held for the visit otherwise, and forgotten with everything else when Private comes back. Nothing leaves the device;
 * the backup is a file the person downloads, and gives back.
 */
import { store, keeping } from '../../kit/core/store.ts';

export interface Business {
  /** The name, then the address and contact lines. */
  from: string;
  currency: string;
  /** Days from issue to due. */
  terms: number;
  /** The tax rate in percent ('' for none). */
  tax: string;
  /** What every new invoice says at its foot. */
  notes: string;
  /** The first invoice number; after it, the one after the highest kept. */
  start: string;
}

export interface Client {
  /** The name, then the address lines. */
  to: string;
  email: string;
}

const BUSINESS = 'tinyoffice.plus.invoice.business';
const CLIENTS = 'tinyoffice.plus.invoice.clients';

const DEFAULT_BUSINESS: Business = { from: '', currency: '$', terms: 15, tax: '', notes: '', start: '1001' };

function read<T>(key: string): T | null {
  try {
    const raw = store.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

const str = (v: unknown, or = ''): string => (typeof v === 'string' ? v : or);

/** A business as kept, every field there and of its type, whatever an older version or a backup wrote. */
function tidyBusiness(b: Partial<Business> | null | undefined): Business {
  const terms = Number(b?.terms);
  return {
    from: str(b?.from),
    currency: str(b?.currency) || '$',
    terms: Number.isFinite(terms) && terms >= 0 ? Math.round(terms) : DEFAULT_BUSINESS.terms,
    tax: str(b?.tax),
    notes: str(b?.notes),
    start: str(b?.start) || DEFAULT_BUSINESS.start,
  };
}
const tidyClient = (c: Partial<Client> | null | undefined): Client | null => (c && str(c.to).trim() ? { to: str(c.to).trim(), email: str(c.email).trim() } : null);

export const business = (): Business => tidyBusiness(read<Business>(BUSINESS));
export const setBusiness = (b: Business) => store.set(BUSINESS, JSON.stringify(tidyBusiness(b)));

/** The clients, A to Z by name. */
export function clients(): Client[] {
  const list = read<Client[]>(CLIENTS);
  return (Array.isArray(list) ? list : [])
    .map(tidyClient)
    .filter((c): c is Client => !!c)
    .sort((a, b) => a.to.localeCompare(b.to));
}
const nameKey = (c: Client) => c.to.split('\n')[0].trim().toLowerCase();

/** Keep a client, in place of one of the same name. */
export function saveClient(c: Client) {
  const tidy = tidyClient(c);
  if (!tidy) return;
  store.set(CLIENTS, JSON.stringify([...clients().filter((x) => nameKey(x) !== nameKey(tidy)), tidy]));
}
export function forgetClient(c: Client) {
  store.set(CLIENTS, JSON.stringify(clients().filter((x) => nameKey(x) !== nameKey(c))));
}

/** Whether what is kept here outlasts the visit (Save in browser is on). */
export const lasting = (): boolean => keeping();

/** The business and the clients as one file's text, to download. */
export const backup = (): string => JSON.stringify({ invoicer: 1, business: business(), clients: clients() }, null, 2);

/**
 * A backup given back: the business replaced, the clients added (one of the same name replaced). Also reads
 * Localhost Invoicer's backup ({ business: { name, addr, sym, termsDays, notes, nextNum }, clients: [{ name, addr, emails }] }).
 * False when the text is not one.
 */
export function restore(text: string): boolean {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return false;
  }
  if (!data || typeof data !== 'object') return false;
  const d = data as { business?: Record<string, unknown>; clients?: unknown };
  if (!d.business && !Array.isArray(d.clients)) return false;
  if (d.business && typeof d.business === 'object') {
    const b = d.business;
    // Localhost Invoicer's fields, where they are the ones given.
    const from = 'from' in b ? str(b.from) : [str(b.name), str(b.addr)].filter(Boolean).join('\n');
    setBusiness(
      tidyBusiness({
        from,
        currency: str(b.currency) || str(b.sym),
        terms: (b.terms ?? b.termsDays) as number,
        tax: str(b.tax),
        notes: str(b.notes),
        start: str(b.start) || str(b.nextNum),
      }),
    );
  }
  if (Array.isArray(d.clients))
    for (const c of d.clients as Record<string, unknown>[]) {
      if (!c || typeof c !== 'object') continue;
      const to = 'to' in c ? str(c.to) : [str(c.name), str(c.addr)].filter(Boolean).join('\n');
      saveClient({ to, email: str(c.email) || str(c.emails) });
    }
  return true;
}
