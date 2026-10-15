/**
 * The build's part for the plus apps (vite.config.ts names it once, after upstream's own). Upstream writes the home
 * page's first paint from its registry (scripts/seo.ts, homeFirst): the site's name and a link per app, shown until the
 * app file has come and drawn the same list over it, with nothing moving (e2e/smoke.spec.ts). The plus apps are in the
 * list the app draws, so they are put in the first paint's list too, after upstream's, each linking to its new
 * document, since a plus app has no page of its own in the build. Run under node, with no DOM.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Plugin } from 'vite';

const html = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The first paint's list of apps with the plus apps after upstream's. Unchanged where there is no such list. */
export function withPlusApps(page: string, apps: { id: string; name: string }[]): string {
  const items = apps.map((a) => `<li><a href="#/v1/${html(a.id)}">${html(a.name)}</a></li>`).join('');
  return page.replace(/(<header id="to-first">[\s\S]*?<ul>[\s\S]*?)(<\/ul>)/, `$1${items}$2`);
}

export function plusBuild(root: string): Plugin {
  return {
    name: 'tinyoffice-plus',
    apply: 'build',
    // After upstream's closeBundle has written dist/index.html: hooks of this kind run side by side unless one is sequential.
    closeBundle: {
      order: 'post',
      sequential: true,
      async handler() {
        const file = resolve(root, 'dist', 'index.html');
        if (!existsSync(file)) return;
        // By its path, as vite.config.ts's fromSource reads the registry: the config's bundler never follows it into the apps.
        const { PLUS_APPS } = (await import(pathToFileURL(resolve(root, 'src/plus/apps.ts')).href)) as typeof import('./apps.ts');
        writeFileSync(file, withPlusApps(readFileSync(file, 'utf8'), PLUS_APPS));
      },
    },
  };
}
