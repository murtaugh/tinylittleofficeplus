/**
 * The plus apps, in the order the home page lists them, after upstream's. No side effect: src/plus/index.ts puts them
 * in the site's registry, and src/plus/build.ts names them in the built home page.
 */
import type { AppDef } from '../kit/core/app.ts';
import invoice from './invoice/def.ts';

export const PLUS_APPS: AppDef[] = [invoice];
