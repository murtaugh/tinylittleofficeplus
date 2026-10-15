// The npm package `tinylittleoffice` (packages/doc) as an agent with a runtime gets it: built (npm run build:cli),
// packed, installed from the tarball into a folder of its own, and run there. Node strips no types under
// node_modules, so this is the test that the package carries what it runs.
import { test, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PKG = join(ROOT, 'packages/doc');
const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'));

test('the package is the site’s version, public, named tinylittleoffice, with both commands and no dependencies', () => {
  expect(pkg.name).toBe('tinylittleoffice');
  expect(pkg.private).toBe(true); // This fork publishes no package (src/plus/README.md, "Deploying").
  expect(pkg.version).toBe(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version);
  expect(pkg.bin).toStrictEqual({ tinylittleoffice: 'dist/tinyoffice.js', tinyoffice: 'dist/tinyoffice.js' });
  expect(pkg.dependencies).toBeUndefined();
  expect(pkg.files).toEqual(expect.arrayContaining(['dist/tinyoffice.js', 'dist/api.js', 'dist/skill', 'examples', 'schema', 'README.md']));
});

test('packed and installed elsewhere, `tinylittleoffice` lints an example, gives one, installs the skill, and the API imports', { timeout: 180_000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'tlo-npm-'));
  try {
    const npm = (args: string[], cwd: string) => execFileSync('npm', [...args, '--cache', join(dir, 'cache'), '--no-audit', '--no-fund', '--loglevel=error'], { cwd, encoding: 'utf8' });
    execFileSync('npm', ['run', '-s', 'build:cli'], { cwd: ROOT, stdio: 'ignore' });
    const tgz = npm(['pack', '--pack-destination', dir], PKG).trim().split('\n').pop()!;
    const app = join(dir, 'app');
    execFileSync('mkdir', [app]);
    writeFileSync(join(app, 'package.json'), '{ "name": "agent", "private": true, "type": "module" }\n');
    npm(['install', '--offline', join(dir, tgz)], app);
    const bin = join(app, 'node_modules/.bin/tinylittleoffice');
    const sheet = JSON.parse(readFileSync(join(app, 'node_modules/tinylittleoffice/examples/sheet.json'), 'utf8'));
    writeFileSync(join(app, 'money.tlo'), `---\napp: sheet\n---\n${sheet.shapes[0].text}`);
    expect(execFileSync(bin, ['lint', join(app, 'money.tlo')], { encoding: 'utf8' })).toBe('');
    expect(execFileSync(bin, ['example', 'sheet', 'money'], { encoding: 'utf8' })).toContain('The lint: clean');
    expect(execFileSync(join(app, 'node_modules/.bin/tinyoffice'), ['shapes', 'diagram'], { encoding: 'utf8' })).toContain('venn');
    // The skill's folder rides in the package, as `npm run skill` wrote it, and installs from there, whole.
    const files = [
      'SKILL.md',
      ...readdirSync(join(ROOT, 'skill/tinyoffice/references'))
        .sort()
        .map((f) => `references/${f}`),
    ];
    expect(execFileSync(bin, ['skill'], { encoding: 'utf8' })).toBe(readFileSync(join(ROOT, 'skill/tinyoffice/SKILL.md'), 'utf8'));
    expect(
      execFileSync(bin, ['skill', '--into', join(app, 'skills')], { encoding: 'utf8' })
        .trim()
        .split('\n'),
    ).toStrictEqual(files.map((f) => join(app, 'skills/tinyoffice', f)));
    for (const f of files) expect(readFileSync(join(app, 'skills/tinyoffice', f), 'utf8'), f).toBe(readFileSync(join(ROOT, 'skill/tinyoffice', f), 'utf8'));
    expect(readdirSync(join(app, 'node_modules/tinylittleoffice/dist/skill/tinyoffice')).sort()).toStrictEqual(['SKILL.md', 'references']);
    const made = execFileSync(process.execPath, ['--input-type=module', '-e', "import { link, read } from 'tinylittleoffice'; console.log(read(link('outline', '- [ ] Milk\\n')).text)"], {
      cwd: app,
      encoding: 'utf8',
    });
    expect(made).toBe('- [ ] Milk\n\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
