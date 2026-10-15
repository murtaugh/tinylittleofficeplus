/**
 * The Invoicer's words, through pt(), in the language the site is in, from the dictionaries in ./i18n/ (one file a language,
 * named as src/i18n names its files). A language with no file here shows the English. src/plus/tests/plus.unit.test.ts holds
 * each file to the keys the code uses.
 */
import { translator, type PlusStrings } from '../i18n.ts';

// Vite rewrites the glob call; read under plain node (the build's own scripts, src/plus/build.ts), there are no files and
// the words are English.
const files: Record<string, PlusStrings> = (() => {
  try {
    return import.meta.glob<PlusStrings>('./i18n/*.ts', { eager: true, import: 'default' });
  } catch {
    return {};
  }
})();
export const DICTS: Record<string, PlusStrings> = Object.fromEntries(Object.entries(files).map(([path, d]) => [path.replace(/^.*\/([^/]+)\.ts$/, '$1'), d]));

export const pt = translator(DICTS);
