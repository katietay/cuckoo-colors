// Builds the Angular app and assembles a folder you can upload to IONOS.
//   npm run package:ionos                      app at the root of a domain or subdomain
//   npm run package:ionos -- /cuckoo-colors/   app in a subfolder
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baseHref = process.argv[2] ?? '/';
if (!/^\/([A-Za-z0-9._-]+\/)*$/.test(baseHref)) {
  console.error('Base href must start and end with "/", for example "/" or "/cuckoo-colors/".');
  process.exit(2);
}

const out = join(root, 'deploy', 'ionos');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

execFileSync('npx', ['ng', 'build', '--base-href', baseHref], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });

cpSync(join(root, 'dist', 'cuckoo-colors', 'browser'), out, { recursive: true });
cpSync(join(root, 'php', 'api'), join(out, 'api'), {
  recursive: true,
  filter: (src) => !/[\\/]config\.php$/.test(src),
});
cpSync(join(root, 'php', 'root.htaccess'), join(out, '.htaccess'));

if (!existsSync(join(out, 'index.html')) || !existsSync(join(out, 'api', 'index.php'))) {
  console.error('Packaging failed: expected files are missing.');
  process.exit(1);
}
writeFileSync(
  join(out, 'api', 'DEPLOY-NOTE.txt'),
  'Copy config.sample.php to config.php and fill it in. Never share config.php.\n',
);
console.log(`\nReady: ${out}\nBase href: ${baseHref}\nNext: upload the CONTENTS of that folder (including .htaccess) to IONOS. See README, "Deploying to IONOS".`);
