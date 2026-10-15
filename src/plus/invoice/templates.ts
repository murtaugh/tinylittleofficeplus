/**
 * The Invoicer's templates: a laundromat's month of wash and fold for a restaurant, a freelancer's hours, and a
 * monthly retainer. Each is dated today, due in fifteen days, so it is ready to send once the names are yours.
 * (Laundering is a service New York does not tax, so the laundromat's has no tax line.)
 */
import type { Template } from '../../kit/core/app.ts';
import { addDays, invoiceText, today, type Invoice } from './model.ts';
import { pt } from './words.ts';

function dated(inv: Omit<Invoice, 'date' | 'due' | 'paid'>): string {
  const date = today();
  return invoiceText({ ...inv, date, due: addDays(date, 15), paid: '' });
}

export function templates(): Template[] {
  return [
    {
      id: 'laundry',
      name: pt('Wash-and-fold account'),
      blurb: pt('A laundromat’s month for a restaurant: linens by the pound, and pickup and delivery.'),
      doc: dated({
        title: pt('October wash and fold'),
        number: '1042',
        currency: '$',
        tax: '',
        from: 'Steinway Suds Laundromat\n31-05 Steinway St\nAstoria, NY 11103\n(718) 555-0142',
        to: 'Café Brava\n45-10 Broadway\nAstoria, NY 11103',
        email: 'billing@cafebrava.example',
        lines: [
          { desc: pt('Wash and fold: table linens and aprons'), unit: 'lb', qty: '112', rate: '1.75' },
          { desc: pt('Wash and fold: kitchen towels'), unit: 'lb', qty: '64', rate: '1.75' },
          { desc: pt('Pickup and delivery, Tuesdays'), unit: 'flat', qty: '4', rate: '10' },
        ],
        notes: pt('Payment due within 15 days. Zelle or check to Steinway Suds Laundromat. Thank you!'),
      }),
    },
    {
      id: 'hours',
      name: pt('Hours worked'),
      blurb: pt('A freelancer’s invoice: hours at a rate, with sales tax.'),
      doc: dated({
        title: pt('Website redesign, phase one'),
        number: '2001',
        currency: '$',
        tax: '8.875',
        from: 'Your name\nStreet and number\nCity, state and ZIP code\nyou@example.com',
        to: 'Who pays\nStreet and number\nCity, state and ZIP code',
        email: '',
        lines: [
          { desc: pt('Design'), unit: 'hours', qty: '12', rate: '150' },
          { desc: pt('Build'), unit: 'hours', qty: '20', rate: '140' },
          { desc: pt('Hosting for a year'), unit: 'flat', qty: '1', rate: '480' },
        ],
        notes: pt('Payment within 15 days by bank transfer.'),
      }),
    },
    {
      id: 'retainer',
      name: pt('Monthly retainer'),
      blurb: pt('One line, the same every month: duplicate it as the next when the month turns.'),
      doc: dated({
        title: pt('Retainer for the month'),
        number: '3001',
        currency: '$',
        tax: '',
        from: 'Your name\nStreet and number\nCity, state and ZIP code',
        to: 'Who pays\nStreet and number\nCity, state and ZIP code',
        email: '',
        lines: [{ desc: pt('Monthly retainer'), unit: 'month', qty: '1', rate: '2000' }],
        notes: pt('Thank you for your business.'),
      }),
    },
  ];
}
