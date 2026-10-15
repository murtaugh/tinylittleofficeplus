// The plus apps' place in upstream's registry, and their words: what an upstream merge could break shows here first.
import { describe, expect, test } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { apps, appOf } from '../../kit/core/apps.ts';
import { addPlusApps } from '../index.ts';
import { PLUS_APPS } from '../apps.ts';
import { DICTS } from '../invoice/words.ts';
import { gaps } from '../i18n.ts';
import { withPlusApps } from '../build.ts';

const PLUS = new URL('../', import.meta.url).pathname;

describe('the registry', () => {
  test('the plus apps are put after upstream’s, once, and the site finds them by id', () => {
    const before = apps().filter((a) => !PLUS_APPS.includes(a)).length;
    addPlusApps();
    addPlusApps();
    expect(apps().length).toBe(before + PLUS_APPS.length);
    expect(apps().slice(-PLUS_APPS.length)).toEqual(PLUS_APPS);
    for (const app of PLUS_APPS) expect(appOf(app.id)).toBe(app);
  });
  test('no plus app takes an id upstream has', async () => {
    const upstream = readFileSync(new URL('../../kit/core/apps.ts', import.meta.url), 'utf8');
    for (const app of PLUS_APPS) expect(upstream).not.toMatch(new RegExp(`apps/${app.id}/`));
  });
});

/** Every pt('…') key in a plus app's code. */
function keysIn(dir: string): string[] {
  const out = new Set<string>();
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) {
        if (f !== 'tests' && f !== 'i18n') walk(p);
      } else if (p.endsWith('.ts')) for (const m of readFileSync(p, 'utf8').matchAll(/\bpt\(\s*'((?:\\.|[^'\\])*)'/g)) out.add(m[1].replace(/\\(['\\])/g, '$1'));
    }
  };
  walk(dir);
  return [...out].sort();
}

describe('the words', () => {
  const keys = keysIn(join(PLUS, 'invoice'));
  test('the Invoicer has words, and no t() of upstream’s, whose extractor would claim them', () => {
    expect(keys.length).toBeGreaterThan(50);
    const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : f.endsWith('.ts') && !d.endsWith('tests') ? [join(d, f)] : []));
    for (const f of walk(PLUS)) expect(readFileSync(f, 'utf8'), f).not.toMatch(/(?<![\w.])t\(\s*['"`]/);
  });
  for (const [code, dict] of Object.entries(DICTS))
    test(`${code}: every key, no other, each placeholder kept`, () => {
      expect(gaps(keys, dict)).toEqual({ missing: [], extra: [] });
      const names = (s: string) => [...s.matchAll(/\{(\w+)/g)].map((m) => m[1]).sort();
      for (const k of keys) expect(names(dict[k]), k).toEqual(names(k));
    });
});

describe('the build', () => {
  test('the first paint’s list of apps gets the plus apps after upstream’s, and a page without one is left as it was', () => {
    const page = '<body><header id="to-first"><h1>Tiny Little Office</h1><ul><li><a href="write/">Word Processor</a></li></ul></header><main><ul></ul></main></body>';
    expect(withPlusApps(page, [{ id: 'invoice', name: 'Invoicer & co' }])).toBe(
      '<body><header id="to-first"><h1>Tiny Little Office</h1><ul><li><a href="write/">Word Processor</a></li><li><a href="#/v1/invoice">Invoicer &amp; co</a></li></ul></header><main><ul></ul></main></body>',
    );
    expect(withPlusApps('<body></body>', PLUS_APPS)).toBe('<body></body>');
  });
});
