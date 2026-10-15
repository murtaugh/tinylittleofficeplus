/**
 * Invoicer: an invoice that is its link, like every document here, made the way a small business makes them: the
 * business's name, address, terms and tax kept on this device and filled into each new invoice, the clients billed
 * before, the next number counted from the invoices kept, the sums worked out, a PDF to send, a mailto draft, and a
 * ledger of what is paid, owed and late. The document is model.ts's; the paper is view.ts's; the editor is editor.ts.
 * A plus app (src/plus/README.md): registered by src/plus/index.ts, not by upstream's registry.
 */
import { ReceiptText } from 'lucide';
import { apply, parse, write } from '../../doc/index.ts';
import { defineApp, type Doc } from '../../kit/core/app.ts';
import { keptInvoices } from './ledger.ts';
import { addDays, asWrite, emptyLine, invoiceText, numberFor, readInvoice, today } from './model.ts';
import { business } from './profile.ts';
import { invoiceView } from './view.ts';
import { pt } from './words.ts';

export const ID = 'invoice';

export const titleOf = (doc: Doc): string => parse(doc).head.title ?? '';
export const retitle = (doc: Doc, title: string): Doc => write(apply(parse(doc), { op: 'head', key: 'title', value: title.replace(/\n/g, ' ').trim() || undefined }));

/** A new invoice: the business's own details and terms, today's date, and the next number. */
export function freshInvoice(): string {
  const b = business();
  const date = today();
  return invoiceText({
    title: '',
    number: numberFor(
      b.start,
      keptInvoices(ID).map((k) => k.inv.number),
    ),
    date,
    due: addDays(date, b.terms),
    paid: '',
    currency: b.currency,
    tax: b.tax,
    from: b.from,
    to: '',
    email: '',
    lines: [emptyLine()],
    notes: b.notes,
  });
}

export default defineApp({
  id: ID,
  get name() {
    return pt('Invoicer');
  },
  get noun() {
    return pt('invoice');
  },
  get group() {
    return pt('Business');
  },
  icon: ReceiptText,
  get blurb() {
    return pt('Invoices for a small business: your details and clients kept, the sums done, a PDF to send, and who still owes.');
  },
  blank: freshInvoice,
  templates: () => import('./templates.ts').then((m) => m.templates()),
  editor: () => import('./editor.ts'),
  title: titleOf,
  retitle,
  view: (doc, opts) => invoiceView(parse(doc), { small: opts?.small }),
  handoffs: [{ to: 'write', label: () => pt('Open in the Word Processor'), convert: (doc) => asWrite(readInvoice(parse(doc)), pt('Invoice')) }],
});
