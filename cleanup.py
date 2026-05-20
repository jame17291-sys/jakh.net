#!/usr/bin/env python3
"""
JAKH Cleanup: Remove footer-socials HTML + inject unique SEO meta descriptions.
Run from: cd /Users/jameelkhabaze/jakh-repo && python3 cleanup.py
"""
import os, re, glob

WEB_DIR = os.path.dirname(os.path.abspath(__file__))
SOCIAL_RE = re.compile(r'\s*<div\s+class="footer-socials"[^>]*>.*?</div>\s*', re.DOTALL | re.IGNORECASE)

SEO = {
    'history': 'Test your knowledge of world history — from ancient civilizations to modern revolutions. Bilingual trivia in English and Arabic.',
    'science': 'Explore the wonders of science with bilingual trivia covering physics, biology, chemistry, and beyond.',
    'geography': 'How well do you know the world? Challenge yourself with geography questions on countries, capitals, and landmarks.',
    'math': 'Sharpen your mind with math puzzles and trivia ranging from basic arithmetic to brain-bending logic.',
    'chemistry': 'Dive into the periodic table and beyond — bilingual chemistry trivia from elements to reactions.',
    'biology': 'From cells to ecosystems — test your biology knowledge with questions across all difficulty levels.',
    'geology': 'Rocks, minerals, tectonic plates, and more — explore the Earth with bilingual geology trivia.',
    'philosophy': 'Ponder the big questions — ethics, existence, logic, and the great thinkers of philosophy.',
    'psychology': 'Understand the human mind — trivia on behavior, cognition, famous experiments, and mental health.',
    'classic-riddles': 'The original brain teasers — classic riddles that have challenged minds for generations.',
    'kids-riddles': 'Fun and safe riddles designed for kids — easy enough to enjoy, clever enough to learn from.',
    'football': 'Think you know football? Test yourself on players, clubs, World Cup history, and legendary matches.',
    'flag-questions': 'Can you identify every country by its flag? Challenge yourself with this visual trivia category.',
    'coding-and-design': 'Programming concepts, design patterns, and web development — trivia for builders and creators.',
    'software-and-computing': 'From operating systems to algorithms — computing trivia for tech enthusiasts at every level.',
    'medical-questions': 'Medical trivia covering anatomy, diseases, treatments, and healthcare history.',
    'pharmacy': 'Drugs, dosages, and pharmaceutical science — trivia for pharmacy students and health professionals.',
    'law-middle-east': 'Middle Eastern legal systems, constitutional law, and Sharia-based jurisprudence trivia.',
    'art-and-painters': 'From Da Vinci to Basquiat — explore the world of art through painters, movements, and masterpieces.',
    'books-and-quotes': 'Famous authors, literary classics, and unforgettable quotes — a trivia paradise for bookworms.',
    'business-and-management': 'Leadership, strategy, startups, and corporate history — business trivia for professionals.',
    'civil-engineering': 'Bridges, roads, and structural design — civil engineering trivia from foundations to skyscrapers.',
    'electrical-engineering': 'Circuits, power systems, and electronics — challenging trivia for electrical engineering minds.',
    'mechanical-engineering': 'Thermodynamics, mechanics, and manufacturing — trivia for engineers and curious minds.',
    'infrastructure-systems': 'Water, energy, and transport networks — how the systems that run our world actually work.',
    'space-and-astrology': 'Planets, stars, and space exploration — trivia that takes you beyond the atmosphere.',
    'story-mysteries': 'Solve narrative puzzles and logic-based story mysteries — think critically to crack each case.',
    'middle-east-history': 'From the Ottoman Empire to modern Gulf states — bilingual trivia on Middle Eastern history.',
    'relationship-questions': 'Fun, thought-provoking relationship questions — explore love, communication, and compatibility.',
    'world-habits-and-etiquette': 'Cultural norms, social customs, and etiquette from around the world.',
    'environment-and-ecology': 'Climate change, biodiversity, and sustainability — trivia on the planet we share.',
    'ancient-civilizations': 'Egypt, Mesopotamia, Rome, and beyond — explore the civilizations that shaped humanity.',
    'inventions-and-minds': "The stories behind the world's greatest inventions and the minds who created them.",
    'animal-kingdom': 'From insects to whales — test your knowledge of the animal kingdom across all habitats.',
    'economics-and-finance': 'Markets, money, and macroeconomics — trivia on the forces that drive the global economy.',
    'architecture-and-landmarks': 'Iconic buildings and famous landmarks — architectural trivia from the Pyramids to Burj Khalifa.',
    'music-and-performing-arts': 'From classical composers to modern pop — trivia on music, theater, and the performing arts.',
    'food-and-cuisines': 'A world tour of flavors — trivia on dishes, ingredients, and culinary traditions from every continent.',
    'cinema-and-film-history': 'Lights, camera, trivia! Test your knowledge of movies, directors, and film history.',
    'future-tech-and-energy': 'AI, renewable energy, and the technology of tomorrow — trivia on the future being built today.',
    'anime': 'From Dragon Ball to Demon Slayer — anime trivia for otaku and casual fans alike.',
    'ayam-tayebeen': 'Nostalgic trivia from the golden days of Arabic culture, TV, and everyday life.',
    'mythology-legends': 'Greek gods, Norse legends, and myths from every culture — explore the stories that shaped belief.',
    'true-crime': 'Real cases, real investigations — true crime trivia on notorious crimes and forensic breakthroughs.',
    'pop-culture': 'Memes, trends, and viral moments — how well do you know modern pop culture?',
    'superheroes': 'Marvel, DC, and beyond — superhero trivia on powers, origins, and epic storylines.',
    'fictional-worlds': 'Middle-earth, Hogwarts, and galaxies far away — trivia from the greatest fictional universes.',
    'survival': 'Wilderness skills, emergency scenarios, and survival knowledge — could you make it in the wild?',
    'automotive': 'Cars, engines, and automotive history — trivia for gearheads and car enthusiasts.',
    'linguistics': 'Language families, grammar, and the science of words — trivia for language lovers.',
    'currencies': "Dollars, dinars, and digital coins — trivia on the world's currencies past and present.",
    'tech-retro': 'Floppy disks, dial-up modems, and retro tech — nostalgic trivia from the dawn of the digital age.',
    'tv-shows-trivia': 'Binge-worthy trivia on TV shows from Friends to Breaking Bad and Arabic series.',
    'social-sciences': 'Sociology, anthropology, and political science — explore how societies work and evolve.',
    'physical-and-life-sciences': 'Physics, earth science, and the natural world — multidisciplinary science trivia.',
    'logic-puzzles': 'Lateral thinking, deduction, and brain teasers — logic puzzles to stretch your mind.',
}

if __name__ == '__main__':
    files = sorted(glob.glob(os.path.join(WEB_DIR, '*.html')))
    print(f'\n Found {len(files)} HTML files\n')
    sc, sc2 = 0, 0
    for f in files:
        name = os.path.basename(f)
        try:
            with open(f, 'r') as fh: orig = fh.read()
            txt = SOCIAL_RE.sub('\n', orig)
            slug = name.replace('.html','')
            if slug in SEO:
                d = SEO[slug]
                txt = re.sub(r'(<meta\s+name="description"\s+content=")[^"]*(")', r'\g<1>'+d+r'\2', txt)
                txt = re.sub(r'(<meta\s+property="og:description"\s+content=")[^"]*(")', r'\g<1>'+d+r'\2', txt)
                txt = re.sub(r'(<meta\s+name="twitter:description"\s+content=")[^"]*(")', r'\g<1>'+d+r'\2', txt)
                txt = re.sub(r'("description":\s*")[^"]*(")', r'\g<1>'+d+r'\2', txt, count=1)
                if txt != orig: sc2 += 1
            if txt != orig:
                with open(f, 'w') as fh: fh.write(txt)
                sc += 1
                print(f'  OK: {name}')
        except Exception as e:
            print(f'  ERR: {name} — {e}')
    print(f'\n Fixed: {sc} files, SEO updated: {sc2}\n')
