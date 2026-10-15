/**
 * The plus apps: this fork's own apps, put beside upstream's at load. src/main.ts imports this file once, before the
 * shell; nothing else of upstream's is changed to add an app. See src/plus/README.md.
 *
 * Upstream's registry (src/kit/core/apps.ts) hands out its own list from apps(), and appOf() and the shell read that
 * same list, so an app pushed onto it is an app of the site: on the home page, in the routes, in Download and in the
 * library. Upstream's tests, the command line, the API and the guides for agents read the registry without this file,
 * so they go on seeing upstream's apps alone, and an upstream merge never meets these. src/plus/tests holds the
 * registration, so a change upstream that breaks it fails here first.
 */
import { apps } from '../kit/core/apps.ts';
import type { AppDef } from '../kit/core/app.ts';
import invoice from './invoice/def.ts';

/** The plus apps, in the order the home page lists them, after upstream's. */
export const PLUS_APPS: AppDef[] = [invoice];

/** Put the plus apps in the site's registry, once. */
export function addPlusApps(list: AppDef[] = apps()): AppDef[] {
  for (const app of PLUS_APPS) if (!list.some((a) => a.id === app.id)) list.push(app);
  return list;
}

addPlusApps();
