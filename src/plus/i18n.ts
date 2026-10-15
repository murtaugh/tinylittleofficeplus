/**
 * The words of the plus apps, in the language the site is in. The site's own strings are kit/core/i18n.ts's, checked
 * against src/i18n/*.ts by scripts/i18n-extract.ts; a plus app keeps its own beside its code (src/plus/<app>/i18n/),
 * so the upstream language files are never edited by this fork. English is the key, as upstream's: pt('Bill to').
 * A language a plus app has no file for, or a key its file lacks, shows the English.
 *
 *   pt('Invoice {number}', { number })           a placeholder: {number}
 *   pt('{n|one line|# lines}', { n: 3 })          a plural: the forms in the language's own order, "#" the number
 *
 * The function is named pt, not t, on purpose: upstream's extractor reads every call of t with a quoted key in src/ as a
 * key en.ts must hold, and these are not its keys.
 */
import { language } from '../kit/core/i18n.ts';

export type PlusStrings = Record<string, string>;

const ORDER = ['zero', 'one', 'two', 'few', 'many', 'other'];

function plural(code: string, n: number, forms: string[]): string {
  let rules: Intl.PluralRules;
  try {
    rules = new Intl.PluralRules(code);
  } catch {
    rules = new Intl.PluralRules('en');
  }
  const have = ORDER.filter((c) => rules.resolvedOptions().pluralCategories.includes(c as Intl.LDMLPluralRule));
  const form = forms[have.indexOf(rules.select(n))] ?? forms[forms.length - 1];
  let num = String(n);
  try {
    num = new Intl.NumberFormat(code).format(n);
  } catch {
    // The number as JavaScript writes it.
  }
  return form.replaceAll('#', num);
}

/** A plus app's translator over its dictionaries, keyed by the site's language codes ("es", "zh-hans"). */
export function translator(dicts: Record<string, PlusStrings>) {
  return (text: string, vars: Record<string, string | number> = {}): string => {
    const code = language();
    const s = (code === 'en' ? undefined : dicts[code]?.[text]) ?? text;
    return s.replace(/\{(\w+)(?:\|([^}]*))?\}/g, (whole, name: string, forms?: string) => {
      const v = vars[name];
      if (v === undefined) return whole;
      if (forms !== undefined) return plural(code, Number(v), forms.split('|'));
      return String(v);
    });
  };
}

/** Every key a dictionary should hold that it does not, and every key it holds that English has not: for a plus app's test. */
export function gaps(english: readonly string[], dict: PlusStrings): { missing: string[]; extra: string[] } {
  const keys = new Set(english);
  return { missing: english.filter((k) => !(k in dict)), extra: Object.keys(dict).filter((k) => !keys.has(k)) };
}
