// Draw only the result summary. Questions and answers never enter the share image.
export async function makeScoreCard({ score, show, mode, lang }) {
  await document.fonts?.ready;
  const canvas = document.createElement('canvas');
  canvas.width = 1080; canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas-unavailable');
  ctx.fillStyle = '#fcf8ef'; ctx.fillRect(0, 0, 1080, 1080);
  ctx.strokeStyle = '#dccbb3'; ctx.lineWidth = 3; ctx.strokeRect(38, 38, 1004, 1004);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const family = lang === 'ar' ? getComputedStyle(document.documentElement).getPropertyValue('--font-ar').trim() || 'sans-serif' : 'Georgia, serif';
  function line(text, y, size, color = '#39291f', weight = 500) {
    ctx.direction = lang === 'ar' ? 'rtl' : 'ltr';
    ctx.fillStyle = color;
    do { ctx.font = `${weight} ${size--}px ${family}`; } while (ctx.measureText(text).width > 900 && size > 20);
    ctx.fillText(text, 540, y);
  }
  line(lang === 'ar' ? 'ريدل أرابيا' : 'RIDDLE ARABIA', 135, 35, '#8b4429', 700);
  line(lang === 'ar' ? 'تحدّي المسلسلات' : 'THE TV TRIVIA CLUB', 207, 23, '#725846');
  line(show, 323, 64, '#39291f', 700);
  ctx.fillStyle = '#8b4429'; ctx.direction = 'ltr'; ctx.font = '700 220px Georgia, serif'; ctx.fillText(`${score}/10`, 540, 533);
  line(lang === 'ar' ? 'انتهت الجولة!' : 'That’s a wrap!', 721, 55, '#39291f', 700);
  line(mode, 801, 30, '#725846');
  line(lang === 'ar' ? 'هل تتفوق عليّ؟' : 'Can you beat my score?', 902, 37, '#8b4429', 700);
  ctx.direction = 'ltr'; ctx.font = '24px sans-serif'; ctx.fillStyle = '#725846'; ctx.fillText('riddlearabia.com/tv-shows-trivia', 540, 980);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('image-unavailable')), 'image/png'));
}
