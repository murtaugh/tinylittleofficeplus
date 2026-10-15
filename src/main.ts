/**
 * The page: the stylesheet with its layers, the shell, and what runs at load: the language, the theme, and the
 * service worker under Save in browser (kit/share/offline.ts), registered once the page has loaded.
 * (The size of everything is drawn by the shell.)
 */
import './styles.css';
import { initLanguage } from './kit/core/i18n.ts';
import { initTheme } from './kit/ui/theme.ts';
import { offlineAtLoad } from './kit/share/offline.ts';
// This fork's own apps, put in the registry before the shell reads it (src/plus/README.md).
import './plus/index.ts';
import './kit/core/shell.ts';

initTheme();
void initLanguage();
if (document.readyState === 'complete') void offlineAtLoad();
else window.addEventListener('load', () => void offlineAtLoad(), { once: true });
