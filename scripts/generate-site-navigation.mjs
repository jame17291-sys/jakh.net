import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {siteHeader, navigationScript} from './site-navigation-markup.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const games = ['akshifha','chess','backgammon','mastermind','go','reversi','codenames','catan','set','hanabi','diplomacy'];
const pages = [['index','/ar/','home'],['mind-lab','/ar/mind-lab/','library'],['play','/ar/play/','games'],['daily','/ar/daily/','daily'],['privacy','/ar/privacy/',''],...games.map(slug=>[slug,`/ar/games/${slug}/`,'games'])];
const stale = [];
for (const [slug,alternate,active] of pages) {
  const file = path.join(root,slug+'.html');
  const source = fs.readFileSync(file,'utf8');
  let result = source.replace(/<header class="site-header[^]*?<\/header>/,siteHeader({alternate,active}));
  if (!result.includes('class="primary-navigation"')) throw Error('Missing header: '+slug);
  if (!result.includes('src="/site-navigation.js"')) result = result.replace('</body>', '  '+navigationScript+'\n  </body>');
  if (result !== source) {
    stale.push(slug+'.html');
    if (!check) fs.writeFileSync(file,result);
  }
}
if (check && stale.length) throw Error('Stale shared navigation: '+stale.join(', '));
console.log(check ? 'Shared source navigation is current.' : 'Updated shared source navigation: '+stale.length+' pages.');
