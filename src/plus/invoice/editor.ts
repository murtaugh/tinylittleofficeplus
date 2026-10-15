/**
 * <plus-invoice-editor>: the Invoicer. The invoice as a sheet of paper whose every part is a field: the business at
 * the top left, the number and the days at the top right, the title, who pays (picked from the clients kept, or typed
 * and kept), the lines with their amounts worked out as they are typed, the tax and the sums, the notes. The bar:
 * the business's details, the ledger of invoices kept, Duplicate as next, Email, Mark as paid, Undo and Redo. Print
 * and the PDF are the shell's (Download, Mod+P), from view.ts.
 *
 * Every change is the invoice read, changed and written back as operations (model.ts opsTo), so Undo puts back
 * exactly what was, and a burst of typing in one field is one step. A field shows what the person typed while they
 * type it: Lit sets a field's value only when the document's differs from what it last set, so a space at a line's end
 * or a new line in an address, which the document tidies away, is never taken from under the caret.
 */
import { html, nothing, type PropertyDeclarations, type TemplateResult } from 'lit';
import { BadgeCheck, CopyPlus, Files, Mail, Plus, Store, UserPlus, X } from 'lucide';
import { DocElement } from '../../kit/core/element.ts';
import { tool } from '../../kit/ui/bar.ts';
import { icon } from '../../kit/draw/icons.ts';
import { toast } from '../../kit/core/say.ts';
import { routeHash } from '../../kit/core/route.ts';
import { encodeDoc } from '../../kit/core/codec.ts';
import { saveFile } from '../../kit/file/exports.ts';
import { formatMoney, write, type Doc } from '../../doc/index.ts';
import type { ToDialog } from '../../kit/ui/dialog.ts';
import { ID } from './def.ts';
import { keptInvoices, owed } from './ledger.ts';
import { addDays, emptyLine, invoiceText, nameOf, numberFor, opsTo, readInvoice, statusOf, today, totals, UNITS, type Invoice, type Line, type Status } from './model.ts';
import { backup, business, clients, forgetClient, lasting, restore, saveClient, setBusiness, type Business, type Client } from './profile.ts';
import { dayText } from './view.ts';
import { pt } from './words.ts';
import '../../kit/ui/bar.ts';
import '../../kit/ui/dialog.ts';
import css from './style.css?inline';

// The Invoicer's rules, adopted by the page when the editor first loads: kept out of upstream's one stylesheet, so its
// budget (budgets.json) and an upstream merge never meet them.
if (typeof document !== 'undefined' && 'adoptedStyleSheets' in document) {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
}

export const tag = 'plus-invoice-editor';

/** The longest link a mail draft carries; past it the draft says the PDF is attached instead. */
const MAIL_LINK_MAX = 1800;
/**
 * The address a mail draft links an invoice at: the build's VITE_PLUS_INVOICE_SITE where it names one (a name of the
 * business's own that redirects to the site, the document after the "#" carried through), else the page's own.
 */
const INVOICE_SITE = (import.meta.env?.VITE_PLUS_INVOICE_SITE as string | undefined) || '';

const statusWords = (s: Status): string => ({ paid: pt('Paid'), overdue: pt('Overdue'), open: pt('Open'), draft: pt('Draft') })[s];

export class PlusInvoiceEditor extends DocElement<Invoice> {
  static properties: PropertyDeclarations = { biz: { state: true }, kept: { state: true } };
  /** The business's details as the dialog edits them, before Save. */
  declare biz: Business;
  /** The ledger's list, read as it opens. */
  declare kept: ReturnType<typeof keptInvoices>;

  constructor() {
    super();
    this.biz = business();
    this.kept = [];
  }

  protected read(doc: Doc): Invoice {
    return readInvoice(doc);
  }

  /** The invoice with these fields changed; `key` makes a burst of typing in one field one undo. */
  change(patch: Partial<Invoice>, key?: string) {
    this.edit(opsTo(this.doc, { ...this.view, ...patch }), key);
  }
  setLine(i: number, patch: Partial<Line>, key?: string) {
    this.change({ lines: this.view.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }, key);
  }
  async addLine() {
    this.change({ lines: [...this.view.lines, emptyLine()] });
    await this.updateComplete;
    this.querySelectorAll<HTMLTextAreaElement>('.inv-line .inv-desc')[this.view.lines.length - 1]?.focus();
  }
  removeLine(i: number) {
    this.change({ lines: this.view.lines.filter((_, j) => j !== i) });
  }

  /** Where a person starts: who it is from, while that is empty; else who pays; else the first line. */
  focusFirst() {
    const v = this.view;
    const sel = !v.from.trim() ? '.inv-from' : !v.to.trim() ? '.inv-to' : '.inv-line .inv-desc';
    this.querySelector<HTMLElement>(sel)?.focus({ preventScroll: true });
  }

  /* ---------- the bar's acts ---------- */

  togglePaid() {
    this.change({ paid: this.view.paid ? '' : today() });
    toast(this.view.paid ? pt('Marked as paid') : pt('Marked as owed'));
  }

  /** A new invoice from this one: the next number, dated today, due as far off as this one was, not paid. */
  duplicateNext() {
    const v = this.view;
    const used = [...keptInvoices(ID).map((k) => k.inv.number), v.number];
    const date = today();
    const gap = v.date && v.due ? Math.round((Date.parse(v.due) - Date.parse(v.date)) / 864e5) : business().terms;
    const next = { ...v, number: numberFor(v.number || business().start, used), date, due: addDays(date, Number.isFinite(gap) ? gap : business().terms), paid: '' };
    location.hash = routeHash(ID, encodeDoc(invoiceText(next)));
    toast(pt('Invoice {number}, ready to change', { number: next.number }));
  }

  /** The person's mail app, with a draft to whoever pays: what it is for, how much, by when, and the link to read it. */
  email() {
    const v = this.view;
    const total = formatMoney(totals(v).total, v.currency || '$');
    const link = new URL(INVOICE_SITE || location.href);
    link.hash = routeHash(ID, encodeDoc(write(this.doc)), '', true);
    const subject = v.title.trim() || pt('Invoice {number}', { number: v.number });
    const due = v.due ? pt('due {day}', { day: dayText(v.due) }) : pt('due on receipt');
    const body = [
      pt('Hello,'),
      '',
      pt('Here is invoice {number} for {total}, {due}.', { number: v.number, total, due }),
      '',
      link.href.length <= MAIL_LINK_MAX ? pt('You can read and print it here: {link}', { link: link.href }) : pt('The invoice is attached as a PDF.'),
      '',
      pt('Thank you,'),
      nameOf(v.from),
    ].join('\n');
    const to = v.email
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .join(',');
    window.location.href = `mailto:${encodeURIComponent(to).replace(/%40/g, '@').replace(/%2C/g, ',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    if (link.href.length > MAIL_LINK_MAX) toast(pt('Draft opened: attach the PDF from Download'));
  }

  /* ---------- the clients ---------- */

  pickClient(i: number) {
    const c = clients()[i];
    if (c) this.change({ to: c.to, email: c.email });
  }
  keepClient() {
    const v = this.view;
    if (!nameOf(v.to)) return toast(pt('Type who pays first'));
    saveClient({ to: v.to, email: v.email });
    this.requestUpdate();
    toast(lasting() ? pt('{name} is kept as a client', { name: nameOf(v.to) }) : pt('{name} is kept for this visit; turn on Save in browser to keep clients', { name: nameOf(v.to) }));
  }

  /* ---------- the dialogs ---------- */

  private dialog = (cls: string) => this.querySelector<ToDialog>(`to-dialog.${cls}`);

  openBusiness() {
    this.biz = business();
    void this.dialog('inv-business-dialog')?.show();
  }
  saveBusiness(e: Event) {
    e.preventDefault();
    setBusiness(this.biz);
    // An invoice with no sender yet takes the business's details at once.
    if (!this.view.from.trim()) this.change({ from: this.biz.from, currency: this.biz.currency, tax: this.biz.tax, notes: this.view.notes || this.biz.notes });
    this.dialog('inv-business-dialog')?.close();
    toast(lasting() ? pt('Your business details are kept on this device') : pt('Kept for this visit; turn on Save in browser to keep them'));
  }
  async backupFile() {
    await saveFile(`invoicer-${today()}.json`, 'application/json', backup(), false);
  }
  async restoreFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (restore(await file.text())) {
      this.biz = business();
      toast(pt('Your business and clients are back'));
    } else toast(pt('That file is not an Invoicer backup'));
  }
  openLedger() {
    this.kept = keptInvoices(ID);
    void this.dialog('inv-ledger-dialog')?.show();
  }

  /* ---------- drawing ---------- */

  private field(label: string, value: string, set: (v: string) => void, opts: { cls?: string; type?: string; multi?: boolean; placeholder?: string; mode?: string } = {}): TemplateResult {
    const on = (e: Event) => set((e.target as HTMLInputElement).value);
    return opts.multi
      ? html`<textarea class=${opts.cls ?? ''} aria-label=${label} placeholder=${opts.placeholder ?? ''} rows="3" .value=${value} @input=${on}></textarea>`
      : html`<input class=${opts.cls ?? ''} type=${opts.type ?? 'text'} inputmode=${opts.mode ?? nothing} aria-label=${label} placeholder=${opts.placeholder ?? ''} .value=${value} @input=${on} />`;
  }

  private lineRow(l: Line, i: number, amount: number): TemplateResult {
    const n = i + 1;
    return html`<tr class="inv-line">
      <td><textarea class="inv-desc" rows="1" aria-label=${pt('Line {n}: description', { n })} placeholder=${pt('What you did')} .value=${l.desc} @input=${(e: Event) => this.setLine(i, { desc: (e.target as HTMLTextAreaElement).value }, `l${i}d`)}></textarea></td>
      <td><input class="inv-unit" list="inv-units" aria-label=${pt('Line {n}: unit', { n })} .value=${l.unit} @input=${(e: Event) => this.setLine(i, { unit: (e.target as HTMLInputElement).value }, `l${i}u`)} /></td>
      <td class="inv-num"><input inputmode="decimal" aria-label=${pt('Line {n}: quantity', { n })} .value=${l.qty} @input=${(e: Event) => this.setLine(i, { qty: (e.target as HTMLInputElement).value }, `l${i}q`)} /></td>
      <td class="inv-num"><input inputmode="decimal" aria-label=${pt('Line {n}: rate', { n })} .value=${l.rate} @input=${(e: Event) => this.setLine(i, { rate: (e.target as HTMLInputElement).value }, `l${i}r`)} /></td>
      <td class="inv-num inv-amount">${formatMoney(amount, this.view.currency || '$')}</td>
      <td><button type="button" class="to-btn to-tool inv-remove" aria-label=${pt('Remove line {n}', { n })} title=${pt('Remove line {n}', { n })} @click=${() => this.removeLine(i)}>${icon(X, 16)}</button></td>
    </tr>`;
  }

  private businessDialog(): TemplateResult {
    const b = this.biz;
    const set = (patch: Partial<Business>) => (this.biz = { ...this.biz, ...patch });
    const kept = clients();
    return html`<form class="inv-form" @submit=${(e: Event) => this.saveBusiness(e)}>
      <p class="inv-note">${lasting() ? pt('Kept in this browser, and filled into every new invoice. Nothing is sent anywhere.') : pt('Save in browser is off, so these are kept for this visit only. Turn it on in the menu to keep them.')}</p>
      <label class="inv-label"><span>${pt('Your name and address')}</span><textarea rows="4" .value=${b.from} placeholder=${pt('Business name, then address, phone and email')} @input=${(e: Event) => set({ from: (e.target as HTMLTextAreaElement).value })}></textarea></label>
      <div class="inv-pair">
        <label class="inv-label"><span>${pt('Currency')}</span><input .value=${b.currency} maxlength="3" @input=${(e: Event) => set({ currency: (e.target as HTMLInputElement).value })} /></label>
        <label class="inv-label"><span>${pt('Days to pay')}</span><input inputmode="numeric" .value=${String(b.terms)} @input=${(e: Event) => set({ terms: Number((e.target as HTMLInputElement).value) })} /></label>
      </div>
      <div class="inv-pair">
        <label class="inv-label"><span>${pt('Tax %')}</span><input inputmode="decimal" .value=${b.tax} @input=${(e: Event) => set({ tax: (e.target as HTMLInputElement).value })} /></label>
        <label class="inv-label"><span>${pt('First invoice number')}</span><input .value=${b.start} @input=${(e: Event) => set({ start: (e.target as HTMLInputElement).value })} /></label>
      </div>
      <label class="inv-label"><span>${pt('Notes on every invoice')}</span><textarea rows="3" .value=${b.notes} @input=${(e: Event) => set({ notes: (e.target as HTMLTextAreaElement).value })}></textarea></label>
      <div class="inv-actions"><button type="submit" class="to-btn primary">${pt('Save')}</button></div>
      <h3 class="inv-sub">${pt('Clients')}</h3>
      ${
        kept.length
          ? html`<ul class="inv-clients">
            ${kept.map((c: Client) => html`<li><span>${nameOf(c.to)}${c.email ? html` <small>${c.email}</small>` : nothing}</span><button type="button" class="to-btn" @click=${() => (forgetClient(c), this.requestUpdate())}>${pt('Forget')}</button></li>`)}
          </ul>`
          : html`<p class="inv-note">${pt('None yet. Type who pays on an invoice, then Keep client.')}</p>`
      }
      <h3 class="inv-sub">${pt('Backup')}</h3>
      <p class="inv-note">${pt('Your business and clients as a file, to keep or to move to another browser. Localhost Invoicer’s backups open here too.')}</p>
      <div class="inv-actions">
        <button type="button" class="to-btn" @click=${() => void this.backupFile()}>${pt('Download backup')}</button>
        <label class="to-btn inv-file">${pt('Open a backup…')}<input type="file" accept="application/json,.json" @change=${(e: Event) => void this.restoreFile(e)} /></label>
      </div>
    </form>`;
  }

  private ledgerDialog(): TemplateResult {
    if (!lasting()) return html`<p class="inv-note">${pt('Turn on Save in browser in the menu, and every invoice you make is listed here: what is paid, what is owed, and what is late.')}</p>`;
    if (!this.kept.length) return html`<p class="inv-note">${pt('No invoices kept yet. The ones you make from now on are listed here.')}</p>`;
    const sums = owed(this.kept);
    return html`${
      sums.length
        ? html`<p class="inv-owed">${sums.map((s) => html`<span>${pt('Owed: {amount}', { amount: formatMoney(s.open, s.currency) })}${s.overdue ? html` · <b>${pt('late: {amount}', { amount: formatMoney(s.overdue, s.currency) })}</b>` : nothing}</span>`)}</p>`
        : html`<p class="inv-owed">${pt('Nothing is owed.')}</p>`
    }
      <table class="inv-ledger">
        <thead>
          <tr>
            <th>${pt('Invoice #')}</th>
            <th>${pt('Bill to')}</th>
            <th>${pt('Due')}</th>
            <th class="inv-num">${pt('Total')}</th>
            <th>${pt('Status')}</th>
          </tr>
        </thead>
        <tbody>
          ${this.kept.map(
            (k) =>
              html`<tr>
                <td><a href=${k.hash} @click=${() => this.dialog('inv-ledger-dialog')?.close()}>${k.inv.number || '—'}</a></td>
                <td>${nameOf(k.inv.to) || '—'}</td>
                <td>${k.inv.due ? dayText(k.inv.due) : '—'}</td>
                <td class="inv-num">${formatMoney(k.total, k.inv.currency || '$')}</td>
                <td><span class="inv-status inv-${k.status}">${statusWords(k.status)}</span></td>
              </tr>`,
          )}
        </tbody>
      </table>`;
  }

  render() {
    const v = this.view;
    const sums = totals(v);
    const money = (n: number) => formatMoney(n, v.currency || '$');
    const status = statusOf(v);
    const kept = clients();
    return html`<to-bar class="inv-bar">
        ${tool({ label: pt('Your business'), icon: Store, does: () => this.openBusiness() })} ${tool({ label: pt('Invoices'), icon: Files, does: () => this.openLedger() })}
        ${tool({ label: pt('Duplicate as next'), icon: CopyPlus, does: () => this.duplicateNext() })} ${tool({ label: pt('Email'), icon: Mail, does: () => this.email() })}
        ${tool({ label: pt('Mark as paid'), icon: BadgeCheck, pressed: !!v.paid, does: () => this.togglePaid() })} ${this.undoTools()}
      </to-bar>
      <div class="inv">
        <article class="inv-paper">
          <header class="inv-head">
            <div class="inv-from-block">${this.field(pt('From: your name and address'), v.from, (x) => this.change({ from: x }, 'from'), { cls: 'inv-from', multi: true, placeholder: pt('Your business name, then its address') })}</div>
            <div class="inv-meta">
              <p class="inv-word">${pt('INVOICE')}${status === 'paid' || status === 'overdue' ? html` <span class="inv-status inv-${status}">${statusWords(status)}</span>` : nothing}</p>
              <label><span>${pt('Invoice #')}</span>${this.field(pt('Invoice #'), v.number, (x) => this.change({ number: x }, 'number'), { cls: 'inv-number' })}</label>
              <label><span>${pt('Issued')}</span>${this.field(pt('Issued'), v.date, (x) => this.change({ date: x }, 'date'), { type: 'date' })}</label>
              <label><span>${pt('Due')}</span>${this.field(pt('Due'), v.due, (x) => this.change({ due: x }, 'due'), { type: 'date' })}</label>
              ${v.paid ? html`<label><span>${pt('Paid')}</span>${this.field(pt('Paid'), v.paid, (x) => this.change({ paid: x }, 'paid'), { type: 'date' })}</label>` : nothing}
            </div>
          </header>
          <label class="inv-title"><span>${pt('Title')}</span>${this.field(pt('Title'), v.title, (x) => this.change({ title: x }, 'title'), { placeholder: pt('What this invoice is for') })}</label>
          <section class="inv-to-block">
            <div class="inv-to-bar">
              <span class="inv-eyebrow">${pt('Bill to')}</span>
              ${
                kept.length
                  ? html`<select aria-label=${pt('Clients')} @change=${(e: Event) => (this.pickClient(Number((e.target as HTMLSelectElement).value)), ((e.target as HTMLSelectElement).value = ''))}>
                    <option value="">${pt('Clients…')}</option>
                    ${kept.map((c, i) => html`<option value=${String(i)}>${nameOf(c.to)}</option>`)}
                  </select>`
                  : nothing
              }
              <button type="button" class="to-btn inv-keep-client" @click=${() => this.keepClient()}>${icon(UserPlus, 16)}<span>${pt('Keep client')}</span></button>
            </div>
            ${this.field(pt('Bill to: name and address'), v.to, (x) => this.change({ to: x }, 'to'), { cls: 'inv-to', multi: true, placeholder: pt('Who pays, then their address') })}
            ${this.field(pt('Their email'), v.email, (x) => this.change({ email: x }, 'email'), { cls: 'inv-email', type: 'email', placeholder: pt('Their email, for Email') })}
          </section>
          <table class="inv-lines">
            <thead>
              <tr>
                <th>${pt('Description')}</th>
                <th class="inv-unit-h">${pt('Unit')}</th>
                <th class="inv-num">${pt('Qty')}</th>
                <th class="inv-num">${pt('Rate')}</th>
                <th class="inv-num">${pt('Amount')}</th>
                <th><span class="inv-hidden">${pt('Remove')}</span></th>
              </tr>
            </thead>
            <tbody>
              ${v.lines.map((l, i) => this.lineRow(l, i, sums.lines[i]))}
            </tbody>
          </table>
          <datalist id="inv-units">${UNITS.map((u) => html`<option value=${u}></option>`)}</datalist>
          <button type="button" class="to-btn inv-add" @click=${() => void this.addLine()}>${icon(Plus, 16)}<span>${pt('Add a line')}</span></button>
          <div class="inv-foot">
            <div class="inv-settings">
              <label><span>${pt('Currency')}</span>${this.field(pt('Currency'), v.currency, (x) => this.change({ currency: x }, 'currency'), { cls: 'inv-currency' })}</label>
              <label><span>${pt('Tax %')}</span>${this.field(pt('Tax %'), v.tax, (x) => this.change({ tax: x }, 'tax'), { cls: 'inv-tax', mode: 'decimal', placeholder: '0' })}</label>
            </div>
            <dl class="inv-sums">
              <dt>${pt('Subtotal')}</dt>
              <dd>${money(sums.subtotal)}</dd>
              ${sums.rate ? html`<dt>${pt('Tax ({rate}%)', { rate: String(sums.rate) })}</dt><dd>${money(sums.tax)}</dd>` : nothing}
              <dt class="inv-total">${pt('Total due')}</dt>
              <dd class="inv-total">${money(sums.total)}</dd>
            </dl>
          </div>
          <label class="inv-notes"><span class="inv-eyebrow">${pt('Notes')}</span>${this.field(pt('Notes'), v.notes, (x) => this.change({ notes: x }, 'notes'), { multi: true, placeholder: pt('Terms, how to pay, a word of thanks') })}</label>
        </article>
      </div>
      <to-dialog class="inv-business-dialog" heading=${pt('Your business')} .body=${this.businessDialog()}></to-dialog>
      <to-dialog class="inv-ledger-dialog" heading=${pt('Invoices')} .body=${this.ledgerDialog()}></to-dialog>`;
  }
}

if (!customElements.get(tag)) customElements.define(tag, PlusInvoiceEditor);

declare global {
  interface HTMLElementTagNameMap {
    'plus-invoice-editor': PlusInvoiceEditor;
  }
}
