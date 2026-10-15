// The Invoicer's document, sums, numbers and days, its templates and its paper, and the business kept on the device.
import { describe, expect, test } from 'vitest';
import { applyAll, evaluateTable, parse, tableAt, write } from '../../../doc/index.ts';
import { addDays, amount, asWrite, invoiceText, nextNumber, numberFor, opsTo, readText, statusOf, totals, type Invoice } from '../model.ts';
import { templates } from '../templates.ts';
import { invoiceView } from '../view.ts';
import { backup, business, clients, restore } from '../profile.ts';
import def, { freshInvoice } from '../def.ts';

const INV: Invoice = {
  title: 'October wash and fold',
  number: '1042',
  date: '2026-10-01',
  due: '2026-10-16',
  paid: '',
  currency: '$',
  tax: '8.875',
  from: 'Steinway Suds\n31-05 Steinway St\nAstoria, NY 11103',
  to: 'Café Brava\n45-10 Broadway',
  email: 'billing@cafebrava.example',
  lines: [
    { desc: 'Wash and fold: linens', unit: 'lb', qty: '112', rate: '1.75' },
    { desc: 'Pickup and delivery', unit: 'flat', qty: '4', rate: '10' },
  ],
  notes: 'Payment due within 15 days.\nThank you!',
};

describe('the document', () => {
  test('an invoice is written as TLO and read back the same', () => {
    const text = invoiceText(INV);
    expect(text).toContain('from: Steinway Suds | 31-05 Steinway St | Astoria, NY 11103');
    expect(text).toContain('Description | Unit | Qty:number | Rate:money');
    expect(readText(text)).toEqual(INV);
  });
  test('the text is the kernel’s canonical text: written again, it is the same bytes', () => {
    const text = invoiceText(INV);
    expect(write(parse(text))).toBe(text);
  });
  test('read leniently: a table of other names, other blocks, and no head at all', () => {
    const inv = readText('Item | Price:money | Quantity:number\n--- | --- | ---\nSoap | 3 | 2\n\n# A heading\n\nSome words.');
    expect(inv.lines).toEqual([{ desc: 'Soap', unit: '', qty: '2', rate: '3' }]);
    expect(inv.notes).toBe('A heading\n\nSome words.');
    expect(inv.currency).toBe('$');
    expect(readText('').lines).toEqual([]);
  });
  test('the operations to a changed invoice make its text, keep a head key it does not know, and undo exactly', () => {
    const before = parse(invoiceText(INV).replace('---\n', '---\nby: Paul\n'));
    const next = { ...INV, to: 'Someone else', lines: [...INV.lines, { desc: 'Stain treatment', unit: 'item', qty: '3', rate: '5' }] };
    const ops = opsTo(before, next);
    const after = applyAll(before, ops);
    expect(after.head.by).toBe('Paul');
    expect(readText(write(after))).toEqual(next);
    expect(opsTo(after, next)).toEqual([]);
  });
  test('an address keeps its lines, blank ones dropped and a pipe made a slash', () => {
    expect(readText(invoiceText({ ...INV, from: 'A | B\n\n  C  \n' })).from).toBe('A / B\nC');
  });
});

describe('the sums', () => {
  test('each line, the subtotal, the tax and the total, to the cent', () => {
    expect(totals(INV)).toEqual({ lines: [196, 40], subtotal: 236, rate: 8.875, tax: 20.95, total: 256.95 });
  });
  test('a number as a person types it', () => {
    expect(amount('$1,250.50')).toBe(1250.5);
    expect(amount(' 3 ')).toBe(3);
    expect(amount('')).toBeNaN();
    expect(totals({ ...INV, tax: '', lines: [{ desc: '', unit: '', qty: 'two', rate: '5' }] }).total).toBe(0);
  });
  test('the Word Processor’s invoice works out to the same total', () => {
    const doc = parse(asWrite(INV, 'Invoice'));
    expect(write(doc)).toBe(asWrite(INV, 'Invoice'));
    const at = doc.blocks.findIndex((b) => b.k === 'table');
    const values = evaluateTable(tableAt(doc, at)!).values;
    expect(values[values.length - 1][4]).toBeCloseTo(totals(INV).total, 2);
    expect(doc.head.from).toBe('Steinway Suds | 31-05 Steinway St | Astoria, NY 11103');
  });
});

describe('numbers and days', () => {
  test('the next number keeps its prefix and its width', () => {
    expect(nextNumber('1042')).toBe('1043');
    expect(nextNumber('INV-0099')).toBe('INV-0100');
    expect(nextNumber('2026-007a')).toBe('2026-008a');
    expect(nextNumber('')).toBe('1001');
  });
  test('a new invoice takes the start, or the one after the highest used with the same prefix', () => {
    expect(numberFor('1001', [])).toBe('1001');
    expect(numberFor('1001', ['1001', '1007', '1003'])).toBe('1008');
    expect(numberFor('INV-001', ['INV-004', '9999'])).toBe('INV-005');
    expect(numberFor('2000', ['1500'])).toBe('2000');
  });
  test('days on, and where an invoice stands', () => {
    expect(addDays('2026-12-25', 15)).toBe('2027-01-09');
    expect(addDays('soon', 1)).toBe('');
    expect(statusOf(INV, '2026-10-10')).toBe('open');
    expect(statusOf(INV, '2026-10-17')).toBe('overdue');
    expect(statusOf({ ...INV, paid: '2026-10-20' }, '2026-11-01')).toBe('paid');
    expect(statusOf({ ...INV, to: '', lines: [] })).toBe('draft');
  });
});

describe('the app', () => {
  test('every template is canonical and drawn on paper, its first page the size of a letter', async () => {
    for (const tpl of await def.templates()) {
      expect(write(parse(tpl.doc)), tpl.id).toBe(tpl.doc);
      const pages = def.view(tpl.doc);
      expect(pages[0]).toMatchObject({ w: 816, h: 1056 });
      expect(pages[0].alt, tpl.id).toContain(readText(tpl.doc).number);
    }
    expect(templates().map((t) => t.id)).toEqual(['laundry', 'hours', 'retainer']);
  });
  test('lines past a page go on to the next; a thumbnail is the first page alone', () => {
    const many = { ...INV, lines: Array.from({ length: 60 }, (_, i) => ({ desc: `Line ${i + 1}`, unit: 'lb', qty: '1', rate: '1' })) };
    const text = invoiceText(many);
    expect(invoiceView(parse(text)).length).toBeGreaterThan(1);
    expect(invoiceView(parse(text), { small: true }).length).toBe(1);
    expect(invoiceView(parse(text)).at(-1)!.svg).toContain('Line 60');
  });
  test('the paid stamp, and the title and retitle', () => {
    const text = invoiceText({ ...INV, paid: '2026-10-20' });
    expect(def.view(text)[0].svg).toContain('PAID');
    expect(def.title(def.retitle(text, 'New name'))).toBe('New name');
  });
  test('a blank invoice is the business’s, dated today, due after its terms', () => {
    const inv = readText(freshInvoice());
    expect(inv.number).toBe(business().start);
    expect(inv.lines).toHaveLength(1);
    expect(inv.due).toBe(addDays(inv.date, business().terms));
  });
  test('the hand-off to the Word Processor', () => {
    const [handoff] = def.handoffs!;
    expect(handoff.to).toBe('write');
    expect(handoff.convert(invoiceText(INV))).toContain('=SUM(E1:E3)');
  });
});

describe('the business and the clients, on the device', () => {
  test('a backup is read back, and so is one of Localhost Invoicer’s', () => {
    expect(
      restore(
        '{"business":{"name":"Suds","addr":"1 Main St","sym":"€","termsDays":30,"notes":"Thanks","nextNum":"500"},"clients":[{"label":"Acme","name":"Acme Co","addr":"2 Side St","emails":"a@acme.example"}]}',
      ),
    ).toBe(true);
    expect(business()).toEqual({ from: 'Suds\n1 Main St', currency: '€', terms: 30, tax: '', notes: 'Thanks', start: '500' });
    expect(clients()).toEqual([{ to: 'Acme Co\n2 Side St', email: 'a@acme.example' }]);
    const file = backup();
    expect(restore(file)).toBe(true);
    expect(JSON.parse(backup())).toEqual(JSON.parse(file));
    expect(restore('not json')).toBe(false);
    expect(restore('{"something":"else"}')).toBe(false);
  });
});
