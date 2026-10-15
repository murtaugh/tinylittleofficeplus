// The Invoicer in a real browser: the paper from the document, the sums as a line is typed, a line added and taken
// away, one undo for a burst of typing, a space or a new line kept under the caret, paid and owed, a client kept and
// picked; and in the shell: on the home page, and a link that opens it.
import { expect, test } from 'vitest';
import '../../../styles.css';
import '../editor.ts';
import type { PlusInvoiceEditor } from '../editor.ts';
import { invoiceText, readText, type Invoice } from '../model.ts';
import { clients, forgetClient } from '../profile.ts';
import { mount, tick, until } from '../../../../test/browser/helpers.ts';
import { routeHash } from '../../../kit/core/route.ts';
import { encodeDoc } from '../../../kit/core/codec.ts';
import '../../index.ts';

const INV: Invoice = {
  title: 'October',
  number: '1042',
  date: '2026-10-01',
  due: '2026-10-16',
  paid: '',
  currency: '$',
  tax: '',
  from: 'Steinway Suds\n31-05 Steinway St',
  to: 'Café Brava',
  email: 'billing@cafebrava.example',
  lines: [{ desc: 'Wash and fold', unit: 'lb', qty: '10', rate: '1.50' }],
  notes: 'Thanks',
};

async function editor(inv: Invoice = INV) {
  document.body.innerHTML = '';
  const main = document.createElement('main');
  main.className = 'to-main';
  document.body.append(main);
  const el = document.createElement('plus-invoice-editor') as PlusInvoiceEditor;
  el.value = invoiceText(inv);
  const changes: string[] = [];
  el.addEventListener('docchange', (e) => changes.push((e as CustomEvent<string>).detail));
  main.append(el);
  await el.updateComplete;
  return { el, last: () => readText(changes.at(-1) ?? el.value) };
}
async function type(el: PlusInvoiceEditor, box: HTMLInputElement | HTMLTextAreaElement, s: string) {
  box.focus();
  box.value = s;
  box.dispatchEvent(new InputEvent('input', { bubbles: true, data: s, inputType: 'insertText' }));
  await el.updateComplete;
}
const sums = (el: HTMLElement) => [...el.querySelectorAll('.inv-sums dd')].map((d) => d.textContent!.trim());
const bar = (el: HTMLElement, label: string) => el.querySelector<HTMLButtonElement>(`to-bar button[aria-label="${label}"]`)!;

test('the paper from the document: every field, the amounts and the total', async () => {
  const { el } = await editor();
  expect(el.querySelector<HTMLTextAreaElement>('.inv-from')!.value).toBe('Steinway Suds\n31-05 Steinway St');
  expect(el.querySelector<HTMLInputElement>('.inv-number')!.value).toBe('1042');
  expect(el.querySelector<HTMLTextAreaElement>('.inv-line .inv-desc')!.value).toBe('Wash and fold');
  expect(el.querySelector('.inv-amount')!.textContent).toBe('$15.00');
  expect(sums(el)).toEqual(['$15.00', '$15.00']);
});

test('a quantity typed works the sums out; tax adds its line; a burst of typing is one undo', async () => {
  const { el, last } = await editor();
  const qty = el.querySelectorAll<HTMLInputElement>('.inv-line input[inputmode=decimal]')[0];
  await type(el, qty, '2');
  await type(el, qty, '20');
  expect(last().lines[0].qty).toBe('20');
  expect(sums(el)).toEqual(['$30.00', '$30.00']);
  await type(el, el.querySelector<HTMLInputElement>('.inv-tax')!, '10');
  expect(sums(el)).toEqual(['$30.00', '$3.00', '$33.00']);
  el.dispatchEvent(new Event('docundo', { cancelable: true }));
  el.dispatchEvent(new Event('docundo', { cancelable: true }));
  await el.updateComplete;
  expect(last().lines[0].qty).toBe('10');
  expect(last().tax).toBe('');
});

test('a line added takes the focus, a line taken away goes, and the sums follow', async () => {
  const { el, last } = await editor();
  el.querySelector<HTMLButtonElement>('.inv-add')!.click();
  await until(() => el.querySelectorAll('.inv-line').length === 2);
  await el.updateComplete;
  expect(document.activeElement).toBe(el.querySelectorAll('.inv-line .inv-desc')[1]);
  const rate = el.querySelectorAll<HTMLInputElement>('.inv-line input[inputmode=decimal]')[3];
  await type(el, rate, '5');
  expect(sums(el).at(-1)).toBe('$20.00');
  el.querySelector<HTMLButtonElement>('.inv-remove')!.click();
  await el.updateComplete;
  expect(last().lines).toEqual([{ desc: '', unit: '', qty: '1', rate: '5' }]);
  expect(sums(el).at(-1)).toBe('$5.00');
});

test('a space at the end of the notes and a new line in an address stay under the caret', async () => {
  const { el, last } = await editor();
  const notes = el.querySelector<HTMLTextAreaElement>('.inv-notes textarea')!;
  await type(el, notes, 'Thanks ');
  expect(notes.value).toBe('Thanks ');
  await type(el, notes, 'Thanks a lot');
  expect(last().notes).toBe('Thanks a lot');
  const to = el.querySelector<HTMLTextAreaElement>('.inv-to')!;
  await type(el, to, 'Café Brava\n');
  expect(to.value).toBe('Café Brava\n');
  await type(el, to, 'Café Brava\n45-10 Broadway');
  expect(last().to).toBe('Café Brava\n45-10 Broadway');
});

test('Mark as paid puts today in, and takes it out again', async () => {
  const { el, last } = await editor();
  bar(el, 'Mark as paid').click();
  await el.updateComplete;
  expect(last().paid).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(bar(el, 'Mark as paid').getAttribute('aria-pressed')).toBe('true');
  expect(el.querySelector('.inv-word .inv-paid')).not.toBeNull();
  bar(el, 'Mark as paid').click();
  await el.updateComplete;
  expect(last().paid).toBe('');
});

test('a client kept is offered on the next invoice, and picking one fills who pays', async () => {
  const { el } = await editor();
  el.querySelector<HTMLButtonElement>('.inv-keep-client')!.click();
  expect(clients().map((c) => c.to)).toContain('Café Brava');
  const next = await editor({ ...INV, to: '', email: '' });
  const pick = next.el.querySelector<HTMLSelectElement>('.inv-to-bar select')!;
  pick.value = String(clients().findIndex((c) => c.to === 'Café Brava'));
  pick.dispatchEvent(new Event('change', { bubbles: true }));
  await next.el.updateComplete;
  expect(next.last()).toMatchObject({ to: 'Café Brava', email: 'billing@cafebrava.example' });
  forgetClient({ to: 'Café Brava', email: '' });
});

test('Your business: the details saved fill an invoice that has no sender', async () => {
  const { el, last } = await editor({ ...INV, from: '' });
  bar(el, 'Your business').click();
  await until(() => !!el.querySelector('.inv-business-dialog dialog[open]'));
  const form = el.querySelector<HTMLFormElement>('.inv-form')!;
  const from = form.querySelector<HTMLTextAreaElement>('textarea')!;
  from.value = 'Steinway Suds\n31-05 Steinway St';
  from.dispatchEvent(new InputEvent('input', { bubbles: true }));
  await el.updateComplete;
  form.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
  await until(() => !el.querySelector('.inv-business-dialog dialog[open]'));
  expect(last().from).toBe('Steinway Suds\n31-05 Steinway St');
});

test('in the shell: the Invoicer is on the home page, and its link opens it', async () => {
  const home = await mount('');
  await until(() => [...home.querySelectorAll('.to-app-name')].some((n) => n.textContent === 'Invoicer'), 'the Invoicer never came on the home page');
  const shell = await mount(routeHash('invoice', encodeDoc(invoiceText(INV))));
  await until(() => !!shell.querySelector('plus-invoice-editor .inv-number'), 5000, 'the editor never opened');
  await tick();
  expect(shell.querySelector<HTMLInputElement>('plus-invoice-editor .inv-number')!.value).toBe('1042');
});
