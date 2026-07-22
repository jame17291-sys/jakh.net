#!/usr/bin/env python3
import json, os
D = '/Users/jameelkhabaze/JAKH/site/data'

def update(slug, new_cards):
    p = f'{D}/{slug}.json'
    data = json.load(open(p, encoding='utf-8'))
    data['cards'].extend(new_cards)
    dc = {}
    for c in data['cards']:
        dc[c['difficulty']] = dc.get(c['difficulty'], 0) + 1
    data['count'] = len(data['cards'])
    data['difficultyCounts'] = dc
    json.dump(data, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print(f'{slug}: {data["count"]} cards — {dc}')

# ── GEOGRAPHY ─────────────────────────────────────────────────────────────────
geo = [
  {"id":"geography-031","difficulty":"easy","subcategory":{"en":"Capitals","ar":"العواصم"},"question":{"en":"What is the capital of Japan?","ar":"ما عاصمة اليابان؟"},"answer":{"en":"Tokyo","ar":"طوكيو"}},
  {"id":"geography-032","difficulty":"easy","subcategory":{"en":"Countries","ar":"الدول"},"question":{"en":"What is the largest country in the world by area?","ar":"ما أكبر دولة في العالم من حيث المساحة؟"},"answer":{"en":"Russia","ar":"روسيا"}},
  {"id":"geography-033","difficulty":"easy","subcategory":{"en":"Countries","ar":"الدول"},"question":{"en":"What is the smallest country in the world?","ar":"ما أصغر دولة في العالم؟"},"answer":{"en":"Vatican City","ar":"مدينة الفاتيكان"}},
  {"id":"geography-034","difficulty":"easy","subcategory":{"en":"Capitals","ar":"العواصم"},"question":{"en":"What is the capital of Brazil?","ar":"ما عاصمة البرازيل؟"},"answer":{"en":"Brasília","ar":"برازيليا"}},
  {"id":"geography-035","difficulty":"easy","subcategory":{"en":"Continents","ar":"القارات"},"question":{"en":"On which continent is Egypt located?","ar":"في أي قارة تقع مصر؟"},"answer":{"en":"Africa","ar":"أفريقيا"}},
  {"id":"geography-036","difficulty":"easy","subcategory":{"en":"Capitals","ar":"العواصم"},"question":{"en":"What is the capital of Australia?","ar":"ما عاصمة أستراليا؟"},"answer":{"en":"Canberra","ar":"كانبيرا"}},
  {"id":"geography-037","difficulty":"easy","subcategory":{"en":"Oceans","ar":"المحيطات"},"question":{"en":"What is the largest ocean on Earth?","ar":"ما أكبر محيط على وجه الأرض؟"},"answer":{"en":"The Pacific Ocean","ar":"المحيط الهادئ"}},
  {"id":"geography-038","difficulty":"easy","subcategory":{"en":"Capitals","ar":"العواصم"},"question":{"en":"What is the capital of Canada?","ar":"ما عاصمة كندا؟"},"answer":{"en":"Ottawa","ar":"أوتاوا"}},
  {"id":"geography-039","difficulty":"easy","subcategory":{"en":"Countries","ar":"الدول"},"question":{"en":"Which country has the largest population in the world?","ar":"أي دولة لديها أكبر تعداد سكاني في العالم؟"},"answer":{"en":"India","ar":"الهند"}},
  {"id":"geography-040","difficulty":"easy","subcategory":{"en":"Capitals","ar":"العواصم"},"question":{"en":"What is the capital of Germany?","ar":"ما عاصمة ألمانيا؟"},"answer":{"en":"Berlin","ar":"برلين"}},
  {"id":"geography-041","difficulty":"easy","subcategory":{"en":"Rivers","ar":"الأنهار"},"question":{"en":"What is the longest river in South America?","ar":"ما أطول نهر في أمريكا الجنوبية؟"},"answer":{"en":"The Amazon River","ar":"نهر الأمازون"}},
  {"id":"geography-042","difficulty":"easy","subcategory":{"en":"Deserts","ar":"الصحاري"},"question":{"en":"What is the largest hot desert in the world?","ar":"ما أكبر صحراء حارة في العالم؟"},"answer":{"en":"The Sahara Desert","ar":"الصحراء الكبرى"}},
  {"id":"geography-043","difficulty":"easy","subcategory":{"en":"Capitals","ar":"العواصم"},"question":{"en":"What is the capital of Saudi Arabia?","ar":"ما عاصمة المملكة العربية السعودية؟"},"answer":{"en":"Riyadh","ar":"الرياض"}},
  {"id":"geography-044","difficulty":"easy","subcategory":{"en":"Continents","ar":"القارات"},"question":{"en":"Which continent has the most countries?","ar":"أي قارة تضم أكبر عدد من الدول؟"},"answer":{"en":"Africa","ar":"أفريقيا"}},
  {"id":"geography-045","difficulty":"easy","subcategory":{"en":"Mountains","ar":"الجبال"},"question":{"en":"What is the tallest mountain in the world?","ar":"ما أعلى جبل في العالم؟"},"answer":{"en":"Mount Everest","ar":"جبل إيفرست"}},

  {"id":"geography-046","difficulty":"medium","subcategory":{"en":"Lakes","ar":"البحيرات"},"question":{"en":"What is the deepest lake in the world?","ar":"ما أعمق بحيرة في العالم؟"},"answer":{"en":"Lake Baikal","ar":"بحيرة بايكال"}},
  {"id":"geography-047","difficulty":"medium","subcategory":{"en":"Countries","ar":"الدول"},"question":{"en":"Which country has the most natural lakes?","ar":"أي دولة تمتلك أكبر عدد من البحيرات الطبيعية؟"},"answer":{"en":"Canada","ar":"كندا"}},
  {"id":"geography-048","difficulty":"medium","subcategory":{"en":"Mountains","ar":"الجبال"},"question":{"en":"What is the highest mountain in Africa?","ar":"ما أعلى جبل في أفريقيا؟"},"answer":{"en":"Mount Kilimanjaro","ar":"جبل كليمنجارو"}},
  {"id":"geography-049","difficulty":"medium","subcategory":{"en":"Capitals","ar":"العواصم"},"question":{"en":"What is the capital of New Zealand?","ar":"ما عاصمة نيوزيلندا؟"},"answer":{"en":"Wellington","ar":"ولينغتون"}},
  {"id":"geography-050","difficulty":"medium","subcategory":{"en":"Seas","ar":"البحار"},"question":{"en":"What is the saltiest body of water in the world?","ar":"ما أشد مسطح مائي ملوحةً في العالم؟"},"answer":{"en":"The Dead Sea","ar":"البحر الميت"}},
  {"id":"geography-051","difficulty":"medium","subcategory":{"en":"Capitals","ar":"العواصم"},"question":{"en":"What is the capital of Argentina?","ar":"ما عاصمة الأرجنتين؟"},"answer":{"en":"Buenos Aires","ar":"بوينس آيرس"}},
  {"id":"geography-052","difficulty":"medium","subcategory":{"en":"Capitals","ar":"العواصم"},"question":{"en":"What is the capital of South Korea?","ar":"ما عاصمة كوريا الجنوبية؟"},"answer":{"en":"Seoul","ar":"سيول"}},
  {"id":"geography-053","difficulty":"medium","subcategory":{"en":"Capitals","ar":"العواصم"},"question":{"en":"What is the capital of Nigeria?","ar":"ما عاصمة نيجيريا؟"},"answer":{"en":"Abuja","ar":"أبوجا"}},
  {"id":"geography-054","difficulty":"medium","subcategory":{"en":"Capitals","ar":"العواصم"},"question":{"en":"What is the capital of Turkey?","ar":"ما عاصمة تركيا؟"},"answer":{"en":"Ankara","ar":"أنقرة"}},
  {"id":"geography-055","difficulty":"medium","subcategory":{"en":"Oceans","ar":"المحيطات"},"question":{"en":"Which ocean borders Africa on the east?","ar":"أي محيط يحدّ أفريقيا من الشرق؟"},"answer":{"en":"The Indian Ocean","ar":"المحيط الهندي"}},
  {"id":"geography-056","difficulty":"medium","subcategory":{"en":"Capitals","ar":"العواصم"},"question":{"en":"What is the capital of Mexico?","ar":"ما عاصمة المكسيك؟"},"answer":{"en":"Mexico City","ar":"مكسيكو سيتي"}},
  {"id":"geography-057","difficulty":"medium","subcategory":{"en":"Countries","ar":"الدول"},"question":{"en":"Which country is made up entirely of islands?","ar":"أي دولة تتكوّن بالكامل من جزر؟"},"answer":{"en":"Japan","ar":"اليابان"}},
  {"id":"geography-058","difficulty":"medium","subcategory":{"en":"Rivers","ar":"الأنهار"},"question":{"en":"Which river is the longest in Europe?","ar":"أي نهر هو الأطول في أوروبا؟"},"answer":{"en":"The Volga River","ar":"نهر الفولغا"}},
  {"id":"geography-059","difficulty":"medium","subcategory":{"en":"Mountains","ar":"الجبال"},"question":{"en":"What is the highest mountain in Europe (excluding Caucasus)?","ar":"ما أعلى جبل في أوروبا (باستثناء القوقاز)؟"},"answer":{"en":"Mont Blanc","ar":"مونت بلان"}},
  {"id":"geography-060","difficulty":"medium","subcategory":{"en":"Capitals","ar":"العواصم"},"question":{"en":"What is the capital of Egypt?","ar":"ما عاصمة مصر؟"},"answer":{"en":"Cairo","ar":"القاهرة"}},

  {"id":"geography-061","difficulty":"hard","subcategory":{"en":"Capitals","ar":"العواصم"},"question":{"en":"What is the capital of Myanmar?","ar":"ما عاصمة ميانمار؟"},"answer":{"en":"Naypyidaw","ar":"نيبيداو"}},
  {"id":"geography-062","difficulty":"hard","subcategory":{"en":"Straits","ar":"المضائق"},"question":{"en":"What strait separates Africa from Europe?","ar":"ما المضيق الذي يفصل أفريقيا عن أوروبا؟"},"answer":{"en":"The Strait of Gibraltar","ar":"مضيق جبل طارق"}},
  {"id":"geography-063","difficulty":"hard","subcategory":{"en":"Capitals","ar":"العواصم"},"question":{"en":"What is the capital of Kazakhstan?","ar":"ما عاصمة كازاخستان؟"},"answer":{"en":"Astana","ar":"أستانا"}},
  {"id":"geography-064","difficulty":"hard","subcategory":{"en":"Countries","ar":"الدول"},"question":{"en":"Which African country has more ancient pyramids than Egypt?","ar":"أي دولة أفريقية تمتلك عدداً من الأهرامات القديمة يفوق مصر؟"},"answer":{"en":"Sudan","ar":"السودان"}},
  {"id":"geography-065","difficulty":"hard","subcategory":{"en":"Trenches","ar":"الأخاديد"},"question":{"en":"What is the name of the deepest point on Earth?","ar":"ما اسم أعمق نقطة على الأرض؟"},"answer":{"en":"Challenger Deep","ar":"تشالنجر ديب"}},
  {"id":"geography-066","difficulty":"hard","subcategory":{"en":"Countries","ar":"الدول"},"question":{"en":"Which country has the most time zones?","ar":"أي دولة تمتلك أكبر عدد من المناطق الزمنية؟"},"answer":{"en":"France","ar":"فرنسا"}},
  {"id":"geography-067","difficulty":"hard","subcategory":{"en":"Mountains","ar":"الجبال"},"question":{"en":"What is the world's longest mountain range?","ar":"ما أطول سلسلة جبلية في العالم؟"},"answer":{"en":"The Andes","ar":"جبال الأنديز"}},
  {"id":"geography-068","difficulty":"hard","subcategory":{"en":"Capitals","ar":"العواصم"},"question":{"en":"What is the capital of Bhutan?","ar":"ما عاصمة بوتان؟"},"answer":{"en":"Thimphu","ar":"تيمفو"}},
  {"id":"geography-069","difficulty":"hard","subcategory":{"en":"Countries","ar":"الدول"},"question":{"en":"Which country is known as the Land of a Thousand Lakes?","ar":"أي دولة تُعرف ببلد الألف بحيرة؟"},"answer":{"en":"Finland","ar":"فنلندا"}},
  {"id":"geography-070","difficulty":"hard","subcategory":{"en":"Rivers","ar":"الأنهار"},"question":{"en":"Which river forms the border between the USA and Mexico?","ar":"أي نهر يشكّل الحدود بين الولايات المتحدة والمكسيك؟"},"answer":{"en":"The Rio Grande","ar":"نهر ريو غراندي"}},
  {"id":"geography-071","difficulty":"hard","subcategory":{"en":"Capitals","ar":"العواصم"},"question":{"en":"What is the capital of Eritrea?","ar":"ما عاصمة إريتريا؟"},"answer":{"en":"Asmara","ar":"أسمرة"}},
  {"id":"geography-072","difficulty":"hard","subcategory":{"en":"Capitals","ar":"العواصم"},"question":{"en":"What is the capital of Laos?","ar":"ما عاصمة لاوس؟"},"answer":{"en":"Vientiane","ar":"فيينتيان"}},
  {"id":"geography-073","difficulty":"hard","subcategory":{"en":"Countries","ar":"الدول"},"question":{"en":"Which is the only country in the world to border both the Atlantic and Indian Oceans?","ar":"ما الدولة الوحيدة في العالم التي تطلّ على المحيطين الأطلسي والهندي؟"},"answer":{"en":"South Africa","ar":"جنوب أفريقيا"}},
  {"id":"geography-074","difficulty":"hard","subcategory":{"en":"Seas","ar":"البحار"},"question":{"en":"What sea lies between Italy and the Balkans?","ar":"أي بحر يقع بين إيطاليا وشبه جزيرة البلقان؟"},"answer":{"en":"The Adriatic Sea","ar":"بحر الأدرياتيك"}},
  {"id":"geography-075","difficulty":"hard","subcategory":{"en":"Deserts","ar":"الصحاري"},"question":{"en":"In which countries is the Gobi Desert located?","ar":"في أي دولتين تقع صحراء الغوبي؟"},"answer":{"en":"China and Mongolia","ar":"الصين ومنغوليا"}},

  {"id":"geography-076","difficulty":"very-advanced","subcategory":{"en":"Capitals","ar":"العواصم"},"question":{"en":"What is the world's northernmost national capital?","ar":"ما أبعد عاصمة وطنية نحو الشمال في العالم؟"},"answer":{"en":"Reykjavik, Iceland","ar":"ريكيافيك، آيسلندا"}},
  {"id":"geography-077","difficulty":"very-advanced","subcategory":{"en":"Borders","ar":"الحدود"},"question":{"en":"What is the world's longest international land border?","ar":"ما أطول حدود برية دولية في العالم؟"},"answer":{"en":"USA–Canada border","ar":"الحدود الأمريكية الكندية"}},
  {"id":"geography-078","difficulty":"very-advanced","subcategory":{"en":"Straits","ar":"المضائق"},"question":{"en":"What strait connects the Black Sea to the Sea of Marmara?","ar":"ما المضيق الذي يصل البحر الأسود ببحر مرمرة؟"},"answer":{"en":"The Bosphorus","ar":"مضيق البوسفور"}},
  {"id":"geography-079","difficulty":"very-advanced","subcategory":{"en":"Countries","ar":"الدول"},"question":{"en":"Which country is entirely surrounded by Italy?","ar":"أي دولة تحيط بها إيطاليا من جميع الجهات؟"},"answer":{"en":"San Marino","ar":"سان مارينو"}},
  {"id":"geography-080","difficulty":"very-advanced","subcategory":{"en":"Oceans","ar":"المحيطات"},"question":{"en":"Which ocean current moderates the climate of Western Europe?","ar":"أي تيار محيطي يلطّف مناخ غرب أوروبا؟"},"answer":{"en":"The Gulf Stream","ar":"تيار الخليج"}},
  {"id":"geography-081","difficulty":"very-advanced","subcategory":{"en":"Landforms","ar":"التضاريس"},"question":{"en":"What is the geographic term for land surrounded by water on three sides?","ar":"ما المصطلح الجغرافي للأرض المحاطة بالماء من ثلاثة جهات؟"},"answer":{"en":"Peninsula","ar":"شبه جزيرة"}},
  {"id":"geography-082","difficulty":"very-advanced","subcategory":{"en":"Borders","ar":"الحدود"},"question":{"en":"How many countries share a border with China?","ar":"كم دولة تشترك في حدود برية مع الصين؟"},"answer":{"en":"14 countries","ar":"14 دولة"}},
  {"id":"geography-083","difficulty":"very-advanced","subcategory":{"en":"Reefs","ar":"الشعاب المرجانية"},"question":{"en":"What is the world's largest coral reef system?","ar":"ما أكبر نظام شعاب مرجانية في العالم؟"},"answer":{"en":"The Great Barrier Reef","ar":"الحاجز المرجاني العظيم"}},
  {"id":"geography-084","difficulty":"very-advanced","subcategory":{"en":"Latitude","ar":"خطوط العرض"},"question":{"en":"What is the name of the line at 23.5° North latitude?","ar":"ما اسم الخط الواقع عند درجة 23.5 شمالاً؟"},"answer":{"en":"Tropic of Cancer","ar":"مدار السرطان"}},
  {"id":"geography-085","difficulty":"very-advanced","subcategory":{"en":"Landforms","ar":"التضاريس"},"question":{"en":"What is the name of the narrow strip of land connecting North and South America?","ar":"ما اسم شريط الأرض الضيق الذي يصل أمريكا الشمالية بالجنوبية؟"},"answer":{"en":"Isthmus of Panama","ar":"برزخ بنما"}},
  {"id":"geography-086","difficulty":"very-advanced","subcategory":{"en":"Capitals","ar":"العواصم"},"question":{"en":"What is the capital of the Maldives?","ar":"ما عاصمة جزر المالديف؟"},"answer":{"en":"Malé","ar":"ماليه"}},
  {"id":"geography-087","difficulty":"very-advanced","subcategory":{"en":"Countries","ar":"الدول"},"question":{"en":"Which African country was formerly known as Rhodesia?","ar":"أي دولة أفريقية كانت تُعرف سابقاً بروديسيا؟"},"answer":{"en":"Zimbabwe","ar":"زيمبابوي"}},
  {"id":"geography-088","difficulty":"very-advanced","subcategory":{"en":"Deltas","ar":"الدلتا"},"question":{"en":"What is the world's largest river delta?","ar":"ما أكبر دلتا نهرية في العالم؟"},"answer":{"en":"The Ganges–Brahmaputra Delta (Sundarbans)","ar":"دلتا الغانج-براهمابوترا (سوندربانز)"}},
  {"id":"geography-089","difficulty":"very-advanced","subcategory":{"en":"Countries","ar":"الدول"},"question":{"en":"Which country has the highest average elevation above sea level?","ar":"أي دولة تمتلك أعلى ارتفاع متوسط فوق مستوى البحر؟"},"answer":{"en":"Bhutan","ar":"بوتان"}},
  {"id":"geography-090","difficulty":"very-advanced","subcategory":{"en":"Seas","ar":"البحار"},"question":{"en":"What is the name of the sea between mainland Australia and the Great Barrier Reef?","ar":"ما اسم البحر الواقع بين البر الرئيسي لأستراليا والحاجز المرجاني العظيم؟"},"answer":{"en":"The Coral Sea","ar":"بحر الكورال"}},
  {"id":"geography-091","difficulty":"very-advanced","subcategory":{"en":"Countries","ar":"الدول"},"question":{"en":"Which country has the most UNESCO World Heritage Sites?","ar":"أي دولة تمتلك أكبر عدد من مواقع التراث العالمي لليونسكو؟"},"answer":{"en":"Italy","ar":"إيطاليا"}},
  {"id":"geography-092","difficulty":"very-advanced","subcategory":{"en":"Trenches","ar":"الأخاديد"},"question":{"en":"Approximately how deep is the Mariana Trench?","ar":"ما العمق التقريبي لخندق ماريانا؟"},"answer":{"en":"About 11,000 metres (36,000 feet)","ar":"حوالي 11,000 متر"}},
  {"id":"geography-093","difficulty":"very-advanced","subcategory":{"en":"Mountains","ar":"الجبال"},"question":{"en":"In which country is Mount Olympus located?","ar":"في أي دولة يقع جبل أوليمبوس؟"},"answer":{"en":"Greece","ar":"اليونان"}},
  {"id":"geography-094","difficulty":"very-advanced","subcategory":{"en":"Capitals","ar":"العواصم"},"question":{"en":"What is the capital of Burkina Faso?","ar":"ما عاصمة بوركينا فاسو؟"},"answer":{"en":"Ouagadougou","ar":"واغادوغو"}},
  {"id":"geography-095","difficulty":"very-advanced","subcategory":{"en":"Seas","ar":"البحار"},"question":{"en":"The Caspian Sea is bordered by how many countries?","ar":"كم دولة تحدّ بحر قزوين؟"},"answer":{"en":"Five (Russia, Kazakhstan, Turkmenistan, Iran, Azerbaijan)","ar":"خمس دول (روسيا، كازاخستان، تركمانستان، إيران، أذربيجان)"}},
  {"id":"geography-096","difficulty":"very-advanced","subcategory":{"en":"Countries","ar":"الدول"},"question":{"en":"What is the official name of the country commonly called Cape Verde?","ar":"ما الاسم الرسمي للدولة المعروفة بالرأس الأخضر؟"},"answer":{"en":"Cabo Verde","ar":"كابو فيردي"}},
  {"id":"geography-097","difficulty":"very-advanced","subcategory":{"en":"Rivers","ar":"الأنهار"},"question":{"en":"Which river flows through the most countries?","ar":"أي نهر يجري عبر أكبر عدد من الدول؟"},"answer":{"en":"The Danube (10 countries)","ar":"نهر الدانوب (10 دول)"}},
  {"id":"geography-098","difficulty":"very-advanced","subcategory":{"en":"Latitude","ar":"خطوط العرض"},"question":{"en":"Which line of latitude marks the boundary of the Arctic Circle?","ar":"أي خط عرض يحدّد حدود الدائرة القطبية الشمالية؟"},"answer":{"en":"66.5° North","ar":"66.5 درجة شمالاً"}},
  {"id":"geography-099","difficulty":"very-advanced","subcategory":{"en":"Countries","ar":"الدول"},"question":{"en":"Which country has no rivers?","ar":"أي دولة لا تمر بها أنهار؟"},"answer":{"en":"Saudi Arabia","ar":"المملكة العربية السعودية"}},
  {"id":"geography-100","difficulty":"very-advanced","subcategory":{"en":"Capitals","ar":"العواصم"},"question":{"en":"What is the capital of Kyrgyzstan?","ar":"ما عاصمة قيرغيزستان؟"},"answer":{"en":"Bishkek","ar":"بيشكيك"}},
]

update('geography', geo)
print("Batch 1 complete.")
