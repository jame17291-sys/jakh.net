
if (location.protocol === 'http:' && !/^(localhost|127\.0\.0\.1)$/i.test(location.hostname)) {
  location.replace(`https://${location.host}${location.pathname}${location.search}${location.hash}`);
}

let _sio = null; // Socket.io client instance (lazy-loaded)

// ── Micro-animations ──────────────────────────────────────────────────────────
function spawnConfetti(originEl) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const rect = originEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const colors = ['#E8613C', '#C9A227', '#48d597', '#9f7cff', '#E2C566', '#ff7a8a', '#5ac8ff', '#F6EFE0'];
  for (let i = 0; i < 18; i++) {
    const dot = document.createElement('div');
    dot.className = 'confetti-dot';
    const angle = (i / 18) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
    const dist = 55 + Math.random() * 90;
    const size = 4 + Math.random() * 7;
    dot.style.cssText = [
      `left:${cx}px`, `top:${cy}px`,
      `width:${size}px`, `height:${size}px`,
      `background:${colors[i % colors.length]}`,
      `border-radius:${Math.random() > 0.45 ? '50%' : '2px'}`,
      `--dx:${(Math.cos(angle) * dist).toFixed(1)}px`,
      `--dy:${(Math.sin(angle) * dist).toFixed(1)}px`,
      `--rot:${(Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 360)}deg`,
      `animation-delay:${(Math.random() * 90).toFixed(0)}ms`,
    ].join(';');
    document.body.appendChild(dot);
    dot.addEventListener('animationend', () => dot.remove(), { once: true });
  }
}

function flashCard(id, tone = 'success') {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const el = document.querySelector(`.riddle-card[data-id="${CSS.escape(id)}"]`);
  if (!el) return;
  const flashClass = tone === 'error' ? 'flash-error' : 'flash-success';
  el.classList.remove('flash-success', 'flash-error');
  void el.offsetWidth; // reflow to restart animation
  el.classList.add(flashClass);
  el.addEventListener('animationend', () => el.classList.remove(flashClass), { once: true });
}

const STORAGE_KEYS = {
  settings: 'jakh-riddles-settings',
  audio: 'jakh-audio-enabled',
};

const DIFFICULTY_POINTS = {
  easy: 1,
  medium: 2,
  hard: 3,
  'very-advanced': 5,
};

const PAGE_SIZE = 20;

const DIRECTORY_PARENT_META = {
  mind: {
    code: 'Mind',
    label: { en: 'Mind & Logic', ar: 'العقل والمنطق' },
    gradient: 'linear-gradient(135deg,#171225 0%,#6E62D8 54%,#D6B66A 100%)',
    accent: '#B8A7FF',
  },
  science: {
    code: 'Science',
    label: { en: 'Science & Nature', ar: 'العلوم والطبيعة' },
    gradient: 'linear-gradient(135deg,#08251D 0%,#44B78B 56%,#D6B66A 100%)',
    accent: '#7EE2B8',
  },
  tech: {
    code: 'Tech',
    label: { en: 'Tech & Engineering', ar: 'التقنية والهندسة' },
    gradient: 'linear-gradient(135deg,#071A2E 0%,#2D94C9 56%,#D6B66A 100%)',
    accent: '#76D8FF',
  },
  world: {
    code: 'World',
    label: { en: 'World & Society', ar: 'العالم والمجتمع' },
    gradient: 'linear-gradient(135deg,#26190B 0%,#B47B3A 56%,#D6B66A 100%)',
    accent: '#E8C77B',
  },
  culture: {
    code: 'Culture',
    label: { en: 'Arts & Pop Culture', ar: 'الفنون والثقافة الشعبية' },
    gradient: 'linear-gradient(135deg,#26101C 0%,#C46A98 56%,#D6B66A 100%)',
    accent: '#F3A6C8',
  },
};

const CATEGORY_COLLECTIONS = [
  {
    key: 'riddles-and-mysteries',
    parent: 'mind',
    title: { en: 'Riddles & Mysteries', ar: 'الألغاز والغموض' },
    description: { en: 'Classic riddles, logic puzzles, kid-friendly riddles, mysteries, and true-crime reasoning.', ar: 'ألغاز كلاسيكية ومنطقية وألغاز خفيفة وغموض وتفكير في الجرائم.' },
    slugs: ['classic-riddles', 'logic-puzzles', 'kids-riddles', 'story-mysteries', 'true-crime'],
  },
  {
    key: 'people-and-society',
    parent: 'mind',
    title: { en: 'People & Society', ar: 'الناس والمجتمع' },
    description: { en: 'Psychology, philosophy, relationships, business, economics, society, and language.', ar: 'علم النفس والفلسفة والعلاقات والأعمال والاقتصاد والمجتمع واللغة.' },
    slugs: ['psychology', 'philosophy', 'relationship-questions', 'business-and-management', 'economics-and-finance', 'social-sciences', 'linguistics'],
  },
  {
    key: 'nature-and-health',
    parent: 'science',
    title: { en: 'Nature & Health', ar: 'الطبيعة والصحة' },
    description: { en: 'Biology, animals, environment, survival, medicine, and pharmacy.', ar: 'الأحياء والحيوانات والبيئة والبقاء والطب والصيدلة.' },
    slugs: ['biology', 'animal-kingdom', 'environment-and-ecology', 'survival', 'medical-questions', 'pharmacy'],
  },
  {
    key: 'science-and-space',
    parent: 'science',
    title: { en: 'Science & Space', ar: 'العلوم والفضاء' },
    description: { en: 'Math, science, chemistry, life sciences, geology, space, and future energy.', ar: 'الرياضيات والعلوم والكيمياء وعلوم الحياة والجيولوجيا والفضاء والطاقة.' },
    slugs: ['math', 'science', 'chemistry', 'physical-and-life-sciences', 'geology', 'space-and-astrology', 'future-tech-and-energy'],
  },
  {
    key: 'tech-and-engineering',
    parent: 'tech',
    title: { en: 'Tech & Engineering', ar: 'التقنية والهندسة' },
    description: { en: 'Computing, coding, engineering, infrastructure, architecture, and inventions.', ar: 'الحوسبة والبرمجة والهندسة والبنية التحتية والعمارة والاختراعات.' },
    slugs: ['software-and-computing', 'coding-and-design', 'tech-retro', 'civil-engineering', 'electrical-engineering', 'mechanical-engineering', 'infrastructure-systems', 'architecture-and-landmarks', 'inventions-and-minds'],
  },
  {
    key: 'sports-and-machines',
    parent: 'world',
    title: { en: 'Sports & Machines', ar: 'الرياضة والآلات' },
    description: { en: 'Football and cars, kept simple and direct.', ar: 'كرة القدم والسيارات بطريقة بسيطة ومباشرة.' },
    slugs: ['football', 'automotive'],
  },
  {
    key: 'world-atlas',
    parent: 'world',
    title: { en: 'World Atlas', ar: 'أطلس العالم' },
    description: { en: 'Geography, flags, currencies, etiquette, and food.', ar: 'الجغرافيا والأعلام والعملات والآداب والطعام.' },
    slugs: ['geography', 'flag-questions', 'currencies', 'world-habits-and-etiquette', 'food-and-cuisines'],
  },
  {
    key: 'history-and-civilization',
    parent: 'world',
    title: { en: 'History & Civilization', ar: 'التاريخ والحضارات' },
    description: { en: 'History, ancient civilizations, Middle East history, and law.', ar: 'التاريخ والحضارات القديمة وتاريخ الشرق الأوسط والقانون.' },
    slugs: ['history', 'ancient-civilizations', 'middle-east-history', 'law-middle-east'],
  },
  {
    key: 'arts-and-stories',
    parent: 'culture',
    title: { en: 'Arts & Stories', ar: 'الفنون والقصص' },
    description: { en: 'Art, books, music, mythology, fictional worlds, and superheroes.', ar: 'الفن والكتب والموسيقى والأساطير والعوالم الخيالية والأبطال.' },
    slugs: ['art-and-painters', 'books-and-quotes', 'music-and-performing-arts', 'mythology-legends', 'fictional-worlds', 'superheroes'],
  },
  {
    key: 'screen-culture',
    parent: 'culture',
    title: { en: 'Screen Culture', ar: 'ثقافة الشاشة' },
    description: { en: 'TV shows trivia, cinema, anime, Ayam Tayebeen, and pop culture.', ar: 'معلومات المسلسلات والأفلام والأنمي وأيام الطيبين والثقافة الشعبية.' },
    slugs: ['tv-shows-trivia', 'cinema-and-film-history', 'anime', 'ayam-tayebeen', 'pop-culture'],
  },
];

const PRIMARY_TOPIC_MAP = new Map(CATEGORY_COLLECTIONS.map(topic => [topic.key, topic]));

function isPrimaryTopicSlug(slug) {
  return PRIMARY_TOPIC_MAP.has(slug);
}

function primaryTopicHref(topic) {
  return `topic.html?topic=${encodeURIComponent(topic.key)}`;
}

const CATEGORY_GRADIENTS = {
  'art-and-painters': 'linear-gradient(135deg, #FF6B6B 0%, #FFA500 100%)',
  'biology': 'linear-gradient(135deg, #00C9A7 0%, #005CE6 100%)',
  'books-and-quotes': 'linear-gradient(135deg, #6B3A2A 0%, #D4A017 100%)',
  'business-and-management': 'linear-gradient(135deg, #1E3A5F 0%, #4A90D9 100%)',
  'chemistry': 'linear-gradient(135deg, #7B2FBE 0%, #00C9A7 100%)',
  'civil-engineering': 'linear-gradient(135deg, #607D8B 0%, #B0BEC5 100%)',
  'classic-riddles': 'linear-gradient(135deg, #4A0E8F 0%, #C77DFF 100%)',
  'coding-and-design': 'linear-gradient(135deg, #0D47A1 0%, #26C6DA 100%)',
  'electrical-engineering': 'linear-gradient(135deg, #FF8F00 0%, #EF5350 100%)',
  'flag-questions': 'linear-gradient(135deg, #C62828 0%, #1565C0 100%)',
  'football': 'linear-gradient(135deg, #2E7D32 0%, #66BB6A 100%)',
  'geography': 'linear-gradient(135deg, #0277BD 0%, #26C6DA 100%)',
  'geology': 'linear-gradient(135deg, #5D4037 0%, #D7CCC8 100%)',
  'history': 'linear-gradient(135deg, #B71C1C 0%, #4A148C 100%)',
  'infrastructure-systems': 'linear-gradient(135deg, #37474F 0%, #78909C 100%)',
  'kids-riddles': 'linear-gradient(135deg, #FF6B6B 0%, #FFD93D 100%)',
  'law-middle-east': 'linear-gradient(135deg, #1A237E 0%, #C0A060 100%)',
  'math': 'linear-gradient(135deg, #0D47A1 0%, #7B1FA2 100%)',
  'mechanical-engineering': 'linear-gradient(135deg, #263238 0%, #78909C 100%)',
  'medical-questions': 'linear-gradient(135deg, #AD1457 0%, #F48FB1 100%)',
  'middle-east-history': 'linear-gradient(135deg, #4E342E 0%, #F9A825 100%)',
  'philosophy': 'linear-gradient(135deg, #4A148C 0%, #9C4DCC 100%)',
  'physical-and-life-sciences': 'linear-gradient(135deg, #0D47A1 0%, #00BCD4 100%)',
  'pharmacy': 'linear-gradient(135deg, #1B5E20 0%, #66BB6A 100%)',
  'psychology': 'linear-gradient(135deg, #4527A0 0%, #9C4DCC 100%)',
  'relationship-questions': 'linear-gradient(135deg, #880E4F 0%, #F06292 100%)',
  'science': 'linear-gradient(135deg, #01579B 0%, #26C6DA 100%)',
  'social-sciences': 'linear-gradient(135deg, #006064 0%, #26C6DA 100%)',
  'software-and-computing': 'linear-gradient(135deg, #1A1A2E 0%, #5C6BC0 100%)',
  'space-and-astrology': 'linear-gradient(135deg, #0D0D2B 0%, #1A237E 100%)',
  'story-mysteries': 'linear-gradient(135deg, #1A1A2E 0%, #4A4A8A 100%)',
  'tv-shows-trivia': 'linear-gradient(135deg, #311B92 0%, #AD1457 100%)',
  'world-habits-and-etiquette': 'linear-gradient(135deg, #BF360C 0%, #5C6BC0 100%)',
  'environment-and-ecology': 'linear-gradient(135deg, #1B5E20 0%, #76FF03 100%)',
  'ancient-civilizations': 'linear-gradient(135deg, #4E342E 0%, #FFD54F 100%)',
  'inventions-and-minds': 'linear-gradient(135deg, #1A237E 0%, #FF6F00 100%)',
  'animal-kingdom': 'linear-gradient(135deg, #33691E 0%, #FF8F00 100%)',
  'economics-and-finance': 'linear-gradient(135deg, #004D40 0%, #FFD600 100%)',
  'architecture-and-landmarks': 'linear-gradient(135deg, #37474F 0%, #FF8A65 100%)',
  'music-and-performing-arts': 'linear-gradient(135deg, #4A148C 0%, #F50057 100%)',
  'food-and-cuisines': 'linear-gradient(135deg, #E65100 0%, #FDD835 100%)',
  'cinema-and-film-history': 'linear-gradient(135deg, #212121 0%, #B71C1C 100%)',
  'future-tech-and-energy': 'linear-gradient(135deg, #006064 0%, #00E5FF 100%)',
  'anime': 'linear-gradient(135deg, #FF416C 0%, #FF4B2B 100%)',
  'ayam-tayebeen': 'linear-gradient(135deg, #6C3483 0%, #1A5276 100%)',
  'mythology-legends': 'linear-gradient(135deg, #D4AF37 0%, #8A2BE2 100%)',
  'true-crime': 'linear-gradient(135deg, #8B0000 0%, #1A1A1A 100%)',
  'pop-culture': 'linear-gradient(135deg, #FF69B4 0%, #00FFFF 100%)',
  'superheroes': 'linear-gradient(135deg, #EF4444 0%, #3B82F6 100%)',
  'fictional-worlds': 'linear-gradient(135deg, #10B981 0%, #065F46 100%)',
  'survival': 'linear-gradient(135deg, #228B22 0%, #8B4513 100%)',
  'automotive': 'linear-gradient(135deg, #9CA3AF 0%, #F97316 100%)',
  'linguistics': 'linear-gradient(135deg, #8B5CF6 0%, #C084FC 100%)',
  'currencies': 'linear-gradient(135deg, #059669 0%, #F59E0B 100%)',
  'tech-retro': 'linear-gradient(135deg, #84CC16 0%, #111827 100%)',
};

const CATEGORY_ART_MOTIFS = {
  'riddle-forge': 'question',
  'human-signals': 'dialogue',
  'mystery-desk': 'keyhole',
  'living-planet': 'leaf-world',
  'core-science-lab': 'atom',
  'medicine-cabinet': 'pulse',
  'orbit-energy': 'energy',
  'digital-workshop': 'terminal',
  'built-systems': 'network',
  'speed-stadiums': 'pitch',
  'atlas-room': 'map',
  'time-archive': 'timeline',
  'society-engine': 'nodes',
  'gallery-myths': 'canvas',
  'screen-worlds': 'screen',
  'classic-riddles': 'question',
  'logic-puzzles': 'maze',
  'kids-riddles': 'blocks',
  'philosophy': 'column',
  'psychology': 'profile',
  'relationship-questions': 'dialogue',
  'story-mysteries': 'keyhole',
  'true-crime': 'lens',
  'biology': 'cell-leaf',
  'animal-kingdom': 'wild-track',
  'environment-and-ecology': 'leaf-world',
  'survival': 'terrain',
  'math': 'equation-grid',
  'science': 'atom',
  'chemistry': 'flask',
  'physical-and-life-sciences': 'wave-lab',
  'geology': 'strata',
  'medical-questions': 'pulse',
  'pharmacy': 'capsule',
  'space-and-astrology': 'orbit',
  'future-tech-and-energy': 'energy',
  'software-and-computing': 'terminal',
  'coding-and-design': 'blueprint',
  'tech-retro': 'crt',
  'civil-engineering': 'bridge',
  'electrical-engineering': 'circuit',
  'mechanical-engineering': 'gear',
  'infrastructure-systems': 'network',
  'architecture-and-landmarks': 'arch',
  'inventions-and-minds': 'bulb',
  'football': 'pitch',
  'automotive': 'road',
  'geography': 'map',
  'flag-questions': 'banner',
  'currencies': 'coin',
  'world-habits-and-etiquette': 'globe-lines',
  'food-and-cuisines': 'table',
  'history': 'timeline',
  'ancient-civilizations': 'temple',
  'middle-east-history': 'heritage-arch',
  'law-middle-east': 'scales',
  'business-and-management': 'chart',
  'economics-and-finance': 'market',
  'social-sciences': 'nodes',
  'linguistics': 'letterform',
  'art-and-painters': 'canvas',
  'books-and-quotes': 'book',
  'music-and-performing-arts': 'sound-stage',
  'mythology-legends': 'myth-star',
  'tv-shows-trivia': 'screen',
  'cinema-and-film-history': 'film',
  'anime': 'motion-frame',
  'ayam-tayebeen': 'screen',
  'pop-culture': 'signal-burst',
  'superheroes': 'shield',
  'fictional-worlds': 'portal',
};

function atlasFamilyFromCluster(clusterKey) {
  return ({
    mind: 'logic',
    science: 'science',
    tech: 'tech',
    world: 'world',
    culture: 'culture',
  })[clusterKey] || 'logic';
}

function mindTrackMeta(clusterKey) {
  return DIRECTORY_PARENT_META[clusterKey] || DIRECTORY_PARENT_META.mind;
}

function mindTrackAccent(clusterKey) {
  return mindTrackMeta(clusterKey).accent || '#d6b66a';
}

function mindTrackGradient(clusterKey) {
  return mindTrackMeta(clusterKey).gradient || 'linear-gradient(135deg,#0b0c10,#d6b66a)';
}

function mindCoverSvg({ slug, title, clusterKey, color, variant = 'card' }) {
  const safeSlug = String(slug || 'mind-lab').toLowerCase().replace(/[^a-z0-9-]/g, '');
  const family = atlasFamilyFromCluster(clusterKey);
  const coverTitle = escapeHtml(title || safeSlug);
  const seed = mindCoverSeed(safeSlug);
  const accent = escapeHtml(color || mindTrackAccent(clusterKey));
  const bloom = mindCoverSeries(seed, 4, 0, 100);
  const bloomX = 170 + bloom[0] * 3;
  const bloomY = 68 + bloom[1];
  const subject = mindCoverCategorySigil(safeSlug, family, seed);

  return [
    '<svg class="mind-cover-svg mind-cover-' + family + ' mind-cover-' + variant + '" viewBox="0 0 640 360" role="img" aria-label="' + coverTitle + ' cover" style="--mind-accent:' + accent + '">',
    '<rect width="640" height="360" rx="30" fill="#07080b"></rect>',
    '<rect x="0" y="0" width="640" height="360" rx="30" fill="#0b0c10" opacity=".96"></rect>',
    '<circle cx="' + bloomX + '" cy="' + bloomY + '" r="232" fill="var(--mind-accent)" opacity=".13"></circle>',
    '<circle cx="486" cy="44" r="210" fill="#d6b66a" opacity=".06"></circle>',
    '<rect x="18" y="18" width="604" height="324" rx="24" fill="none" stroke="#d6b66a" stroke-opacity=".28" stroke-width="1.4"></rect>',
    '<rect x="35" y="35" width="570" height="290" rx="18" fill="none" stroke="#f6efe0" stroke-opacity=".065" stroke-width="1"></rect>',
    '<g class="mind-cover-lattice">' + mindCoverGrid(seed) + '</g>',
    '<g class="mind-cover-constellation">' + mindCoverConstellation(seed) + '</g>',
    '<circle class="mind-cover-halo" cx="320" cy="180" r="126"></circle>',
    '<circle class="mind-cover-core" cx="320" cy="180" r="92"></circle>',
    '<path class="mind-cover-axis" d="M146 180h348M320 76v208" fill="none"></path>',
    '<g class="mind-cover-family-mark">' + mindCoverFamilySigil(family) + '</g>',
    '<g class="mind-cover-subject">' + subject + '</g>',
    '<g class="mind-cover-foil">' + mindCoverFoilLines(seed) + '</g>',
    '<path class="mind-cover-corners" d="M52 52h94M52 52v94M588 308h-94M588 308v-94" fill="none" stroke="#d6b66a" stroke-opacity=".54" stroke-width="3.5" stroke-linecap="round"></path>',
    '</svg>',
  ].join('');
}

function mindCoverSeed(slug) {
  return String(slug || 'mind-lab')
    .split('')
    .reduce((total, char) => ((total * 31) + char.charCodeAt(0)) >>> 0, 2166136261);
}

function mindCoverSeries(seed, count, min, span) {
  const values = [];
  let value = seed >>> 0;
  for (let i = 0; i < count; i += 1) {
    value = (Math.imul(value ^ 0x9e3779b9, 1664525) + 1013904223) >>> 0;
    values.push(min + (value % span));
  }
  return values;
}

function mindCoverGrid(seed) {
  const offset = seed % 24;
  let html = '';
  for (let x = -24 + offset; x < 680; x += 48) {
    html += '<path d="M' + x + ' 34v292"></path>';
  }
  for (let y = 34 + (offset % 18); y < 326; y += 46) {
    html += '<path d="M34 ' + y + 'h572"></path>';
  }
  return html;
}

function mindCoverConstellation(seed) {
  const nums = mindCoverSeries(seed, 16, 0, 1000);
  const points = [];
  for (let i = 0; i < 8; i += 1) {
    points.push({
      x: 120 + (nums[i * 2] % 402),
      y: 76 + (nums[i * 2 + 1] % 206),
    });
  }
  const path = points.map((point, index) => (index ? 'L' : 'M') + point.x + ' ' + point.y).join(' ');
  return '<path d="' + path + '" fill="none" stroke="#f6efe0" stroke-opacity=".18" stroke-width="1.2"></path>'
    + points.map(point => '<circle cx="' + point.x + '" cy="' + point.y + '" r="3.2" fill="#f6efe0" fill-opacity=".34"></circle>').join('');
}

function mindCoverFoilLines(seed) {
  const nums = mindCoverSeries(seed, 8, 0, 120);
  let html = '';
  for (let i = 0; i < 4; i += 1) {
    const y = 94 + (i * 42) + (nums[i] % 14);
    const c1 = 176 + (nums[i + 2] % 70);
    const c2 = 382 - (nums[i + 4] % 70);
    html += '<path d="M82 ' + y + 'C' + c1 + ' ' + (y - 34) + ' ' + c2 + ' ' + (y + 34) + ' 558 ' + (y - 4) + '" fill="none" stroke="#d6b66a" stroke-opacity=".16" stroke-width="1.3"></path>';
  }
  return html;
}

function mindCoverFamilySigil(family) {
  const sigils = {
    logic: '<circle cx="320" cy="178" r="76" fill="none" stroke="#f6efe0" stroke-opacity=".42" stroke-width="2"></circle><path d="M270 180h100M320 130v100M284 144l72 72M356 144l-72 72" fill="none" stroke="var(--mind-accent)" stroke-opacity=".7" stroke-width="5" stroke-linecap="round"></path>',
    science: '<ellipse cx="320" cy="180" rx="142" ry="44" fill="none" stroke="#f6efe0" stroke-opacity=".36" stroke-width="2"></ellipse><ellipse cx="320" cy="180" rx="142" ry="44" fill="none" stroke="#f6efe0" stroke-opacity=".24" stroke-width="2" transform="rotate(60 320 180)"></ellipse><ellipse cx="320" cy="180" rx="142" ry="44" fill="none" stroke="var(--mind-accent)" stroke-opacity=".56" stroke-width="3" transform="rotate(-60 320 180)"></ellipse><circle cx="320" cy="180" r="16" fill="#d6b66a" fill-opacity=".84"></circle>',
    tech: '<rect x="244" y="104" width="152" height="152" rx="18" fill="none" stroke="#f6efe0" stroke-opacity=".34" stroke-width="2"></rect><path d="M274 138h92M274 180h92M274 222h92M320 104V66M320 256v38M244 180h-38M396 180h38" fill="none" stroke="var(--mind-accent)" stroke-opacity=".66" stroke-width="4" stroke-linecap="round"></path>',
    world: '<circle cx="320" cy="180" r="98" fill="none" stroke="#f6efe0" stroke-opacity=".34" stroke-width="2"></circle><path d="M222 180h196M320 82c-34 38-50 70-50 98s16 60 50 98M320 82c34 38 50 70 50 98s-16 60-50 98" fill="none" stroke="var(--mind-accent)" stroke-opacity=".58" stroke-width="3" stroke-linecap="round"></path>',
    culture: '<rect x="238" y="96" width="164" height="168" rx="18" fill="none" stroke="#f6efe0" stroke-opacity=".34" stroke-width="2"></rect><path d="M274 132h92M274 174h92M274 216h58M238 264l-36 36M402 264l36 36" fill="none" stroke="var(--mind-accent)" stroke-opacity=".62" stroke-width="4" stroke-linecap="round"></path>',
  };
  return sigils[family] || sigils.logic;
}

function mindCoverCategorySigil(slug, family, seed) {
  const motif = CATEGORY_ART_MOTIFS[slug] || family;
  const drift = mindCoverSeries(seed, 6, -18, 37);
  const rotate = drift[0] / 3;
  const shiftX = drift[1] / 3;
  const shiftY = drift[2] / 4;
  const group = (body) => '<g transform="translate(' + shiftX + ' ' + shiftY + ') rotate(' + rotate + ' 320 180)">' + body + '</g>';
  const line = 'fill="none" stroke="var(--mind-accent)" stroke-opacity=".78" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"';
  const soft = 'fill="none" stroke="#f6efe0" stroke-opacity=".34" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
  const fill = 'fill="var(--mind-accent)" fill-opacity=".18" stroke="var(--mind-accent)" stroke-opacity=".5" stroke-width="2"';

  const motifs = {
    question: '<path d="M284 144c10-34 78-42 90 2 10 38-40 48-52 78" ' + line + '></path><circle cx="320" cy="266" r="8" fill="var(--mind-accent)" fill-opacity=".8"></circle><path d="M248 278h144" ' + soft + '></path>',
    maze: '<path d="M244 104h154v154H244zM282 104v72h72M398 144h-72v78M244 218h72v40" ' + line + '></path><path d="M282 258h116" ' + soft + '></path>',
    blocks: '<rect x="236" y="122" width="74" height="74" rx="14" ' + fill + '></rect><rect x="324" y="122" width="74" height="74" rx="14" ' + fill + '></rect><rect x="280" y="210" width="74" height="74" rx="14" ' + fill + '></rect>',
    column: '<path d="M250 112h140M270 138h100M286 138v118M354 138v118M260 256h120M240 286h160" ' + line + '></path>',
    profile: '<circle cx="292" cy="154" r="44" ' + soft + '></circle><path d="M220 276c22-54 122-54 144 0M370 124c38 30 46 82 16 124" ' + line + '></path>',
    dialogue: '<path d="M224 128h164a30 30 0 0 1 30 30v52a30 30 0 0 1-30 30h-62l-58 46v-46h-44a30 30 0 0 1-30-30v-52a30 30 0 0 1 30-30z" ' + line + '></path><path d="M252 172h124M252 204h88" ' + soft + '></path>',
    keyhole: '<circle cx="320" cy="152" r="54" ' + soft + '></circle><path d="M320 206l-44 88h88z" ' + line + '></path>',
    lens: '<circle cx="292" cy="164" r="72" ' + line + '></circle><path d="M344 216l70 70M254 164h76M292 126v76" ' + soft + '></path>',
    'cell-leaf': '<path d="M228 216c54-112 160-112 210-26-72 78-154 78-210 26z" ' + line + '></path><path d="M248 216c58-8 116-28 168-62M310 128c16 40 8 84-18 132" ' + soft + '></path>',
    'wild-track': '<circle cx="278" cy="162" r="22" ' + fill + '></circle><circle cx="330" cy="134" r="20" ' + fill + '></circle><circle cx="382" cy="164" r="22" ' + fill + '></circle><path d="M256 248c18-60 112-70 144 0 12 28-20 48-52 26-18-12-36-12-54 0-32 22-50 2-38-26z" ' + line + '></path>',
    'leaf-world': '<circle cx="320" cy="182" r="90" ' + soft + '></circle><path d="M246 194c62-88 160-82 188 2-62 58-126 62-188-2zM274 198c58-2 100-24 142-66" ' + line + '></path>',
    terrain: '<path d="M212 262l86-120 44 62 42-54 76 112z" ' + line + '></path><path d="M248 262h196M304 142l16 62M384 150l-8 58" ' + soft + '></path>',
    'equation-grid': '<path d="M226 126h188M226 178h188M226 230h188M278 92v176M362 92v176" ' + soft + '></path><path d="M246 276c52-120 96-120 148 0M258 198h112" ' + line + '></path>',
    atom: '<ellipse cx="320" cy="180" rx="136" ry="44" ' + line + '></ellipse><ellipse cx="320" cy="180" rx="136" ry="44" ' + soft + ' transform="rotate(60 320 180)"></ellipse><ellipse cx="320" cy="180" rx="136" ry="44" ' + soft + ' transform="rotate(-60 320 180)"></ellipse><circle cx="320" cy="180" r="14" fill="var(--mind-accent)" fill-opacity=".82"></circle>',
    flask: '<path d="M286 104h68M300 104v72l-70 106h180l-70-106v-72" ' + line + '></path><path d="M270 238h100M292 196h56" ' + soft + '></path>',
    'wave-lab': '<path d="M218 204c44-72 94 72 138 0s94 72 138 0" ' + line + '></path><path d="M236 260h168M278 104v92M362 104v92" ' + soft + '></path>',
    strata: '<path d="M214 128h214c32 0 54 28 44 58l-30 92H198l-28-88c-10-34 14-62 44-62z" ' + line + '></path><path d="M204 178c58 18 126-20 188 4 30 12 50 8 74-4M218 230c62-16 112 18 176 0 28-8 48-8 70 0" ' + soft + '></path>',
    pulse: '<path d="M206 202h74l26-70 42 134 32-64h54" ' + line + '></path><path d="M242 128h156a28 28 0 0 1 28 28v88a28 28 0 0 1-28 28H242a28 28 0 0 1-28-28v-88a28 28 0 0 1 28-28z" ' + soft + '></path>',
    capsule: '<path d="M236 226l106-106a60 60 0 0 1 86 86L322 312a60 60 0 0 1-86-86zM288 174l86 86" ' + line + '></path>',
    orbit: '<circle cx="320" cy="180" r="22" fill="var(--mind-accent)" fill-opacity=".74"></circle><ellipse cx="320" cy="180" rx="148" ry="54" ' + line + '></ellipse><ellipse cx="320" cy="180" rx="148" ry="54" ' + soft + ' transform="rotate(-32 320 180)"></ellipse>',
    energy: '<path d="M342 80l-112 138h84l-28 74 126-146h-88z" ' + line + '></path>',
    terminal: '<rect x="220" y="116" width="200" height="144" rx="18" ' + soft + '></rect><path d="M258 164l36 28-36 28M312 224h70" ' + line + '></path>',
    blueprint: '<rect x="228" y="106" width="184" height="152" rx="18" ' + soft + '></rect><path d="M262 218l52-92 52 92M288 178h52" ' + line + '></path>',
    crt: '<rect x="218" y="112" width="204" height="138" rx="20" ' + line + '></rect><path d="M278 286h84M320 250v36M252 154h136M252 190h82" ' + soft + '></path>',
    bridge: '<path d="M204 248h232M236 248c20-90 148-90 168 0M236 190h168M260 190v58M320 174v74M380 190v58" ' + line + '></path>',
    circuit: '<path d="M220 180h92v-58h108M312 180v74h108M312 180h108" ' + line + '></path><circle cx="220" cy="180" r="16" ' + fill + '></circle><circle cx="420" cy="122" r="16" ' + fill + '></circle><circle cx="420" cy="254" r="16" ' + fill + '></circle>',
    gear: '<circle cx="320" cy="180" r="58" ' + line + '></circle><circle cx="320" cy="180" r="20" ' + soft + '></circle><path d="M320 88v42M320 230v42M228 180h42M370 180h42M256 116l30 30M354 214l30 30M384 116l-30 30M286 214l-30 30" ' + line + '></path>',
    network: '<circle cx="250" cy="142" r="22" ' + fill + '></circle><circle cx="390" cy="142" r="22" ' + fill + '></circle><circle cx="320" cy="246" r="22" ' + fill + '></circle><path d="M270 152l100-2M262 162l42 66M378 162l-42 66" ' + line + '></path>',
    arch: '<path d="M234 282V176c0-58 38-98 86-98s86 40 86 98v106M264 282V178c0-38 24-66 56-66s56 28 56 66v104M214 282h212" ' + line + '></path>',
    bulb: '<path d="M320 86c-52 0-86 38-86 84 0 34 18 58 46 76v38h80v-38c28-18 46-42 46-76 0-46-34-84-86-84zM286 318h68" ' + line + '></path>',
    pitch: '<rect x="218" y="104" width="204" height="152" rx="16" ' + soft + '></rect><path d="M320 104v152M218 180h204M284 180a36 36 0 1 0 72 0 36 36 0 1 0-72 0" ' + line + '></path>',
    road: '<path d="M270 286l42-176h16l42 176M320 132v38M320 202v42M238 286h164" ' + line + '></path>',
    map: '<path d="M220 130l72-28 72 28 72-28v148l-72 28-72-28-72 28zM292 102v148M364 130v148" ' + line + '></path>',
    banner: '<path d="M244 96v190M244 112h160l-28 54 28 54H244" ' + line + '></path>',
    coin: '<circle cx="320" cy="180" r="92" ' + line + '></circle><path d="M350 134h-44a34 34 0 0 0 0 68h28a26 26 0 0 1 0 52h-62M320 108v144" ' + soft + '></path>',
    'globe-lines': '<circle cx="320" cy="180" r="92" ' + line + '></circle><path d="M228 180h184M320 88c-34 42-44 72-44 92s10 50 44 92M320 88c34 42 44 72 44 92s-10 50-44 92" ' + soft + '></path>',
    table: '<path d="M238 210h164M270 210c4 42 96 42 100 0M258 154c42-28 88-28 124 0M286 126v50M354 126v50" ' + line + '></path>',
    timeline: '<path d="M220 180h200M260 180v-58M320 180v76M380 180v-46" ' + line + '></path><circle cx="260" cy="122" r="18" ' + fill + '></circle><circle cx="320" cy="256" r="18" ' + fill + '></circle><circle cx="380" cy="134" r="18" ' + fill + '></circle>',
    temple: '<path d="M222 150h196M250 150v110M294 150v110M346 150v110M390 150v110M210 260h220M238 120l82-44 82 44z" ' + line + '></path>',
    'heritage-arch': '<path d="M230 280V170c0-56 36-94 90-94s90 38 90 94v110M270 280V176c0-32 18-58 50-58s50 26 50 58v104" ' + line + '></path>',
    scales: '<path d="M320 94v182M250 134h140M250 134l-44 94h88zM390 134l-44 94h88zM276 286h88" ' + line + '></path>',
    chart: '<path d="M232 266V116M232 266h184M270 226v-42M320 226v-90M370 226v-64" ' + line + '></path>',
    market: '<path d="M226 250c38-80 86-44 112-92 28-52 66-40 78-52M386 104h32v32" ' + line + '></path><path d="M226 250h190" ' + soft + '></path>',
    nodes: '<circle cx="250" cy="146" r="24" ' + fill + '></circle><circle cx="390" cy="146" r="24" ' + fill + '></circle><circle cx="320" cy="250" r="24" ' + fill + '></circle><path d="M274 146h92M262 166l42 64M378 166l-42 64" ' + soft + '></path>',
    letterform: '<path d="M244 256l76-152 76 152M280 196h80M420 132v124M420 132h-42M420 194h-38M420 256h-48" ' + line + '></path>',
    canvas: '<rect x="228" y="108" width="184" height="132" rx="16" ' + line + '></rect><path d="M258 214l42-46 34 34 28-32 34 44M292 270h56" ' + soft + '></path>',
    book: '<path d="M226 112h84c30 0 46 16 46 46v126c0-30-16-46-46-46h-84zM414 112h-84c-30 0-46 16-46 46v126c0-30 16-46 46-46h84z" ' + line + '></path>',
    'sound-stage': '<path d="M248 228V124l86-24v118c0 26-22 46-48 46s-38-14-38-36zM334 130h70v92" ' + line + '></path>',
    'myth-star': '<path d="M320 84l28 70 76 6-58 48 18 74-64-40-64 40 18-74-58-48 76-6z" ' + line + '></path>',
    screen: '<rect x="218" y="112" width="204" height="132" rx="18" ' + line + '></rect><path d="M280 284h80M320 244v40M282 152h76M282 188h110" ' + soft + '></path>',
    film: '<rect x="224" y="112" width="192" height="148" rx="18" ' + line + '></rect><path d="M264 112v148M376 112v148M224 152h192M224 220h192" ' + soft + '></path>',
    'motion-frame': '<path d="M232 130h176v112H232zM270 282l96-192M234 282l96-192M306 282l96-192" ' + line + '></path>',
    'signal-burst': '<circle cx="320" cy="180" r="36" ' + fill + '></circle><path d="M320 86v46M320 228v46M226 180h46M368 180h46M254 114l32 32M354 214l32 32M386 114l-32 32M286 214l-32 32" ' + line + '></path>',
    shield: '<path d="M320 84l100 42v76c0 74-48 116-100 138-52-22-100-64-100-138v-76z" ' + line + '></path><path d="M320 126v154M272 184h96" ' + soft + '></path>',
    portal: '<ellipse cx="320" cy="180" rx="100" ry="132" ' + line + '></ellipse><ellipse cx="320" cy="180" rx="52" ry="92" ' + soft + '></ellipse><path d="M230 180h180" ' + soft + '></path>',
  };

  return group(motifs[motif] || motifs[family] || motifs.question);
}

const CATEGORY_COLORS = {
  'art-and-painters': '#FF6B6B',
  'biology': '#2DD4BF',
  'books-and-quotes': '#D4A455',
  'business-and-management': '#60A5FA',
  'chemistry': '#C084FC',
  'civil-engineering': '#94A3B8',
  'classic-riddles': '#A78BFA',
  'coding-and-design': '#38BDF8',
  'electrical-engineering': '#FBBF24',
  'flag-questions': '#F87171',
  'football': '#4ADE80',
  'geography': '#38BDF8',
  'geology': '#B8956A',
  'history': '#FB7185',
  'infrastructure-systems': '#94A3B8',
  'kids-riddles': '#FBBF24',
  'law-middle-east': '#C9A227',
  'math': '#818CF8',
  'mechanical-engineering': '#94A3B8',
  'medical-questions': '#F472B6',
  'middle-east-history': '#F9A825',
  'philosophy': '#C084FC',
  'physical-and-life-sciences': '#22D3EE',
  'pharmacy': '#4ADE80',
  'psychology': '#A78BFA',
  'relationship-questions': '#FB7185',
  'science': '#22D3EE',
  'social-sciences': '#34D399',
  'software-and-computing': '#818CF8',
  'space-and-astrology': '#6366F1',
  'story-mysteries': '#818CF8',
  'tv-shows-trivia': '#E879F9',
  'world-habits-and-etiquette': '#FB923C',
  'environment-and-ecology': '#4ADE80',
  'ancient-civilizations': '#FCD34D',
  'inventions-and-minds': '#FB923C',
  'animal-kingdom': '#86EFAC',
  'economics-and-finance': '#FCD34D',
  'architecture-and-landmarks': '#FDA4AF',
  'music-and-performing-arts': '#F472B6',
  'food-and-cuisines': '#FDBA74',
  'cinema-and-film-history': '#F87171',
  'future-tech-and-energy': '#67E8F9',
  'anime': '#FB7185',
  'ayam-tayebeen': '#C084FC',
  'mythology-legends': '#D4AF37',
  'true-crime': '#8B0000',
  'pop-culture': '#FF69B4',
  'superheroes': '#EF4444',
  'fictional-worlds': '#10B981',
  'survival': '#228B22',
  'automotive': '#F97316',
  'linguistics': '#8B5CF6',
  'currencies': '#059669',
  'tech-retro': '#84CC16',
};

const UI = {
  en: {
    brandSubtitle: 'bilingual categories, teams, and saved progress',
    navHome: 'Home',
    navCategories: 'Mind Lab',
    navGameHub: 'Game Hub',
    navContact: 'Contact',
    navLeaderboard: 'Leaderboard',
    navBattle: 'Battle',
    navSearch: 'Search',
    authOpen: 'Create account',
    language: 'Language',
    homeEyebrow: 'Riddles, quizzes, and games',
    mindLabHeroTitle: 'The Mind Lab',
    mindLabHeroSubtitle: 'Pick a topic. Answer questions. Track your score.',
    homeTitle: 'Play riddles, quizzes, and brain games in English and Arabic.',
    homeText: 'Choose a topic, answer questions, play games, and save your progress.',
    browseCategories: 'Enter Mind Lab',
    heroGameHub: 'Open Game Hub',
    statCategories: 'Topics',
    statQuestions: 'Questions',
    statGames: 'Games',
    statLanguages: 'Languages',
    portalMindTag: 'Mind Lab',
    portalMindTitle: 'Mind Lab',
    portalMindDesc: 'Riddles, quizzes, trivia, science, history, culture, and logic in simple topic pages.',
    portalMindStat: '10 topics',
    portalMindStat2: '3,000+ questions',
    portalMindCta: 'Explore Mind Lab',
    portalGamesTag: 'Game Hub',
    portalGamesTitle: 'Game Hub',
    portalGamesDesc: '20 brain games including Chess, Checkers, Go, Reversi, Hex, Oware, and more. Play the computer or invite a player.',
    portalGamesStat1: '20 games live',
    portalGamesStat2: 'Computer or online',
    portalGamesCta: 'Open Game Hub',
    playerPortalTag: 'Player Profile',
    playerPortalTitle: 'Your JAKH account center.',
    playerPortalDesc: 'Sign in once to save progress, favorites, game scores, and your last activity across devices.',
    playerPortalSignedTitle: 'Welcome back, {name}.',
    playerPortalSignedDesc: 'Your progress is synced. Jump back in, review your stats, or manage your account.',
    playerPortalPoint1: 'Save progress on every device',
    playerPortalPoint2: 'Use one name on leaderboards',
    playerPortalPoint3: 'Resume your last topic fast',
    playerPortalOpenProfile: 'Open Profile',
    playerPortalAdmin: 'Admin Dashboard',
    playerPortalStart: 'Start with Mind Lab',
    playerPortalGames: 'Open Game Hub',
    playerPortalResume: 'Continue',
    profileSynced: 'Synced account',
    profileOverview: 'Overview',
    profileIdentity: 'Profile mark',
    profileIdentityDesc: 'Choose a clean visual mark for your profile and leaderboards.',
    profileSecurity: 'Security',
    profileSecurityDesc: 'Change your password without affecting saved progress.',
    profileSupport: 'Support and privacy',
    profileTopAreas: 'Top areas',
    profileNoTopAreas: 'Start a topic and your strongest areas will appear here.',
    profileAchievements: 'Achievements',
    profileNoAchievements: 'No achievements yet. Answer a few questions to unlock your first badge.',
    profileCurrentPassword: 'Current password',
    profileNewPassword: 'New password',
    profileUpdatePassword: 'Update password',
    profileContact: 'Recommend a change',
    profilePrivacy: 'Privacy policy',
    profileMember: 'Member',
    profileOwner: 'Owner',
    profileAdmin: 'Admin',
    createAccount: 'Save my progress',
    todayMomentum: 'Your snapshot',
    categoryEyebrow: 'Choose a section',
    categoryTitle: 'Choose a topic',
    categoryText: 'Pick one clear topic, or search across the original category pages.',
    searchCategoriesLabel: 'Search topics',
    tracksLabel: 'Sections',
    resetDirectoryFilters: 'Reset filters',
    authEyebrow: 'Profile',
    authTitle: 'Create account or sign in',
    footerNote: 'All rights reserved to JAKH 2026',
    footerContact: 'Recommend changes',
    footerPrivacy: 'Privacy',

    pageProgress: 'Page progress',
    insidePageEyebrow: 'Questions',
    insidePageTitle: 'Start easy. Build up.',
    insidePageText: 'Questions are sorted from easy to difficult by default. Search or filter only when you need to.',
    searchThisPageLabel: 'Search questions',
    difficultyLabel: 'Difficulty',
    showLabel: 'Progress',
    sortLabel: 'Order',
    subcategoriesLabel: 'Sections',
    resetFilters: 'Clear',
    categoryFlowHint: 'Default order: Easy to Expert',
    emptyTitle: 'No cards match that combination.',
    emptyText: 'Try clearing a filter or broadening the search.',
    relatedEyebrow: 'Keep exploring',
    relatedTitle: 'Explore more',
    relatedText: 'Jump to nearby pages without going back to the home page.',
    easy: 'Easy',
    medium: 'Medium',
    hard: 'Hard',
    veryAdvanced: 'Expert',
    allLevels: 'All levels',
    everything: 'Everything',
    onlyUnsolved: 'Only unsolved',
    onlySolved: 'Only solved',
    onlyFavorites: 'Only favorites',
    featuredOrder: 'Original order',
    byDifficulty: 'Easy to difficult',
    aToZ: 'A → Z',
    shuffleNow: 'Shuffle',
    pageQuestions: '{count} questions',
    categoryCountLabel: '{count} categories',
    totalQuestionLabel: '{count} questions',
    showingAllPages: 'Showing all {count} topics.',
    showingAllCollections: 'Showing all {count} topics.',
    showingFilteredCollections: 'Showing {count} topics.',
    showingSearchPages: 'Showing {count} matching topics.',
    openCollection: 'Open',
    showingAllCards: 'Showing all {count} cards on this page.',
    showingFilteredCards: 'Showing {count} cards with your current filters.',
    openPage: 'Open page',
    savedProgress: 'Saved progress',
    guestTitle: 'Sign up to continue',
    guestText: 'Create a free account to open questions, save progress, favorites, and game scores.',
    createLocalProfile: 'Create account',
    contactTag: 'Contact',
    contactTitle: 'Talk to JAKH',
    contactText: 'Use the recommendation box to send page fixes, content ideas, account notes, or partnership requests.',
    contactEmailLabel: 'Recommendation box',
    signedInAs: 'Signed in as',
    score: 'Score',
    solved: 'Solved',
    favorites: 'Favorites',
    authSignInTab: 'Sign in',
    authRegisterTab: 'Create account',
    username: 'Username',
    password: 'Password',
    passwordHint: 'Use at least 15 characters. A short phrase works best.',
    signIn: 'Sign in',
    register: 'Create account',
    logout: 'Log out',
    accountReady: 'Your progress is saved to your cloud account.',
    flipForAnswer: 'Show answer',
    backToQuestion: 'Show question',
    addFavorite: 'Add favorite',
    removeFavorite: 'Remove favorite',
    markSolved: 'Correct',
    markWrong: 'Wrong',
    markUnsolved: 'Remove',
    answerReveal: 'Answer',
    loginNeeded: 'Please sign in first to view questions, save favorites, and score.',
    accountCreated: 'Account created and signed in.',
    signedIn: 'Signed in successfully.',
    signedOut: 'Signed out.',
    badLogin: 'Username or password is incorrect.',
    userExists: 'That username is already taken.',
    languageSet: 'Language updated.',
    directoryResetDone: 'Category filters reset.',
    pageResetDone: 'Page filters reset.',
    favoriteAdded: 'Added to favorites.',
    favoriteRemoved: 'Removed from favorites.',
    solvedAdded: 'Correct! Score updated.',
    markedWrong: 'Marked as wrong.',
    solvedRemoved: 'Answer removed.',
    memberName: 'Member name',
    resetScore: 'Reset score',
    noRelated: 'No related categories available.',
    audioPlay: 'Read aloud',
    audioStop: 'Stop',
    audioOn: 'Audio on',
    audioOff: 'Audio off',
    suggestTitle: 'Recommend a change',
    suggestSub: 'Send page fixes, category ideas, account notes, privacy requests, game suggestions, or partnership notes.',
    suggestPlaceholder: 'What should we change or add?',
    suggestEmailPlaceholder: 'Email (optional)',
    suggestSubmit: 'Submit Idea',
    suggestThanks: 'Thank you! We\'ll take a look.',
    suggestError: 'Please write at least 5 characters.',
    suggestDuplicate: 'This suggestion was already sent.',
    lockHard: 'Answer any 10 questions correctly to unlock Hard.',
    lockDifficult: 'Answer 10 Hard questions correctly to unlock Expert.',
    lockSignIn: 'Sign in to unlock this level.',
    badgesTitle: 'Badges',
    badgeBronze: 'Bronze — 10 Easy questions answered correctly',
    badgeSilver: 'Silver — 10 Medium questions answered correctly',
    badgeGold: 'Gold — 10 Hard questions answered correctly',
    badgeDiamond: 'Diamond — 10 Expert questions answered correctly',
    reportTitle: 'Score Report',
    reportCategory: 'Category',
    reportCorrect: 'Correct',
    reportWrong: 'Wrong',
    // Achievements
    achievementsTitle: 'Achievements',
    achNoAchievements: 'No achievements yet — start answering!',
    bgEyebrow: 'Strategy · Classic',
    bgTitle: 'Backgammon',
    bgDesc: 'Roll dice, move your checkers, and bear them all off before your opponent. Blot-hitting and blocking encouraged.',
    // Report
    reportBtn: 'Report',
    reportThanks: 'Reported — thanks for the feedback!',
    reportError: 'Could not submit report.',
    // Share
    shareCopied: 'Result copied to clipboard!',
    // Streak freeze
    streakFreezeLabel: 'Freeze',
  },
  ar: {
    brandSubtitle: 'فئات ثنائية اللغة مع فرق وتقدّم محفوظ',
    navHome: 'الرئيسية',
    navCategories: 'مختبر العقل',
    navGameHub: 'مركز الألعاب',
    navContact: 'تواصل',
    navLeaderboard: 'المتصدرون',
    navBattle: 'معركة',
    navSearch: 'بحث',
    authOpen: 'إنشاء حساب',
    language: 'اللغة',
    homeEyebrow: 'ألغاز واختبارات وألعاب عقلية',
    mindLabHeroTitle: 'مختبر العقل',
    mindLabHeroSubtitle: 'اختر موضوعًا، أجب عن الأسئلة، وتابع تقدمك.',
    homeTitle: 'ألغاز واختبارات وألعاب عقلية بالعربية والإنجليزية.',
    homeText: 'اختر موضوعًا، أجب عن الأسئلة، العب، واحفظ تقدمك.',
    browseCategories: 'ادخل مختبر العقل',
    heroGameHub: 'افتح مركز الألعاب',
    statCategories: 'مجموعات',
    statQuestions: 'الأسئلة',
    statGames: 'الألعاب',
    statLanguages: 'اللغات',
    portalMindTag: 'مختبر العقل',
    portalMindTitle: 'مختبر العقل',
    portalMindDesc: 'ألغاز واختبارات وعلوم وتاريخ وثقافة ومنطق في صفحات بسيطة.',
    portalMindStat: '10 مواضيع',
    portalMindStat2: '+3000 سؤال',
    portalMindCta: 'استكشف مختبر العقل',
    portalGamesTag: 'مركز الألعاب',
    portalGamesTitle: 'مركز الألعاب',
    portalGamesDesc: '20 لعبة عقلية مثل الشطرنج والداما وغو وريفيرسي وهكس وأواري. العب ضد الكمبيوتر أو ادع لاعباً.',
    portalGamesStat1: '20 لعبة',
    portalGamesStat2: 'كمبيوتر أو أونلاين',
    portalGamesCta: 'افتح مركز الألعاب',
    playerPortalTag: 'الملف الشخصي',
    playerPortalTitle: 'مركز حسابك في JAKH.',
    playerPortalDesc: 'سجّل الدخول مرة واحدة لحفظ التقدم والمفضلة ونتائج الألعاب وآخر نشاط على كل أجهزتك.',
    playerPortalSignedTitle: 'مرحبًا بعودتك، {name}.',
    playerPortalSignedDesc: 'تقدمك محفوظ. تابع اللعب، راجع ملخصك، أو أدِر حسابك.',
    playerPortalPoint1: 'احفظ تقدمك على كل جهاز',
    playerPortalPoint2: 'اسم واحد في لوحات المتصدرين',
    playerPortalPoint3: 'تابع آخر موضوع بسرعة',
    playerPortalOpenProfile: 'افتح الملف الشخصي',
    playerPortalAdmin: 'لوحة الإدارة',
    playerPortalStart: 'ابدأ في مختبر العقل',
    playerPortalGames: 'افتح مركز الألعاب',
    playerPortalResume: 'تابع',
    profileSynced: 'حساب متزامن',
    profileOverview: 'نظرة عامة',
    profileIdentity: 'علامة الملف',
    profileIdentityDesc: 'اختر علامة بصرية نظيفة لحسابك ولوحات المتصدرين.',
    profileSecurity: 'الأمان',
    profileSecurityDesc: 'غيّر كلمة المرور من دون التأثير على تقدمك المحفوظ.',
    profileSupport: 'الدعم والخصوصية',
    profileTopAreas: 'أقوى المجالات',
    profileNoTopAreas: 'ابدأ موضوعًا وستظهر أقوى مجالاتك هنا.',
    profileAchievements: 'الإنجازات',
    profileNoAchievements: 'لا توجد إنجازات بعد. أجب عن بضعة أسئلة لفتح أول شارة.',
    bgEyebrow: 'استراتيجية · كلاسيكية',
    bgTitle: 'لعبة الطاولة',
    bgDesc: 'ارمي النرد، وحرّك أحجارك، وأخرجها جميعها قبل خصمك. يُنصح بالضرب والعرقلة.',
    profileCurrentPassword: 'كلمة المرور الحالية',
    profileNewPassword: 'كلمة المرور الجديدة',
    profileUpdatePassword: 'تحديث كلمة المرور',
    profileContact: 'تواصل مع الدعم',
    profilePrivacy: 'سياسة الخصوصية',
    profileMember: 'عضو',
    profileOwner: 'مالك',
    profileAdmin: 'مشرف',
    createAccount: 'احفظ تقدمي',
    todayMomentum: 'ملخصك',
    categoryEyebrow: 'اختر قسمًا',
    categoryTitle: 'اختر موضوعًا',
    categoryText: 'اختر موضوعًا واضحًا، أو ابحث في صفحات الفئات الأصلية.',
    searchCategoriesLabel: 'ابحث في المواضيع',
    tracksLabel: 'الأقسام',
    resetDirectoryFilters: 'إعادة الضبط',
    authEyebrow: 'الملف الشخصي',
    authTitle: 'أنشئ حسابًا أو سجّل الدخول',
    footerNote: 'جميع الحقوق محفوظة لـ JAKH 2026',
    footerContact: 'اقترح تغييرات',
    footerPrivacy: 'الخصوصية',

    pageProgress: 'تقدم الصفحة',
    insidePageEyebrow: 'الأسئلة',
    insidePageTitle: 'ابدأ بالسهل ثم تقدّم',
    insidePageText: 'تظهر الأسئلة من السهل إلى الأصعب تلقائيًا. استخدم البحث أو الفلاتر عند الحاجة.',
    searchThisPageLabel: 'ابحث في الأسئلة',
    difficultyLabel: 'الصعوبة',
    showLabel: 'التقدم',
    sortLabel: 'الترتيب',
    subcategoriesLabel: 'الأقسام',
    resetFilters: 'مسح',
    categoryFlowHint: 'الترتيب الافتراضي: من السهل إلى الخبير',
    emptyTitle: 'لا توجد نتائج.',
    emptyText: 'جرّب إزالة أحد الفلاتر أو توسيع البحث.',
    relatedEyebrow: 'واصل الاستكشاف',
    relatedTitle: 'استكشف المزيد',
    relatedText: 'انتقل إلى صفحات قريبة من دون الرجوع إلى الصفحة الرئيسية.',
    easy: 'سهل',
    medium: 'متوسط',
    hard: 'صعب',
    veryAdvanced: 'خبير',
    allLevels: 'كل المستويات',
    everything: 'الكل',
    onlyUnsolved: 'غير المحلول فقط',
    onlySolved: 'المحلول فقط',
    onlyFavorites: 'المفضلة فقط',
    featuredOrder: 'الترتيب الأصلي',
    byDifficulty: 'من الأسهل للأصعب',
    aToZ: 'أ → ي',
    shuffleNow: 'خلط',
    pageQuestions: '{count} سؤال',
    categoryCountLabel: '{count} فئة',
    totalQuestionLabel: '{count} سؤال',
    showingAllPages: 'عرض كل المواضيع: {count}.',
    showingAllCollections: 'عرض كل المواضيع: {count}.',
    showingFilteredCollections: 'عرض {count} موضوع.',
    showingSearchPages: 'عرض {count} موضوع يطابق البحث.',
    openCollection: 'افتح',
    showingAllCards: 'يتم عرض كل بطاقات الصفحة وعددها {count}.',
    showingFilteredCards: 'يتم عرض {count} بطاقة وفق الفلاتر الحالية.',
    openPage: 'افتح الصفحة',
    savedProgress: 'تقدم محفوظ',
    guestTitle: 'أنشئ حسابًا للمتابعة',
    guestText: 'أنشئ حسابًا مجانيًا لفتح الأسئلة وحفظ التقدم والمفضلة ونتائج الألعاب.',
    createLocalProfile: 'إنشاء حساب',
    contactTag: 'تواصل',
    contactTitle: 'تواصل مع JAKH',
    contactText: 'استخدم صندوق الاقتراحات لإرسال تصحيحات الصفحات أو أفكار المحتوى أو ملاحظات الحساب أو طلبات الشراكة.',
    contactEmailLabel: 'صندوق الاقتراحات',
    signedInAs: 'مسجل باسم',
    score: 'النقاط',
    solved: 'المحلول',
    favorites: 'المفضلة',
    authSignInTab: 'تسجيل الدخول',
    authRegisterTab: 'إنشاء حساب',
    username: 'اسم المستخدم',
    password: 'كلمة المرور',
    passwordHint: 'استخدم 15 حرفًا على الأقل. عبارة قصيرة يسهل تذكرها أفضل.',
    signIn: 'دخول',
    register: 'إنشاء حساب',
    logout: 'تسجيل الخروج',
    accountReady: 'تقدمك محفوظ في حسابك السحابي.',
    flipForAnswer: 'عرض الإجابة',
    backToQuestion: 'عرض السؤال',
    addFavorite: 'أضف للمفضلة',
    removeFavorite: 'أزل من المفضلة',
    markSolved: 'صحيح',
    markWrong: 'خاطئ',
    markUnsolved: 'إزالة',
    answerReveal: 'الإجابة',
    loginNeeded: 'الرجاء تسجيل الدخول أولًا لعرض الأسئلة وحفظ المفضلة والنقاط.',
    accountCreated: 'تم إنشاء الحساب وتسجيل الدخول.',
    signedIn: 'تم تسجيل الدخول بنجاح.',
    signedOut: 'تم تسجيل الخروج.',
    badLogin: 'اسم المستخدم أو كلمة المرور غير صحيحين.',
    userExists: 'اسم المستخدم هذا مأخوذ بالفعل.',
    languageSet: 'تم تحديث اللغة.',
    directoryResetDone: 'تمت إعادة ضبط فلاتر الفئات.',
    pageResetDone: 'تمت إعادة ضبط فلاتر الصفحة.',
    favoriteAdded: 'تمت الإضافة إلى المفضلة.',
    favoriteRemoved: 'تمت الإزالة من المفضلة.',
    solvedAdded: 'صحيح! تم تحديث النقاط.',
    markedWrong: 'تم وضعه كخاطئ.',
    solvedRemoved: 'تمت إزالة الإجابة.',
    memberName: 'اسم العضو',
    resetScore: 'تصفير النقاط',
    noRelated: 'لا توجد صفحات قريبة متاحة.',
    audioPlay: 'اقرأ بصوت عالٍ',
    audioStop: 'إيقاف',
    audioOn: 'الصوت مفعّل',
    audioOff: 'الصوت معطّل',
    suggestTitle: 'اقترح تغييرًا',
    suggestSub: 'أرسل تصحيحات الصفحات أو أفكار الفئات أو ملاحظات الحساب أو طلبات الخصوصية أو اقتراحات الألعاب أو الشراكات.',
    suggestPlaceholder: 'ما الذي يجب تغييره أو إضافته؟',
    suggestEmailPlaceholder: 'البريد الإلكتروني (اختياري)',
    suggestSubmit: 'أرسل الفكرة',
    suggestThanks: 'شكرًا لك! سنراجع اقتراحك.',
    suggestError: 'الرجاء كتابة 5 أحرف على الأقل.',
    suggestDuplicate: 'تم إرسال هذا الاقتراح من قبل.',
    lockHard: 'أجب على 10 أسئلة صحيحة لفتح المستوى الصعب.',
    lockDifficult: 'أجب على 10 أسئلة صعبة صحيحة لفتح مستوى الخبير.',
    lockSignIn: 'سجّل الدخول لفتح هذا المستوى.',
    badgesTitle: 'الشارات',
    badgeBronze: 'برونزية — 10 أسئلة سهلة صحيحة',
    badgeSilver: 'فضية — 10 أسئلة متوسطة صحيحة',
    badgeGold: 'ذهبية — 10 أسئلة صعبة صحيحة',
    badgeDiamond: 'ماسية — 10 أسئلة خبير صحيحة',
    reportTitle: 'تقرير النتائج',
    reportCategory: 'الفئة',
    reportCorrect: 'صحيح',
    reportWrong: 'خاطئ',
    achievementsTitle: 'الإنجازات',
    achNoAchievements: 'لا إنجازات بعد — ابدأ بالإجابة!',
    reportBtn: 'إبلاغ',
    reportThanks: 'تم الإبلاغ — شكرًا على ملاحظتك!',
    reportError: 'تعذّر إرسال البلاغ.',
    shareCopied: 'تم نسخ النتيجة!',
    streakFreezeLabel: 'تجميد',
  }
};

const state = {
  lang: 'en',
  catalog: null,
  page: document.body.dataset.page || 'home',
  categorySlug: document.body.dataset.category || '',
  categoryData: null,
  directorySearch: '',
  cluster: 'all',
  search: '',
  difficulty: 'all',
  view: 'all',
  sort: 'difficulty',
  subcategory: 'all',
  dbUser: null,
  flipped: new Set(),
  cardPage: 1,
  streak: 0,
  freezeCount: 0,
  dailyCard: null,
};

const timedQuizState = {
  cards: [], index: 0, score: 0, timer: null, timeLeft: 20,
};
const TRUTH_DASH_SECONDS = 12;

const ACHIEVEMENTS = [
  {
    id: 'first-solve', icon: '', en: 'First Steps', ar: 'الخطوة الأولى',
    descEn: 'Answer your first question correctly', descAr: 'أجب على سؤالك الأول بشكل صحيح',
    check: () => getTotalCorrectCount() >= 1
  },
  {
    id: 'scholar', icon: '', en: 'Scholar', ar: 'العالم',
    descEn: 'Answer 100 questions correctly', descAr: 'أجب على 100 سؤال بشكل صحيح',
    check: () => getTotalCorrectCount() >= 100
  },
  {
    id: 'streak-7', icon: '', en: '7-Day Streak', ar: '٧ أيام متتالية',
    descEn: '7 consecutive active days', descAr: '٧ أيام نشاط متتالية',
    check: () => state.streak >= 7
  },
  {
    id: 'category-master', icon: '', en: 'Category Master', ar: 'سيد الفئة',
    descEn: 'Complete any category 100%', descAr: 'أكمل أي فئة بنسبة 100%',
    check: () => getCategoryMasterCount() >= 1
  },
  {
    id: 'completionist', icon: '', en: 'Completionist', ar: 'المكتمل',
    descEn: 'Complete 5 categories 100%', descAr: 'أكمل 5 فئات بنسبة 100%',
    check: () => getCategoryMasterCount() >= 5
  },
  {
    id: 'speed-demon', icon: '', en: 'Speed Demon', ar: 'الرعد',
    descEn: 'Score 8/10+ in Truth Dash', descAr: 'احصل على 8/10 أو أعلى في سباق الحقيقة',
    check: () => loadJson('jakh-speed-demon', 0) >= 1
  },
  {
    id: 'bookworm', icon: '', en: 'Bookworm', ar: 'نهم القراءة',
    descEn: 'Add 20 questions to favorites', descAr: 'أضف 20 سؤالاً إلى المفضلة',
    check: () => getFavoriteSet().size >= 20
  },
  {
    id: 'bilingual', icon: '', en: 'Bilingual', ar: 'ثنائي اللغة',
    descEn: 'Use both Arabic and English modes', descAr: 'استخدم العربية والإنجليزية',
    check: () => !!loadJson('jakh-used-ar', 0) && !!loadJson('jakh-used-en', 0)
  },
  {
    id: 'night-owl', icon: '', en: 'Night Owl', ar: 'بومة الليل',
    descEn: 'Answer a question after midnight', descAr: 'أجب على سؤال بعد منتصف الليل',
    check: () => !!loadJson('jakh-night-owl', 0)
  },
  {
    id: 'streak-30', icon: '', en: '30-Day Streak', ar: '٣٠ يوماً متتالياً',
    descEn: '30 consecutive active days', descAr: '٣٠ يوم نشاط متتالي',
    check: () => state.streak >= 30
  },
  {
    id: 'hard-solver', icon: '', en: 'Hard Hitter', ar: 'مواجه الصعاب',
    descEn: 'Answer 25 hard or difficult questions correctly', descAr: 'أجب بشكل صحيح على 25 سؤالاً صعباً',
    check: () => getCorrectCountByDifficulty('hard') + getCorrectCountByDifficulty('very-advanced') >= 25
  },
  {
    id: 'sharer', icon: '', en: 'Sharer', ar: 'المشارك',
    descEn: 'Share your first question', descAr: 'شارك سؤالك الأول',
    check: () => !!loadJson('jakh-shared', 0)
  },
];

const completedCategoriesShown = new Set();

const els = {};

function t(key) {
  return (UI[state.lang] && UI[state.lang][key]) || (UI.en && UI.en[key]) || key;
}

function fmt(key, vars = {}) {
  return t(key).replace(/\{(\w+)\}/g, (_, token) => String(vars[token] ?? ''));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function stripEmoji(value) {
  return String(value || '')
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]\uFE0F?(?:\u200D[\p{Emoji_Presentation}\p{Extended_Pictographic}]\uFE0F?)*/gu, '')
    .replace(/[\uFE0F\u200D]/g, '')
    .trim();
}

const PROFILE_MARKS = [
  {
    id: 'arc',
    glyph: 'A',
    tone: 'cyan',
    pattern: 'arc',
    name: { en: 'Arc Light', ar: 'قوس الضوء' },
    note: { en: 'Clean, calm, focused.', ar: 'هادئة وواضحة ومركزة.' },
  },
  {
    id: 'cipher',
    glyph: 'C',
    tone: 'violet',
    pattern: 'cipher',
    name: { en: 'Cipher', ar: 'الشيفرة' },
    note: { en: 'For puzzle solvers.', ar: 'لمحبي الألغاز.' },
  },
  {
    id: 'atlas',
    glyph: 'T',
    tone: 'blue',
    pattern: 'atlas',
    name: { en: 'Atlas', ar: 'الأطلس' },
    note: { en: 'World-minded player.', ar: 'لاعب واسع الأفق.' },
  },
  {
    id: 'forge',
    glyph: 'F',
    tone: 'amber',
    pattern: 'forge',
    name: { en: 'Forge', ar: 'المسبك' },
    note: { en: 'Keep going.', ar: 'واصل اللعب.' },
  },
  {
    id: 'orbit',
    glyph: 'O',
    tone: 'teal',
    pattern: 'orbit',
    name: { en: 'Orbit', ar: 'المدار' },
    note: { en: 'Measured and strategic.', ar: 'مدروسة واستراتيجية.' },
  },
  {
    id: 'onyx',
    glyph: 'N',
    tone: 'silver',
    pattern: 'onyx',
    name: { en: 'Onyx', ar: 'العقيق' },
    note: { en: 'Quiet confidence.', ar: 'ثقة هادئة.' },
  },
];

function getProfileMark(value) {
  const key = stripEmoji(value).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 10);
  return PROFILE_MARKS.find(mark => mark.id === key) || null;
}

function getProfileMarkText(mark, field) {
  return mark?.[field]?.[state.lang] || mark?.[field]?.en || '';
}

function getAvatarLabel(value, fallback = 'U') {
  const mark = getProfileMark(value);
  if (mark) return mark.glyph;
  const clean = stripEmoji(value).replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase();
  return clean || fallback;
}

function renderProfileMark(value, fallback = 'U', extraClass = '') {
  const mark = getProfileMark(value);
  const glyph = mark ? mark.glyph : getAvatarLabel(value, fallback);
  const title = mark ? getProfileMarkText(mark, 'name') : glyph;
  const tone = mark ? mark.tone : 'legacy';
  const pattern = mark ? mark.pattern : 'legacy';
  const safeClass = extraClass ? ` ${extraClass}` : '';
  return `<span class="profile-mark profile-mark-${pattern} profile-mark-tone-${tone}${safeClass}" aria-label="${escapeHtml(title)}"><span>${escapeHtml(glyph)}</span></span>`;
}




// ================= API WRAPPER =================
const API_URL = '/api';

async function apiFetch(endpoint, options = {}) {
  options.credentials = 'include';
  options.headers = { ...options.headers, 'Content-Type': 'application/json' };
  try {
    const res = await fetch(`${API_URL}${endpoint}`, options);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'API Error');
    return data;
  } catch (err) {
    console.error(`[API] ${endpoint} failed:`, err.message);
    throw err;
  }
}

async function checkCloudSession() {
  try {
    const data = await apiFetch('/user/profile');
    state.dbUser = data;
  } catch (err) {
    state.dbUser = null;
  }
}

function getActiveUser() {
  if (!state.dbUser) return null;
  const solvedMap = {};
  (state.dbUser.progress || []).forEach(p => { solvedMap[p.cardId] = p.status; });
  return {
    id: state.dbUser.id,
    username: state.dbUser.username,
    avatar: state.dbUser.avatar || state.dbUser.username?.[0] || 'U',
    favorites: (state.dbUser.favorites || []).map(f => f.cardId),
    solved: solvedMap,
  };
}


function shuffleArray(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function _loadSocketIO() {
  return new Promise((resolve) => {
    if (window.io) { resolve(window.io); return; }
    const s = document.createElement('script');
    s.src = '/socket.io/socket.io.js';
    s.onload = () => resolve(window.io);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
}

async function connectGameRoom() {
  const io = await _loadSocketIO();
  if (!io) { showToast('Multiplayer unavailable', 'error'); return null; }
  if (_sio?.connected) return _sio;
  _sio = io('https://jakh.net', { path: '/socket.io', transports: ['polling', 'websocket'] });
  _sio.on('connect_error', (err) => {
    showToast('Could not connect to game server. Try again.', 'error');
  });
  return _sio;
}

async function joinGameRoom(roomId, playerName) {
  if (!state.dbUser) {
    showToast(t('loginNeeded'), true);
    openAuthModal();
    return;
  }
  const socket = await connectGameRoom();
  if (!socket) return;
  socket.emit('joinRoom', { roomId, playerName: playerName || 'Player' });
  socket.once('roomJoined', ({ players, hostId }) => {
    showToast(`Joined room! ${players.length} player(s) connected.`, 'success');
    showGameRoomModal(roomId, buildCurrentRoomUrl(roomId), players, hostId);
  });
  socket.once('error', ({ message }) => showToast(message, 'error'));
}

function buildCurrentRoomUrl(roomId, fallbackUrl = '') {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomId);
    url.hash = '';
    return url.toString();
  } catch (_) {
    return fallbackUrl || `https://jakh.net/?room=${encodeURIComponent(roomId)}`;
  }
}

function showGameRoomModal(roomId, url, players = [], hostId = null) {
  const existing = document.getElementById('gameRoomModal');
  if (existing) existing.remove();
  const isHost = hostId === null || (_sio && _sio.id === hostId);
  const modal = document.createElement('div');
  modal.id = 'gameRoomModal';
  modal.className = 'modal is-open';
  modal.innerHTML = `
    <div class="modal-backdrop" data-close-modal="gameRoomModal"></div>
    <div class="modal-card" role="dialog" aria-modal="true">
      <div class="modal-head">
        <h2>Game Room</h2>
        <button class="ghost-btn" data-close-modal="gameRoomModal">✕</button>
      </div>
      <p style="font-size:0.9rem;color:var(--muted);margin-bottom:0.75rem;">Share this link with friends:</p>
      <div style="display:flex;gap:0.5rem;margin-bottom:1rem;">
        <input id="gameRoomUrl" class="input" value="${url}" readonly style="flex:1;font-size:0.85rem;" />
        <button class="primary-btn" id="copyRoomUrlBtn">Copy</button>
      </div>
      <div id="gameRoomPlayers" style="margin-bottom:1rem;">
        ${players.map(p => `<div class="ghost-btn" style="margin:0.25rem 0;width:100%;text-align:left;">${escapeHtml(p.name)}</div>`).join('') || '<p class="muted">Waiting for players…</p>'}
      </div>
      ${isHost ? `<button class="primary-btn" id="startGameRoomBtn" style="width:100%;">Start Battle</button>` : '<p class="muted" style="text-align:center;">Waiting for host to start…</p>'}
    </div>`;
  document.body.appendChild(modal);

  document.getElementById('copyRoomUrlBtn')?.addEventListener('click', () => {
    navigator.clipboard?.writeText(url).then(() => showToast('Link copied!', 'success'));
  });
  document.getElementById('startGameRoomBtn')?.addEventListener('click', () => {
    if (_sio) _sio.emit('relay', { roomId, event: 'startBattle', data: { category: state.categorySlug } });
    modal.remove();
    openBattleModal(state.categorySlug);
  });

  // Live player list updates
  if (_sio) {
    _sio.on('playerJoined', ({ players: pl }) => {
      const el = document.getElementById('gameRoomPlayers');
      if (el) el.innerHTML = pl.map(p => `<div class="ghost-btn" style="margin:0.25rem 0;width:100%;text-align:left;">${escapeHtml(p.name)}</div>`).join('');
    });
    _sio.on('playerLeft', ({ players: pl }) => {
      const el = document.getElementById('gameRoomPlayers');
      if (el) el.innerHTML = pl.map(p => `<div class="ghost-btn" style="margin:0.25rem 0;width:100%;text-align:left;">${escapeHtml(p.name)}</div>`).join('');
    });
    _sio.on('relayed', ({ event: ev }) => {
      if (ev === 'startBattle') { modal.remove(); openBattleModal(state.categorySlug); }
    });
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_error) {
    return fallback;
  }
}




function saveSettings() {
  saveJson(STORAGE_KEYS.settings, { lang: state.lang });
  saveJson(`jakh-used-${state.lang}`, 1);
}

function getFavoriteSet() {
  const account = getActiveUser();
  return new Set(account ? account.favorites : []);
}

function getSolvedMap() {
  const account = getActiveUser();
  return account ? account.solved : {};
}

function isFavorite(id) {
  return getFavoriteSet().has(id);
}

function getScore() {
  const solved = getSolvedMap();
  return Object.values(solved).reduce((sum, difficulty) => sum + (DIFFICULTY_POINTS[difficulty] || 0), 0);
}

function getProgressResult(id) {
  const status = getSolvedMap()[id];
  if (!status) return null;
  return status.startsWith('wrong-') ? 'wrong' : 'correct';
}

function getCategoryProgress(slug) {
  const meta = state.catalog?.categories.find(c => c.slug === slug);
  const total = meta?.count || 1;
  const solved = state.dbUser
    ? (state.dbUser.progress || []).filter(p => p.categoryId === slug && !p.status.startsWith('wrong-')).length
    : 0;
  return { solved, pct: Math.min(100, Math.round((solved / total) * 100)) };
}

function getCorrectCountByDifficulty(diff) {
  return state.dbUser ? (state.dbUser.progress || []).filter(p => p.status === diff).length : 0;
}

function getTotalCorrectCount() {
  return state.dbUser ? (state.dbUser.progress || []).filter(p => !p.status.startsWith('wrong-')).length : 0;
}

function isLevelUnlocked(difficulty) {
  if (difficulty === 'easy' || difficulty === 'medium') return true;
  if (!state.dbUser) return false;
  if (difficulty === 'hard') {
    return getTotalCorrectCount() >= 10;
  }
  if (difficulty === 'very-advanced') {
    return getCorrectCountByDifficulty('hard') >= 10;
  }
  return true;
}

function handleFlip(id, cardEl) {
  hapticTap();
  if (!state.dbUser) {
    showToast(t('loginNeeded'), true);
    openAuthModal();
    return;
  }
  const wasFlipped = state.flipped.has(id);
  if (wasFlipped) state.flipped.delete(id); else state.flipped.add(id);
  if (!wasFlipped) trackEvent('card_flip', { category: state.categorySlug, card_id: id });
  updateCardEl(id);
}


function showToast(message, isError) {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.classList.toggle('is-error', !!isError);
  els.toast.classList.add('is-visible');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    els.toast.classList.remove('is-visible');
  }, isError ? 3200 : 2200);
}

function getThemeColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--theme-color').trim() || '#17151c';
}

function forceDarkTheme() {
  document.documentElement.dataset.theme = 'dark';
  document.documentElement.style.colorScheme = 'dark';
  document.querySelectorAll('meta[name="theme-color"]').forEach((node) => {
    node.setAttribute('content', getThemeColor());
  });
}

function applyTheme() {
  forceDarkTheme();
  document.documentElement.dataset.accent = 'aurora';
  document.documentElement.lang = state.lang === 'ar' ? 'ar' : 'en';
  document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
  if (els.langSelect) els.langSelect.value = state.lang;
}

function applyStaticCopy() {
  document.querySelectorAll('[data-i18n]').forEach((node) => {
    const key = node.dataset.i18n;
    node.textContent = t(key);
  });
  if (els.categorySearchInput) {
    els.categorySearchInput.placeholder = state.lang === 'ar' ? 'ابحث عن موضوع أو فئة...' : 'Search topics or categories...';
  }
  if (els.cardSearchInput) {
    els.cardSearchInput.placeholder = state.lang === 'ar' ? 'ابحث في الأسئلة أو الإجابات...' : 'Search questions or answers...';
  }
  if (els.openAuthBtn) {
    const account = getActiveUser();
    els.openAuthBtn.textContent = account ? account.username : t('authOpen');
  }
  ensureCategoryFlowHint();
  updateSelectLabels();
  updateDocumentTitle();
  updateBottomNavActive();
  enhanceFooterLinks();
}

function ensureCategoryFlowHint() {
  if (state.page !== 'category') return;
  const toolbar = document.querySelector('.library-toolbar');
  if (!toolbar) return;
  let hint = toolbar.querySelector('.category-flow-hint');
  if (!hint) {
    hint = document.createElement('p');
    hint.className = 'category-flow-hint';
    hint.dataset.i18n = 'categoryFlowHint';
    toolbar.insertBefore(hint, toolbar.firstChild);
  }
  hint.textContent = t('categoryFlowHint');
}

function enhanceFooterLinks() {
  const isAr = state.lang === 'ar';

  // Permanently remove any remaining social link blocks from the DOM
  document.querySelectorAll('.footer-socials').forEach(el => el.remove());

  document.querySelectorAll('.site-footer .footer-inner').forEach((footer) => {
    let legal = footer.querySelector('.footer-legal');
    if (!legal) {
      legal = document.createElement('div');
      legal.className = 'footer-legal';
      legal.innerHTML = `
        <a class="footer-link footer-contact-link" href="contact.html#suggestionBox" aria-label="Recommend a change to JAKH">
          <span data-footer-contact></span>
        </a>
        <a class="footer-link footer-privacy-link" href="privacy.html" aria-label="Read the JAKH privacy page">
          <span data-footer-privacy></span>
        </a>`;
      footer.appendChild(legal);
    }
    const contact = legal.querySelector('[data-footer-contact]');
    const privacy = legal.querySelector('[data-footer-privacy]');
    if (contact) contact.textContent = t('footerContact');
    if (privacy) privacy.textContent = t('footerPrivacy');
    const contactLink = legal.querySelector('.footer-contact-link');
    const privacyLink = legal.querySelector('.footer-privacy-link');
    if (contactLink) {
      contactLink.setAttribute('href', 'contact.html#suggestionBox');
      contactLink.setAttribute('aria-label', isAr ? 'اقترح تغييرًا على JAKH' : 'Recommend a change to JAKH');
    }
    if (privacyLink) privacyLink.setAttribute('aria-label', isAr ? 'اقرأ صفحة خصوصية JAKH' : 'Read the JAKH privacy page');
  });
}

function updateDocumentTitle() {
  if (state.page === 'home') {
    document.title = state.lang === 'ar' ? 'JAKH — ألغاز وألعاب عقلية' : 'JAKH — Riddles & Brain Games';
    return;
  }
  if (state.categoryData) {
    document.title = state.lang === 'ar'
      ? `${state.categoryData.title.ar} | مختبر العقل من JAKH`
      : `${state.categoryData.title.en} | JAKH Mind Lab`;
  }
}

function updateSelectLabels() {
  if (els.difficultySelect) {
    els.difficultySelect.options[0].text = t('allLevels');
    els.difficultySelect.options[1].text = t('easy');
    els.difficultySelect.options[2].text = t('medium');
    els.difficultySelect.options[3].text = t('hard');
    els.difficultySelect.options[4].text = t('veryAdvanced');
  }
  if (els.viewSelect) {
    els.viewSelect.options[0].text = t('everything');
    els.viewSelect.options[1].text = t('onlyUnsolved');
    els.viewSelect.options[2].text = t('onlySolved');
    els.viewSelect.options[3].text = t('onlyFavorites');
  }
  if (els.sortSelect) {
    els.sortSelect.options[0].text = t('featuredOrder');
    els.sortSelect.options[1].text = t('byDifficulty');
    els.sortSelect.options[2].text = t('aToZ');
    els.sortSelect.options[3].text = t('shuffleNow');
  }
}

function protectedDataPath(path) {
  const match = String(path || '').match(/^data\/([a-z0-9-]+)\.json$/);
  if (!match || match[1] === 'catalog' || location.protocol === 'file:') return path;
  return `/api/content/category/${match[1]}`;
}

async function fetchJson(path, retries = 2) {
  const url = protectedDataPath(path);
  try {
    const response = await fetch(url, {
      credentials: String(url).startsWith('/api/') ? 'include' : 'same-origin',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (err) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, 1000));
      return fetchJson(path, retries - 1);
    }
    throw err;
  }
}

let offlineStatusCheckId = 0;
let offlineToastShown = false;

async function probeSiteReachability() {
  if (location.protocol === 'file:') return true;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(`/manifest.webmanifest?health=${Date.now()}`, {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    });
    return response.ok;
  } catch (_) {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function handleOfflineStatus() {
  const checkId = ++offlineStatusCheckId;
  if (navigator.onLine) {
    document.body.classList.remove('is-offline');
    offlineToastShown = false;
    return;
  }

  const isReachable = await probeSiteReachability();
  if (checkId !== offlineStatusCheckId) return;

  const isOff = !isReachable;
  document.body.classList.toggle('is-offline', isOff);
  if (isOff && !offlineToastShown) {
    offlineToastShown = true;
    showToast(state.lang === 'ar' ? 'أنت تعمل حالياً بدون اتصال — قد لا تتوفر بعض الميزات' : 'You are currently offline — some features may be limited', 'warning');
  } else if (!isOff) {
    offlineToastShown = false;
  }
}

function cacheEls() {
  [
    'toast', 'langSelect', 'openAuthBtn',
    'heroAuthBtn', 'categorySearchInput', 'resetDirectoryBtn', 'directoryResultsLabel',
    'categoryDirectoryGrid', 'badgeCategories', 'badgeCategories2', 'badgeQuestions', 'accountSummaryMount',
    'authModal', 'authModalBody',
    'categoryKicker', 'categoryTitle', 'categoryDescription', 'categoryCountPill', 'categoryImage',
    'categorySummaryMount', 'cardSearchInput', 'difficultySelect', 'viewSelect', 'sortSelect',
    'subcategoryWrap', 'subcategoryFilters', 'resultsLabel', 'resetPageBtn', 'cardGrid', 'emptyState',
    'relatedCategories', 'categoryDiffBadge',
    'suggestionText', 'suggestionEmail', 'suggestionSubmit', 'suggestionThanks', 'suggestionForm',
  ].forEach((id) => { els[id] = document.getElementById(id); });
}

const APP_VERSION = '5.8';

function purgeLegacyCaches() {
  try {
    if ('caches' in window) {
      caches.keys()
        .then(keys => Promise.all(keys.filter(key => key.startsWith('jakh')).map(key => caches.delete(key))))
        .catch(() => { });
    }
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' });
    }
  } catch (_) { }
}

function flushStaleStorage() {
  const stored = localStorage.getItem('jakh-app-version');
  if (stored !== null && stored !== APP_VERSION) {
    const staleKeys = ['jakh-catalog-cache', 'jakh-cluster-cache', 'jakh-home-state'];
    staleKeys.forEach(k => { localStorage.removeItem(k); sessionStorage.removeItem(k); });
    localStorage.setItem('jakh-app-version', APP_VERSION);
    purgeLegacyCaches();
    return;
  }
  if (stored === null) {
    localStorage.setItem('jakh-app-version', APP_VERSION);
    purgeLegacyCaches();
  }
}

function initializeFromStorage() {
  flushStaleStorage();
  const settings = loadJson(STORAGE_KEYS.settings, {});
  state.lang = settings.lang || 'en';
  state.audioEnabled = localStorage.getItem(STORAGE_KEYS.audio) !== 'false';
}

function applyDir() {
  document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = state.lang;
}

let _installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _installPrompt = e;
  maybeShowInstallBanner();
});

function isInstallOfferPage() {
  return state.page === 'home' || state.page === 'play';
}

function noteInstallEligibleVisit() {
  if (!isInstallOfferPage()) return;
  try {
    const sessionKey = `jakh-install-visit:${location.pathname}`;
    if (sessionStorage.getItem(sessionKey)) return;
    sessionStorage.setItem(sessionKey, '1');
    const current = Number(localStorage.getItem('jakh-install-visit-count') || '0');
    localStorage.setItem('jakh-install-visit-count', String(Math.min(99, current + 1)));
  } catch (_error) { }
}

function shouldOfferInstall() {
  if (!_installPrompt) return false;
  if (!isInstallOfferPage()) return false;
  if (localStorage.getItem('jakh-install-dismissed')) return false;
  const visits = Number(localStorage.getItem('jakh-install-visit-count') || '0');
  return visits >= 3;
}

function maybeShowInstallBanner() {
  if (!shouldOfferInstall()) return;
  const show = () => {
    if (shouldOfferInstall()) showInstallBanner();
  };
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(show, { timeout: 5000 });
  } else {
    setTimeout(show, 3500);
  }
}

function showInstallBanner() {
  if (document.getElementById('installBanner')) return;
  const banner = document.createElement('div');
  banner.id = 'installBanner';
  banner.className = 'install-banner';
  const isAr = state.lang === 'ar';
  banner.innerHTML = `
    <span>${isAr ? 'ثبّت JAKH عندما تريد وصولًا أسرع إلى Mind Lab وGame Hub.' : 'Install JAKH when you want faster access to Mind Lab and Game Hub.'}</span>
    <div class="install-banner-actions">
      <button class="primary-btn install-banner-btn" id="installAcceptBtn">${isAr ? 'تثبيت' : 'Install'}</button>
      <button class="ghost-btn install-banner-close" id="installDismissBtn">${isAr ? 'لاحقًا' : 'Later'}</button>
    </div>
  `;
  document.body.appendChild(banner);
  document.getElementById('installAcceptBtn')?.addEventListener('click', async () => {
    if (!_installPrompt) return;
    _installPrompt.prompt();
    const { outcome } = await _installPrompt.userChoice;
    _installPrompt = null;
    banner.remove();
    if (outcome === 'accepted') localStorage.setItem('jakh-install-dismissed', '1');
  });
  document.getElementById('installDismissBtn')?.addEventListener('click', () => {
    localStorage.setItem('jakh-install-dismissed', '1');
    banner.remove();
  });
}

let globalEventsBound = false;
let navCloseHandlersBound = false;
let backToTopScrollBound = false;

function isSpaManagedUrl(targetUrl) {
  const path = targetUrl.pathname;
  if (path === '/' || path === '') return true;
  const file = path.split('/').pop() || 'index.html';
  if (file === 'index.html' || file === 'mind-lab.html' || file === 'topic.html') return true;
  if (!file.endsWith('.html')) return false;
  const slug = file.slice(0, -5);
  return Boolean(state.catalog?.categories?.some(meta => meta.slug === slug));
}

function closeOpenNav(event) {
  const nav = document.querySelector('.header-actions.nav-open');
  const hbtn = document.getElementById('hamburgerBtn');
  if (!nav || !hbtn) return;
  if (!nav.contains(event.target) && !hbtn.contains(event.target)) {
    nav.classList.remove('nav-open');
    hbtn.setAttribute('aria-expanded', 'false');
  }
}

async function spaNavigate(url, isPopState = false) {
  // Only navigate same-origin URLs — anything else gets a hard redirect
  let targetUrl;
  try {
    targetUrl = new URL(url, location.href);
    if (targetUrl.origin !== location.origin) { location.href = url; return; }
  } catch { location.href = url; return; }
  if (!isSpaManagedUrl(targetUrl)) {
    location.href = targetUrl.href;
    return;
  }

  try {
    const res = await fetch(url);
    const html = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    document.title = doc.title;
    // Adopt nodes from the parsed doc instead of re-serializing via innerHTML
    const nodes = Array.from(doc.body.childNodes).map(n => document.adoptNode(n));
    document.body.replaceChildren(...nodes);
    document.body.className = doc.body.className;

    // Safely copy data attributes since DOMParser dataset can be unreliable
    const topicFromUrl = targetUrl.pathname.endsWith('/topic.html') || targetUrl.pathname.endsWith('topic.html')
      ? targetUrl.searchParams.get('topic')
      : '';
    const pageCategory = topicFromUrl && isPrimaryTopicSlug(topicFromUrl)
      ? topicFromUrl
      : (doc.body.getAttribute('data-category') || '');
    document.body.setAttribute('data-page', doc.body.getAttribute('data-page') || '');
    document.body.setAttribute('data-category', pageCategory);

    // Reset local state for the new page
    state.page = doc.body.getAttribute('data-page') || 'home';
    state.categorySlug = pageCategory;
    state.categoryData = null;
    state.directorySearch = '';
    state.cluster = 'all';
    state.search = '';
    state.difficulty = 'all';
    state.view = 'all';
    state.sort = 'difficulty';
    state.subcategory = 'all';
    state.cardPage = 1;

    if (!isPopState) {
      history.pushState(null, '', url);
    }
    const hasHomeScrollTarget = state.page === 'home' && sessionStorage.getItem('jakh-scroll-to');
    if (!hasHomeScrollTarget) window.scrollTo({ top: 0, left: 0, behavior: 'auto' });

    // Re-initialize for new DOM
    await init();
    if (!hasHomeScrollTarget) {
      requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
    }
  } catch (err) {
    console.error('SPA Navigation failed:', err);
    location.href = url;
  }
}

function bindCommonEvents() {
  if (els.langSelect) {
    els.langSelect.addEventListener('change', () => {
      state.lang = els.langSelect.value;
      saveSettings();
      applyTheme();
      applyDir();
      applyStaticCopy();
      rerender();
      showToast(t('languageSet'));
    });
  }
  if (els.openAuthBtn) els.openAuthBtn.addEventListener('click', openAuthModal);
  if (els.heroAuthBtn) els.heroAuthBtn.addEventListener('click', openAuthModal);

  // Inject leaderboard button into nav if missing
  if (!document.getElementById('leaderboardBtn')) {
    const nav = document.querySelector('.header-actions');
    if (nav) {
      const btn = document.createElement('button');
      btn.id = 'leaderboardBtn';
      btn.className = 'ghost-btn';
      btn.dataset.i18n = 'navLeaderboard';
      btn.textContent = t('navLeaderboard');
      btn.setAttribute('aria-label', t('navLeaderboard'));
      nav.insertBefore(btn, nav.children[2]);
    }
  }
  const lbBtn = document.getElementById('leaderboardBtn');
  if (lbBtn) lbBtn.addEventListener('click', openLeaderboard);

  // Inject battle button into nav
  if (!document.getElementById('battleNavBtn')) {
    const nav = document.querySelector('.header-actions');
    if (nav) {
      const btn = document.createElement('button');
      btn.id = 'battleNavBtn';
      btn.className = 'ghost-btn';
      btn.dataset.i18n = 'navBattle';
      btn.textContent = t('navBattle');
      btn.setAttribute('aria-label', t('navBattle'));
      nav.insertBefore(btn, nav.children[2]);
    }
  }
  document.getElementById('battleNavBtn')?.addEventListener('click', () => openBattleModal(state.categorySlug));


  // Handle /play/ROOMID path — auto-open join dialog
  const playMatch = location.pathname.match(/^\/play\/([A-Z0-9]{6})$/i);
  if (playMatch) {
    const roomId = playMatch[1].toUpperCase();
    setTimeout(async () => {
      const name = state.dbUser?.username || '';
      await joinGameRoom(roomId, name);
    }, 800);
  }

  // Handle #battle/CODE deep-link
  const hashMatch = location.hash.match(/^#battle\/([A-Z0-9-]+)$/i);
  if (hashMatch) {
    setTimeout(() => {
      openBattleModal('', 'join');
      setTimeout(() => {
        const codeInput = document.getElementById('battleCodeInput');
        if (codeInput) codeInput.value = hashMatch[1].toUpperCase();
      }, 80);
    }, 600);
  }

  // Inject global search button into nav
  if (!document.getElementById('globalSearchBtn')) {
    const nav = document.querySelector('.header-actions');
    if (nav) {
      const btn = document.createElement('button');
      btn.id = 'globalSearchBtn';
      btn.className = 'ghost-btn';
      btn.dataset.i18n = 'navSearch';
      btn.setAttribute('aria-label', t('navSearch'));
      btn.textContent = t('navSearch');
      nav.insertBefore(btn, nav.firstElementChild);
    }
  }
  document.getElementById('globalSearchBtn')?.addEventListener('click', openGlobalSearch);

  // Inject hamburger button for mobile nav
  if (!document.getElementById('hamburgerBtn')) {
    const header = document.querySelector('.site-header');
    const nav = document.querySelector('.header-actions');
    if (header && nav) {
      const hbtn = document.createElement('button');
      hbtn.id = 'hamburgerBtn';
      hbtn.className = 'hamburger-btn';
      hbtn.setAttribute('aria-label', state.lang === 'ar' ? 'القائمة' : 'Menu');
      hbtn.setAttribute('aria-expanded', 'false');
      hbtn.textContent = '☰';
      header.insertBefore(hbtn, nav);
      const _toggleNav = (e) => {
        if (e.type === 'touchstart') e.preventDefault();
        const open = nav.classList.toggle('nav-open');
        hbtn.setAttribute('aria-expanded', String(open));
      };
      hbtn.addEventListener('click', _toggleNav);
      hbtn.addEventListener('touchstart', _toggleNav, { passive: false });

    }
  }
  if (!navCloseHandlersBound) {
    document.addEventListener('click', closeOpenNav);
    document.addEventListener('touchstart', closeOpenNav, { passive: true });
    navCloseHandlersBound = true;
  }

  const randomBtn = document.getElementById('randomCategoryBtn');
  if (randomBtn) randomBtn.addEventListener('click', randomCategory);

  if (!globalEventsBound) {
    document.addEventListener('click', (event) => {
      const closeTarget = event.target.closest('[data-close-modal]');
      if (closeTarget) {
        const name = closeTarget.dataset.closeModal;
        closeModal(name);
      }
    });

    document.addEventListener('click', (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = e.target.closest('a');
      if (link && link.origin === location.origin && link.target !== '_blank' && !link.hasAttribute('download')) {
        const targetUrl = new URL(link.href);
        const path = targetUrl.pathname;
        // Skip hash-only anchor links (e.g. #questionSection) — let native scroll handle them
        if (link.hash && link.pathname === location.pathname) return;
        const isHome = path === '/' || path === '' || path.endsWith('index.html');
        if ((path.endsWith('.html') || isHome) && !path.includes('admin') && isSpaManagedUrl(targetUrl)) {
          e.preventDefault();
          spaNavigate(link.href);
        }
      }
    });

    window.addEventListener('popstate', () => {
      spaNavigate(location.href, true);
    });

    window.addEventListener('online', handleOfflineStatus);
    window.addEventListener('offline', handleOfflineStatus);
    if (!navigator.onLine) handleOfflineStatus();

    globalEventsBound = true;
  }

  if (els.resetDirectoryBtn) {
    els.resetDirectoryBtn.addEventListener('click', () => {
      state.directorySearch = '';
      state.cluster = 'all';
      if (els.categorySearchInput) els.categorySearchInput.value = '';
      renderClusterTabBar();
      fadeAndRenderDirectory({ scrollToTop: true });
      showToast(t('directoryResetDone'));
    });
  }
  if (els.categorySearchInput) {
    els.categorySearchInput.addEventListener('input', debounce(() => {
      state.directorySearch = els.categorySearchInput.value.trim().toLowerCase();
      renderCategoryDirectory();
    }, 200));
  }

  if (els.resetPageBtn) {
    els.resetPageBtn.addEventListener('click', () => {
      state.search = '';
      state.difficulty = 'all';
      state.view = 'all';
      state.sort = 'difficulty';
      state.subcategory = 'all';
      state.cardPage = 1;
      document.getElementById('loadMoreBtn')?.remove();
      if (els.cardSearchInput) els.cardSearchInput.value = '';
      if (els.difficultySelect) els.difficultySelect.value = 'all';
      if (els.viewSelect) els.viewSelect.value = 'all';
      if (els.sortSelect) els.sortSelect.value = 'difficulty';
      renderSubcategoryFilters();
      renderCards();
      showToast(t('pageResetDone'));
    });
  }
  if (els.cardSearchInput) {
    els.cardSearchInput.addEventListener('input', debounce(() => {
      state.search = els.cardSearchInput.value.trim().toLowerCase();
      state.cardPage = 1;
      syncFilterParams();
      renderCards();
    }, 250));
  }
  if (els.difficultySelect) {
    els.difficultySelect.addEventListener('change', () => {
      state.difficulty = els.difficultySelect.value;
      state.cardPage = 1;
      syncFilterParams();
      renderCards();
    });
  }
  if (els.viewSelect) {
    els.viewSelect.addEventListener('change', () => {
      state.view = els.viewSelect.value;
      state.cardPage = 1;
      syncFilterParams();
      renderCards();
    });
  }
  if (els.sortSelect) {
    els.sortSelect.addEventListener('change', () => {
      state.sort = els.sortSelect.value;
      state.cardPage = 1;
      syncFilterParams();
      renderCards();
    });
  }
  if (els.cardGrid) {
    els.cardGrid.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-action]');
      if (btn) {
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        if (!id) return;
        event.preventDefault();
        event.stopPropagation();
        if (action === 'flip') {
          handleFlip(id, event.target.closest('.riddle-card'));
        } else if (action === 'auth') {
          openAuthModal();
        } else if (action === 'audio') {
          handleAudioBtn(btn);
        } else if (action === 'favorite') {
          toggleFavorite(id);
        } else if (action === 'markCorrect') {
          markCard(id, 'correct');
        } else if (action === 'markWrong') {
          markCard(id, 'wrong');
        } else if (action === 'unmark') {
          unmarkCard(id);
        } else if (action === 'share') {
          shareCard(id);
        } else if (action === 'report') {
          const card = state.categoryData?.cards.find(c => c.id === id);
          if (card) reportCard(id, state.categoryData?.slug || 'unknown', card.question[state.lang]);
        }
        return;
      }
      const card = event.target.closest('.riddle-card[data-id]:not(.is-locked)');
      if (!card) return;
      const id = card.dataset.id;
      if (!id) return;
      handleFlip(id, card);
    });
    els.cardGrid.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const card = event.target.closest('.riddle-card[data-id]:not(.is-locked)');
      if (!card) return;
      event.preventDefault();
      const id = card.dataset.id;
      if (!id) return;
      handleFlip(id, card);
    });

    // ── Enhanced swipe: visual tilt + swipe-to-mark on flipped cards ──
    let _sw = null;

    function _resetSwipeCard() {
      if (!_sw?.cardEl) { _sw = null; return; }
      const c = _sw.cardEl;
      c.style.transform = '';
      c.style.willChange = '';
      c.classList.remove('is-swiping');
      const ov = c.querySelector('.swipe-overlay');
      if (ov) ov.style.opacity = '0';
      _sw = null;
    }

    function _getSwipeOverlay(cardEl) {
      let ov = cardEl.querySelector('.swipe-overlay');
      if (!ov) {
        ov = document.createElement('div');
        ov.className = 'swipe-overlay';
        cardEl.appendChild(ov);
      }
      return ov;
    }

    els.cardGrid.addEventListener('touchstart', (e) => {
      const card = e.target.closest('.riddle-card[data-id]:not(.is-locked)');
      if (!card) return;
      const t = e.touches[0];
      card.style.willChange = 'transform';
      _sw = { x: t.clientX, y: t.clientY, id: card.dataset.id, cardEl: card };
    }, { passive: true });

    els.cardGrid.addEventListener('touchmove', (e) => {
      if (!_sw) return;
      const t = e.touches[0];
      const dx = t.clientX - _sw.x;
      const dy = t.clientY - _sw.y;
      if (Math.abs(dx) < 8 || Math.abs(dy) > Math.abs(dx) * 0.85) return;
      const card = _sw.cardEl;
      card.classList.add('is-swiping');
      card.style.transform = `translateX(${dx * 0.22}px) rotate(${dx * 0.035}deg)`;
      const isFlipped = card.classList.contains('is-flipped');
      if (!isFlipped) return;
      const isRtl = document.documentElement.dir === 'rtl';
      const isCorrect = isRtl ? dx < 0 : dx > 0;
      const ov = _getSwipeOverlay(card);
      ov.style.background = isCorrect
        ? 'color-mix(in srgb, var(--easy) 22%, transparent)'
        : 'color-mix(in srgb, var(--danger) 20%, transparent)';
      ov.style.color = isCorrect ? 'var(--easy)' : 'var(--danger)';
      ov.style.border = isCorrect
        ? '2px solid color-mix(in srgb, var(--easy) 55%, transparent)'
        : '2px solid color-mix(in srgb, var(--danger) 50%, transparent)';
      ov.textContent = isCorrect ? '✓' : '✗';
      ov.style.opacity = String(Math.min(Math.abs(dx) / 70, 1) * 0.95);
    }, { passive: true });

    els.cardGrid.addEventListener('touchend', (e) => {
      if (!_sw) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - _sw.x;
      const dy = t.clientY - _sw.y;
      const { id } = _sw;
      const cardEl = _sw.cardEl;
      const isFlipped = cardEl.classList.contains('is-flipped');
      _resetSwipeCard();
      if (Math.abs(dx) < 42 || Math.abs(dy) > Math.abs(dx) * 0.9) return;
      const isRtl = document.documentElement.dir === 'rtl';
      const isRightSwipe = isRtl ? dx < 0 : dx > 0;
      if (!isFlipped) {
        handleFlip(id, cardEl);
      } else {
        if (isRightSwipe) markCard(id, 'correct');
        else markCard(id, 'wrong');
      }
    }, { passive: true });

    els.cardGrid.addEventListener('touchcancel', () => { _resetSwipeCard(); }, { passive: true });
  }
}

function rerender() {
  if (state.page === 'home') {
    renderHome();
  } else {
    renderCategoryPage();
  }
  updateBottomNavActive();
}

function renderHome() {
  if (!state.catalog) return;
  if (els.badgeCategories) els.badgeCategories.textContent = CATEGORY_COLLECTIONS.length;
  if (els.badgeCategories2) {
    els.badgeCategories2.textContent = state.lang === 'ar'
      ? `${CATEGORY_COLLECTIONS.length} مواضيع`
      : `${CATEGORY_COLLECTIONS.length} topics`;
  }
  if (els.badgeQuestions) els.badgeQuestions.textContent = state.catalog.site.totalQuestions.toLocaleString();
  renderHomePlayerPortal();
  if (els.accountSummaryMount) els.accountSummaryMount.innerHTML = '';
  updateHomeWidgetRow();
  renderDailyChallenge();
  renderClusterTabBar();
  renderCategoryDirectory();
}

function createCategoryCardMarkup(meta) {
  const artColor = mindTrackAccent(meta.cluster_key);
  const gradient = mindTrackGradient(meta.cluster_key);
  const isAr = state.lang === 'ar';
  const rawTitle = meta.title[state.lang] || meta.title.en || meta.slug;
  const title = escapeHtml(rawTitle);
  const artFamily = atlasFamilyFromCluster(meta.cluster_key);
  const cluster = escapeHtml(meta.cluster[state.lang]);
  const prog = getCategoryProgress(meta.slug);
  const progressLine = prog.pct > 0
    ? `<div class="card-progress-bar" style="width:${prog.pct}%;background:${artColor}" aria-hidden="true"></div>`
    : '';
  const doneLabel = prog.pct > 0 ? ` · ${prog.pct}% ${isAr ? 'مكتمل' : 'done'}` : '';
  const enterLabel = isAr ? 'افتح' : 'Enter';
  const cardCountLabel = isAr ? `${meta.count} سؤال` : `${meta.count} Q`;
  return `
    <a class="category-card" href="${escapeHtml(meta.href)}" style="--category-accent:${artColor};--category-gradient:${gradient}" aria-label="${title}">
      <span class="category-card-stripe" style="background:${gradient}" aria-hidden="true"></span>
      <div class="category-card-bg mind-cover-shell mind-cover-${artFamily}" aria-hidden="true">
        ${mindCoverSvg({ slug: meta.slug, title: meta.title.en, clusterKey: meta.cluster_key, color: artColor })}
        <span class="category-card-count-badge">${cardCountLabel}</span>
        <span class="category-card-corner-mark"></span>
      </div>
      <div class="category-card-overlay">
        <span class="category-card-cluster cluster-chip" style="color:${artColor}">${cluster}</span>
        <h3 class="category-title">${title}</h3>
      </div>
      <div class="category-card-footer">
        <span class="category-card-label">${meta.count} ${isAr ? 'سؤال' : 'questions'}${doneLabel}</span>
        <span class="category-card-enter">${enterLabel}</span>
      </div>
      ${prog.pct > 0 ? `<div class="card-progress-track" aria-hidden="true">${progressLine}</div>` : ''}
    </a>
  `;
}

function getCategoryMap() {
  return new Map((state.catalog?.categories || []).map(meta => [meta.slug, meta]));
}

function collectionParent(collection) {
  return DIRECTORY_PARENT_META[collection.parent] || DIRECTORY_PARENT_META.mind;
}

function getCollectionCategories(collection, categoryMap = getCategoryMap()) {
  return collection.slugs.map(slug => categoryMap.get(slug)).filter(Boolean);
}

function createCollectionCardMarkup(collection, categoryMap = getCategoryMap()) {
  const parent = collectionParent(collection);
  const categories = getCollectionCategories(collection, categoryMap);
  const leadCategory = categories[0];
  const leadGradient = leadCategory
    ? mindTrackGradient(leadCategory.cluster_key)
    : mindTrackGradient(collection.parent);
  const rawTitle = collection.title[state.lang] || collection.title.en;
  const title = escapeHtml(rawTitle);
  const description = escapeHtml(collection.description[state.lang] || collection.description.en);
  const parentLabel = escapeHtml(parent.label[state.lang] || parent.label.en);
  const artFamily = atlasFamilyFromCluster(collection.parent);
  const totalQuestions = categories.reduce((sum, meta) => sum + Number(meta.count || 0), 0);
  const countWord = state.lang === 'ar' ? 'سؤال' : 'questions';
  const preview = categories.slice(0, 4).map(meta => escapeHtml(meta.title[state.lang] || meta.title.en)).join(' · ');
  return `
    <a class="category-card collection-card" href="${escapeHtml(primaryTopicHref(collection))}" style="--category-accent:${parent.accent};--category-gradient:${leadGradient}" aria-label="${title}">
      <span class="category-card-stripe" style="background:${parent.accent}" aria-hidden="true"></span>
      <div class="collection-art mind-cover-shell mind-cover-${artFamily}" aria-hidden="true">
        ${mindCoverSvg({ slug: collection.key, title: collection.title.en, clusterKey: collection.parent, color: parent.accent, variant: 'collection' })}
      </div>
      <div class="collection-card-body">
        <span class="collection-parent" style="color:${parent.accent}">${parentLabel}</span>
        <h3>${title}</h3>
        <p>${description}</p>
      </div>
      <div class="collection-preview">${preview}</div>
      <div class="category-card-footer">
        <span>${totalQuestions.toLocaleString()} ${countWord}</span>
        <span class="category-card-enter">${escapeHtml(t('openCollection'))}</span>
      </div>
    </a>
  `;
}

function updateDirectoryResultsLabel(count) {
  if (!els.directoryResultsLabel) return;
  if (state.directorySearch) {
    els.directoryResultsLabel.textContent = fmt('showingSearchPages', { count });
  } else {
    els.directoryResultsLabel.textContent = count === CATEGORY_COLLECTIONS.length
      ? fmt('showingAllCollections', { count })
      : fmt('showingFilteredCollections', { count });
  }
}

function renderCategoryDirectory() {
  if (!els.categoryDirectoryGrid || !state.catalog) return;
  const categoryMap = getCategoryMap();
  const filtered = CATEGORY_COLLECTIONS.filter((collection) => {
    if (state.cluster !== 'all' && collection.parent !== state.cluster) return false;
    if (!state.directorySearch) return true;
    const sourceCategories = getCollectionCategories(collection, categoryMap);
    const parent = collectionParent(collection);
    const haystack = [
      collection.title.en, collection.title.ar,
      collection.description.en, collection.description.ar,
      parent.label.en, parent.label.ar,
      ...sourceCategories.flatMap(meta => [
        meta.title?.en, meta.title?.ar,
        meta.description?.en, meta.description?.ar,
        meta.cluster?.en, meta.cluster?.ar,
      ]),
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(state.directorySearch);
  });
  updateDirectoryResultsLabel(filtered.length);
  const renderKey = [
    state.lang,
    state.cluster,
    state.directorySearch,
    state.catalog.site.totalQuestions,
    filtered.map(collection => collection.key).join(','),
  ].join('|');
  if (els.categoryDirectoryGrid.dataset.renderKey === renderKey) return;
  els.categoryDirectoryGrid.dataset.renderKey = renderKey;
  els.categoryDirectoryGrid.innerHTML = filtered.map(collection => createCollectionCardMarkup(collection, categoryMap)).join('');

  const cards = [...els.categoryDirectoryGrid.querySelectorAll('.category-card')];
  requestAnimationFrame(() => {
    cards.forEach((el) => el.classList.add('is-visible'));
  });
}

function renderClusterTabBar() {
  const tabBar = document.getElementById('clusterTabBar');
  if (!tabBar || !state.catalog) return;
  const isAr = state.lang === 'ar';
  const renderKey = `${state.lang}|${state.cluster}|${CATEGORY_COLLECTIONS.length}`;
  if (tabBar.dataset.renderKey === renderKey) return;
  tabBar.dataset.renderKey = renderKey;

  const clusters = Object.entries(DIRECTORY_PARENT_META).map(([key, meta]) => ({
    key,
    label: meta.label,
    count: CATEGORY_COLLECTIONS.filter(collection => collection.parent === key).length,
    code: meta.code,
    gradient: meta.gradient,
  }));
  const total = CATEGORY_COLLECTIONS.length;
  const countWord = isAr ? 'موضوع' : 'topics';

  const allTab = {
    key: 'all',
    label: { en: 'All topics', ar: 'كل المواضيع' },
    count: total,
    code: 'All',
    gradient: 'linear-gradient(135deg,#0f0c1a,#2a1f3d)',
  };

  const tabs = [allTab, ...clusters];

  tabBar.innerHTML = tabs.map(c => {
    const name = c.key === 'all' ? (isAr ? c.label.ar : c.label.en) : (c.label[state.lang] || c.label.en);
    const isActive = state.cluster === c.key;
    return `
      <button class="ml-cluster-tab${isActive ? ' is-active' : ''}" data-cluster="${escapeHtml(c.key)}" role="tab" aria-selected="${isActive}" aria-label="${escapeHtml(name)}">
        <div class="ml-cluster-tab-bg" style="background:${c.gradient};" aria-hidden="true"></div>
        <div class="ml-cluster-tab-content">
          <span class="ml-cluster-tab-code" aria-hidden="true">${escapeHtml(c.code)}</span>
          <div class="ml-cluster-tab-text">
            <span class="ml-cluster-tab-name">${escapeHtml(name)}</span>
            <span class="ml-cluster-tab-count">${c.count} ${countWord}</span>
          </div>
        </div>
      </button>`;
  }).join('');

  tabBar.querySelectorAll('.ml-cluster-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const newCluster = btn.dataset.cluster;
      if (state.cluster === newCluster) return;
      state.cluster = newCluster;
      renderClusterTabBar();
      fadeAndRenderDirectory({ scrollToTop: true });
    });
  });
}

function scrollCategoryDirectoryToTop(behavior = 'smooth') {
  const target = document.getElementById('kv-lab') || document.getElementById('top') || els.categoryDirectoryGrid;
  if (!target) return;
  const header = document.querySelector('.site-header');
  const headerOffset = header ? header.getBoundingClientRect().height + 14 : 0;
  const top = Math.max(0, target.getBoundingClientRect().top + window.scrollY - headerOffset);
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top, behavior: reduced ? 'auto' : behavior });
}

function fadeAndRenderDirectory(options = {}) {
  const grid = els.categoryDirectoryGrid;
  if (options.scrollToTop) scrollCategoryDirectoryToTop();
  if (!grid) { renderCategoryDirectory(); return; }
  grid.style.transition = 'none';
  grid.style.opacity = '0';
  grid.style.transform = 'translateY(10px)';
  requestAnimationFrame(() => {
    renderCategoryDirectory();
    requestAnimationFrame(() => {
      grid.style.transition = 'opacity 0.22s ease, transform 0.22s ease';
      grid.style.opacity = '1';
      grid.style.transform = 'translateY(0)';
    });
  });
}

function getGreeting(name, lang) {
  const h = new Date().getHours();
  const isAr = lang === 'ar';
  const greet = isAr
    ? (h < 12 ? 'صباح الخير' : 'مساء الخير')
    : (h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening');
  return isAr ? `${greet}، ${name}` : `${greet}, ${name}`;
}

function getDashInsight(totalSolved, totalQ, catProgress, lang) {
  const isAr = lang === 'ar';
  if (state.streak >= 7) return isAr ? `${state.streak} أيام متتالية — لا يُوقفك شيء!` : `${state.streak}-day streak — unstoppable!`;
  if (state.streak >= 3) return isAr ? `${state.streak} أيام رائعة — واصل!` : `${state.streak}-day streak — keep going!`;
  if (!isLevelUnlocked('hard') && totalSolved >= 7) {
    const left = 10 - totalSolved;
    return isAr ? `${left} إجابة صحيحة تفتح لك المستوى الصعب!` : `${left} more correct answer${left === 1 ? '' : 's'} to unlock Hard.`;
  }
  if (isLevelUnlocked('hard') && !isLevelUnlocked('very-advanced')) {
    const hardSolved = getCorrectCountByDifficulty('hard');
    if (hardSolved >= 7) {
      const left = 10 - hardSolved;
      return isAr ? `${left} إجابة صعبة تفتح لك مستوى الخبير!` : `${left} more hard answer${left === 1 ? '' : 's'} to unlock Expert.`;
    }
  }
  const almostDone = catProgress.find(c => c.pct >= 80 && c.pct < 100);
  if (almostDone) {
    const left = almostDone.count - almostDone.solved;
    return isAr ? `${left} سؤال لإكمال ${almostDone.title.ar || almostDone.title.en}!` : `${left} question${left === 1 ? '' : 's'} left to complete ${almostDone.title.en}!`;
  }
  if (catProgress.length > 0 && catProgress[0].pct > 0) {
    const best = catProgress[0];
    return isAr ? `أقوى مجال لديك: ${best.title.ar || best.title.en} بنسبة ${best.pct}%` : `Top category: ${best.title.en} at ${best.pct}% complete`;
  }
  if (!isLevelUnlocked('hard') && totalSolved > 0) {
    const left = 10 - totalSolved;
    return isAr ? `${left} إجابة صحيحة تفتح لك المستوى الصعب!` : `${left} more correct answer${left === 1 ? '' : 's'} to unlock Hard.`;
  }
  const pct = totalQ > 0 ? ((totalSolved / totalQ) * 100).toFixed(1) : '0.0';
  return isAr ? `أجبت على ${pct}% من جميع ألغاز JAKH` : `You've tackled ${pct}% of all JAKH riddles`;
}

function renderHomePlayerPortal() {
  const section = document.getElementById('playerPortalSection');
  if (!section) return;
  const title = document.getElementById('playerPortalTitle');
  const desc = section.querySelector('[data-i18n="playerPortalDesc"]');
  const points = section.querySelector('.kv-player-points');
  const actions = document.getElementById('playerPortalActions');
  if (!title || !desc || !points || !actions) return;

  const account = getActiveUser();
  const isAr = state.lang === 'ar';
  section.classList.toggle('is-signed-in', !!account);

  if (!account) {
    title.textContent = t('playerPortalTitle');
    desc.textContent = t('playerPortalDesc');
    points.innerHTML = [
      { title: t('playerPortalPoint1'), note: isAr ? 'لا تفقد إجاباتك أو المفضلة.' : 'Never lose solved questions or favorites.' },
      { title: t('playerPortalPoint2'), note: isAr ? 'اسم واضح لنتائج الألعاب.' : 'A clear identity for game scores.' },
      { title: t('playerPortalPoint3'), note: isAr ? 'ارجع إلى آخر مكان بضغطة واحدة.' : 'Return to your last activity in one tap.' }
    ].map(item => `
      <span class="kv-player-benefit">
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.note)}</small>
      </span>
    `).join('');
    actions.innerHTML = `
      <button class="kv-btn-primary" type="button" id="playerPortalSignInBtn">${escapeHtml(t('authOpen'))}</button>
      <a class="kv-btn-outline" href="mind-lab.html">${escapeHtml(t('playerPortalStart'))}</a>
      <a class="kv-btn-outline" href="play.html">${escapeHtml(t('playerPortalGames'))}</a>
    `;
    document.getElementById('playerPortalSignInBtn')?.addEventListener('click', openAuthModal);
    return;
  }

  const totalSolved = getTotalCorrectCount();
  const favorites = account.favorites?.length || 0;
  const totalQ = state.catalog?.site?.totalQuestions || 1;
  const overallPct = Math.min(100, Math.round((totalSolved / totalQ) * 100));
  const resume = getResumeSuggestion();
  const resumeLabel = resume
    ? (resume.title[state.lang] || resume.title.en)
    : (isAr ? 'ابدأ تحدياً جديداً' : 'Start a new challenge');
  const resumeHref = resume ? resume.href : 'mind-lab.html';
  title.textContent = fmt('playerPortalSignedTitle', { name: account.username });
  desc.textContent = t('playerPortalSignedDesc');
  points.innerHTML = `
    <div class="kv-player-profile-card">
      <div class="kv-player-profile-head">
        ${renderProfileMark(account.avatar, account.username?.[0] || 'U', 'kv-player-profile-mark')}
        <div>
          <strong>${escapeHtml(account.username)}</strong>
          <small>${escapeHtml(t('profileSynced'))}</small>
        </div>
      </div>
      <div class="kv-player-progress" aria-label="${escapeHtml(isAr ? 'تقدم الحساب' : 'Account progress')}">
        <span style="--pct:${overallPct}%"></span>
      </div>
      <p>${escapeHtml(isAr ? `${totalSolved} من ${totalQ.toLocaleString()} سؤال` : `${totalSolved} of ${totalQ.toLocaleString()} questions`)}</p>
    </div>
    ${[
      { value: totalSolved, label: isAr ? 'أسئلة محلولة' : 'Solved' },
      { value: favorites, label: isAr ? 'محفوظة' : 'Saved' },
      { value: getScore(), label: isAr ? 'نقاط' : 'Points' }
    ].map(item => `
      <span class="kv-player-metric">
        <strong>${escapeHtml(item.value)}</strong>
        <small>${escapeHtml(item.label)}</small>
      </span>
    `).join('')}
    <a class="kv-player-resume-link" href="${escapeHtml(resumeHref)}">
      <strong>${escapeHtml(t('playerPortalResume'))}</strong>
      <small>${escapeHtml(resumeLabel)}</small>
    </a>
  `;
  actions.innerHTML = `
    <button class="kv-btn-primary" type="button" id="playerPortalProfileBtn">${escapeHtml(t('playerPortalOpenProfile'))}</button>
    <a class="kv-btn-outline" href="${escapeHtml(resumeHref)}">${escapeHtml(t('playerPortalResume'))}</a>
    ${(state.dbUser?.role === 'ADMIN' || state.dbUser?.role === 'OWNER') ? `<a class="kv-btn-outline" href="/admin.html">${escapeHtml(t('playerPortalAdmin'))}</a>` : ''}
  `;
  document.getElementById('playerPortalProfileBtn')?.addEventListener('click', () => {
    renderAuthModal('signin');
    openModal('auth');
  });
}

function updateHomeWidgetRow() {
  const row = document.querySelector('.kv-widgets-row');
  if (!row) return;
  const filled = Array.from(row.children).filter(child => child.textContent.trim() || child.querySelector('*'));
  row.classList.toggle('is-empty', filled.length === 0);
  row.classList.toggle('is-single', filled.length === 1);
}

function renderAccountSummary(mount) {
  if (!mount) return;
  const account = getActiveUser();
  if (!account) {
    mount.innerHTML = `
      <section class="account-card">
        <strong>${escapeHtml(t('guestTitle'))}</strong>
        <p>${escapeHtml(t('guestText'))}</p>
        <div class="hero-actions">
          <button class="primary-btn" id="inlineCreateProfileBtn">${escapeHtml(t('createLocalProfile'))}</button>
        </div>
      </section>
    `;
    const button = document.getElementById('inlineCreateProfileBtn');
    if (button) button.addEventListener('click', openAuthModal);
    return;
  }
  // ── Category page sidebar (unchanged) ──────────────────
  if (state.page === 'category') {
    const earned = computeAchievements();
    const achHtml = earned.length
      ? earned.map(a => `<span class="achievement-badge" title="${escapeHtml(state.lang === 'ar' ? a.descAr : a.descEn)}">${escapeHtml(state.lang === 'ar' ? a.ar : a.en)}</span>`).join('')
      : `<span class="muted" style="font-size:0.82rem">${escapeHtml(t('achNoAchievements'))}</span>`;
    const dc = state.categoryData?.difficultyCounts || {};
    const diffs = [
      { key: 'easy', labelEn: 'Easy', labelAr: 'سهل', color: '#22c55e' },
      { key: 'medium', labelEn: 'Medium', labelAr: 'متوسط', color: '#f59e0b' },
      { key: 'hard', labelEn: 'Hard', labelAr: 'صعب', color: '#ef4444' },
      { key: 'very-advanced', labelEn: 'Expert', labelAr: 'خبير', color: '#a855f7' },
    ].filter(d => dc[d.key] > 0);
    const bars = diffs.map(d => {
      const total = dc[d.key];
      const done = getCorrectCountByDifficulty(d.key);
      const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
      return `<div class="diff-row">
        <span class="diff-label">${escapeHtml(state.lang === 'ar' ? d.labelAr : d.labelEn)}</span>
        <div class="diff-track"><div class="diff-fill" style="width:${pct}%;background:${d.color}"></div></div>
        <span class="diff-count">${done}/${total}</span>
      </div>`;
    }).join('');
    mount.innerHTML = `
      <section class="account-card">
        <div class="row-between">
          <strong>${escapeHtml(account.username)}</strong>
          <span class="badge">${escapeHtml(t('savedProgress'))}</span>
        </div>
        <div class="stats-grid">
          <div class="stat-box"><span>${escapeHtml(t('score'))}</span><strong>${getScore()}</strong></div>
          <div class="stat-box"><span>${escapeHtml(t('solved'))}</span><strong>${getTotalCorrectCount()}</strong></div>
          ${state.streak > 0 ? `<div class="stat-box"><span>${state.lang === 'ar' ? 'متتالية' : 'Streak'}</span><strong>${state.streak}</strong></div>` : ''}
        </div>
        ${bars ? `<div class="diff-breakdown">${bars}</div>` : ''}
        <div class="achievements-section">
          <p class="achievements-title">${escapeHtml(t('achievementsTitle'))}</p>
          <div class="achievements-list">${achHtml}</div>
        </div>
      </section>
    `;
    return;
  }

  // ── Home page: dynamic dashboard ───────────────────────
  const isAr = state.lang === 'ar';
  const totalSolved = getTotalCorrectCount();
  const totalQ = state.catalog?.site?.totalQuestions || 1;
  const overallPct = Math.min(100, Math.round((totalSolved / totalQ) * 100));

  const catProgress = (state.catalog?.categories || [])
    .map(cat => ({ ...cat, ...getCategoryProgress(cat.slug) }))
    .filter(c => c.solved > 0)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 3);

  const topCatHtml = catProgress.length > 0 ? `
    <div class="dash-section">
      <p class="dash-section-label">${isAr ? 'تقدّمك بالفئات' : 'Leading in'}</p>
      ${catProgress.map(c => `
        <div class="dash-cat-row">
          <span class="dash-cat-name">${escapeHtml(c.title[state.lang] || c.title.en)}</span>
          <div class="dash-cat-bar"><div class="dash-cat-fill" style="width:${c.pct}%"></div></div>
          <span class="dash-cat-pct">${c.pct}%</span>
        </div>`).join('')}
    </div>` : '';

  const insight = getDashInsight(totalSolved, totalQ, catProgress, state.lang);
  const earned = computeAchievements();
  const achHtml = earned.length
    ? `<div class="dash-achievements">${earned.map(a => `<span class="achievement-badge" title="${escapeHtml(state.lang === 'ar' ? a.descAr : a.descEn)}">${escapeHtml(state.lang === 'ar' ? a.ar : a.en)}</span>`).join('')}</div>`
    : '';

  mount.innerHTML = `
    <div class="dash-card">
      <div class="dash-head">
        <span class="dash-greeting">${escapeHtml(getGreeting(account.username, state.lang))}</span>
        <div class="dash-score-display">
          <span class="dash-score-num">${getScore()}</span>
          <span class="dash-score-unit">${isAr ? 'نقطة' : 'pts'}</span>
        </div>
      </div>

      <div class="dash-stats">
        <div class="dash-stat">
          <strong>${totalSolved}</strong>
          <span>${isAr ? 'محلول' : 'solved'}</span>
        </div>
        <div class="dash-stat">
          <strong>${account.favorites.length}</strong>
          <span>${isAr ? 'مفضلة' : 'saved'}</span>
        </div>
        <div class="dash-stat${state.streak > 0 ? ' dash-stat-streak' : ''}">
          <strong>${state.streak > 0 ? `${state.streak}` : '—'}</strong>
          <span>${isAr ? 'متتالية' : 'streak'}</span>
        </div>
      </div>

      <div class="dash-section">
        <div class="dash-progress-bar">
          <div class="dash-progress-fill" style="width:${overallPct}%"></div>
        </div>
        <p class="dash-progress-text">${isAr ? `${totalSolved} من ${totalQ.toLocaleString()} سؤال` : `${totalSolved} of ${totalQ.toLocaleString()} questions`}</p>
      </div>

      ${topCatHtml}

      <div class="dash-insight">
        <p>${escapeHtml(insight)}</p>
      </div>

      ${achHtml}
    </div>
  `;
}

function updateBackToTopVisibility() {
  const btn = document.getElementById('backToTopBtn');
  if (!btn) return;
  btn.classList.toggle('is-visible', window.scrollY > 500);
}

function injectBackToTop() {
  let btn = document.getElementById('backToTopBtn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'backToTopBtn';
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="18 15 12 9 6 15"/></svg>';
    document.body.appendChild(btn);
  }
  btn.classList.add('back-to-top-btn');
  btn.setAttribute('aria-label', state.lang === 'ar' ? 'العودة للأعلى' : 'Back to top');
  btn.setAttribute('title', state.lang === 'ar' ? 'العودة للأعلى' : 'Back to top');
  btn.onclick = () => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  };
  if (!backToTopScrollBound) {
    window.addEventListener('scroll', updateBackToTopVisibility, { passive: true });
    backToTopScrollBound = true;
  }
  updateBackToTopVisibility();
}

function getCategoryShell() {
  if (state.categoryData) return state.categoryData;
  if (isPrimaryTopicSlug(state.categorySlug)) {
    const topic = PRIMARY_TOPIC_MAP.get(state.categorySlug);
    const parent = topic ? collectionParent(topic) : null;
    if (!topic || !parent) return null;
    return {
      slug: topic.key,
      title: topic.title,
      description: topic.description,
      cluster: parent.label,
      cluster_key: topic.parent,
      count: topic.count || topic.slugs?.length || 0,
    };
  }
  return (state.catalog?.categories || []).find(c => c.slug === state.categorySlug) || null;
}

function localized(value, fallback = '') {
  if (!value) return fallback;
  if (typeof value === 'string') return value;
  return value[state.lang] || value.en || value.ar || fallback;
}

function renderCategoryAccessGate(category) {
  document.getElementById('loadMoreBtn')?.remove();
  if (els.subcategoryWrap) els.subcategoryWrap.classList.add('hidden');
  if (els.resultsLabel) els.resultsLabel.textContent = state.lang === 'ar' ? 'سجّل الدخول لعرض الأسئلة.' : 'Sign in to view questions.';
  if (els.emptyState) els.emptyState.classList.add('hidden');
  if (els.categorySummaryMount) renderAccountSummary(els.categorySummaryMount);
  if (els.cardGrid) {
    els.cardGrid.innerHTML = `
      <section class="account-summary account-summary-gate" aria-label="${escapeHtml(t('authTitle'))}">
        <strong>${escapeHtml(state.lang === 'ar' ? 'أنشئ حسابًا لفتح هذه الصفحة' : 'Create an account to open this page')}</strong>
        <p>${escapeHtml(state.lang === 'ar' ? 'الأسئلة والألعاب محفوظة للأعضاء حتى نحمي التقدم، المفضلة، والنتائج.' : 'Questions and games are members-only so progress, favorites, and scores stay tied to a real account.')}</p>
        <button class="primary-btn" type="button" id="categoryAuthGateBtn">${escapeHtml(state.lang === 'ar' ? 'إنشاء حساب' : 'Create account')}</button>
      </section>
    `;
    document.getElementById('categoryAuthGateBtn')?.addEventListener('click', () => openAuthModal('register'));
  }
  if (els.relatedCategories) els.relatedCategories.innerHTML = '';
  document.getElementById('faqSchema')?.remove();
}

function renderCategoryPage() {
  if (!state.catalog) return;

  const category = getCategoryShell();
  if (!category) return;
  const gradient = mindTrackGradient(category.cluster_key);
  const accent = mindTrackAccent(category.cluster_key);
  const artFamily = atlasFamilyFromCluster(category.cluster_key);
  document.body.dataset.activeCategory = category.slug;
  document.body.dataset.artFamily = artFamily;
  document.body.style.setProperty('--active-category-gradient', gradient);
  document.body.style.setProperty('--active-category-accent', accent);
  if (els.categoryKicker) els.categoryKicker.textContent = localized(category.cluster);
  if (els.categoryTitle) els.categoryTitle.textContent = localized(category.title, category.slug);
  document.title = `${localized(category.title, category.slug)} | JAKH`;
  document.querySelector('meta[name="description"]')?.setAttribute('content', localized(category.description));
  const breadcrumbEl = document.getElementById('breadcrumbCategoryName');
  if (breadcrumbEl) breadcrumbEl.textContent = localized(category.title, category.slug);
  if (els.categoryDescription) els.categoryDescription.textContent = localized(category.description);
  if (els.categoryCountPill) els.categoryCountPill.textContent = fmt('pageQuestions', { count: category.count });
  if (els.categoryImage) {
    const heroDiv = document.createElement('div');
    heroDiv.className = `category-hero-bg mind-cover-shell mind-cover-${artFamily}`;
    heroDiv.style.setProperty('--category-gradient', gradient);
    heroDiv.innerHTML = mindCoverSvg({ slug: category.slug, title: category.title.en, clusterKey: category.cluster_key, color: accent, variant: 'hero' });
    els.categoryImage.replaceWith(heroDiv);
    els.categoryImage = null;
  }
  if (els.categoryDiffBadge) els.categoryDiffBadge.textContent = buildDiffBadge(category);
  if (!state.dbUser) {
    renderCategoryAccessGate(category);
    return;
  }
  restoreFilterParams();
  renderAccountSummary(els.categorySummaryMount);
  renderSubcategoryFilters();
  renderCards();
  renderRelatedCategories();
  injectFaqSchema();
}

function injectFaqSchema() {
  document.getElementById('faqSchema')?.remove();
  if (!state.categoryData?.cards?.length) return;
  const easy = state.categoryData.cards.filter(c => c.difficulty === 'easy' || c.difficulty === 'medium').slice(0, 8);
  if (!easy.length) return;
  const script = document.createElement('script');
  script.id = 'faqSchema';
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: easy.map(c => ({
      '@type': 'Question',
      name: c.question.en,
      acceptedAnswer: { '@type': 'Answer', text: c.answer.en },
    })),
  });
  document.head.appendChild(script);
}

function buildDiffBadge(category) {
  const dc = category.difficultyCounts || {};
  const total = category.count || (category.cards || []).length;
  const order = ['easy', 'medium', 'hard', 'very-advanced'];
  const labels = state.lang === 'ar'
    ? { easy: 'سهل', medium: 'متوسط', hard: 'صعب', 'very-advanced': 'خبير' }
    : { easy: 'Easy', medium: 'Medium', hard: 'Hard', 'very-advanced': 'Expert' };
  const parts = order.filter(d => dc[d] > 0).map(d => `${dc[d]} ${labels[d]}`);
  const totalLabel = state.lang === 'ar' ? `${total} سؤال` : `${total} questions`;
  return parts.length ? `${totalLabel} — ${parts.join(' · ')}` : totalLabel;
}

function renderSubcategoryFilters() {
  if (!els.subcategoryWrap || !els.subcategoryFilters || !state.categoryData) return;
  let subcats = state.categoryData.subcategories || [];
  if (!subcats.length) {
    const counts = {};
    for (const card of state.categoryData.cards || []) {
      const sc = card.subcategory;
      if (sc && sc.en) {
        if (!counts[sc.en]) counts[sc.en] = { en: sc.en, ar: sc.ar || sc.en, count: 0 };
        counts[sc.en].count++;
      }
    }
    subcats = Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 12);
  }
  if (!subcats.length) {
    els.subcategoryWrap.classList.add('hidden');
    return;
  }
  els.subcategoryWrap.classList.remove('hidden');
  const allLabel = state.lang === 'ar' ? 'الكل' : 'All';
  const chips = [{ key: 'all', label: allLabel }, ...subcats.map((item) => ({ key: item.en, label: item[state.lang] || item.en || '' }))];
  els.subcategoryFilters.innerHTML = chips.map((chip) => `
    <button class="category-chip ${state.subcategory === chip.key ? 'is-active' : ''}" data-subcategory="${escapeHtml(chip.key)}">${escapeHtml(chip.label)}</button>
  `).join('');
  els.subcategoryFilters.querySelectorAll('[data-subcategory]').forEach((button) => {
    button.addEventListener('click', () => {
      state.subcategory = button.dataset.subcategory;
      state.cardPage = 1;
      renderSubcategoryFilters();
      renderCards();
    });
  });
}

function syncFilterParams() {
  if (state.page !== 'category') return;
  const params = new URLSearchParams(location.search);
  if (state.difficulty && state.difficulty !== 'all') params.set('difficulty', state.difficulty); else params.delete('difficulty');
  if (state.view && state.view !== 'all') params.set('view', state.view); else params.delete('view');
  if (state.sort && state.sort !== 'difficulty') params.set('sort', state.sort); else params.delete('sort');
  if (state.subcategory && state.subcategory !== 'all') params.set('sub', state.subcategory); else params.delete('sub');
  if (state.search) params.set('q', state.search); else params.delete('q');
  const newSearch = params.toString() ? `?${params.toString()}` : location.pathname;
  history.replaceState(null, '', params.toString() ? `${location.pathname}?${params.toString()}` : location.pathname);
}

function restoreFilterParams() {
  const params = new URLSearchParams(location.search);
  if (params.has('difficulty')) state.difficulty = params.get('difficulty');
  if (params.has('view')) state.view = params.get('view');
  if (params.has('sort')) state.sort = params.get('sort');
  if (params.has('sub')) state.subcategory = params.get('sub');
  if (params.has('q')) state.search = params.get('q').toLowerCase();
  // Sync select UI elements
  if (els.difficultySelect && state.difficulty) els.difficultySelect.value = state.difficulty;
  if (els.viewSelect && state.view) els.viewSelect.value = state.view;
  if (els.sortSelect && state.sort) els.sortSelect.value = state.sort;
  if (els.cardSearchInput && state.search) els.cardSearchInput.value = state.search;
}

function getFilteredCards() {
  if (!state.categoryData) return [];
  let cards = [...state.categoryData.cards];
  if (state.difficulty !== 'all') cards = cards.filter((card) => card.difficulty === state.difficulty);
  if (state.view === 'solved') cards = cards.filter((card) => getProgressResult(card.id) === 'correct');
  if (state.view === 'unsolved') cards = cards.filter((card) => getProgressResult(card.id) !== 'correct');
  if (state.view === 'favorites') cards = cards.filter((card) => isFavorite(card.id));
  if (state.subcategory !== 'all') cards = cards.filter((card) => card.subcategory && card.subcategory.en === state.subcategory);
  if (state.search) {
    cards = cards.filter((card) => {
      const haystack = [
        card.question.en, card.question.ar, card.answer.en, card.answer.ar,
        card.subcategory ? card.subcategory.en : '', card.subcategory ? card.subcategory.ar : ''
      ].join(' ').toLowerCase();
      return haystack.includes(state.search);
    });
  }
  if (state.sort === 'difficulty') {
    const order = { easy: 0, medium: 1, hard: 2, 'very-advanced': 3 };
    cards.sort((a, b) => order[a.difficulty] - order[b.difficulty] || a.id.localeCompare(b.id));
  } else if (state.sort === 'az') {
    cards.sort((a, b) => a.question[state.lang].localeCompare(b.question[state.lang], state.lang));
  } else if (state.sort === 'random') {
    cards = shuffleArray(cards);
  }
  return cards;
}

function cardIconSvg(name) {
  const icons = {
    answer: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.8"/></svg>',
    question: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.2 9a3.1 3.1 0 1 1 5.3 2.2c-1.2 1-2.3 1.7-2.3 3.3"/><path d="M12 18h.01"/><circle cx="12" cy="12" r="9"/></svg>',
    bookmark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.8c0-1 .8-1.8 1.8-1.8h8.4c1 0 1.8.8 1.8 1.8V21l-6-3.5L6 21V4.8Z"/></svg>',
    saved: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.8c0-1 .8-1.8 1.8-1.8h8.4c1 0 1.8.8 1.8 1.8V21l-6-3.5L6 21V4.8Z"/><path d="m9.2 11.5 1.8 1.8 4-4"/></svg>',
    audio: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16 9.5a4 4 0 0 1 0 5"/><path d="M18.7 7a7.5 7.5 0 0 1 0 10"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 7"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7 17 17"/><path d="M17 7 7 17"/></svg>',
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-3-3-3 3"/><path d="M12 3v12"/><path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
    report: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V4"/><path d="M6 5h10l-1.2 4L16 13H6"/></svg>',
  };
  return icons[name] || icons.question;
}

function cardIconButton(className, action, id, label, icon) {
  return `<button class="${className}" data-action="${escapeHtml(action)}" data-id="${escapeHtml(id)}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">${cardIconSvg(icon)}</button>`;
}

function refreshCardTextOverflow(root = document) {
  root.querySelectorAll('.card-question, .card-answer').forEach((node) => {
    node.classList.remove('is-scrollable');
    node.classList.toggle('is-scrollable', node.scrollHeight > node.clientHeight + 2);
  });
}

function scheduleCardTextOverflow(root = document) {
  requestAnimationFrame(() => refreshCardTextOverflow(root));
}

function createCardMarkup(card) {
  const flipped = state.flipped.has(card.id);
  const favorite = isFavorite(card.id);
  const result = getProgressResult(card.id);
  const difficultyLabel = card.difficulty === 'very-advanced' ? t('veryAdvanced') : t(card.difficulty);
  const subcatText = card.subcategory ? (card.subcategory[state.lang] || card.subcategory.en || '') : '';
  const subcat = subcatText ? `<span class="badge badge-subcategory">${escapeHtml(subcatText)}</span>` : '';
  const categoryBadge = '';
  const difficultyBadge = `<span class="badge badge-difficulty" data-difficulty="${escapeHtml(card.difficulty)}">${escapeHtml(difficultyLabel)}</span>`;

  if (!state.dbUser) {
    const unlockLabel = state.lang === 'ar' ? 'إنشاء حساب' : 'Create account';
    return `
      <article class="riddle-card is-locked requires-auth" data-id="${escapeHtml(card.id)}" data-mode="${escapeHtml(card.mode || 'quiz')}" tabindex="0" aria-label="${escapeHtml(t('loginNeeded'))}">
        <div class="card-inner">
          <section class="card-face card-front">
            <div class="card-badges">${categoryBadge}${difficultyBadge}${subcat}</div>
            <p class="card-question">${escapeHtml(t('loginNeeded'))}</p>
            <div class="card-actions">
              <button class="primary-btn mini-btn" data-action="auth" data-id="${escapeHtml(card.id)}">${escapeHtml(unlockLabel)}</button>
            </div>
          </section>
        </div>
      </article>
    `;
  }

  if (!isLevelUnlocked(card.difficulty)) {
    const lockMsg = card.difficulty === 'hard' ? t('lockHard') : t('lockDifficult');
    return `
      <article class="riddle-card is-locked" data-id="${escapeHtml(card.id)}" data-mode="${escapeHtml(card.mode || 'quiz')}" tabindex="0" aria-label="Locked">
        <div class="card-inner">
          <section class="card-face card-front">
            <div class="card-badges">${categoryBadge}${difficultyBadge}${subcat}</div>
            <p class="card-question">${escapeHtml(card.question[state.lang])}</p>
            <p class="lock-msg">${escapeHtml(lockMsg)}</p>
          </section>
        </div>
      </article>
    `;
  }

  const flipLabel = flipped ? t('backToQuestion') : t('flipForAnswer');
  const favoriteLabel = favorite ? t('removeFavorite') : t('addFavorite');
  const flipBtn = cardIconButton(
    'primary-btn mini-btn card-action-btn action-flip',
    'flip',
    card.id,
    flipLabel,
    flipped ? 'question' : 'answer'
  );
  const favoriteBtn = cardIconButton(
    `mini-btn card-action-btn action-fav${favorite ? ' is-fav' : ''}`,
    'favorite',
    card.id,
    favoriteLabel,
    favorite ? 'saved' : 'bookmark'
  );
  const audioBtn = state.audioEnabled
    ? cardIconButton('mini-btn card-action-btn card-audio-btn', 'audio', card.id, t('audioPlay'), 'audio')
    : '';
  let markBtns;
  if (result === 'correct') {
    markBtns = cardIconButton('card-mark-btn card-action-btn is-correct', 'unmark', card.id, t('markUnsolved'), 'check');
  } else if (result === 'wrong') {
    markBtns = cardIconButton('card-mark-btn card-action-btn is-wrong', 'unmark', card.id, t('markUnsolved'), 'x');
  } else {
    markBtns = `
      ${cardIconButton('card-mark-btn card-action-btn action-correct', 'markCorrect', card.id, t('markSolved'), 'check')}
      ${cardIconButton('card-mark-btn card-action-btn action-wrong', 'markWrong', card.id, t('markWrong'), 'x')}
    `;
  }

  return `
    <article class="riddle-card ${flipped ? 'is-flipped' : ''} ${result === 'correct' ? 'is-solved' : ''} ${result === 'wrong' ? 'is-wrong-card' : ''}" data-id="${escapeHtml(card.id)}" data-mode="${escapeHtml(card.mode || 'quiz')}" tabindex="0" role="button" aria-label="${escapeHtml(card.question[state.lang])}" aria-expanded="${flipped}">
      <div class="card-inner">
        <section class="card-face card-front">
          <div class="card-badges">
            ${categoryBadge}
            ${difficultyBadge}
            ${subcat}
          </div>
          <p class="card-question">${escapeHtml(card.question[state.lang])}</p>
          <div class="card-actions">
            ${flipBtn}
            ${favoriteBtn}
            ${audioBtn}
          </div>
        </section>
        <section class="card-face card-back">
          <p class="card-answer"><strong>${escapeHtml(card.answer[state.lang])}</strong></p>
          <div class="card-actions">
            ${flipBtn}
            <div class="card-icon-row">
              ${cardIconButton(`card-fav-btn card-action-btn${favorite ? ' is-fav' : ''}`, 'favorite', card.id, favoriteLabel, favorite ? 'saved' : 'bookmark')}
              ${markBtns}
              ${cardIconButton('mini-btn card-action-btn card-share-btn', 'share', card.id, state.lang === 'ar' ? 'مشاركة السؤال' : 'Share question', 'share')}
              ${cardIconButton('mini-btn card-action-btn report-btn', 'report', card.id, t('reportBtn'), 'report')}
            </div>
          </div>
        </section>
      </div>
    </article>
  `;
}

function updateCardEl(id) {
  const el = els.cardGrid?.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if (!el) return;
  const card = state.categoryData?.cards.find(c => c.id === id);
  if (!card) return;
  const cardI = el.style.getPropertyValue('--card-i');
  const tmp = document.createElement('div');
  tmp.innerHTML = createCardMarkup(card);
  const newEl = tmp.firstElementChild;
  newEl.style.setProperty('--card-i', cardI || '0');
  newEl.style.animation = 'none';
  el.replaceWith(newEl);
  scheduleCardTextOverflow(newEl);
}

// When marking or favoriting, visibility may change if a filter is active
function updateCardElOrRefresh(id) {
  if (state.view !== 'all') {
    renderCards();
  } else {
    updateCardEl(id);
  }
}

function renderCards() {
  if (!els.cardGrid || !state.categoryData) return;

  // Remove any previous load-more button
  document.getElementById('loadMoreBtn')?.remove();

  const filtered = getFilteredCards();
  const pageEnd = state.cardPage * PAGE_SIZE;
  const visible = filtered.slice(0, pageEnd);

  els.cardGrid.innerHTML = visible.map(createCardMarkup).join('');
  els.cardGrid.querySelectorAll('.riddle-card').forEach((el, i) => {
    el.style.setProperty('--card-i', Math.min(i, 10));
  });
  scheduleCardTextOverflow(els.cardGrid);

  // Append Load More button when more cards remain
  if (filtered.length > pageEnd) {
    const remaining = filtered.length - pageEnd;
    const btn = document.createElement('button');
    btn.id = 'loadMoreBtn';
    btn.className = 'secondary-btn';
    btn.style.cssText = 'width:100%;margin-top:1rem;display:block;';
    btn.textContent = state.lang === 'ar'
      ? `عرض ${Math.min(PAGE_SIZE, remaining)} إضافي (${remaining} متبقية)`
      : `Show ${Math.min(PAGE_SIZE, remaining)} more (${remaining} remaining)`;
    btn.addEventListener('click', () => {
      state.cardPage += 1;
      renderCards();
    });
    els.cardGrid.insertAdjacentElement('afterend', btn);
  }

  if (els.emptyState) els.emptyState.classList.toggle('hidden', filtered.length > 0);
  if (els.resultsLabel) {
    els.resultsLabel.textContent = filtered.length === state.categoryData.cards.length
      ? fmt('showingAllCards', { count: filtered.length })
      : fmt('showingFilteredCards', { count: filtered.length });
  }
  renderAccountSummary(els.categorySummaryMount);
}

function renderRelatedCategories() {
  if (!els.relatedCategories || !state.catalog || !state.categoryData) return;
  const currentSlug = state.categoryData.slug;

  // Deterministic per-page shuffle: each source page picks a stable but unique set
  // of related pages, ensuring all categories receive inbound links (no orphans).
  function slugHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    return h >>> 0;
  }
  function seededShuffle(arr, seed) {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = slugHash(seed + String(i)) % (i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  const sameCluster = state.catalog.categories.filter(
    m => m.slug !== currentSlug && m.cluster_key === state.categoryData.cluster_key
  );
  const otherCluster = state.catalog.categories.filter(
    m => m.slug !== currentSlug && m.cluster_key !== state.categoryData.cluster_key
  );

  const related = [
    ...seededShuffle(sameCluster, currentSlug),
    ...seededShuffle(otherCluster, currentSlug),
  ].slice(0, 6);

  els.relatedCategories.innerHTML = related.length
    ? related.map(createCategoryCardMarkup).join('')
    : `<p class="muted">${escapeHtml(t('noRelated'))}</p>`;
}


async function toggleFavorite(id) {
  const isFav = isFavorite(id);

  if (!state.dbUser) {
    showToast(t('loginNeeded'), true);
    openAuthModal();
    return;
  }

  const dbUser = state.dbUser;
  const action = isFav ? 'remove' : 'add';
  if (action === 'add') {
    dbUser.favorites.push({ cardId: id, categoryId: state.categoryData?.slug || 'unknown' });
    showToast(t('favoriteAdded'));
  } else {
    dbUser.favorites = dbUser.favorites.filter(f => f.cardId !== id);
    showToast(t('favoriteRemoved'));
  }
  updateCardElOrRefresh(id);
  renderAccountSummary(els.categorySummaryMount);

  try {
    await apiFetch('/user/favorite', {
      method: 'POST',
      body: JSON.stringify({ cardId: id, categoryId: state.categoryData?.slug || 'unknown', action })
    });
  } catch (err) {
    showToast(state.lang === 'ar' ? 'خطأ في الحفظ السحابي' : 'Error saving to cloud');
  }
}

async function markCard(id, result) {
  const card = state.categoryData?.cards.find(item => item.id === id);
  if (!card) return;
  if (!state.dbUser) {
    showToast(t('loginNeeded'), true);
    openAuthModal();
    return;
  }
  if (result === 'correct') hapticSuccess(); else hapticError();
  const status = result === 'correct' ? card.difficulty : `wrong-${card.difficulty}`;
  showToast(result === 'correct' ? t('solvedAdded') : t('markedWrong'));
  trackEvent(result === 'correct' ? 'card_correct' : 'card_wrong', { category: state.categorySlug, difficulty: card.difficulty });
  if (result === 'correct') {
    const cardEl = els.cardGrid?.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (cardEl) spawnConfetti(cardEl);
    const h = new Date().getHours();
    if (h >= 0 && h < 5) saveJson('jakh-night-owl', 1);
    checkNewAchievements();
  }
  const dbUser = state.dbUser;
  dbUser.progress = dbUser.progress.filter(p => p.cardId !== id);
  dbUser.progress.push({ cardId: id, categoryId: state.categoryData?.slug || 'unknown', status });
  updateCardElOrRefresh(id);
  if (result === 'correct') flashCard(id);
  else flashCard(id, 'error');
  renderAccountSummary(els.categorySummaryMount);
  if (result === 'correct') setTimeout(() => checkCategoryComplete(state.categoryData?.slug || ''), 400);

  try {
    await apiFetch('/user/progress', {
      method: 'POST',
      body: JSON.stringify({ cardId: id, categoryId: state.categoryData?.slug || 'unknown', status }),
    });
  } catch (e) { }
}

async function unmarkCard(id) {
  if (!state.dbUser) {
    showToast(t('loginNeeded'), true);
    openAuthModal();
    return;
  }

  const dbUser = state.dbUser;
  dbUser.progress = dbUser.progress.filter(p => p.cardId !== id);
  showToast(t('solvedRemoved'));
  updateCardElOrRefresh(id);
  renderAccountSummary(els.categorySummaryMount);

  try {
    await apiFetch('/user/progress', {
      method: 'DELETE',
      body: JSON.stringify({ cardId: id, categoryId: state.categoryData?.slug || 'unknown' }),
    });
  } catch (e) { }
}

const FOCUSABLE = 'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])';

function trapFocus(el) {
  const nodes = () => [...el.querySelectorAll(FOCUSABLE)].filter(n => !n.closest('[aria-hidden="true"]'));
  el._trapHandler = (e) => {
    if (e.key !== 'Tab') return;
    const items = nodes();
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
    else { if (document.activeElement === last) { e.preventDefault(); first.focus(); } }
  };
  el.addEventListener('keydown', el._trapHandler);
  const firstFocusable = nodes()[0];
  if (firstFocusable) requestAnimationFrame(() => firstFocusable.focus());
}

function releaseFocus(el) {
  if (el._trapHandler) el.removeEventListener('keydown', el._trapHandler);
}

function openModal(name) {
  const modal = els.authModal;
  if (!modal) return;
  document.body.classList.add('modal-open');
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  trapFocus(modal);
}

function closeModal(name) {
  if (name === 'leaderboard') {
    const lb = document.getElementById('leaderboardModal');
    if (lb) { lb.classList.add('hidden'); lb.setAttribute('aria-hidden', 'true'); releaseFocus(lb); }
    return;
  }
  const modal = els.authModal;
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  releaseFocus(modal);
}

function openAuthModal(mode = 'register') {
  renderAuthModal(mode);
  openModal('auth');
  if (mode === 'register') trackFunnelStep('signup-intent');
}

function renderAuthModal(mode = 'signin') {
  if (!els.authModalBody) return;
  const account = getActiveUser();
  const modalCard = els.authModal?.querySelector('.modal-card');
  const modalTitle = document.getElementById('authModalTitle');
  const modalEyebrow = els.authModal?.querySelector('[data-i18n="authEyebrow"]');
  modalCard?.classList.toggle('modal-card-wide', !!account);
  if (modalTitle) modalTitle.textContent = account ? t('playerPortalOpenProfile') : t('authTitle');
  if (modalEyebrow) modalEyebrow.textContent = account ? t('profileSynced') : t('authEyebrow');
  if (account) {
    const isAr = state.lang === 'ar';
    const totalSolved = getTotalCorrectCount();
    const totalQ = state.catalog?.site?.totalQuestions || 1;
    const overallPct = Math.min(100, Math.round((totalSolved / totalQ) * 100));
    const resume = getResumeSuggestion();
    const resumeHref = resume ? resume.href : 'mind-lab.html';
    const resumeLabel = resume ? (resume.title[state.lang] || resume.title.en) : (isAr ? 'مختبر العقل' : 'Mind Lab');
    const favorites = account.favorites?.length || 0;
    const role = state.dbUser?.role || 'MEMBER';
    const roleLabel = role === 'OWNER' ? t('profileOwner') : role === 'ADMIN' ? t('profileAdmin') : t('profileMember');
    const catProgress = (state.catalog?.categories || [])
      .map(cat => ({ ...cat, ...getCategoryProgress(cat.slug) }))
      .filter(cat => cat.solved > 0)
      .sort((a, b) => b.pct - a.pct || b.solved - a.solved)
      .slice(0, 4);
    const topCategoryHtml = catProgress.length ? catProgress.map(cat => `
      <div class="profile-topic-row">
        <span>${escapeHtml(cat.title[state.lang] || cat.title.en)}</span>
        <strong>${cat.pct}%</strong>
        <div class="profile-topic-track"><i style="--pct:${cat.pct}%"></i></div>
      </div>
    `).join('') : `<p class="profile-empty">${escapeHtml(t('profileNoTopAreas'))}</p>`;
    const earnedAchievements = computeAchievements();
    const achievementHtml = earnedAchievements.length
      ? earnedAchievements.slice(0, 6).map(a => `<span class="achievement-badge" title="${escapeHtml(state.lang === 'ar' ? a.descAr : a.descEn)}">${escapeHtml(state.lang === 'ar' ? a.ar : a.en)}</span>`).join('')
      : `<p class="profile-empty">${escapeHtml(t('profileNoAchievements'))}</p>`;
    const activeMarkId = getProfileMark(account.avatar)?.id || '';
    const profileMarkCards = PROFILE_MARKS.map(mark => {
      const active = activeMarkId === mark.id;
      return `
        <button type="button" class="profile-mark-card ${active ? 'is-active' : ''}" data-avatar="${escapeHtml(mark.id)}" aria-pressed="${active ? 'true' : 'false'}">
          ${renderProfileMark(mark.id, mark.glyph, 'profile-mark-choice')}
          <span class="profile-mark-card-copy">
            <strong>${escapeHtml(getProfileMarkText(mark, 'name'))}</strong>
            <small>${escapeHtml(getProfileMarkText(mark, 'note'))}</small>
          </span>
        </button>
      `;
    }).join('');

    els.authModalBody.innerHTML = `
      <section class="profile-hub">
        <div class="profile-hub-hero">
          <div class="auth-profile-head">
            ${renderProfileMark(account.avatar, account.username?.[0] || 'U', 'profile-mark-current')}
            <div>
              <span class="profile-hub-kicker">${escapeHtml(roleLabel)}</span>
              <strong class="auth-profile-name">${escapeHtml(account.username)}</strong>
              <p class="auth-profile-note">${escapeHtml(t('accountReady'))}</p>
            </div>
          </div>
          <div class="profile-sync-card">
            <span>${escapeHtml(t('profileSynced'))}</span>
            <strong>${escapeHtml(isAr ? 'جاهز للمتابعة' : 'Ready to continue')}</strong>
          </div>
        </div>

        <div class="profile-action-row">
          <a class="primary-btn" href="${escapeHtml(resumeHref)}">${escapeHtml(t('playerPortalResume'))}: ${escapeHtml(resumeLabel)}</a>
          <a class="secondary-btn" href="mind-lab.html">${escapeHtml(t('playerPortalStart'))}</a>
          <a class="secondary-btn" href="play.html">${escapeHtml(t('playerPortalGames'))}</a>
          ${(role === 'ADMIN' || role === 'OWNER') ? `<a href="/admin.html" class="secondary-btn">${escapeHtml(t('playerPortalAdmin'))}</a>` : ''}
        </div>

        <div class="profile-stat-grid" aria-label="${escapeHtml(t('profileOverview'))}">
          <div class="profile-stat-card"><span>${escapeHtml(t('score'))}</span><strong>${getScore()}</strong></div>
          <div class="profile-stat-card"><span>${escapeHtml(t('solved'))}</span><strong>${totalSolved}</strong></div>
          <div class="profile-stat-card"><span>${escapeHtml(t('favorites'))}</span><strong>${favorites}</strong></div>
          <div class="profile-stat-card"><span>${escapeHtml(isAr ? 'متتالية' : 'Streak')}</span><strong>${state.streak || 0}</strong></div>
        </div>

        <div class="profile-progress-panel">
          <div>
            <strong>${escapeHtml(t('profileOverview'))}</strong>
            <p>${escapeHtml(isAr ? `${totalSolved} من ${totalQ.toLocaleString()} سؤال مكتمل` : `${totalSolved} of ${totalQ.toLocaleString()} questions completed`)}</p>
          </div>
          <div class="profile-progress-track"><span style="--pct:${overallPct}%"></span></div>
        </div>

        <div class="profile-panel-grid">
          <section class="profile-panel">
            <div class="profile-panel-head">
              <strong>${escapeHtml(t('profileTopAreas'))}</strong>
            </div>
            <div class="profile-topic-list">${topCategoryHtml}</div>
          </section>
          <section class="profile-panel">
            <div class="profile-panel-head">
              <strong>${escapeHtml(t('profileAchievements'))}</strong>
            </div>
            <div class="profile-achievements">${achievementHtml}</div>
          </section>
        </div>

        <section class="profile-panel profile-mark-section">
          <div class="profile-panel-head">
            <strong>${escapeHtml(t('profileIdentity'))}</strong>
            <p>${escapeHtml(t('profileIdentityDesc'))}</p>
          </div>
          <div id="avatarSelector" class="profile-mark-grid">${profileMarkCards}</div>
        </section>

        <section class="profile-panel">
          <div class="profile-panel-head">
            <strong>${escapeHtml(t('profileSecurity'))}</strong>
            <p>${escapeHtml(t('profileSecurityDesc'))}</p>
          </div>
          <div class="form-row profile-password-row">
            <label>
              <span>${escapeHtml(t('profileCurrentPassword'))}</span>
              <input type="password" id="currentPassword" autocomplete="current-password" />
            </label>
            <label>
              <span>${escapeHtml(t('profileNewPassword'))}</span>
              <input type="password" id="newPassword" minlength="15" maxlength="128" autocomplete="new-password" />
            </label>
          </div>
          <button class="mini-btn" id="changePasswordBtn">${escapeHtml(t('profileUpdatePassword'))}</button>
        </section>

        <div class="profile-support-row">
          <div>
            <strong>${escapeHtml(t('profileSupport'))}</strong>
            <p>${escapeHtml(isAr ? 'الدعم، الخصوصية، والخروج في مكان واحد.' : 'Support, privacy, and sign-out in one place.')}</p>
          </div>
          <div class="profile-support-actions">
            <a class="mini-btn" href="contact.html#suggestionBox">${escapeHtml(t('profileContact'))}</a>
            <a class="mini-btn" href="privacy.html">${escapeHtml(t('profilePrivacy'))}</a>
            <button class="mini-btn profile-danger-btn" id="logoutBtn">${escapeHtml(t('logout'))}</button>
          </div>
        </div>
      </section>
    `;

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', async () => {
      try { await apiFetch('/auth/logout', { method: 'POST' }); } catch (e) { }
      state.dbUser = null;
      if (state.page === 'category') state.categoryData = null;
      closeModal('auth');
      applyStaticCopy();
      rerender();
      showToast(t('signedOut'));
    });

    const avatarBtns = document.querySelectorAll('.profile-mark-card');
    avatarBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const avatar = getProfileMark(btn.dataset.avatar)?.id || PROFILE_MARKS[0].id;
        btn.disabled = true;
        try {
          await apiFetch('/user/avatar', { method: 'PUT', body: JSON.stringify({ avatar }) });
          state.dbUser.avatar = avatar;
          renderAuthModal('signin');
          showToast(state.lang === 'ar' ? 'تم تحديث علامة الملف الشخصي' : 'Profile mark updated');
        } catch (err) {
          showToast(state.lang === 'ar' ? 'تعذر حفظ العلامة' : 'Failed to save profile mark');
          btn.disabled = false;
        }
      });
    });

    const cpBtn = document.getElementById('changePasswordBtn');
    if (cpBtn) cpBtn.addEventListener('click', async () => {
      const cur = document.getElementById('currentPassword').value;
      const neu = document.getElementById('newPassword').value;
      if (!cur || !neu) return showToast(state.lang === 'ar' ? 'الرجاء ملء حقلي كلمة المرور' : 'Fill both passwords');
      cpBtn.textContent = '...';
      try {
        await apiFetch('/user/password', { method: 'POST', body: JSON.stringify({ currentPassword: cur, newPassword: neu }) });
        showToast(state.lang === 'ar' ? 'تم تحديث كلمة المرور' : 'Password updated');
        document.getElementById('currentPassword').value = '';
        document.getElementById('newPassword').value = '';
      } catch (err) {
        showToast(err.message);
      } finally {
        cpBtn.textContent = t('profileUpdatePassword');
      }
    });

    return;
  }

  els.authModalBody.innerHTML = `
    <div class="auth-tabs">
      <button class="auth-tab ${mode === 'signin' ? 'is-active' : ''}" id="tabSignin">${escapeHtml(t('authSignInTab'))}</button>
      <button class="auth-tab ${mode === 'register' ? 'is-active' : ''}" id="tabRegister">${escapeHtml(t('authRegisterTab'))}</button>
    </div>
    <form class="auth-form" id="authForm">
      <div class="form-row">
        <label>
          <span>${escapeHtml(t('username'))}</span>
          <input id="authUsername" required minlength="3" maxlength="20" pattern="[A-Za-z0-9_]{3,20}" autocomplete="username" autocapitalize="none" spellcheck="false" />
        </label>
        <label>
          <span>${escapeHtml(t('password'))}</span>
          <span class="password-field">
            <input id="authPassword" type="password" required minlength="${mode === 'signin' ? '1' : '15'}" maxlength="128" autocomplete="${mode === 'signin' ? 'current-password' : 'new-password'}" />
            <button class="text-btn password-toggle" type="button" id="authPasswordToggle">${escapeHtml(state.lang === 'ar' ? 'إظهار' : 'Show')}</button>
          </span>
        </label>
      </div>
      ${mode === 'register' ? `
      <div class="form-row" style="margin-top: 1rem;">
         <label>
           <span>${escapeHtml(state.lang === 'ar' ? 'البريد الإلكتروني' : 'Email')}</span>
           <input id="authEmail" type="email" autocomplete="email" autocapitalize="none" spellcheck="false" required />
         </label>
      </div>` : ''}
      <p class="muted">${escapeHtml(mode === 'register' ? t('passwordHint') : (state.lang === 'ar' ? 'يمكنك استخدام مدير كلمات المرور أو لصق كلمة المرور.' : 'Password managers and paste are supported.'))}</p>
      <div class="hero-actions">
        <button class="primary-btn" type="submit" id="authSubmitBtn">${escapeHtml(mode === 'signin' ? t('signIn') : t('register'))}</button>
      </div>
      ${mode === 'signin' ? `<button class="text-btn" type="button" id="forgotPasswordBtn">${escapeHtml(state.lang === 'ar' ? 'نسيت كلمة المرور؟' : 'Forgot password?')}</button>` : ''}
    </form>
  `;
  const tabSignin = document.getElementById('tabSignin');
  const tabRegister = document.getElementById('tabRegister');
  if (tabSignin) tabSignin.addEventListener('click', () => renderAuthModal('signin'));
  if (tabRegister) tabRegister.addEventListener('click', () => renderAuthModal('register'));
  const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
  if (forgotPasswordBtn) forgotPasswordBtn.addEventListener('click', () => renderPasswordResetRequest());
  const passwordInput = document.getElementById('authPassword');
  const passwordToggle = document.getElementById('authPasswordToggle');
  if (passwordInput && passwordToggle) {
    passwordToggle.addEventListener('click', () => {
      const showing = passwordInput.type === 'text';
      passwordInput.type = showing ? 'password' : 'text';
      passwordToggle.textContent = state.lang === 'ar'
        ? (showing ? 'إظهار' : 'إخفاء')
        : (showing ? 'Show' : 'Hide');
    });
  }
  const form = document.getElementById('authForm');
  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const btn = document.getElementById('authSubmitBtn');
      btn.disabled = true;
      btn.textContent = state.lang === 'ar' ? 'جاري التحميل...' : 'Loading...';

      const username = document.getElementById('authUsername').value.trim();
      const password = document.getElementById('authPassword').value;
      const emailEl = document.getElementById('authEmail');
      const email = emailEl ? emailEl.value.trim() : null;

      try {
        if (mode === 'signin') {
          await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
        } else {
          await apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ username, password, email }) });
        }
        await checkCloudSession();
        if (state.page === 'category') await loadCategoryIfNeeded();
        closeModal('auth');
        applyStaticCopy();
        rerender();
        trackEvent(mode === 'signin' ? 'login' : 'sign_up', { method: 'username' });
        if (mode === 'register') trackFunnelStep('signup-complete');
        showToast(mode === 'signin' ? t('signedIn') : t('accountCreated'));
      } catch (err) {
        if (mode === 'register') trackFunnelStep('signup-error');
        showToast(err.message || t('badLogin'));
      } finally {
        btn.disabled = false;
        btn.textContent = mode === 'signin' ? t('signIn') : t('register');
      }
    });
  }
}

function renderPasswordResetRequest() {
  if (!els.authModalBody) return;
  const isAr = state.lang === 'ar';
  els.authModalBody.innerHTML = `
    <form class="auth-form" id="forgotPasswordForm">
      <p class="muted">${escapeHtml(isAr ? 'أدخل بريد حسابك وسنرسل رابطاً آمناً لإعادة تعيين كلمة المرور.' : 'Enter your account email and we will send a secure password reset link.')}</p>
      <label>
        <span>${escapeHtml(isAr ? 'البريد الإلكتروني' : 'Email')}</span>
        <input id="resetEmail" type="email" required autocomplete="email" autocapitalize="none" spellcheck="false" />
      </label>
      <div class="hero-actions">
        <button class="primary-btn" type="submit" id="forgotPasswordSubmit">${escapeHtml(isAr ? 'إرسال الرابط' : 'Send reset link')}</button>
        <button class="text-btn" type="button" id="backToSigninBtn">${escapeHtml(isAr ? 'العودة لتسجيل الدخول' : 'Back to sign in')}</button>
      </div>
      <p class="muted" id="forgotPasswordMessage" role="status"></p>
    </form>
  `;
  document.getElementById('backToSigninBtn')?.addEventListener('click', () => renderAuthModal('signin'));
  document.getElementById('forgotPasswordForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const btn = document.getElementById('forgotPasswordSubmit');
    const message = document.getElementById('forgotPasswordMessage');
    btn.disabled = true;
    btn.textContent = isAr ? 'جارٍ الإرسال...' : 'Sending...';
    try {
      const email = document.getElementById('resetEmail').value.trim();
      const data = await apiFetch('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
      message.textContent = data.message || (isAr ? 'إذا كان البريد موجوداً، تم إرسال الرابط.' : 'If that email exists, a reset link has been sent.');
    } catch (err) {
      message.textContent = err.message || (isAr ? 'تعذر إرسال الرابط.' : 'Could not send reset link.');
    } finally {
      btn.disabled = false;
      btn.textContent = isAr ? 'إرسال الرابط' : 'Send reset link';
    }
  });
}

function renderPasswordResetComplete(token) {
  if (!els.authModalBody) return;
  const isAr = state.lang === 'ar';
  els.authModalBody.innerHTML = `
    <form class="auth-form" id="resetPasswordForm">
      <p class="muted">${escapeHtml(isAr ? 'اختر كلمة مرور جديدة لحسابك.' : 'Choose a new password for your account.')}</p>
      <label>
        <span>${escapeHtml(t('password'))}</span>
        <input id="resetPasswordInput" type="password" required minlength="15" maxlength="128" autocomplete="new-password" />
      </label>
      <p class="muted">${escapeHtml(t('passwordHint'))}</p>
      <div class="hero-actions">
        <button class="primary-btn" type="submit" id="resetPasswordSubmit">${escapeHtml(isAr ? 'تحديث كلمة المرور' : 'Update password')}</button>
      </div>
      <p class="muted" id="resetPasswordMessage" role="alert"></p>
    </form>
  `;
  document.getElementById('resetPasswordForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const btn = document.getElementById('resetPasswordSubmit');
    const message = document.getElementById('resetPasswordMessage');
    btn.disabled = true;
    btn.textContent = isAr ? 'جارٍ التحديث...' : 'Updating...';
    try {
      const password = document.getElementById('resetPasswordInput').value;
      await apiFetch('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) });
      await checkCloudSession();
      if (state.page === 'category') await loadCategoryIfNeeded();
      closeModal('auth');
      applyStaticCopy();
      rerender();
      showToast(isAr ? 'تم تحديث كلمة المرور.' : 'Password updated.');
    } catch (err) {
      message.textContent = err.message || (isAr ? 'تعذر تحديث كلمة المرور.' : 'Could not update password.');
    } finally {
      btn.disabled = false;
      btn.textContent = isAr ? 'تحديث كلمة المرور' : 'Update password';
    }
  });
}

function maybeOpenAuthFromUrl() {
  const params = new URLSearchParams(location.search);
  const token = params.get('reset');
  const wantsSignup = params.get('signup') === '1';
  if (!token && !wantsSignup) return;
  if (token) {
    renderPasswordResetComplete(token);
  } else {
    renderAuthModal('register');
  }
  openModal('auth');
  const cleanUrl = `${location.pathname}${location.hash || ''}`;
  history.replaceState(null, '', cleanUrl);
}



async function loadCatalog() {
  if (state.catalog) return;
  state.catalog = await fetchJson('data/catalog.json');
}

function normalizeCardText(value) {
  return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function hasMeaningfulBilingualContent(card) {
  const fields = [
    normalizeCardText(card?.question?.en),
    normalizeCardText(card?.question?.ar),
    normalizeCardText(card?.answer?.en),
    normalizeCardText(card?.answer?.ar),
  ];
  if (fields.some(text => text.length < 2)) return false;
  const badPattern = /\b(todo|tbd|undefined|null|nan|lorem|translate|translation pending)\b|ترجمة|غير مترجم|\?\?\?/i;
  if (fields.some(text => badPattern.test(text))) return false;
  const [questionEn, questionAr, answerEn, answerAr] = fields;
  const hasArabicQuestion = /[\u0600-\u06FF]/.test(questionAr);
  const hasArabicAnswer = /[\u0600-\u06FF]/.test(answerAr);
  if (!hasArabicQuestion || !hasArabicAnswer) return false;
  if (questionEn.toLowerCase() === questionAr.toLowerCase()) return false;
  if (answerEn.toLowerCase() === answerAr.toLowerCase() && /[a-z]/i.test(answerAr)) return false;
  return true;
}

async function buildPrimaryTopicCategory(topic) {
  const categoryMap = getCategoryMap();
  const parent = collectionParent(topic);
  const sourceCategories = getCollectionCategories(topic, categoryMap);
  const cards = [];
  const seen = new Set();

  const payloads = await Promise.all(sourceCategories.map(async (meta) => {
    const raw = await fetchJson(`data/${meta.slug}.json`);
    return { meta, raw };
  }));

  for (const { meta, raw } of payloads) {
    const rawCards = Array.isArray(raw) ? raw : (Array.isArray(raw.cards) ? raw.cards : []);
    for (const card of rawCards) {
      if (!hasMeaningfulBilingualContent(card)) continue;
      const questionEn = normalizeCardText(card.question.en).toLowerCase();
      const answerEn = normalizeCardText(card.answer.en).toLowerCase();
      const key = `${questionEn}|${answerEn}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cards.push({
        ...card,
        sourceSlug: meta.slug,
        sourceTitle: meta.title,
        sourceSubcategory: card.subcategory,
        subcategory: {
          en: meta.title.en,
          ar: meta.title.ar || meta.title.en,
        },
      });
    }
  }

  const difficultyOrder = { easy: 0, medium: 1, hard: 2, 'very-advanced': 3 };
  cards.sort((a, b) => {
    const aRank = difficultyOrder[a.difficulty] ?? 9;
    const bRank = difficultyOrder[b.difficulty] ?? 9;
    return aRank - bRank || String(a.id || '').localeCompare(String(b.id || ''));
  });

  const difficultyCounts = cards.reduce((acc, card) => {
    const key = card.difficulty || 'medium';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const subcategories = sourceCategories.map(meta => ({
    en: meta.title.en,
    ar: meta.title.ar || meta.title.en,
    count: cards.filter(card => card.sourceSlug === meta.slug).length,
  })).filter(item => item.count > 0);

  return {
    slug: topic.key,
    title: topic.title,
    description: topic.description,
    cluster: parent.label,
    cluster_key: topic.parent,
    mode: 'topic',
    count: cards.length,
    difficultyCounts,
    subcategories,
    related: topic.slugs,
    sourceSlugs: topic.slugs,
    cards,
  };
}

async function loadCategoryIfNeeded() {
  if (state.page !== 'category' || !state.categorySlug) return;
  if (!state.dbUser) {
    state.categoryData = null;
    return;
  }
  if (isPrimaryTopicSlug(state.categorySlug)) {
    state.categoryData = await buildPrimaryTopicCategory(PRIMARY_TOPIC_MAP.get(state.categorySlug));
    return;
  }
  const raw = await fetchJson(`data/${state.categorySlug}.json`);
  // Some category files are plain card arrays; normalise them using catalog metadata
  const meta = (state.catalog?.categories || []).find(c => c.slug === state.categorySlug) || {};
  if (Array.isArray(raw)) {
    state.categoryData = { ...meta, cards: raw };
  } else {
    state.categoryData = { ...raw, ...meta, cards: Array.isArray(raw.cards) ? raw.cards : [] };
  }
}


// ================= ANALYTICS TRACKING =================
let _analyticsInterval = null;

// ── Audio narration ───────────────────────────────────────────────────────────

const _ttsCache = new Map(); // "lang:text" → blob URL
let _currentAudio = null;

function _getBestVoice(lang) {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const isArabic = lang === 'ar';
  const targets = isArabic
    ? ['ar-SA', 'ar-EG', 'ar-AE', 'ar']
    : ['en-US', 'en-GB', 'en-AU', 'en'];

  function score(v) {
    const n = v.name.toLowerCase();
    const premiumEnglish = [
      'samantha', 'ava', 'allison', 'joelle', 'susan', 'victoria',
      'daniel', 'serena', 'karen', 'moira', 'tessa',
      'jenny', 'aria', 'guy', 'zira', 'david',
    ];
    let s = 0;
    if (!isArabic && premiumEnglish.some(name => n.includes(name))) s += 130;
    if (n.includes('enhanced')) s += 110;
    if (n.includes('premium')) s += 100;
    if (n.includes('neural')) s += 95;
    if (n.includes('natural')) s += 90;
    if (n.includes('online')) s += 65;
    if (n.includes('google')) s += 45;
    if (n.includes('compact')) s -= 60;
    if (n.includes('default')) s -= 25;
    if (v.localService) s += 10;
    return s;
  }

  for (const tl of targets) {
    const matches = voices.filter(v => v.lang === tl || v.lang.startsWith(tl + '-'));
    if (matches.length) return matches.sort((a, b) => score(b) - score(a))[0];
  }
  const prefix = isArabic ? 'ar' : 'en';
  const any = voices.filter(v => v.lang.startsWith(prefix));
  return any.length ? any.sort((a, b) => score(b) - score(a))[0] : null;
}

function speakText(text, lang) {
  stopSpeech();
  const narrationText = _prepareNarrationText(text, lang);

  if (_shouldUseBrowserSpeechFirst()) {
    if (_speakTextWithBrowser(narrationText, lang)) return;
  }

  // Prefer server narration for both English and Arabic. Browser voices vary a
  // lot by device and often sound robotic; browser speech is only the fallback.
  _speakTextFromServer(narrationText, lang, true);
}

function _speakTextWithBrowser(text, lang) {
  if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') return false;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang === 'ar' ? 'ar-SA' : 'en-US';
  utterance.rate = lang === 'ar' ? 0.82 : 0.88;
  utterance.pitch = lang === 'ar' ? 1.04 : 0.98;
  utterance.volume = 1;
  const voice = _getBestVoice(lang);
  if (voice) utterance.voice = voice;
  utterance.onend = _clearAudioBtns;
  utterance.onerror = _clearAudioBtns;
  _currentAudio = { pause: () => window.speechSynthesis.cancel() };
  window.speechSynthesis.speak(utterance);
  if (typeof window.speechSynthesis.resume === 'function') {
    window.speechSynthesis.resume();
    setTimeout(() => window.speechSynthesis.resume(), 250);
  }
  return true;
}

function _shouldUseBrowserSpeechFirst() {
  const ua = navigator.userAgent || '';
  return (
    window.matchMedia?.('(any-pointer: coarse)')?.matches ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
  );
}

function _prepareNarrationText(text, lang) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (lang === 'ar') return raw;
  return raw
    .replace(/\bvs\.?\b/gi, 'versus')
    .replace(/\bAI\b/g, 'A I')
    .replace(/\bAPI\b/g, 'A P I')
    .replace(/\bURL\b/g, 'U R L')
    .replace(/\bJAKH\b/g, 'Jack')
    .replace(/([.!?])\s+/g, '$1  ')
    .replace(/:\s+/g, ': ')
    .replace(/;\s+/g, '; ')
    .replace(/\s+—\s+/g, ', ')
    .slice(0, 500);
}

async function _speakTextFromServer(text, lang, allowBrowserFallback = false) {
  const key = lang + ':' + text;
  let src = _ttsCache.get(key);

  if (!src) {
    try {
      const url = 'https://jakh.net/api/tts?lang=' + encodeURIComponent(lang)
        + '&text=' + encodeURIComponent(text);
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.status);
      const blob = await res.blob();
      src = URL.createObjectURL(blob);
      if (_ttsCache.size >= 200) {
        const first = _ttsCache.keys().next().value;
        URL.revokeObjectURL(_ttsCache.get(first));
        _ttsCache.delete(first);
      }
      _ttsCache.set(key, src);
    } catch (err) {
      console.warn('[tts]', err);
      if (allowBrowserFallback) _speakTextWithBrowser(text, lang);
      else _clearAudioBtns();
      return;
    }
  }

  const audio = new Audio(src);
  _currentAudio = audio;
  audio.onended = audio.onerror = _clearAudioBtns;
  audio.play().catch(err => {
    console.warn('[audio play]', err);
    if (allowBrowserFallback) _speakTextWithBrowser(text, lang);
    else _clearAudioBtns();
  });
}

async function _speakTextFallback(text, lang) {
  return _speakTextFromServer(text, lang, false);
}

function _clearAudioBtns() {
  _currentAudio = null;
  document.querySelectorAll('.card-audio-btn.playing').forEach(b => {
    b.classList.remove('playing');
    b.title = t('audioPlay');
  });
}

function stopSpeech() {
  if (_currentAudio) { _currentAudio.pause(); _currentAudio = null; }
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}

function handleAudioBtn(btn) {
  const cardId = btn.dataset.id;
  const card = state.categoryData?.cards.find(c => c.id === cardId);
  if (!card) return;

  if (btn.classList.contains('playing')) {
    stopSpeech();
    btn.classList.remove('playing');
    btn.title = t('audioPlay');
    return;
  }

  document.querySelectorAll('.card-audio-btn.playing').forEach(b => {
    b.classList.remove('playing');
    b.title = t('audioPlay');
  });

  btn.classList.add('playing');
  btn.title = t('audioStop');
  speakText(card.question[state.lang], state.lang);
}

// ── Suggestion box ────────────────────────────────────────────────────────────

const SUGGESTION_HISTORY_KEY = 'jakh-submitted-suggestions-v1';

function normalizeSuggestionText(text) {
  return String(text || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function getSuggestionHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SUGGESTION_HISTORY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function hasSubmittedSuggestion(text) {
  const key = normalizeSuggestionText(text);
  return key.length > 0 && getSuggestionHistory().includes(key);
}

function rememberSubmittedSuggestion(text) {
  const key = normalizeSuggestionText(text);
  if (!key) return;
  const history = getSuggestionHistory().filter(item => item !== key);
  history.unshift(key);
  try {
    localStorage.setItem(SUGGESTION_HISTORY_KEY, JSON.stringify(history.slice(0, 80)));
  } catch { }
}

function initSuggestionBox() {
  if (!els.suggestionSubmit) return;
  els.suggestionSubmit.addEventListener('click', async () => {
    const text = els.suggestionText?.value.trim() || '';
    if (text.length < 5) { showToast(t('suggestError'), true); return; }
    if (hasSubmittedSuggestion(text)) { showToast(t('suggestDuplicate'), true); return; }
    els.suggestionSubmit.disabled = true;
    try {
      const res = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, email: els.suggestionEmail?.value.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || 'Error submitting', true); return; }
      rememberSubmittedSuggestion(text);
      if (els.suggestionForm) els.suggestionForm.classList.add('hidden');
      if (els.suggestionThanks) els.suggestionThanks.classList.remove('hidden');
    } catch {
      showToast('Could not submit. Please try again.', true);
    } finally {
      els.suggestionSubmit.disabled = false;
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────

function trackEvent(name, params = {}) {
  try { window.gtag?.('event', name, params); } catch (_) { }
}

function trackFunnelStep(step) {
  trackEvent(step, { method: 'username' });
  try {
    apiFetch('/analytics/time', {
      method: 'POST',
      body: JSON.stringify({
        pageSlug: step,
        timeSpent: 5,
        visitorId: getAnalyticsVisitorId()
      })
    }).catch(() => { });
  } catch (_) { }
}

function getAnalyticsVisitorId() {
  try {
    let id = localStorage.getItem('jakh-visitor-id');
    if (!id) {
      id = window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : String(Date.now()) + '-' + Math.random().toString(36).slice(2);
      localStorage.setItem('jakh-visitor-id', id);
    }
    return id;
  } catch (_) {
    return null;
  }
}

function startAnalyticsHeartbeat() {
  if (_analyticsInterval) return;
  _analyticsInterval = setInterval(async () => {
    if (document.hidden || state.page !== 'category' || !state.categorySlug) return;
    try {
      await apiFetch('/analytics/time', {
        method: 'POST',
        body: JSON.stringify({
          pageSlug: state.categorySlug,
          timeSpent: 30,
          visitorId: getAnalyticsVisitorId()
        })
      });
    } catch (err) { }
  }, 30000);
}
// ======================================================


// ================= DAILY CHALLENGE =================
async function loadDailyChallenge() {
  if (!state.dbUser) return;
  if (state.dailyCard) return;
  if (!document.getElementById('dailyChallengeMount')) return;
  const today = new Date().toISOString().split('T')[0];
  const cacheKey = `jakh-daily-${today}`;
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) { state.dailyCard = JSON.parse(cached); return; }
    if (!state.catalog) return;
    const hash = today.split('').reduce((h, c) => ((h * 31) + c.charCodeAt(0)) | 0, 0);
    const abs = Math.abs(hash);
    const cats = state.catalog.categories.filter(c => c.count >= 15 && c.mode !== 'story');
    const cat = cats[abs % cats.length];
    const raw = await fetchJson(`data/${cat.slug}.json`);
    const cards = (Array.isArray(raw) ? raw : (raw.cards || [])).filter(c => c.difficulty === 'easy' || c.difficulty === 'medium');
    if (!cards.length) return;
    const card = cards[(abs >> 4) % cards.length];
    state.dailyCard = { ...card, categorySlug: cat.slug, categoryTitle: cat.title };
    sessionStorage.setItem(cacheKey, JSON.stringify(state.dailyCard));
  } catch (e) { state.dailyCard = null; }
}

function renderDailyChallenge() {
  const mount = document.getElementById('dailyChallengeMount');
  if (!mount) return;
  if (!state.dailyCard) { mount.innerHTML = ''; return; }
  const card = state.dailyCard;
  const lang = state.lang;
  const today = new Date().toISOString().split('T')[0];
  const isDone = !!localStorage.getItem(`jakh-daily-done-${today}`);
  const isFlipped = state.flipped.has('__daily__');
  mount.innerHTML = `
    <section class="shell daily-challenge-section">
      <div class="daily-challenge-card ${isDone ? 'daily-done' : ''}">
        <div>
          <p class="daily-challenge-eyebrow">${lang === 'ar' ? 'تحدي اليوم' : "Today's Challenge"}${isDone ? ` <span class="daily-done-badge">${lang === 'ar' ? 'مكتمل' : 'Done'}</span>` : ''}</p>
          <p class="daily-challenge-meta">${escapeHtml(card.categoryTitle[lang])} &nbsp;·&nbsp; ${escapeHtml(t(card.difficulty === 'very-advanced' ? 'veryAdvanced' : card.difficulty))}</p>
          <p class="daily-challenge-q">${escapeHtml(card.question[lang])}</p>
          ${isFlipped ? `<div class="daily-challenge-answer">${escapeHtml(card.answer[lang])}</div>` : ''}
        </div>
        <div class="daily-challenge-btns">
          <button class="primary-btn mini-btn" id="flipDailyBtn">${isFlipped ? escapeHtml(t('backToQuestion')) : escapeHtml(t('flipForAnswer'))}</button>
          <a class="ghost-btn mini-btn" href="${escapeHtml(card.categorySlug)}">${lang === 'ar' ? 'المزيد ←' : 'Full category →'}</a>
        </div>
      </div>
    </section>`;
  document.getElementById('flipDailyBtn')?.addEventListener('click', () => {
    if (!state.flipped.has('__daily__')) {
      localStorage.setItem(`jakh-daily-done-${today}`, '1');
    }
    if (state.flipped.has('__daily__')) state.flipped.delete('__daily__'); else state.flipped.add('__daily__');
    renderDailyChallenge();
  });
}

// ================= STREAKS =================
async function loadStreak() {
  if (!state.dbUser) { state.streak = 0; state.freezeCount = 0; return; }
  try {
    const data = await apiFetch('/user/streak');
    state.streak = data.streak || 0;
    state.freezeCount = data.freezeCount || 0;
  } catch (e) { state.streak = 0; state.freezeCount = 0; }
}

// ================= TRUTH DASH (reader-led yes/no speed round) =================
function localizedCardValue(card, key, lang = state.lang) {
  return card?.[key]?.[lang] || card?.[key]?.en || '';
}

function buildTruthDashRound(card, pool, index) {
  const lang = state.lang;
  const actualAnswer = localizedCardValue(card, 'answer', lang);
  const decoys = shuffleArray(pool.filter((candidate) => {
    if (!candidate || candidate.id === card.id) return false;
    const value = localizedCardValue(candidate, 'answer', lang);
    return value && value.toLowerCase() !== actualAnswer.toLowerCase();
  }));
  const shouldBeTrue = index % 2 === 0 || !decoys.length;
  const claimAnswer = shouldBeTrue ? actualAnswer : localizedCardValue(decoys[0], 'answer', lang);
  return {
    id: card.id,
    card,
    truth: shouldBeTrue,
    question: localizedCardValue(card, 'question', lang),
    claimAnswer,
    actualAnswer,
  };
}

function renderTruthDashStaticCopy() {
  const isAr = state.lang === 'ar';
  const copy = {
    title: isAr ? 'سباق الحقيقة' : 'Truth Dash',
    help: isAr
      ? 'القارئ يرى المفتاح. الصديق يجيب نعم أو لا قبل انتهاء الوقت.'
      : 'The reader sees the key. A friend answers Yes or No before time runs out.',
    question: isAr ? 'السؤال' : 'Question',
    claim: isAr ? 'الاقتراح' : 'Claim',
    key: isAr ? 'مفتاح القارئ' : 'Reader key',
    yes: isAr ? 'نعم' : 'Yes',
    no: isAr ? 'لا' : 'No',
    complete: isAr ? 'انتهى سباق الحقيقة' : 'Truth Dash complete',
    again: isAr ? 'جولة جديدة' : 'New round',
    close: isAr ? 'إغلاق' : 'Close',
  };
  const setText = (id, text) => {
    const node = document.getElementById(id);
    if (node) node.textContent = text;
  };
  setText('tqModeTitle', copy.title);
  setText('tqModeHelp', copy.help);
  setText('tqQuestionLabel', copy.question);
  setText('tqClaimLabel', copy.claim);
  setText('tqAnswerLabel', copy.key);
  setText('tqCorrectBtn', copy.yes);
  setText('tqWrongBtn', copy.no);
  setText('tqResultTitle', copy.complete);
  setText('tqPlayAgain', copy.again);
  setText('tqClose', copy.close);
}

function createTimedQuizModal() {
  if (document.getElementById('timedQuizOverlay')) return;
  const el = document.createElement('div');
  el.id = 'timedQuizOverlay';
  el.className = 'timed-quiz-overlay hidden';
  el.innerHTML = `
    <div class="timed-quiz-card">
      <div class="tq-header">
        <span id="tqProgressText" class="tq-progress-text">1 / 10</span>
        <div class="tq-timer-group">
          <span id="tqCountdown" class="timed-quiz-countdown">15</span>
          <span class="tq-sec">s</span>
        </div>
        <button class="tq-exit-btn" id="tqExitBtn" aria-label="Exit">✕</button>
      </div>
      <div class="timed-quiz-track"><div id="tqTrackFill" class="timed-quiz-track-fill" style="width:100%"></div></div>
      <div class="tq-title-block">
        <strong class="tq-mode-title" id="tqModeTitle"></strong>
        <p class="tq-mode-help" id="tqModeHelp"></p>
      </div>
      <div class="tq-qna-block" id="tqQnaBlock">
        <div class="tq-q-wrap">
          <span class="tq-block-label" id="tqQuestionLabel"></span>
          <p id="tqQuestion" class="timed-quiz-question"></p>
          <div class="tq-claim-card">
            <span class="tq-block-label" id="tqClaimLabel"></span>
            <p id="tqClaim" class="tq-claim-text"></p>
          </div>
        </div>
        <div class="tq-qna-divider"></div>
        <div class="tq-a-wrap">
          <span class="tq-block-label tq-answer-label" id="tqAnswerLabel"></span>
          <p id="tqAnswer" class="tq-answer-text"></p>
        </div>
      </div>
      <div id="tqActions" class="timed-quiz-actions">
        <button class="tq-wrong" id="tqWrongBtn"></button>
        <button class="tq-correct" id="tqCorrectBtn"></button>
      </div>
      <div id="tqResult" class="timed-quiz-result hidden">
        <h3 id="tqResultTitle"></h3>
        <div class="timed-quiz-score-big" id="tqScoreBig"></div>
        <p class="timed-quiz-score-sub" id="tqScoreSub"></p>
        <p class="tq-role-note" id="tqRoleNote"></p>
        <div class="hero-actions" style="margin-top:1.5rem;justify-content:center;flex-wrap:wrap;gap:0.75rem;">
          <button class="primary-btn" id="tqPlayAgain"></button>
          <button class="secondary-btn" id="tqClose"></button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(el);
  renderTruthDashStaticCopy();
  const exitQuiz = () => { clearInterval(timedQuizState.timer); document.getElementById('timedQuizOverlay')?.classList.add('hidden'); };
  document.getElementById('tqCorrectBtn')?.addEventListener('click', () => answerTimedCard(true));
  document.getElementById('tqWrongBtn')?.addEventListener('click', () => answerTimedCard(false));
  document.getElementById('tqPlayAgain')?.addEventListener('click', startTimedQuiz);
  document.getElementById('tqExitBtn')?.addEventListener('click', exitQuiz);
  document.getElementById('tqClose')?.addEventListener('click', exitQuiz);
}

function startTimedQuiz() {
  if (!state.dbUser) {
    showToast(t('loginNeeded'), true);
    openAuthModal();
    return;
  }
  if (!state.categoryData?.cards?.length) return;
  const unlocked = shuffleArray(state.categoryData.cards.filter(c => isLevelUnlocked(c.difficulty)));
  const selected = unlocked.slice(0, 10);
  if (!selected.length) return;
  timedQuizState.cards = selected.map((card, index) => buildTruthDashRound(card, unlocked, index));
  timedQuizState.index = 0;
  timedQuizState.score = 0;
  trackEvent('truth_dash_start', { category: state.categorySlug, total: timedQuizState.cards.length });
  const overlay = document.getElementById('timedQuizOverlay');
  if (!overlay) return;
  renderTruthDashStaticCopy();
  overlay.classList.remove('hidden');
  document.getElementById('tqResult')?.classList.add('hidden');
  document.getElementById('tqActions')?.classList.remove('hidden');
  document.getElementById('tqQnaBlock')?.classList.remove('hidden');
  showTimedCard();
}

function showTimedCard() {
  const round = timedQuizState.cards[timedQuizState.index];
  if (!round) { endTimedQuiz(); return; }
  const lang = state.lang;
  const tqQ = document.getElementById('tqQuestion');
  const tqClaim = document.getElementById('tqClaim');
  const tqA = document.getElementById('tqAnswer');
  const tqPT = document.getElementById('tqProgressText');
  const tqCountdown = document.getElementById('tqCountdown');
  const tqFill = document.getElementById('tqTrackFill');
  const tqCorrect = document.getElementById('tqCorrectBtn');
  const tqWrong = document.getElementById('tqWrongBtn');
  const yesText = lang === 'ar' ? 'نعم' : 'Yes';
  const noText = lang === 'ar' ? 'لا' : 'No';
  if (tqQ) tqQ.textContent = round.question;
  if (tqClaim) {
    tqClaim.textContent = lang === 'ar'
      ? `هل الإجابة هي: ${round.claimAnswer}؟`
      : `Is the answer: ${round.claimAnswer}?`;
  }
  if (tqA) {
    tqA.textContent = lang === 'ar'
      ? `الإجابة الصحيحة للرد: ${round.truth ? yesText : noText}. الجواب الحقيقي: ${round.actualAnswer}`
      : `Correct call: ${round.truth ? yesText : noText}. Real answer: ${round.actualAnswer}`;
  }
  if (tqPT) tqPT.textContent = `${timedQuizState.index + 1} / ${timedQuizState.cards.length}`;
  if (tqCorrect) tqCorrect.disabled = false;
  if (tqWrong) tqWrong.disabled = false;
  clearInterval(timedQuizState.timer);
  timedQuizState.timeLeft = TRUTH_DASH_SECONDS;
  if (tqCountdown) { tqCountdown.textContent = String(TRUTH_DASH_SECONDS); tqCountdown.classList.remove('urgent'); }
  if (tqFill) { tqFill.style.transition = 'none'; tqFill.style.width = '100%'; setTimeout(() => { if (tqFill) tqFill.style.transition = 'width 1s linear'; }, 50); }
  timedQuizState.timer = setInterval(() => {
    timedQuizState.timeLeft -= 1;
    if (tqCountdown) { tqCountdown.textContent = String(timedQuizState.timeLeft); if (timedQuizState.timeLeft <= 5) tqCountdown.classList.add('urgent'); }
    if (tqFill) tqFill.style.width = `${(timedQuizState.timeLeft / TRUTH_DASH_SECONDS) * 100}%`;
    if (timedQuizState.timeLeft <= 0) { clearInterval(timedQuizState.timer); answerTimedCard(null); }
  }, 1000);
}

function revealAndAdvance() {
  const tqCorrect = document.getElementById('tqCorrectBtn');
  const tqWrong = document.getElementById('tqWrongBtn');
  if (tqCorrect) tqCorrect.disabled = true;
  if (tqWrong) tqWrong.disabled = true;
  setTimeout(() => {
    timedQuizState.index++;
    timedQuizState.index >= timedQuizState.cards.length ? endTimedQuiz() : showTimedCard();
  }, 600);
}

function answerTimedCard(correct) {
  clearInterval(timedQuizState.timer);
  const round = timedQuizState.cards[timedQuizState.index];
  if (!round) return;
  const isCorrect = correct === round.truth;
  if (isCorrect) { timedQuizState.score++; markCard(round.id, 'correct'); }
  else { markCard(round.id, 'wrong'); }
  revealAndAdvance();
}

function endTimedQuiz() {
  clearInterval(timedQuizState.timer);
  const score = timedQuizState.score;
  const total = timedQuizState.cards.length;
  const pct = Math.round((score / total) * 100);
  document.getElementById('tqActions')?.classList.add('hidden');
  document.getElementById('tqQnaBlock')?.classList.add('hidden');
  document.getElementById('tqResult')?.classList.remove('hidden');
  const scoreBig = document.getElementById('tqScoreBig');
  const scoreSub = document.getElementById('tqScoreSub');
  const roleNote = document.getElementById('tqRoleNote');
  if (scoreBig) scoreBig.textContent = `${score} / ${total}`;
  const lang = state.lang;
  if (scoreSub) scoreSub.textContent = pct >= 80
    ? (lang === 'ar' ? 'ثنائي سريع وذكي.' : 'Sharp team. Fast calls.')
    : pct >= 60
      ? (lang === 'ar' ? 'جولة جيدة. بدّلوا الأدوار.' : 'Good run. Switch roles next.')
      : (lang === 'ar' ? 'ابدؤوا جولة ثانية أسرع.' : 'Warm up done. Try one faster.');
  if (roleNote) roleNote.textContent = lang === 'ar'
    ? 'طريقة اللعب: شخص يقرأ السؤال والمفتاح، وشخص يجيب نعم أو لا.'
    : 'How to play: one reader sees the key, one friend answers Yes or No.';
  trackEvent('truth_dash_end', { category: state.categorySlug, score, total, pct });
  if (pct >= 80) saveJson('jakh-speed-demon', 1);
  const resultEl = document.getElementById('tqResult');
  const actionsEl = resultEl?.querySelector('.hero-actions');
  if (actionsEl) {
    actionsEl.querySelector('.tq-share-btn')?.remove();
    const shareBtn = document.createElement('button');
    shareBtn.className = 'secondary-btn tq-share-btn';
    shareBtn.textContent = lang === 'ar' ? 'شارك النتيجة' : 'Share result';
    shareBtn.addEventListener('click', () => shareResult(score, total, state.categoryData?.title?.[lang] || 'JAKH Truth Dash'));
    actionsEl.insertBefore(shareBtn, actionsEl.lastElementChild);
  }
  checkNewAchievements();
}

// ================= LEADERBOARD =================
function createLeaderboardModal() {
  if (document.getElementById('leaderboardModal')) return;
  const el = document.createElement('div');
  el.id = 'leaderboardModal';
  el.className = 'modal hidden';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `
    <div class="modal-backdrop" data-close-modal="leaderboard"></div>
    <div class="modal-card" role="dialog" aria-modal="true">
      <div class="modal-head">
        <div>
          <p class="eyebrow">${state.lang === 'ar' ? 'لوحة المتصدرين' : 'Leaderboard'}</p>
          <h2>${state.lang === 'ar' ? 'أفضل 20 لاعباً' : 'Top 20 Players'}</h2>
        </div>
        <button class="icon-btn" data-close-modal="leaderboard" aria-label="Close">×</button>
      </div>
      <div id="leaderboardBody" style="padding:0.25rem 0;min-height:120px;"></div>
    </div>`;
  document.body.appendChild(el);
}

// ================= GLOBAL SEARCH =================
const _gsCache = {};

function openGlobalSearch() {
  if (document.getElementById('globalSearchOverlay')) {
    document.getElementById('globalSearchOverlay').classList.remove('hidden');
    document.getElementById('globalSearchInput')?.focus();
    return;
  }
  const overlay = document.createElement('div');
  overlay.id = 'globalSearchOverlay';
  overlay.className = 'global-search-overlay';
  overlay.innerHTML = `
    <div class="global-search-backdrop"></div>
    <div class="global-search-panel" role="dialog" aria-modal="true" aria-label="${state.lang === 'ar' ? 'البحث الشامل' : 'Global search'}">
      <div class="global-search-head">
        <input id="globalSearchInput" class="global-search-input" type="search" autocomplete="off"
          placeholder="${state.lang === 'ar' ? 'ابحث في جميع الأسئلة...' : 'Search all 3,000+ questions…'}"
          aria-label="${state.lang === 'ar' ? 'ابحث في جميع الأسئلة' : 'Search all questions'}" />
        <button class="global-search-close icon-btn" id="globalSearchClose" aria-label="Close">×</button>
      </div>
      <div id="globalSearchResults" class="global-search-results">
        <p class="global-search-hint">${state.lang === 'ar' ? 'اكتب للبدء في البحث...' : 'Start typing to search across all categories…'}</p>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  trapFocus(overlay);

  overlay.querySelector('.global-search-backdrop').addEventListener('click', closeGlobalSearch);
  document.getElementById('globalSearchClose').addEventListener('click', closeGlobalSearch);
  overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeGlobalSearch(); });

  const input = document.getElementById('globalSearchInput');
  input?.focus();
  input?.addEventListener('input', debounce(runGlobalSearch, 280));
}

function closeGlobalSearch() {
  document.getElementById('globalSearchOverlay')?.classList.add('hidden');
}

async function runGlobalSearch() {
  const q = document.getElementById('globalSearchInput')?.value.trim().toLowerCase();
  const resultsEl = document.getElementById('globalSearchResults');
  if (!resultsEl) return;
  if (!q || q.length < 2) {
    resultsEl.innerHTML = `<p class="global-search-hint">${state.lang === 'ar' ? 'اكتب حرفين على الأقل...' : 'Type at least 2 characters…'}</p>`;
    return;
  }
  resultsEl.innerHTML = `<p class="global-search-hint">${state.lang === 'ar' ? 'جارٍ البحث...' : 'Searching…'}</p>`;
  if (!state.dbUser) {
    resultsEl.innerHTML = `<p class="global-search-hint">${state.lang === 'ar' ? 'أنشئ حسابًا للبحث داخل الأسئلة.' : 'Create an account to search inside questions.'}</p>`;
    openAuthModal();
    return;
  }

  const hits = [];
  const cats = state.catalog?.categories || [];
  for (const cat of cats) {
    if (hits.length >= 30) break;
    if (!_gsCache[cat.slug]) {
      try { _gsCache[cat.slug] = await fetchJson(`data/${cat.slug}.json`); } catch { continue; }
    }
    const raw = _gsCache[cat.slug];
    const cards = Array.isArray(raw) ? raw : (raw.cards || []);
    for (const card of cards) {
      if (hits.length >= 30) break;
      const hay = [card.question.en, card.question.ar, card.answer.en, card.answer.ar].join(' ').toLowerCase();
      if (hay.includes(q)) hits.push({ card, cat });
    }
  }

  if (!hits.length) {
    resultsEl.innerHTML = `<p class="global-search-hint">${state.lang === 'ar' ? 'لا نتائج.' : 'No results.'}</p>`;
    return;
  }
  resultsEl.innerHTML = hits.map(({ card, cat }) => `
    <a class="gs-result" href="${escapeHtml(cat.href)}?q=${encodeURIComponent(q)}">
      <span class="gs-result-cat">${escapeHtml(cat.title[state.lang])}</span>
      <span class="gs-result-q">${escapeHtml(card.question[state.lang])}</span>
      <span class="gs-result-a">${escapeHtml(card.answer[state.lang])}</span>
    </a>
  `).join('');
  resultsEl.querySelectorAll('.gs-result').forEach(el => {
    el.addEventListener('click', (e) => { e.preventDefault(); closeGlobalSearch(); spaNavigate(el.href); });
  });
}

async function openLeaderboard() {
  const modal = document.getElementById('leaderboardModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  const body = document.getElementById('leaderboardBody');
  if (body) body.innerHTML = '<p style="padding:2rem;text-align:center;color:var(--muted)">Loading…</p>';
  try {
    const res = await fetch('/api/leaderboard');
    const { leaderboard } = await res.json();
    const currentUser = state.dbUser?.username;
    const medals = ['1', '2', '3'];
    if (!leaderboard?.length) {
      if (body) body.innerHTML = '<p style="padding:2rem;text-align:center;color:var(--muted)">No scores yet — be the first!</p>';
      return;
    }
    if (body) body.innerHTML = leaderboard.map(row => `
      <div class="leaderboard-row">
        <span class="leaderboard-rank ${row.rank <= 3 ? 'top-3' : ''}">${medals[row.rank - 1] || row.rank}</span>
        <span class="leaderboard-username ${row.username === currentUser ? 'leaderboard-you' : ''}">
          ${renderProfileMark(row.avatar, row.username?.[0] || 'U', 'leaderboard-avatar')}${escapeHtml(row.username)}${row.username === currentUser ? ' · you' : ''}
        </span>
        <span class="leaderboard-score">${row.score} pts</span>
      </div>`).join('');
  } catch (e) {
    if (body) body.innerHTML = '<p style="padding:2rem;text-align:center;color:var(--danger)">Failed to load.</p>';
  }
}

// ================= RANDOM CATEGORY =================
function randomCategory() {
  if (!state.catalog) return;
  const topics = CATEGORY_COLLECTIONS.filter(topic => state.cluster === 'all' || topic.parent === state.cluster);
  if (topics.length) {
    spaNavigate(primaryTopicHref(topics[Math.floor(Math.random() * topics.length)]));
    return;
  }
  const cats = state.catalog.categories;
  spaNavigate(cats[Math.floor(Math.random() * cats.length)].href);
}

// ================= ACHIEVEMENTS =================
function getCategoryMasterCount() {
  if (!state.catalog || !state.dbUser) return 0;
  return (state.catalog.categories || []).filter(cat => {
    const meta = state.catalog.categories.find(c => c.slug === cat.slug);
    const solved = (state.dbUser.progress || []).filter(p => p.categoryId === cat.slug && !p.status.startsWith('wrong-')).length;
    return solved >= (meta?.count || 1);
  }).length;
}

function computeAchievements() {
  return ACHIEVEMENTS.filter(a => { try { return a.check(); } catch { return false; } });
}

function checkNewAchievements() {
  if (!state.dbUser) return;
  const key = `jakh-ach-${state.dbUser.id}`;
  const stored = new Set(loadJson(key, []));
  const earned = computeAchievements();
  const newOnes = earned.filter(a => !stored.has(a.id));
  if (!newOnes.length) return;
  newOnes.forEach(a => stored.add(a.id));
  saveJson(key, [...stored]);
  newOnes.forEach((a, i) => setTimeout(() => {
    hapticSuccess();
    showToast(`${state.lang === 'ar' ? 'إنجاز جديد: ' : 'Achievement unlocked: '}${state.lang === 'ar' ? a.ar : a.en}!`);
  }, i * 2400));
}

// ================= RESUME SUGGESTION =================
function getResumeSuggestion() {
  if (!state.dbUser || !state.catalog) return null;
  const progressBySlug = {};
  (state.dbUser.progress || []).forEach(p => {
    if (!progressBySlug[p.categoryId]) progressBySlug[p.categoryId] = 0;
    if (!p.status.startsWith('wrong-')) progressBySlug[p.categoryId]++;
  });
  let best = null;
  for (const slug of Object.keys(progressBySlug)) {
    const meta = state.catalog.categories.find(c => c.slug === slug);
    if (!meta) continue;
    const solved = progressBySlug[slug];
    const pct = Math.min(100, Math.round((solved / (meta.count || 1)) * 100));
    if (pct >= 100) continue;
    if (!best || solved > progressBySlug[best.slug]) best = { ...meta, solved, pct };
  }
  return best;
}

// ================= CATEGORY COMPLETION =================
function isCategoryComplete(slug) {
  if (!state.dbUser || !state.catalog) return false;
  const meta = state.catalog.categories.find(c => c.slug === slug);
  if (!meta) return false;
  const solved = (state.dbUser.progress || []).filter(p => p.categoryId === slug && !p.status.startsWith('wrong-')).length;
  return solved >= meta.count;
}

function checkCategoryComplete(slug) {
  if (!slug || completedCategoriesShown.has(slug)) return;
  if (!isCategoryComplete(slug)) return;
  completedCategoriesShown.add(slug);
  trackEvent('category_complete', { slug });
  setTimeout(() => showCategoryCompleteModal(slug), 500);
}

function showCategoryCompleteModal(slug) {
  const meta = state.catalog?.categories.find(c => c.slug === slug);
  if (!meta) return;
  const lang = state.lang;
  const solved = (state.dbUser?.progress || []).filter(p => p.categoryId === slug && !p.status.startsWith('wrong-')).length;
  const wrong = (state.dbUser?.progress || []).filter(p => p.categoryId === slug && p.status.startsWith('wrong-')).length;
  const points = (state.dbUser?.progress || []).filter(p => p.categoryId === slug && !p.status.startsWith('wrong-')).reduce((sum, p) => sum + (DIFFICULTY_POINTS[p.status] || 0), 0);
  const related = state.catalog.categories.find(c => c.slug !== slug && c.cluster_key === meta.cluster_key) || state.catalog.categories.find(c => c.slug !== slug);
  let el = document.getElementById('categoryCompleteModal');
  if (!el) {
    el = document.createElement('div');
    el.id = 'categoryCompleteModal';
    el.className = 'modal hidden';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
  }
  el.innerHTML = `
    <div class="modal-backdrop" id="catCompleteBackdrop"></div>
    <div class="modal-card category-complete-card" role="dialog" aria-modal="true">
      <div class="category-complete-top" style="background:${CATEGORY_GRADIENTS[slug] || 'linear-gradient(135deg,#1E3A5F,#4A90D9)'}">
        <span class="category-complete-mark">${escapeHtml(meta.title[lang].slice(0, 2).toUpperCase())}</span>
      </div>
      <div class="category-complete-body">
        <h2 style="margin:0 0 0.25rem;">${lang === 'ar' ? 'أكملت الفئة!' : 'Category Complete!'}</h2>
        <p style="margin:0 0 1rem;color:var(--muted);font-size:0.9rem;">${escapeHtml(meta.title[lang])}</p>
        <div class="stats-grid" style="margin-bottom:1.2rem;">
          <div class="stat-box"><span>${lang === 'ar' ? 'صحيح' : 'Correct'}</span><strong style="color:var(--easy)">${solved}</strong></div>
          <div class="stat-box"><span>${lang === 'ar' ? 'خاطئ' : 'Wrong'}</span><strong style="color:var(--danger)">${wrong}</strong></div>
          <div class="stat-box"><span>${lang === 'ar' ? 'النقاط' : 'Points'}</span><strong>${points}</strong></div>
        </div>
        <div class="hero-actions" style="justify-content:center;flex-wrap:wrap;gap:0.75rem;">
          <button class="secondary-btn" id="catCompleteShare">${lang === 'ar' ? 'شارك النتيجة' : 'Share result'}</button>
          <button class="ghost-btn" id="catCompleteBattle">${lang === 'ar' ? 'تحدٍ مباشر' : 'Team Battle'}</button>
          ${related ? `<a class="primary-btn" href="${escapeHtml(related.href)}" style="text-decoration:none;">${lang === 'ar' ? 'الفئة التالية ←' : 'Next category →'}</a>` : ''}
          <button class="ghost-btn" id="catCompleteClose">${lang === 'ar' ? 'إغلاق' : 'Close'}</button>
        </div>
        <div class="tq-challenge-cta" style="margin-top:1rem;">
          <p>${lang === 'ar' ? 'تحدّ أصدقاءك في هذه الفئة' : 'Challenge your friends in this category'}</p>
          <div class="tq-challenge-cta-btns">
            <button class="mini-btn" id="catCompleteChallengeBtn">${lang === 'ar' ? 'تحدٍ صديق' : 'Challenge a Friend'}</button>
          </div>
        </div>
      </div>
    </div>`;
  el.classList.remove('hidden');
  el.setAttribute('aria-hidden', 'false');
  document.getElementById('catCompleteBackdrop')?.addEventListener('click', () => el.classList.add('hidden'));
  document.getElementById('catCompleteClose')?.addEventListener('click', () => el.classList.add('hidden'));
  document.getElementById('catCompleteShare')?.addEventListener('click', () => shareResult(solved, meta.count, meta.title[lang]));
  document.getElementById('catCompleteBattle')?.addEventListener('click', () => {
    el.classList.add('hidden');
    openBattleModal(slug);
  });
  document.getElementById('catCompleteChallengeBtn')?.addEventListener('click', () => {
    const isAr = lang === 'ar';
    const url = `${location.origin}/${slug}`;
    const text = isAr
      ? `أنهيت "${meta.title.ar}" على JAKH بـ ${points} نقطة!\nهل تستطيع التفوق عليّ؟ ← ${url}`
      : `I finished "${meta.title.en}" on JAKH with ${points} pts!\nCan you beat me? → ${url}`;
    navigator.share?.({ title: 'JAKH Challenge', text, url })
      .catch(() => navigator.clipboard?.writeText(text).then(() => showToast(isAr ? 'تم نسخ التحدي!' : 'Challenge copied!')));
  });
  checkNewAchievements();
}

// ================= SHARE =================
function shareCard(cardId) {
  const card = state.categoryData?.cards.find(c => c.id === cardId);
  if (!card) return;
  const question = card.question[state.lang];
  const catTitle = state.categoryData?.title?.[state.lang] || 'JAKH';
  const url = `${location.origin}${location.pathname}?card=${encodeURIComponent(cardId)}`;
  const isAr = state.lang === 'ar';
  const bar = '─────────────────';
  const text = isAr
    ? `لغز من JAKH — ${catTitle}\n${bar}\n${question}\n${bar}\nهل تستطيع الإجابة؟ ← jakh.net`
    : `JAKH Riddle — ${catTitle}\n${bar}\n${question}\n${bar}\nCan you solve this? → jakh.net`;
  saveJson('jakh-shared', 1);
  if (navigator.share) {
    navigator.share({ title: 'JAKH', text, url }).catch(() => { });
  } else {
    navigator.clipboard?.writeText(`${text}\n${url}`).then(() => {
      showToast(isAr ? 'تم نسخ السؤال!' : 'Question copied!');
    }).catch(() => {
      showToast(isAr ? 'تعذر النسخ' : 'Copy failed');
    });
  }
  checkNewAchievements();
}

// ================= REPORT =================
async function reportCard(cardId, categoryId, questionText) {
  const text = `[REPORT] ${categoryId}/${cardId}: ${questionText.substring(0, 150)}`;
  try {
    const res = await fetch('/api/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    showToast(res.ok || res.status === 429 ? t('reportThanks') : t('reportError'));
  } catch { showToast(t('reportError')); }
}

// ================= SHARE =================
function shareResult(score, total, categoryTitle) {
  const isAr = state.lang === 'ar';
  const bar = '─────────────────';
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  const url = `https://jakh.net`;
  const text = isAr
    ? `أنهيت "${categoryTitle}" على JAKH!\n${bar}\n${score} صحيح من ${total}\n${bar}\nهل تستطيع التفوق عليّ؟ ← jakh.net`
    : `I finished "${categoryTitle}" on JAKH!\n${bar}\n${score} / ${total} correct (${pct}%)\n${bar}\nCan you beat my score? → jakh.net`;
  if (navigator.share) {
    navigator.share({ title: 'JAKH', text, url }).catch(() => { });
  } else {
    navigator.clipboard?.writeText(text).then(() => showToast(t('shareCopied'))).catch(() => showToast(t('shareCopied')));
  }
}

// ================= ONBOARDING =================
function shouldShowEntryGuide() {
  if (state.page !== 'home') return false;
  if (!sessionInitialized) return false;
  if (localStorage.getItem('jakh-entry-guide-seen') || localStorage.getItem('jakh-onboarded')) return false;
  if (state.dbUser) return false;
  return true;
}

function checkOnboarding() {
  if (!shouldShowEntryGuide()) return;
  setTimeout(() => {
    if (shouldShowEntryGuide()) showOnboarding();
  }, 1800);
}

function showOnboarding() {
  if (document.getElementById('onboardModal')) return;
  const steps = [
    {
      en: {
        title: 'Choose your path',
        text: 'Start with Mind Lab for riddles and quiz questions, or open Game Hub for strategy games.',
      },
      ar: {
        title: 'اختر مسارك',
        text: 'ابدأ في Mind Lab للألغاز والأسئلة، أو افتح Game Hub لألعاب التفكير والاستراتيجية.',
      }
    },
    {
      en: {
        title: 'Create a free account',
        text: 'Questions and games open after signup, so progress, favorites, and scores are saved from the start.',
      },
      ar: {
        title: 'أنشئ حسابًا مجانيًا',
        text: 'تفتح الأسئلة والألعاب بعد التسجيل حتى يُحفظ التقدم والمفضلة والنتائج من البداية.',
      }
    },
  ];
  let step = 0;
  const lang = state.lang;
  const el = document.createElement('div');
  el.id = 'onboardModal';
  el.className = 'onboard-overlay';
  document.body.appendChild(el);
  el.addEventListener('click', (e) => { if (!e.target.closest('.onboard-card')) dismiss(); });

  function render() {
    const s = steps[step];
    const isLast = step === steps.length - 1;
    el.innerHTML = `
      <div class="onboard-card">
        <button class="onboard-skip" id="onboardSkipBtn">${lang === 'ar' ? 'تخطي' : 'Skip'}</button>
        <h3 class="onboard-title">${escapeHtml(s[lang]?.title || s.en.title)}</h3>
        <p class="onboard-text">${escapeHtml(s[lang]?.text || s.en.text)}</p>
        <div class="onboard-dots">${steps.map((_, i) => `<span class="onboard-dot${i === step ? ' active' : ''}"></span>`).join('')}</div>
        <button class="primary-btn onboard-next" id="onboardNextBtn">
          ${isLast ? (lang === 'ar' ? 'ابدأ' : 'Start') : (lang === 'ar' ? 'التالي' : 'Next')}
        </button>
      </div>`;
    document.getElementById('onboardNextBtn')?.addEventListener('click', () => {
      if (step < steps.length - 1) { step++; render(); } else { dismiss(); }
    });
    document.getElementById('onboardSkipBtn')?.addEventListener('click', dismiss);
  }

  function dismiss() {
    localStorage.setItem('jakh-entry-guide-seen', '1');
    localStorage.setItem('jakh-onboarded', '1');
    el.remove();
  }
  render();
}

let sessionInitialized = false;

// ── Step 5: Haptic Feedback ───────────────────────────────────────────────────
// Requires @capacitor/haptics + npx cap sync for native iOS/Android haptics.
// Falls back to navigator.vibrate on Android WebView (silent on iOS without plugin).
const Haptics = window.Capacitor?.Plugins?.Haptics;
const ImpactStyle = { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' };

function haptic(type = 'light') {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  try {
    if (Haptics?.impact) {
      const style = type === 'heavy' ? ImpactStyle.Heavy
        : type === 'medium' ? ImpactStyle.Medium
          : ImpactStyle.Light;
      Haptics.impact({ style });
    } else if (navigator.vibrate) {
      const ms = type === 'heavy' ? 40 : type === 'medium' ? 20 : 10;
      navigator.vibrate(ms);
    }
  } catch { }
}

function hapticSuccess() { haptic('medium'); }
function hapticError() { haptic('heavy'); }
function hapticTap() { haptic('light'); }

// ── Bottom Navigation Bar ─────────────────────────────────────────────────────
function injectBottomNav() {
  if (document.getElementById('bottomNav')) { updateBottomNavActive(); return; }
  const isAr = state.lang === 'ar';
  const nav = document.createElement('nav');
  nav.id = 'bottomNav';
  nav.className = 'bottom-nav';
  nav.setAttribute('aria-label', isAr ? 'التنقل الرئيسي' : 'Main navigation');
  nav.innerHTML = `
    <div class="bottom-nav-inner">
      <a href="/" class="bottom-nav-tab" data-tab="home" aria-label="${isAr ? 'الرئيسية' : 'Home'}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z"/><polyline points="9 21 9 12 15 12 15 21"/></svg>
        <span>${isAr ? 'الرئيسية' : 'Home'}</span>
      </a>
      <a href="mind-lab.html" class="bottom-nav-tab" data-tab="explore" aria-label="${isAr ? 'استكشف' : 'Explore'}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
        <span>${isAr ? 'استكشف' : 'Explore'}</span>
      </a>
      <button class="bottom-nav-tab" id="bnDailyBtn" data-tab="daily" aria-label="${isAr ? 'التحدي اليومي' : 'Daily'}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        <span>${isAr ? 'يومي' : 'Daily'}</span>
      </button>
      <button class="bottom-nav-tab" id="bnProfileBtn" data-tab="profile" aria-label="${isAr ? 'حسابي' : 'Profile'}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.582-7 8-7s8 3 8 7"/></svg>
        <span>${isAr ? 'حسابي' : 'Profile'}</span>
      </button>
    </div>
    <div class="bottom-nav-safe" aria-hidden="true"></div>`;
  document.body.appendChild(nav);

  document.getElementById('bnDailyBtn')?.addEventListener('click', () => {
    if (state.page === 'home') {
      const target = document.querySelector('.daily-challenge-section') || document.getElementById('dailyChallengeMount');
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      sessionStorage.setItem('jakh-scroll-to', 'daily');
      location.href = '/';
    }
  });
  document.getElementById('bnProfileBtn')?.addEventListener('click', () => {
    document.getElementById('openAuthBtn')?.click();
  });

  updateBottomNavActive();
}

function updateBottomNavActive() {
  const nav = document.getElementById('bottomNav');
  if (!nav) return;
  const activeTab = state.page === 'home' ? 'home' : 'explore';
  nav.querySelectorAll('.bottom-nav-tab').forEach(tab => {
    tab.classList.toggle('is-active', tab.dataset.tab === activeTab);
  });
  const isAr = state.lang === 'ar';
  const labels = {
    home: isAr ? 'الرئيسية' : 'Home',
    explore: isAr ? 'استكشف' : 'Explore',
    daily: isAr ? 'يومي' : 'Daily',
    profile: isAr ? 'حسابي' : 'Profile',
  };
  nav.querySelectorAll('.bottom-nav-tab').forEach(tab => {
    const span = tab.querySelector('span');
    if (span && labels[tab.dataset.tab]) span.textContent = labels[tab.dataset.tab];
  });
  const ariaLabels = {
    home: isAr ? 'الرئيسية' : 'Home',
    explore: isAr ? 'استكشف' : 'Explore',
    daily: isAr ? 'التحدي اليومي' : 'Daily',
    profile: isAr ? 'حسابي' : 'Profile',
  };
  nav.querySelectorAll('.bottom-nav-tab').forEach(tab => {
    if (ariaLabels[tab.dataset.tab]) tab.setAttribute('aria-label', ariaLabels[tab.dataset.tab]);
  });
}

async function init() {
  cacheEls();
  initializeFromStorage();
  applyDir();
  const sessionPromise = sessionInitialized
    ? Promise.resolve()
    : (async () => {
      await checkCloudSession();
      await loadStreak();
      sessionInitialized = true;
    })();
  startAnalyticsHeartbeat();
  applyTheme();
  bindCommonEvents();
  maybeOpenAuthFromUrl();
  injectBackToTop();
  createTimedQuizModal();
  createLeaderboardModal();
  createBattleModal();
  initSuggestionBox();
  renderCategoryPlayModes();
  await sessionPromise.catch(() => { });
  await loadCatalog();
  const dailyChallengePromise = state.page === 'home' && state.dbUser
    ? loadDailyChallenge().catch(() => { })
    : Promise.resolve();
  await loadCategoryIfNeeded();
  applyStaticCopy();
  rerender();
  if (state.page === 'home') {
    dailyChallengePromise.then(() => renderDailyChallenge()).catch(() => { });
  }
  injectBottomNav();
  noteInstallEligibleVisit();
  checkOnboarding();
  maybeShowInstallBanner();
  checkNewAchievements();
  // Handle daily-tab scroll triggered from category pages
  if (state.page === 'home' && sessionStorage.getItem('jakh-scroll-to') === 'daily') {
    sessionStorage.removeItem('jakh-scroll-to');
    requestAnimationFrame(() => {
      const target = document.querySelector('.daily-challenge-section') || document.getElementById('dailyChallengeMount');
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
}

async function subscribePushNotifications() {
  // Disabled until VAPID keys are generated on the server and /api/push/subscribe is implemented.
  // To enable: run `npx web-push generate-vapid-keys`, set the public key below, and wire the endpoint.
}

// ================= CATEGORY PLAY MODES =========

function renderCategoryPlayModes() {
  if (state.page !== 'category' || document.getElementById('categoryPlayModes')) return;
  const isAr = state.lang === 'ar';
  const el = document.createElement('div');
  el.id = 'categoryPlayModes';
  el.className = 'shell section-block category-play-modes';
  el.innerHTML = `
    <div class="play-modes-grid">
      <div class="play-mode-card play-mode-solo">
        <div class="play-mode-head">
          <div>
            <strong class="play-mode-title">${isAr ? 'سباق الحقيقة' : 'Truth Dash'}</strong>
            <p class="play-mode-sub">${isAr ? 'القارئ يرى المفتاح. الصديق يجيب نعم أو لا. 10 جولات سريعة.' : 'Reader sees the key. A friend answers Yes or No. 10 fast rounds.'}</p>
          </div>
        </div>
        <button class="primary-btn play-mode-btn" id="playModeQuickFireBtn">
          ${isAr ? 'ابدأ السباق' : 'Start Truth Dash'}
        </button>
      </div>
      <div class="play-mode-card play-mode-team">
        <div class="play-mode-head">
          <div>
            <strong class="play-mode-title">${isAr ? 'معركة الفريق' : 'Team Battle'}</strong>
            <p class="play-mode-sub">${isAr ? 'العب مع الآخرين في الوقت الفعلي' : 'Play with others live — up to 20'}</p>
          </div>
        </div>
        <div class="play-mode-battle-btns">
          <button class="primary-btn play-mode-btn" id="playModeCreateRoomBtn">
            ${isAr ? 'إنشاء غرفة' : 'Create Room'}
          </button>
          <button class="ghost-btn play-mode-btn" id="playModeJoinBtn">
            ${isAr ? 'الانضمام بكود' : 'Join with Code'}
          </button>
        </div>
      </div>
    </div>`;

  const questionSection = document.getElementById('questionSection');
  if (questionSection) {
    questionSection.parentNode.insertBefore(el, questionSection);
  }
  document.getElementById('playModeQuickFireBtn')?.addEventListener('click', startTimedQuiz);
  document.getElementById('playModeCreateRoomBtn')?.addEventListener('click', () => {
    openBattleModal(state.categorySlug, 'create');
  });
  document.getElementById('playModeJoinBtn')?.addEventListener('click', () => {
    openBattleModal(state.categorySlug, 'join');
  });
}

// ================= BATTLE MODE =================

const battleState = {
  ws: null,
  playerId: null,
  isHost: false,
  hostId: null,
  roomCode: null,
  phase: 'closed',      // closed | setup | lobby | question | reveal | finished
  tab: 'create',        // create | join
  roomData: null,
  currentQuestion: null,
  selectedAnswer: null,
  answerStartTime: null,
  answeredCount: 0,
  totalPlayers: 0,
  revealData: null,
  timerInterval: null,
  timeLeft: 15,
  pendingSlug: '',
};

function getBattleWsUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws/battle`;
}

function createBattleModal() {
  if (document.getElementById('battleOverlay')) return;
  const el = document.createElement('div');
  el.id = 'battleOverlay';
  el.className = 'battle-overlay hidden';
  document.body.appendChild(el);
}

function openBattleModal(slug, tab = 'create') {
  if (!state.dbUser) {
    showToast(t('loginNeeded'), true);
    openAuthModal();
    return;
  }
  if (!document.getElementById('battleOverlay')) createBattleModal();
  clearInterval(battleState.timerInterval);
  if (battleState.ws) {
    battleState.ws.onclose = null;
    battleState.ws.close();
    battleState.ws = null;
  }
  battleState.pendingSlug = slug || state.categorySlug || '';
  battleState.phase = 'setup';
  battleState.tab = tab === 'join' ? 'join' : 'create';
  battleState.hostId = null;
  battleState.playerId = null;
  battleState.isHost = false;
  battleState.roomCode = null;
  battleState.roomData = null;
  battleState.currentQuestion = null;
  battleState.selectedAnswer = null;
  battleState.answerStartTime = null;
  battleState.answeredCount = 0;
  battleState.totalPlayers = 0;
  battleState.revealData = null;
  battleState.timeLeft = 15;
  document.getElementById('battleOverlay')?.classList.remove('hidden');
  renderBattleUI();
}

function closeBattleModal() {
  clearInterval(battleState.timerInterval);
  if (battleState.ws) {
    battleState.ws.onclose = null;
    battleState.ws.close();
    battleState.ws = null;
  }
  document.getElementById('battleOverlay')?.classList.add('hidden');
  battleState.phase = 'closed';
}

function renderBattleUI() {
  const overlay = document.getElementById('battleOverlay');
  if (!overlay) return;
  const isAr = state.lang === 'ar';
  const titles = {
    setup: isAr ? 'معركة الفريق' : 'Team Battle',
    lobby: isAr ? 'غرفة الانتظار' : 'Battle Lobby',
    question: isAr ? 'المعركة جارية' : 'Battle in Progress',
    reveal: isAr ? 'الإجابة' : 'Answer Reveal',
    finished: isAr ? 'انتهت المعركة' : 'Battle Complete',
  };
  overlay.innerHTML = `
    <div class="battle-header">
      <span class="battle-header-title">${titles[battleState.phase] || 'Team Battle'}</span>
      <button class="battle-exit-btn" id="battleExitBtn" aria-label="Close">✕</button>
    </div>
    <div id="battleBody" class="battle-body"></div>`;
  document.getElementById('battleExitBtn')?.addEventListener('click', closeBattleModal);
  const body = document.getElementById('battleBody');
  if (!body) return;
  if (battleState.phase === 'setup') renderBattleSetup(body);
  else if (battleState.phase === 'lobby') renderBattleLobby(body);
  else if (battleState.phase === 'question') renderBattleQuestion(body);
  else if (battleState.phase === 'reveal') renderBattleReveal(body);
  else if (battleState.phase === 'finished') renderBattlePodium(body);
}

function renderBattleSetup(body) {
  const lang = state.lang;
  const isAr = lang === 'ar';
  const slug = battleState.pendingSlug;
  const catOptions = (state.catalog?.categories || [])
    .map(c => `<option value="${escapeHtml(c.slug)}"${c.slug === slug ? ' selected' : ''}>${escapeHtml(c.title[lang])}</option>`)
    .join('');

  body.innerHTML = `
    <div class="battle-setup">
      <div class="battle-setup-tabs">
        <button class="battle-tab${battleState.tab === 'create' ? ' active' : ''}" id="battleTabCreate">
          + ${isAr ? 'إنشاء غرفة' : 'Create Room'}
        </button>
        <button class="battle-tab${battleState.tab === 'join' ? ' active' : ''}" id="battleTabJoin">
          ← ${isAr ? 'الانضمام' : 'Join Room'}
        </button>
      </div>
      <div class="battle-form">
        <label>
          ${isAr ? 'اسمك' : 'Your name'}
          <input type="text" id="battleNameInput" maxlength="20"
            placeholder="${isAr ? 'أدخل اسمك' : 'Enter your name'}"
            value="${escapeHtml(state.dbUser?.username || '')}" autocomplete="nickname" />
        </label>
        ${battleState.tab === 'create' ? `
          <label>
            ${isAr ? 'الفئة' : 'Category'}
            <select id="battleCatSelect">${catOptions}</select>
          </label>
          <label>
            ${isAr ? 'المستوى' : 'Difficulty'}
            <select id="battleDiffSelect">
              <option value="all">${isAr ? 'جميع المستويات' : 'All levels'}</option>
              <option value="easy">${isAr ? 'سهل' : 'Easy'}</option>
              <option value="medium">${isAr ? 'متوسط' : 'Medium'}</option>
              <option value="hard">${isAr ? 'صعب' : 'Hard'}</option>
              <option value="very-advanced">${isAr ? 'خبير' : 'Expert'}</option>
            </select>
          </label>
          <label>
            ${isAr ? 'عدد الأسئلة' : 'Questions'}
            <select id="battleCountSelect">
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="30">30</option>
            </select>
          </label>
          <button class="primary-btn" id="battleCreateBtn">${isAr ? 'إنشاء الغرفة' : 'Create Battle Room'}</button>
        ` : `
          <label>
            ${isAr ? 'كود الغرفة' : 'Room code'}
            <input type="text" id="battleCodeInput" maxlength="10"
              placeholder="${isAr ? 'مثال: BIO-7X2K' : 'e.g. BIO-7X2K'}"
              style="text-transform:uppercase;font-family:var(--font-mono);letter-spacing:0.08em;"
              autocomplete="off" />
          </label>
          <button class="primary-btn" id="battleJoinBtn">${isAr ? 'انضمام' : 'Join Room'}</button>
        `}
        <p class="battle-error hidden" id="battleSetupError"></p>
      </div>
    </div>`;

  document.getElementById('battleTabCreate')?.addEventListener('click', () => { battleState.tab = 'create'; renderBattleUI(); });
  document.getElementById('battleTabJoin')?.addEventListener('click', () => { battleState.tab = 'join'; renderBattleUI(); });
  document.getElementById('battleCreateBtn')?.addEventListener('click', handleBattleCreate);
  document.getElementById('battleJoinBtn')?.addEventListener('click', handleBattleJoin);
}

async function handleBattleCreate() {
  const name = document.getElementById('battleNameInput')?.value.trim() || '';
  const category = document.getElementById('battleCatSelect')?.value || '';
  const difficulty = document.getElementById('battleDiffSelect')?.value || 'all';
  const count = parseInt(document.getElementById('battleCountSelect')?.value || '10', 10);
  const isAr = state.lang === 'ar';
  if (!name) { showBattleError(isAr ? 'أدخل اسمك' : 'Enter your name'); return; }
  if (!category) { showBattleError(isAr ? 'اختر فئة' : 'Choose a category'); return; }
  const btn = document.getElementById('battleCreateBtn');
  if (btn) { btn.disabled = true; btn.textContent = isAr ? 'جارٍ الإنشاء...' : 'Creating...'; }
  try {
    const data = await apiFetch('/battle/create', {
      method: 'POST',
      body: JSON.stringify({ category, difficulty, questionCount: count }),
    });
    battleState.hostId = data.hostId;
    battleState.isHost = true;
    connectToBattle(data.code, name, data.hostId);
  } catch (err) {
    showBattleError(err.message || (isAr ? 'تعذر الإنشاء' : 'Could not create room'));
    if (btn) { btn.disabled = false; btn.textContent = isAr ? 'إنشاء الغرفة' : 'Create Battle Room'; }
  }
}

function handleBattleJoin() {
  const name = document.getElementById('battleNameInput')?.value.trim() || '';
  const code = (document.getElementById('battleCodeInput')?.value || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  const isAr = state.lang === 'ar';
  if (!name) { showBattleError(isAr ? 'أدخل اسمك' : 'Enter your name'); return; }
  if (code.length < 4) { showBattleError(isAr ? 'أدخل كود الغرفة' : 'Enter the room code'); return; }
  connectToBattle(code, name, null);
}

function showBattleError(msg) {
  const el = document.getElementById('battleSetupError');
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
}

function connectToBattle(code, name, hostId) {
  if (battleState.ws) { battleState.ws.onclose = null; battleState.ws.close(); }
  const ws = new WebSocket(getBattleWsUrl());
  battleState.ws = ws;
  battleState.roomCode = code;
  ws.onopen = () => ws.send(JSON.stringify({ type: 'join-room', code, name, hostId: hostId || '' }));
  ws.onmessage = (e) => { try { handleBattleMessage(JSON.parse(e.data)); } catch (_) { } };
  ws.onerror = () => showBattleError(state.lang === 'ar' ? 'تعذر الاتصال بالغرفة' : 'Connection failed');
  ws.onclose = () => {
    if (battleState.phase !== 'closed' && battleState.phase !== 'finished') {
      showToast(state.lang === 'ar' ? 'انقطع الاتصال بالغرفة' : 'Disconnected from battle room');
    }
  };
}

function setBattleRoomState(roomState) {
  battleState.roomData = roomState;
  if (roomState && battleState.playerId) {
    battleState.isHost = roomState.hostId === battleState.playerId;
  }
}

function handleBattleMessage(msg) {
  if (msg.type === 'error') { showBattleError(msg.message); return; }
  if (msg.type === 'joined') {
    battleState.playerId = msg.playerId;
    battleState.isHost = msg.isHost;
    battleState.phase = 'lobby';
    renderBattleUI();
    return;
  }
  if (msg.type === 'room-update') {
    setBattleRoomState(msg.roomState);
    if (battleState.phase === 'lobby') renderBattleUI();
    return;
  }
  if (msg.type === 'question') {
    clearInterval(battleState.timerInterval);
    setBattleRoomState(msg.roomState);
    battleState.currentQuestion = msg.question;
    battleState.selectedAnswer = null;
    battleState.answeredCount = 0;
    battleState.totalPlayers = msg.roomState.totalPlayers;
    battleState.phase = 'question';
    battleState.timeLeft = Math.round(msg.timeMs / 1000);
    battleState.answerStartTime = Date.now();
    renderBattleUI();
    startBattleTimer(msg.timeMs);
    return;
  }
  if (msg.type === 'answer-count') {
    battleState.answeredCount = msg.answeredCount;
    battleState.totalPlayers = msg.totalPlayers;
    const el = document.getElementById('battleAnswerCount');
    if (el) el.textContent = `${msg.answeredCount}/${msg.totalPlayers} ${state.lang === 'ar' ? 'أجابوا' : 'answered'}`;
    return;
  }
  if (msg.type === 'reveal') {
    clearInterval(battleState.timerInterval);
    setBattleRoomState(msg.roomState);
    battleState.revealData = { correctIndex: msg.correctIndex, correctAnswer: msg.correctAnswer };
    battleState.phase = 'reveal';
    renderBattleUI();
    return;
  }
  if (msg.type === 'game-end') {
    clearInterval(battleState.timerInterval);
    setBattleRoomState(msg.roomState);
    battleState.phase = 'finished';
    renderBattleUI();
    spawnBattleConfetti();
    return;
  }
}

function startBattleTimer(timeMs) {
  const totalSec = Math.round(timeMs / 1000);
  battleState.timeLeft = totalSec;
  battleState.timerInterval = setInterval(() => {
    battleState.timeLeft = Math.max(0, battleState.timeLeft - 1);
    const countEl = document.getElementById('battleTimerCount');
    const fillEl = document.getElementById('battleTimerFill');
    if (countEl) {
      countEl.textContent = String(battleState.timeLeft);
      if (battleState.timeLeft <= 5) countEl.classList.add('urgent');
      else countEl.classList.remove('urgent');
    }
    if (fillEl) fillEl.style.width = `${(battleState.timeLeft / totalSec) * 100}%`;
    if (battleState.timeLeft <= 0) clearInterval(battleState.timerInterval);
  }, 1000);
}

function renderBattleLobby(body) {
  const isAr = state.lang === 'ar';
  const room = battleState.roomData;
  const players = room?.players || [];
  const code = battleState.roomCode || '';
  const shareUrl = `${location.origin}/#battle/${code}`;

  body.innerHTML = `
    <div class="battle-lobby">
      <div class="battle-code-display">
        <div class="battle-code-value">${escapeHtml(code)}</div>
        <p class="battle-code-hint">${isAr ? 'شارك هذا الكود لدعوة الآخرين' : 'Share this code to invite players'}</p>
        <button class="ghost-btn" id="battleShareBtn" style="margin-top:0.6rem;font-size:0.82rem;">
          ${isAr ? 'نسخ الرابط' : 'Copy invite link'}
        </button>
      </div>
      <div>
        <p class="mini-label" style="margin-bottom:0.5rem">${isAr ? 'اللاعبون' : 'Players'} (${players.length})</p>
        <div class="battle-player-list">
          ${players.map(p => `
            <div class="battle-player-row">
              ${p.id === room?.hostId ? '<span class="battle-player-crown" aria-label="Host"></span>' : '<span style="width:1.2rem"></span>'}
              <span style="flex:1">${escapeHtml(p.name)}</span>
              ${p.id === battleState.playerId ? `<span class="pill" style="font-size:0.7rem">${isAr ? 'أنت' : 'You'}</span>` : ''}
            </div>`).join('')}
          ${players.length === 0 ? `<p class="battle-waiting-msg">${isAr ? 'في انتظار اللاعبين...' : 'Waiting for players to join...'}</p>` : ''}
        </div>
      </div>
      ${battleState.isHost
      ? `<button class="primary-btn" id="battleStartBtn"${players.length < 1 ? ' disabled' : ''}>
              ${isAr ? 'ابدأ المعركة' : 'Start Battle'} (${players.length} ${isAr ? 'لاعب' : players.length === 1 ? 'player' : 'players'})
           </button>
           <p class="battle-waiting-msg" style="margin-top:-0.25rem">${isAr ? 'يمكنك البدء بلاعب واحد أو أكثر' : 'You can start with 1 or more players'}</p>`
      : `<p class="battle-waiting-msg">${isAr ? 'في انتظار المضيف لبدء المعركة...' : 'Waiting for host to start the battle...'}</p>`}
    </div>`;

  document.getElementById('battleShareBtn')?.addEventListener('click', () => {
    navigator.clipboard?.writeText(shareUrl).then(() => showToast(isAr ? 'تم نسخ الرابط!' : 'Link copied!'))
      .catch(() => showToast(shareUrl));
  });
  document.getElementById('battleStartBtn')?.addEventListener('click', () => {
    battleState.ws?.send(JSON.stringify({ type: 'start-game', hostId: battleState.hostId || '' }));
  });
}

function renderBattleQuestion(body) {
  const lang = state.lang;
  const isAr = lang === 'ar';
  const q = battleState.currentQuestion;
  const room = battleState.roomData;
  if (!q || !room) return;
  const options = (q.options?.[lang] || q.options?.en || []);
  const labels = ['A', 'B', 'C', 'D'];
  const scores = room.players.map(p => p.score);
  const maxScore = Math.max(...scores, 1);

  body.innerHTML = `
    <div class="battle-game">
      <div class="battle-hud">
        <span class="battle-hud-code">${escapeHtml(room.code)}</span>
        <span class="battle-round-label">${isAr ? 'س' : 'Q'}${q.index + 1} / ${q.total}</span>
        <span class="battle-player-count">${room.totalPlayers} ${isAr ? 'لاعبين' : 'players'}</span>
        <span class="battle-timer-badge" id="battleTimerCount">${battleState.timeLeft}</span>
      </div>
      <div class="battle-timer-bar">
        <div class="battle-timer-fill" id="battleTimerFill" style="width:${(battleState.timeLeft / 15) * 100}%"></div>
      </div>
      <div class="battle-question-area">
        <p class="battle-question-text">${escapeHtml(q.text?.[lang] || q.text?.en || '')}</p>
        <div class="battle-options" id="battleOptions">
          ${options.map((opt, i) => `
            <button class="battle-option-btn${battleState.selectedAnswer === i ? ' selected' : ''}"
              data-index="${i}" ${battleState.selectedAnswer !== null ? 'disabled' : ''}>
              <span class="battle-option-label">${labels[i]}</span>
              <span>${escapeHtml(String(opt))}</span>
            </button>`).join('')}
        </div>
        <p class="battle-answer-status" id="battleAnswerCount">
          ${battleState.answeredCount}/${room.totalPlayers} ${isAr ? 'أجابوا' : 'answered'}
        </p>
      </div>
      <div class="battle-bottom">
        <div class="battle-mini-lb">
          ${room.players.slice(0, 5).map((p, i) => {
    const barW = maxScore > 0 ? Math.round((p.score / maxScore) * 100) : 0;
    const isMe = p.id === battleState.playerId;
    return `<div class="battle-mini-lb-row${isMe ? ' is-me' : ''}">
              <span class="battle-mini-lb-pos">${i + 1}</span>
              <span class="battle-mini-lb-name">${escapeHtml(p.name)}${isMe ? (isAr ? ' (أنت)' : ' (you)') : ''}</span>
              ${p.streak >= 2 ? `<span class="battle-streak-badge">${p.streak}×</span>` : ''}
              <div class="battle-mini-lb-bar"><div class="battle-mini-lb-bar-fill" style="width:${barW}%"></div></div>
              <span class="battle-mini-lb-score">${p.score}</span>
            </div>`;
  }).join('')}
        </div>
      </div>
    </div>`;

  document.querySelectorAll('.battle-option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (battleState.selectedAnswer !== null || btn.disabled) return;
      submitBattleAnswer(parseInt(btn.dataset.index, 10));
    });
  });
}

function submitBattleAnswer(index) {
  if (battleState.selectedAnswer !== null) return;
  battleState.selectedAnswer = index;
  const timeMs = Date.now() - (battleState.answerStartTime || Date.now());
  battleState.ws?.send(JSON.stringify({ type: 'submit-answer', answerIndex: index, timeMs }));
  document.querySelectorAll('.battle-option-btn').forEach((btn, i) => {
    btn.disabled = true;
    if (i === index) btn.classList.add('selected');
  });
}

function renderBattleReveal(body) {
  const lang = state.lang;
  const isAr = lang === 'ar';
  const q = battleState.currentQuestion;
  const room = battleState.roomData;
  const reveal = battleState.revealData;
  if (!q || !room || !reveal) return;
  const options = (q.options?.[lang] || q.options?.en || []);
  const labels = ['A', 'B', 'C', 'D'];
  const maxScore = Math.max(...room.players.map(p => p.score), 1);
  const mySelected = battleState.selectedAnswer;
  const correctIndex = reveal.correctIndex;
  const myCorrect = mySelected !== null && mySelected === correctIndex;

  body.innerHTML = `
    <div class="battle-game">
      <div class="battle-hud">
        <span class="battle-hud-code">${escapeHtml(room.code)}</span>
        <span class="battle-round-label">
          ${isAr ? 'س' : 'Q'}${q.index + 1}/${q.total} ·
          ${mySelected === null
      ? (isAr ? 'انتهى الوقت' : 'Time\'s up')
      : myCorrect
        ? (isAr ? 'صحيح!' : 'Correct!')
        : (isAr ? 'خاطئ' : 'Wrong')}
        </span>
      </div>
      <div class="battle-timer-bar"><div class="battle-timer-fill" style="width:0%;transition:none"></div></div>
      <div class="battle-question-area">
        <p class="battle-question-text">${escapeHtml(q.text?.[lang] || q.text?.en || '')}</p>
        <div class="battle-options">
          ${options.map((opt, i) => {
          const isCorrect = i === correctIndex;
          const isWrong = i === mySelected && !isCorrect;
          let cls = isCorrect ? ' correct' : isWrong ? ' wrong' : '';
          const lbl = isCorrect ? (isAr ? 'ص' : 'OK') : isWrong ? (isAr ? 'خ' : 'NO') : labels[i];
          return `<button class="battle-option-btn${cls}" disabled>
              <span class="battle-option-label">${lbl}</span>
              <span>${escapeHtml(String(opt))}</span>
            </button>`;
        }).join('')}
        </div>
        <p class="battle-answer-status">${isAr ? 'القادم خلال ثوانٍ...' : 'Next question in a moment...'}</p>
      </div>
      <div class="battle-bottom">
        <div class="battle-mini-lb">
          ${room.players.slice(0, 5).map((p, i) => {
          const barW = maxScore > 0 ? Math.round((p.score / maxScore) * 100) : 0;
          const isMe = p.id === battleState.playerId;
          return `<div class="battle-mini-lb-row${isMe ? ' is-me' : ''}">
              <span class="battle-mini-lb-pos">${i + 1}</span>
              <span class="battle-mini-lb-name">${escapeHtml(p.name)}</span>
              ${p.streak >= 2 ? `<span class="battle-streak-badge">${p.streak}×</span>` : ''}
              <div class="battle-mini-lb-bar"><div class="battle-mini-lb-bar-fill" style="width:${barW}%"></div></div>
              <span class="battle-mini-lb-score">${p.score}</span>
            </div>`;
        }).join('')}
        </div>
      </div>
    </div>`;
}

function renderBattlePodium(body) {
  const lang = state.lang;
  const isAr = lang === 'ar';
  const room = battleState.roomData;
  if (!room) return;
  const players = room.players;
  const medals = ['1', '2', '3'];
  const top3 = players.slice(0, 3);
  // Podium display order: 2nd | 1st | 3rd
  const podiumOrder = top3.length >= 2
    ? [top3[1], top3[0], top3[2]].filter(Boolean)
    : top3;
  const podiumHeights = [60, 80, 45];
  const podiumColors = [
    'linear-gradient(135deg,#94A3B8,#CBD5E1)',
    'linear-gradient(135deg,#C9A227,#E2C566)',
    'linear-gradient(135deg,#B45309,#D97706)',
  ];
  const podiumRanks = top3.length >= 2 ? [2, 1, 3] : [1, 2, 3];

  body.innerHTML = `
    <div class="battle-podium">
      <h2 class="battle-podium-title">
        ${isAr ? 'انتهت المعركة!' : 'Battle Complete!'}
      </h2>
      <div class="battle-podium-places">
        ${podiumOrder.map((p, di) => {
    const rank = podiumRanks[di];
    const isMe = p.id === battleState.playerId;
    return `<div class="battle-podium-place">
            <div class="battle-podium-medal">${medals[rank - 1] || ''}</div>
            <div class="battle-podium-name${isMe ? ' you' : ''}">${escapeHtml(p.name)}</div>
            <div class="battle-podium-pts">${p.score} ${isAr ? 'نقطة' : 'pts'}</div>
            <div class="battle-podium-block" style="height:${podiumHeights[di]}px;background:${podiumColors[di]}">${rank}</div>
          </div>`;
  }).join('')}
      </div>
      ${players.length > 3 ? `
        <div class="battle-full-lb">
          ${players.map((p, i) => `
            <div class="battle-full-lb-row${p.id === battleState.playerId ? ' is-me' : ''}">
              <span style="color:var(--muted);font-family:var(--font-mono);width:1.4rem">${i + 1}</span>
              <span style="flex:1;font-weight:500">${escapeHtml(p.name)}</span>
              <span style="font-family:var(--font-mono);font-weight:700;color:var(--accent-2)">${p.score}</span>
            </div>`).join('')}
        </div>` : ''}
      <div style="display:flex;gap:0.75rem;flex-wrap:wrap;justify-content:center;margin-top:0.5rem;">
        <button class="primary-btn" id="battlePlayAgainBtn">${isAr ? 'جولة جديدة' : 'Play Again'}</button>
        <button class="secondary-btn" id="battleShareResultBtn">${isAr ? 'شارك' : 'Share'}</button>
        <button class="ghost-btn" id="battleCloseFinBtn">${isAr ? 'إغلاق' : 'Close'}</button>
      </div>
    </div>`;

  document.getElementById('battlePlayAgainBtn')?.addEventListener('click', () => {
    battleState.phase = 'setup';
    battleState.tab = 'create';
    if (battleState.ws) { battleState.ws.onclose = null; battleState.ws.close(); battleState.ws = null; }
    renderBattleUI();
  });
  document.getElementById('battleShareResultBtn')?.addEventListener('click', () => {
    const winner = players[0];
    const myPos = players.findIndex(p => p.id === battleState.playerId) + 1;
    const text = isAr
      ? `انتهت معركة JAKH!\n${winner?.name || ''}: ${winner?.score || 0} نقطة\nمركزي: #${myPos}\njakh.net`
      : `JAKH Battle done!\n${winner?.name || ''}: ${winner?.score || 0} pts\nMy rank: #${myPos}\njakh.net`;
    navigator.share?.({ title: 'JAKH Battle', text }).catch(() =>
      navigator.clipboard?.writeText(text).then(() => showToast(isAr ? 'تم النسخ!' : 'Copied!')));
  });
  document.getElementById('battleCloseFinBtn')?.addEventListener('click', closeBattleModal);
}

function spawnBattleConfetti() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#E8613C', '#C9A227', '#48d597', '#9f7cff', '#E2C566', '#ff7a8a', '#5ac8ff'];
  for (let i = 0; i < 60; i++) {
    setTimeout(() => {
      const dot = document.createElement('div');
      dot.className = 'confetti-dot';
      const cx = Math.random() * window.innerWidth;
      const angle = (Math.random() - 0.5) * Math.PI * 1.8;
      const dist = 120 + Math.random() * 180;
      const size = 5 + Math.random() * 9;
      dot.style.cssText = [
        `left:${cx}px`,
        `top:${window.innerHeight * 0.25}px`,
        `width:${size}px`,
        `height:${size}px`,
        `background:${colors[Math.floor(Math.random() * colors.length)]}`,
        `border-radius:${Math.random() > 0.5 ? '50%' : '3px'}`,
        `--dx:${(Math.cos(angle) * dist).toFixed(1)}px`,
        `--dy:${(-60 - Math.random() * 160).toFixed(1)}px`,
        `--rot:${(Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 720)}deg`,
        `animation-delay:0ms`,
      ].join(';');
      document.body.appendChild(dot);
      dot.addEventListener('animationend', () => dot.remove(), { once: true });
    }, i * 35);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  registerStableServiceWorker();
  init().catch((error) => {
    console.error(error);
    showToast(error.message || 'Initialization error');
  });
  // Ask for push permission after 30s (not immediately, to avoid consent fatigue)
  setTimeout(subscribePushNotifications, 30000);
});

function registerStableServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const register = () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        const updateQuietly = () => reg.update().catch(() => { });
        if ('requestIdleCallback' in window) requestIdleCallback(updateQuietly, { timeout: 5000 });
        else setTimeout(updateQuietly, 2500);
      })
      .catch(() => { });
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
