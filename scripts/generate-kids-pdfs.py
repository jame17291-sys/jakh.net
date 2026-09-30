#!/usr/bin/env python3
"""Generate the committed bilingual activity packs; no browser or network required.

Requires reportlab, arabic-reshaper, python-bidi, and an embeddable Arabic-capable
TrueType font. Set KIDS_PDF_FONT / KIDS_PDF_BOLD_FONT on non-macOS authoring hosts.
CI verifies committed PDF hashes and input hashes instead of regenerating fonts.
"""
import hashlib
import json
import os
import re
from pathlib import Path

import arabic_reshaper
from bidi.algorithm import get_display
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.pagesizes import A4, letter
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets/kids/printables'
FONT = os.environ.get('KIDS_PDF_FONT', '/System/Library/Fonts/Supplemental/Arial.ttf')
BOLD_FONT = os.environ.get('KIDS_PDF_BOLD_FONT', '/System/Library/Fonts/Supplemental/Arial Bold.ttf')
pdfmetrics.registerFont(TTFont('KidsText', FONT))
pdfmetrics.registerFont(TTFont('KidsBold', BOLD_FONT))
INK = HexColor('#483326')
MUTED = HexColor('#63594f')
LINE = HexColor('#d8c9b7')
# Preserve the reading marks supplied by the bilingual source. Their positions
# must shift before bidi reversal so they remain over the intended letters.
ARABIC_RESHAPER = arabic_reshaper.ArabicReshaper(configuration={
    'delete_harakat': False,
    'shift_harakat_position': True,
})
AGES = ['3-4', '5-6', '7-8', '9-12']
AREAS = {
 'language': ('Language & stories', 'اللغة والقصص'),
 'maths': ('Maths in everyday life', 'الرياضيات في حياتنا'),
 'logic': ('Logic & problem-solving', 'المنطق وحلّ المشكلات'),
 'science': ('Science & nature', 'العلوم والطبيعة'),
 'creativity': ('Creativity & making', 'الإبداع والصنع'),
 'life': ('Together & everyday skills', 'التعاون ومهارات الحياة'),
}

def localized(value, lang):
    return value[lang]

def display(text, lang):
    text = str(text).replace('\u2011', '-').replace('\u2013', '-').replace('\u2014', ' - ')
    if lang == 'ar':
        # Python bidi supports explicit overrides, which keep equations such as
        # 7 - 4 = 3 together in LTR order within the surrounding Arabic text.
        text = re.sub(r'(?<![0-9٠-٩۰-۹])([0-9٠-٩۰-۹]+(?:[.:٫٬][0-9٠-٩۰-۹]+)*(?:\s*[+−×÷=<>–/-]\s*[0-9٠-٩۰-۹]+(?:[.:٫٬][0-9٠-٩۰-۹]+)*)+)(?![0-9٠-٩۰-۹])',
                      lambda match: '\u202d' + match.group(1) + '\u202c', text)
    return get_display(ARABIC_RESHAPER.reshape(text), base_dir='R') if lang == 'ar' else text

class Pack:
    def __init__(self, file, lang, size, title):
        self.c = canvas.Canvas(str(file), pagesize=size, invariant=1, pageCompression=1)
        self.c.setTitle(title)
        self.c.setAuthor('Riddle Arabia')
        self.c.setSubject('Playful family learning: activity sheets and parent explanations')
        self.lang, self.w, self.h = lang, *size
        self.left, self.right, self.y, self.page = 43, self.w - 43, 0, 0
        self.title = title
        self.new_page()

    def choose(self, en, ar):
        return ar if self.lang == 'ar' else en

    def line(self, text, y, size=11, bold=False, color=INK):
        self.c.setFillColor(color)
        self.c.setFont('KidsBold' if bold else 'KidsText', size)
        shaped = display(text, self.lang)
        if self.lang == 'ar': self.c.drawRightString(self.right, y, shaped)
        else: self.c.drawString(self.left, y, shaped)

    def new_page(self):
        if self.page: self.c.showPage()
        self.page += 1
        self.line(self.choose('RIDDLE ARABIA / KIDS LEARNING & PLAY', 'ريدل أرابيا / عالم الأطفال: تعلّم والعب'), self.h - 35, 9, True, MUTED)
        self.c.setStrokeColor(LINE)
        self.c.line(self.left, self.h - 44, self.right, self.h - 44)
        # URLs are Latin text even on the right-aligned Arabic pages; applying
        # RTL bidi to the URL would move its trailing slash to the beginning.
        url = self.choose('riddlearabia.com/kids-riddles', 'riddlearabia.com/ar/topics/kids-riddles/')
        self.c.setFillColor(MUTED)
        self.c.setFont('KidsText', 8)
        if self.lang == 'ar': self.c.drawRightString(self.right, 25, url)
        else: self.c.drawString(self.left, 25, url)
        self.c.drawCentredString(self.w / 2, 25, str(self.page))
        self.y = self.h - 68

    def wrap(self, text, size, bold=False):
        font = 'KidsBold' if bold else 'KidsText'
        lines, current = [], ''
        for word in str(text).split():
            candidate = f'{current} {word}'.strip()
            if current and pdfmetrics.stringWidth(display(candidate, self.lang), font, size) > self.right-self.left:
                lines.append(current)
                current = word
            else: current = candidate
        if current: lines.append(current)
        return lines

    def text(self, text, size=11, bold=False, gap=7, keep=0):
        lines = self.wrap(text, size, bold)
        leading = size * 1.48
        # Keep each short paragraph together; longer text flows onto another page.
        if self.y - min(len(lines), 7)*leading - keep < 65:
            self.new_page()
        for line in lines:
            if self.y - leading < 61: self.new_page()
            self.line(line, self.y, size, bold)
            self.y -= leading
        self.y -= gap

    def heading(self, title):
        self.text(title, 12, True, gap=4, keep=32)

    def field(self, heading, value):
        self.heading(heading)
        self.text(value)

    def finish(self):
        self.c.save()

def make_pack(file, activities, age, area, lang, size):
    title = f'{AREAS[area][lang == "ar"]} | {age}'
    pack = Pack(file, lang, size, title)
    L = lambda en, ar: ar if lang == 'ar' else en
    for index, a in enumerate(activities):
        if index: pack.new_page()
        minutes_label = L('minutes', 'دقائق' if 3 <= a['minutes'] <= 10 else 'دقيقة')
        age_from, age_to = age.split('-')
        progress = L(f'{index + 1} / {len(activities)}', f'النشاط {index + 1} من {len(activities)}')
        ages = L(f'Ages {age}', f'الأعمار من {age_from} إلى {age_to}')
        pack.text(f'{progress}  |  {ages}  |  {a["minutes"]} {minutes_label}', 9, True)
        pack.text(localized(a['title'], lang), 19, True, gap=9, keep=36)
        pack.field(L('What we are practising', 'ما الذي نتدرّب عليه؟'), localized(a['objective'], lang))
        pack.field(L('What you need', 'ما تحتاج إليه'), ' / '.join(localized(a['materials'], lang)))
        pack.text(localized(a['alternatives'], lang), 10, gap=6)
        pack.field(L('Before you begin', 'قبل أن تبدأ'), localized(a['preparation'], lang))
        pack.text(localized(a['supervision'], lang), 10, gap=7)
        pack.heading(L('Try it together', 'جرّبوا معًا'))
        for n, step in enumerate(localized(a['steps'], lang), 1): pack.text(f'{n}. {step}', 11, gap=4)
        pack.field(L('Talk, draw or show your idea', 'تحدّث أو ارسم أو اعرض فكرتك'), localized(a['prompt'], lang))
        if pack.y > 145:
            pack.heading(L('Space to explore', 'مساحة للاستكشاف'))
            pack.c.setStrokeColor(LINE)
            for y in range(int(pack.y - 10), max(62, int(pack.y - 81)), -22):
                pack.c.line(pack.left, y, pack.right, y)
        pack.line(L('Answers and variations are in the parent guide at the end.', 'تجد الإجابات والنسخ البديلة في دليل الأهل في نهاية الحزمة.'), 43, 8, False, MUTED)
    for n, a in enumerate(activities, 1):
        # Keep every activity's answer, explanation and adaptations on a clearly
        # identified page that parents can print separately from the child sheet.
        pack.new_page()
        pack.text(L('For the grown-up', 'دليل الأهل'), 21, True)
        pack.text(L('Use these prompts when useful. Open-ended activities can have many good answers. Let your child explain their thinking.', 'استخدم هذه التلميحات عند الحاجة. قد تكون للأنشطة المفتوحة إجابات جيدة متعدّدة. دع طفلك يشرح تفكيره.'), 11)
        pack.text(f'{n}. {localized(a["title"], lang)}', 15, True, gap=8, keep=70)
        pack.field(L('A little hint', 'تلميح صغير'), ' '.join(localized(a['hints'], lang)))
        pack.field(L('Answer / what to notice', 'الإجابة / ما نلاحظه'), localized(a['answer'], lang))
        pack.text(localized(a['explanation'], lang))
        pack.field(L('Make it easier', 'لنجعله أسهل'), localized(a['easier'], lang))
        pack.field(L('Take it further', 'لنتعمّق أكثر'), localized(a['harder'], lang))
        pack.field(L('Another day, away from the screen', 'يوم آخر بعيدًا عن الشاشة'), localized(a['extension'], lang))
        pack.y -= 12
    pack.finish()
    return pack.page

def digest(file): return hashlib.sha256(file.read_bytes()).hexdigest()

def main():
    inventory_file = ROOT/'data/kids/inventory.json'
    inventory = json.loads(inventory_file.read_text())
    per_group = inventory['activitiesPerAgeAndArea']
    files = [ROOT/'data/kids'/file for file in inventory['activitySources']]
    activities = sum((json.loads(file.read_text()) for file in files), [])
    required = per_group * len(AGES) * len(AREAS)
    if len(activities) != required: raise ValueError(f'All {required} activities are required before printing.')
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = {'schemaVersion': 1, 'inputs': {str(file.relative_to(ROOT)): digest(file) for file in [inventory_file, *files]}, 'generatorSha256': digest(Path(__file__)), 'files': []}
    for age in AGES:
        for area in AREAS:
            group = [a for a in activities if a['age'] == age and a['area'] == area]
            if len(group) != per_group: raise ValueError(f'Expected {per_group} activities in {age}/{area}')
            for lang in ['en', 'ar']:
                for paper, size in [('a4', A4), ('letter', letter)]:
                    name = f'pack-{age}-{area}-{lang}-{paper}.pdf'
                    file = OUT/name
                    pages = make_pack(file, group, age, area, lang, size)
                    manifest['files'].append({'path': str(file.relative_to(ROOT)), 'sha256': digest(file), 'bytes': file.stat().st_size, 'pages': pages, 'lang': lang, 'paper': paper})
    (ROOT/'data/kids/print-manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
    print(f'Created {len(manifest["files"])} PDFs across 24 packs; {sum(f["pages"] for f in manifest["files"])} printable pages.')

if __name__ == '__main__': main()
