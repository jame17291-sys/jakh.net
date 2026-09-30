function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/gu)].map(([, name, value]) => [name, value]));
}

export function kidsImageContractFailures(html, relative, illustration) {
  const failures = [];
  const fail = message => failures.push(`${relative}: ${message}`);
  const images = [...html.matchAll(/<img\b[^>]*>/gu)].map(([tag]) => attributes(tag));
  const heroes = images.filter(image => image.class?.split(/\s+/u).includes('kids-hero-art'));
  if (heroes.length !== 1) fail('kids hub needs exactly one responsive hero illustration');
  const hero = heroes[0] || {};
  if (hero.src !== `/assets/illustrations/${illustration}-480.webp`) fail('kids hero artwork does not match its directory card');
  const derivatives = (hero.srcset || '').split(',').map(value => value.trim());
  if (derivatives.length !== 2 || ![480, 960].every(width => derivatives.includes(`/assets/illustrations/${illustration}-${width}.webp ${width}w`))) {
    fail('kids hero needs both matching 480w and 960w WebP derivatives');
  }
  if (!hero.sizes || hero.width !== '960' || hero.height !== '640' || hero.alt !== ''
    || hero.loading !== 'eager' || hero.decoding !== 'async' || hero.fetchpriority !== 'high') {
    fail('kids hero needs decorative alt, responsive sizing, intrinsic dimensions and eager priority');
  }
  const body = attributes(html.match(/<body\b[^>]*>/u)?.[0] || '');
  if (!body.class?.split(/\s+/u).includes('kids-page') || body['data-kids-page'] !== 'hub') fail('missing dedicated kids hub binding');
  const runtime = [...html.matchAll(/<script\b[^>]*>/gu)].map(([tag]) => attributes(tag));
  if (!runtime.some(script => script.type === 'module' && script.src === '/kids-learning.js')) fail('missing dedicated kids module runtime');
  if (runtime.some(script => /^\/app\.js(?:[?#]|$)/u.test(script.src || ''))) fail('kids hub must not load generic question-practice runtime');
  const finder = html.match(/<form\b[^>]*\bdata-kids-filters(?:[\s=>])[^>]*>([\s\S]*?)<\/form>/u)?.[1];
  if (!finder || !['age', 'area', 'minutes', 'search', 'materialGroup', 'format', 'reading', 'adult', 'screenFree', 'noPrinter'].every(name => (
    new RegExp(`<(?:input|select)\\b[^>]*\\bname="${name}"`, 'u').test(finder)
  ))) fail('kids activity finder must expose the supported discovery controls');
  if (!/<article\b[^>]*\bdata-activity-card(?:[\s=>])/u.test(html)) fail('kids hub needs crawlable activity cards');
  return failures;
}
