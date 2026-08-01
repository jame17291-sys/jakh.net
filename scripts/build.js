import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import * as esbuild from 'esbuild';
import { generateSitemap } from './generate-sitemap.js';

const ROOT_DIR = process.cwd();
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const ASSETS_DIST_DIR = path.join(DIST_DIR, 'assets');

function getHash(content) {
  return crypto.createHash('md5').update(content).digest('hex').slice(0, 8);
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

async function cleanDist() {
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
  }
  ensureDir(DIST_DIR);
  ensureDir(ASSETS_DIST_DIR);
}

function copyDirSync(src, dest) {
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function runBuild() {
  console.log('🚀 Starting JAKH Production Asset Build...');
  await cleanDist();

  const manifest = {};

  // 1. Copy raw assets directory
  if (fs.existsSync(path.join(ROOT_DIR, 'assets'))) {
    copyDirSync(path.join(ROOT_DIR, 'assets'), ASSETS_DIST_DIR);
  }

  // 2. Build & Hash CSS
  const cssFiles = ['styles.css'];
  if (fs.existsSync(path.join(ROOT_DIR, 'assets/fonts/fonts.css'))) {
    cssFiles.push('assets/fonts/fonts.css');
  }

  for (const cssFile of cssFiles) {
    const fullPath = path.join(ROOT_DIR, cssFile);
    if (!fs.existsSync(fullPath)) continue;

    const result = await esbuild.transform(fs.readFileSync(fullPath, 'utf8'), {
      loader: 'css',
      minify: true
    });

    const content = result.code;
    const hash = getHash(content);
    const basename = path.basename(cssFile, '.css');
    const hashedFilename = `${basename}.${hash}.css`;
    const destPath = path.join(ASSETS_DIST_DIR, hashedFilename);

    fs.writeFileSync(destPath, content);
    manifest[cssFile] = `assets/${hashedFilename}`;
    console.log(`  CSS: ${cssFile} -> assets/${hashedFilename}`);
  }

  // 3. Build & Hash JS files
  const jsFiles = [
    'app.js',
    'play.js',
    'game-core.js',
    'analytics.js',
    'room.js'
  ];

  // Include games directory JS files
  const gamesDir = path.join(ROOT_DIR, 'games');
  if (fs.existsSync(gamesDir)) {
    const gameEntries = fs.readdirSync(gamesDir).filter(f => f.endsWith('.js'));
    for (const gameFile of gameEntries) {
      jsFiles.push(`games/${gameFile}`);
    }
  }

  for (const jsFile of jsFiles) {
    const fullPath = path.join(ROOT_DIR, jsFile);
    if (!fs.existsSync(fullPath)) continue;

    const result = await esbuild.transform(fs.readFileSync(fullPath, 'utf8'), {
      loader: 'js',
      minify: true,
      target: 'es2020'
    });

    const content = result.code;
    const hash = getHash(content);
    const basename = path.basename(jsFile, '.js');
    const hashedFilename = `${basename}.${hash}.js`;
    const destPath = path.join(ASSETS_DIST_DIR, hashedFilename);

    fs.writeFileSync(destPath, content);
    manifest[jsFile] = `assets/${hashedFilename}`;
    console.log(`  JS: ${jsFile} -> assets/${hashedFilename}`);
  }

  // Write manifest
  fs.writeFileSync(
    path.join(DIST_DIR, 'asset-manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  // 4. Process HTML Files
  function replaceAssetPathsInHtml(htmlContent, htmlRelativeDir = '') {
    let output = htmlContent;

    for (const [orig, hashed] of Object.entries(manifest)) {
      let targetPath = hashed;
      if (htmlRelativeDir) {
        targetPath = path.relative(htmlRelativeDir, hashed).replace(/\\/g, '/');
      }

      const escapedOrig = orig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(src|href)=["'](?:\\./)?${escapedOrig}(?:\\?[^"']*)?["']`, 'g');
      output = output.replace(regex, `$1="${targetPath}"`);
    }

    return output;
  }

  const rootFiles = fs.readdirSync(ROOT_DIR);
  const htmlFiles = rootFiles.filter(f => f.endsWith('.html'));

  for (const htmlFile of htmlFiles) {
    const srcPath = path.join(ROOT_DIR, htmlFile);
    const content = fs.readFileSync(srcPath, 'utf8');
    const processed = replaceAssetPathsInHtml(content);
    fs.writeFileSync(path.join(DIST_DIR, htmlFile), processed);
  }

  // Process subfolder html files (e.g., journal/)
  const journalDir = path.join(ROOT_DIR, 'journal');
  if (fs.existsSync(journalDir)) {
    ensureDir(path.join(DIST_DIR, 'journal'));
    const journalHtmlFiles = fs.readdirSync(journalDir).filter(f => f.endsWith('.html'));
    for (const jFile of journalHtmlFiles) {
      const srcPath = path.join(journalDir, jFile);
      const content = fs.readFileSync(srcPath, 'utf8');
      const processed = replaceAssetPathsInHtml(content, 'journal');
      fs.writeFileSync(path.join(DIST_DIR, 'journal', jFile), processed);
    }
  }

  // 5. Generate & Copy Static Meta Files
  generateSitemap();
  const metaFiles = ['manifest.webmanifest', 'robots.txt', 'sitemap.xml', 'og-image.jpg'];
  for (const meta of metaFiles) {
    const metaPath = path.join(ROOT_DIR, meta);
    if (fs.existsSync(metaPath)) {
      fs.copyFileSync(metaPath, path.join(DIST_DIR, meta));
    }
  }

  // 6. Build Service Worker (sw.js)
  const swPath = path.join(ROOT_DIR, 'sw.js');
  if (fs.existsSync(swPath)) {
    let swContent = fs.readFileSync(swPath, 'utf8');

    const hashedPrecacheList = [
      '/manifest.webmanifest',
      '/assets/logo.webp',
      '/assets/logo.png',
      '/assets/favicon.svg',
      ...Object.values(manifest).map(f => `/${f}`)
    ];

    const buildVersion = `jakh-build-${Date.now()}`;

    swContent = swContent.replace(
      /const CACHE_NAME = ['"].*?['"];/,
      `const CACHE_NAME = '${buildVersion}';`
    );
    swContent = swContent.replace(
      /const ASSET_CACHE = ['"].*?['"];/,
      `const ASSET_CACHE = '${buildVersion}-assets';`
    );
    swContent = swContent.replace(
      /const PRECACHE_ASSETS = \[[\s\S]*?\];/,
      `const PRECACHE_ASSETS = ${JSON.stringify(hashedPrecacheList, null, 2)};`
    );

    fs.writeFileSync(path.join(DIST_DIR, 'sw.js'), swContent);
    console.log(`  SW: sw.js generated with ${hashedPrecacheList.length} hashed precached assets.`);
  }

  console.log('✅ JAKH Production Asset Build Complete! Output in dist/\n');
}

runBuild().catch(err => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
