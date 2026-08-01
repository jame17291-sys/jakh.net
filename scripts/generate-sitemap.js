import fs from 'fs';
import path from 'path';

const SITE_URL = 'https://jakh.net';
const ROOT_DIR = process.cwd();

// Pages to exclude from search engine sitemaps
const EXCLUDED_PAGES = new Set([
  'admin.html',
  'category-template.html',
  '404.html',
  'index.html.bak'
]);

function getPriorityAndFreq(relativePath) {
  if (relativePath === 'index.html') {
    return { priority: '1.0', changefreq: 'daily' };
  }
  if (['mind-lab.html', 'play.html', 'daily.html'].includes(relativePath)) {
    return { priority: '0.9', changefreq: 'daily' };
  }
  if (['chess.html', 'catan.html', 'backgammon.html', 'go.html', 'codenames.html', 'mastermind.html', 'crossword.html'].includes(relativePath)) {
    return { priority: '0.85', changefreq: 'weekly' };
  }
  if (relativePath.startsWith('journal/')) {
    return { priority: '0.75', changefreq: 'monthly' };
  }
  if (['privacy.html', 'terms.html', 'contact.html'].includes(relativePath)) {
    return { priority: '0.4', changefreq: 'yearly' };
  }
  return { priority: '0.8', changefreq: 'weekly' };
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

export function generateSitemap() {
  console.log('🗺️  Generating automated sitemap.xml...');

  const urls = [];
  const todayStr = formatDate(new Date());

  // Helper to process directory
  function scanDir(dirPath, baseRelPath = '') {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Only recurse into public content subfolders (like journal)
        if (entry.name === 'journal') {
          scanDir(path.join(dirPath, entry.name), 'journal');
        }
        continue;
      }

      if (!entry.name.endsWith('.html')) continue;
      if (EXCLUDED_PAGES.has(entry.name)) continue;

      const relPath = baseRelPath ? `${baseRelPath}/${entry.name}` : entry.name;
      const fullPath = path.join(dirPath, entry.name);
      const stat = fs.statSync(fullPath);
      const lastMod = formatDate(stat.mtime > new Date('2026-01-01') ? stat.mtime : new Date());

      const { priority, changefreq } = getPriorityAndFreq(relPath);

      let urlLoc = `${SITE_URL}/${relPath}`;
      if (relPath === 'index.html') {
        urlLoc = `${SITE_URL}/`;
      }

      urls.push({
        loc: urlLoc,
        lastmod: lastMod,
        changefreq,
        priority
      });
    }
  }

  scanDir(ROOT_DIR);

  // Sort URLs by priority descending
  urls.sort((a, b) => parseFloat(b.priority) - parseFloat(a.priority));

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n`;
  xml += `        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n`;

  for (const item of urls) {
    xml += `  <url>\n`;
    xml += `    <loc>${item.loc}</loc>\n`;
    xml += `    <lastmod>${item.lastmod}</lastmod>\n`;
    xml += `    <changefreq>${item.changefreq}</changefreq>\n`;
    xml += `    <priority>${item.priority}</priority>\n`;
    xml += `    <xhtml:link rel="alternate" hreflang="en" href="${item.loc}"/>\n`;
    xml += `    <xhtml:link rel="alternate" hreflang="ar" href="${item.loc}"/>\n`;
    xml += `    <xhtml:link rel="alternate" hreflang="x-default" href="${item.loc}"/>\n`;
    xml += `  </url>\n\n`;
  }

  xml += `</urlset>\n`;

  const outputPath = path.join(ROOT_DIR, 'sitemap.xml');
  fs.writeFileSync(outputPath, xml);
  console.log(`✅ Generated sitemap.xml with ${urls.length} URLs!`);
  return xml;
}

if (process.argv[1] && process.argv[1].endsWith('generate-sitemap.js')) {
  generateSitemap();
}
