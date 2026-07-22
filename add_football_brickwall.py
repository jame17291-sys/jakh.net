import json

new_cards = [
  {
    "id": "football-bw-001",
    "difficulty": "very-advanced",
    "subcategory": {"en": "History & Records", "ar": "التاريخ والأرقام القياسية"},
    "question": {
      "en": "Who is the only player to have won the UEFA Champions League with three different clubs?",
      "ar": "من هو اللاعب الوحيد الذي فاز بدوري أبطال أوروبا مع ثلاثة أندية مختلفة؟"
    },
    "answer": {
      "en": "Clarence Seedorf (Ajax, Real Madrid, AC Milan)",
      "ar": "كلارنس سيدورف (أياكس، ريال مدريد، ميلان)"
    }
  },
  {
    "id": "football-bw-002",
    "difficulty": "very-advanced",
    "subcategory": {"en": "History & Records", "ar": "التاريخ والأرقام القياسية"},
    "question": {
      "en": "Which national team holds the record for the most consecutive unbeaten international matches?",
      "ar": "أي منتخب وطني يحمل الرقم القياسي لأكثر عدد من المباريات الدولية المتتالية دون هزيمة؟"
    },
    "answer": {
      "en": "Italy (37 games, 2018–2021)",
      "ar": "إيطاليا (37 مباراة، 2018-2021)"
    }
  },
  {
    "id": "football-bw-003",
    "difficulty": "very-advanced",
    "subcategory": {"en": "World Cup Trivia", "ar": "معلومات كأس العالم"},
    "question": {
      "en": "Who is the oldest player ever to score in a FIFA World Cup?",
      "ar": "من هو أكبر لاعب سناً يسجل في تاريخ كأس العالم؟"
    },
    "answer": {
      "en": "Roger Milla (42 years, 39 days in 1994)",
      "ar": "روجيه ميلا (42 عاماً و39 يوماً في 1994)"
    }
  },
  {
    "id": "football-bw-004",
    "difficulty": "very-advanced",
    "subcategory": {"en": "History & Records", "ar": "التاريخ والأرقام القياسية"},
    "question": {
      "en": "Which player scored five goals in nine minutes for Bayern Munich against Wolfsburg in 2015?",
      "ar": "من هو اللاعب الذي سجل خمسة أهداف في تسع دقائق لصالح بايرن ميونخ ضد فولفسبورغ عام 2015؟"
    },
    "answer": {
      "en": "Robert Lewandowski",
      "ar": "روبرت ليفاندوفسكي"
    }
  },
  {
    "id": "football-bw-005",
    "difficulty": "very-advanced",
    "subcategory": {"en": "World Cup Trivia", "ar": "معلومات كأس العالم"},
    "question": {
      "en": "Which player holds the record for the most goals scored in a single World Cup tournament?",
      "ar": "من هو اللاعب الذي يحمل الرقم القياسي لأكبر عدد من الأهداف في بطولة كأس عالم واحدة؟"
    },
    "answer": {
      "en": "Just Fontaine (13 goals in 1958)",
      "ar": "جاست فونتين (13 هدفاً في 1958)"
    }
  },
  {
    "id": "football-bw-006",
    "difficulty": "very-advanced",
    "subcategory": {"en": "History & Records", "ar": "التاريخ والأرقام القياسية"},
    "question": {
      "en": "Who was the first goalkeeper in history to win the Ballon d'Or?",
      "ar": "من هو أول حارس مرمى في التاريخ يفوز بجائزة الكرة الذهبية؟"
    },
    "answer": {
      "en": "Lev Yashin (1963)",
      "ar": "ليف ياشين (1963)"
    }
  },
  {
    "id": "football-bw-007",
    "difficulty": "very-advanced",
    "subcategory": {"en": "European Clubs", "ar": "الأندية الأوروبية"},
    "question": {
      "en": "Which club holds the record for the longest unbeaten run in European domestic league history (104 games)?",
      "ar": "أي نادٍ يحمل الرقم القياسي لأطول سلسلة لا هزيمة في تاريخ الدوريات المحلية الأوروبية (104 مباريات)؟"
    },
    "answer": {
      "en": "Steaua București (1986–1989)",
      "ar": "ستيوا بوخارست (1986-1989)"
    }
  },
  {
    "id": "football-bw-008",
    "difficulty": "very-advanced",
    "subcategory": {"en": "Players & Awards", "ar": "اللاعبون والجوائز"},
    "question": {
      "en": "Who is the only defender to win the Ballon d'Or in the 21st century?",
      "ar": "من هو المدافع الوحيد الذي فاز بالكرة الذهبية في القرن الحادي والعشرين؟"
    },
    "answer": {
      "en": "Fabio Cannavaro (2006)",
      "ar": "فابيو كانافارو (2006)"
    }
  },
  {
    "id": "football-bw-009",
    "difficulty": "very-advanced",
    "subcategory": {"en": "World Cup Trivia", "ar": "معلومات كأس العالم"},
    "question": {
      "en": "Which country has appeared in the most World Cup finals without ever winning the tournament?",
      "ar": "أي دولة ظهرت في أكبر عدد من نهائيات كأس العالم دون أن تفوز بالبطولة؟"
    },
    "answer": {
      "en": "Netherlands (3 finals: 1974, 1978, 2010)",
      "ar": "هولندا (3 نهائيات: 1974، 1978، 2010)"
    }
  },
  {
    "id": "football-bw-010",
    "difficulty": "very-advanced",
    "subcategory": {"en": "English Premier League", "ar": "الدوري الإنجليزي الممتاز"},
    "question": {
      "en": "Who scored the fastest hat-trick in Premier League history (2 minutes 56 seconds)?",
      "ar": "من سجل أسرع هاتريك في تاريخ الدوري الإنجليزي الممتاز (دقيقتين و 56 ثانية)؟"
    },
    "answer": {
      "en": "Sadio Mané (for Southampton vs Aston Villa, 2015)",
      "ar": "ساديو ماني (مع ساوثهامبتون ضد أستون فيلا، 2015)"
    }
  },
  {
    "id": "football-bw-011",
    "difficulty": "very-advanced",
    "subcategory": {"en": "Players & Awards", "ar": "اللاعبون والجوائز"},
    "question": {
      "en": "Which player holds the record for most assists in UEFA Champions League history?",
      "ar": "أي لاعب يحمل الرقم القياسي لأكبر عدد من التمريرات الحاسمة في تاريخ دوري أبطال أوروبا؟"
    },
    "answer": {
      "en": "Cristiano Ronaldo",
      "ar": "كريستيانو رونالدو"
    }
  },
  {
    "id": "football-bw-012",
    "difficulty": "very-advanced",
    "subcategory": {"en": "World Cup Trivia", "ar": "معلومات كأس العالم"},
    "question": {
      "en": "What was the name of the dog that famously found the stolen Jules Rimet Trophy in 1966?",
      "ar": "ما كان اسم الكلب الذي اشتهر بالعثور على كأس جول ريميه المسروق عام 1966؟"
    },
    "answer": {
      "en": "Pickles",
      "ar": "بيكلز (Pickles)"
    }
  },
  {
    "id": "football-bw-013",
    "difficulty": "very-advanced",
    "subcategory": {"en": "History & Records", "ar": "التاريخ والأرقام القياسية"},
    "question": {
      "en": "Who is the all-time top goalscorer in the history of the FIFA Women's World Cup?",
      "ar": "من هي الهدافة التاريخية في تاريخ كأس العالم للسيدات؟"
    },
    "answer": {
      "en": "Marta (Brazil, 17 goals)",
      "ar": "مارتا (البرازيل، 17 هدفاً)"
    }
  },
  {
    "id": "football-bw-014",
    "difficulty": "very-advanced",
    "subcategory": {"en": "History & Records", "ar": "التاريخ والأرقام القياسية"},
    "question": {
      "en": "Which manager has won the most UEFA Champions League titles?",
      "ar": "أي مدرب فاز بأكبر عدد من ألقاب دوري أبطال أوروبا؟"
    },
    "answer": {
      "en": "Carlo Ancelotti",
      "ar": "كارلو أنشيلوتي"
    }
  },
  {
    "id": "football-bw-015",
    "difficulty": "very-advanced",
    "subcategory": {"en": "European Clubs", "ar": "الأندية الأوروبية"},
    "question": {
      "en": "Which club is known as \"The Old Lady\" (La Vecchia Signora)?",
      "ar": "أي نادٍ يُعرف بلقب \"السيدة العجوز\"؟"
    },
    "answer": {
      "en": "Juventus",
      "ar": "يوفنتوس"
    }
  },
  {
    "id": "football-bw-016",
    "difficulty": "very-advanced",
    "subcategory": {"en": "History & Records", "ar": "التاريخ والأرقام القياسية"},
    "question": {
      "en": "Which player scored the \"Goal of the Century\" against England in the 1986 World Cup?",
      "ar": "من هو اللاعب الذي سجل \"هدف القرن\" ضد إنجلترا في كأس العالم 1986؟"
    },
    "answer": {
      "en": "Diego Maradona",
      "ar": "دييغو مارادونا"
    }
  },
  {
    "id": "football-bw-017",
    "difficulty": "very-advanced",
    "subcategory": {"en": "English Premier League", "ar": "الدوري الإنجليزي الممتاز"},
    "question": {
      "en": "Which team achieved the lowest points total in a single Premier League season (11 points)?",
      "ar": "أي فريق حقق أدنى إجمالي نقاط في موسم واحد بالدوري الإنجليزي الممتاز (11 نقطة)؟"
    },
    "answer": {
      "en": "Derby County (2007-08)",
      "ar": "ديربي كاونتي (2007-2008)"
    }
  },
  {
    "id": "football-bw-018",
    "difficulty": "very-advanced",
    "subcategory": {"en": "History & Records", "ar": "التاريخ والأرقام القياسية"},
    "question": {
      "en": "Who is the highest goalscorer in the history of international men's football?",
      "ar": "من هو الهداف التاريخي في تاريخ كرة القدم الدولية للرجال؟"
    },
    "answer": {
      "en": "Cristiano Ronaldo",
      "ar": "كريستيانو رونالدو"
    }
  },
  {
    "id": "football-bw-019",
    "difficulty": "very-advanced",
    "subcategory": {"en": "Players & Awards", "ar": "اللاعبون والجوائز"},
    "question": {
      "en": "Who was the first African player to win the Ballon d'Or?",
      "ar": "من هو أول لاعب أفريقي يفوز بالكرة الذهبية؟"
    },
    "answer": {
      "en": "George Weah (1995)",
      "ar": "جورج ويا (1995)"
    }
  },
  {
    "id": "football-bw-020",
    "difficulty": "very-advanced",
    "subcategory": {"en": "World Cup Trivia", "ar": "معلومات كأس العالم"},
    "question": {
      "en": "Which player is the only one to score a hat-trick in a World Cup final and still end up on the losing team?",
      "ar": "من هو اللاعب الوحيد الذي سجل ثلاثية (هاتريك) في نهائي كأس العالم وكان في الفريق الخاسر؟"
    },
    "answer": {
      "en": "Kylian Mbappé (2022)",
      "ar": "كيليان مبابي (2022)"
    }
  },
  {
    "id": "football-bw-021",
    "difficulty": "very-advanced",
    "subcategory": {"en": "History & Records", "ar": "التاريخ والأرقام القياسية"},
    "question": {
      "en": "What is the highest-scoring game in World Cup history (12 goals)?",
      "ar": "ما هي المباراة ذات أعلى عدد أهداف في تاريخ كأس العالم (12 هدفاً)؟"
    },
    "answer": {
      "en": "Austria 7-5 Switzerland (1954)",
      "ar": "النمسا 7-5 سويسرا (1954)"
    }
  },
  {
    "id": "football-bw-022",
    "difficulty": "very-advanced",
    "subcategory": {"en": "History & Records", "ar": "التاريخ والأرقام القياسية"},
    "question": {
      "en": "Which club won the first ever European Cup (now Champions League) in 1956?",
      "ar": "أي نادٍ فاز بأول كأس أوروبية (دوري أبطال أوروبا حالياً) في عام 1956؟"
    },
    "answer": {
      "en": "Real Madrid",
      "ar": "ريال مدريد"
    }
  },
  {
    "id": "football-bw-023",
    "difficulty": "very-advanced",
    "subcategory": {"en": "History & Records", "ar": "التاريخ والأرقام القياسية"},
    "question": {
      "en": "Who holds the record for most red cards in the history of La Liga?",
      "ar": "من يحمل الرقم القياسي لأكبر عدد من البطاقات الحمراء في تاريخ الدوري الإسباني؟"
    },
    "answer": {
      "en": "Sergio Ramos",
      "ar": "سيرجيو راموس"
    }
  },
  {
    "id": "football-bw-024",
    "difficulty": "very-advanced",
    "subcategory": {"en": "World Cup Trivia", "ar": "معلومات كأس العالم"},
    "question": {
      "en": "Who is the only man to win the World Cup as a player and twice as a manager?",
      "ar": "من هو الرجل الوحيد الذي فاز بكأس العالم كلاعب ومرتين كمدرب؟"
    },
    "answer": {
      "en": "Vittorio Pozzo (Manager of Italy 1934 & 1938, though not a player winner; Zagallo & Deschamps & Beckenbauer won as player and manager once. Correct trick: Mário Zagallo won twice as player, once as manager, once as assistant. Actually no one won TWICE as manager and ONCE as player. Mário Zagallo won 2 as player, 1 as manager, 1 as coordinator. The answer usually expected for \"player and manager\" is Zagallo, Beckenbauer, Deschamps. Let's fix this question.)",
      "ar": "تعديل"
    }
  },
  {
    "id": "football-bw-025",
    "difficulty": "very-advanced",
    "subcategory": {"en": "History & Records", "ar": "التاريخ والأرقام القياسية"},
    "question": {
      "en": "Who is the only goalkeeper to ever save a penalty in two different World Cup finals?",
      "ar": "من هو حارس المرمى الوحيد الذي تصدى لركلة جزاء في مباراتين نهائيتين مختلفتين لكأس العالم؟"
    },
    "answer": {
      "en": "No goalkeeper has saved a penalty in two different finals. Let's ask: Who scored the panenka penalty in the 2006 World Cup Final?",
      "ar": "زين الدين زيدان"
    }
  }
]

# Fix the last two questions programmatically to avoid complex text in python array
new_cards[23]["question"]["en"] = "Who are the only three men to have won the FIFA World Cup as both a player and a manager?"
new_cards[23]["question"]["ar"] = "من هم الرجال الثلاثة الوحيدون الذين فازوا بكأس العالم كلاعبين ومدربين؟"
new_cards[23]["answer"]["en"] = "Mário Zagallo, Franz Beckenbauer, and Didier Deschamps"
new_cards[23]["answer"]["ar"] = "ماريو زاجالو، فرانز بيكنباور، وديدييه ديشان"

new_cards[24]["question"]["en"] = "Which player won three World Cups (1958, 1962, 1970)?"
new_cards[24]["question"]["ar"] = "أي لاعب فاز بثلاث بطولات كأس عالم (1958، 1962، 1970)؟"
new_cards[24]["answer"]["en"] = "Pelé"
new_cards[24]["answer"]["ar"] = "بيليه"

# Load existing football data
with open('site/data/football.json', 'r') as f:
    data = json.load(f)

# Ensure 'cards' key exists and is an array
cards = data.get('cards', data) if isinstance(data, dict) else data

# Append new cards
cards.extend(new_cards)

# Update structure if it's a dict
if isinstance(data, dict):
    data['cards'] = cards
    # Update count
    data['count'] = len(cards)
    
    # Recalculate difficulty counts
    diffs = {}
    for c in cards:
        diff = c.get('difficulty', 'MISSING')
        diffs[diff] = diffs.get(diff, 0) + 1
    
    data['difficultyCounts'] = {
        'easy': diffs.get('easy', 0),
        'medium': diffs.get('medium', 0),
        'hard': diffs.get('hard', 0),
        'very-advanced': diffs.get('very-advanced', 0)
    }
else:
    data = cards

# Save updated football.json
with open('site/data/football.json', 'w') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

# Update catalog.json
with open('site/data/catalog.json', 'r') as f:
    catalog = json.load(f)

for cat in catalog['categories']:
    if cat['slug'] == 'football':
        cat['count'] = len(cards)
        
        diffs = {}
        for c in cards:
            diff = c.get('difficulty', 'MISSING')
            diffs[diff] = diffs.get(diff, 0) + 1
            
        cat['difficultyCounts'] = {
            'easy': diffs.get('easy', 0),
            'medium': diffs.get('medium', 0),
            'hard': diffs.get('hard', 0),
            'very-advanced': diffs.get('very-advanced', 0)
        }
        break

catalog['site']['totalQuestions'] += 25

with open('site/data/catalog.json', 'w') as f:
    json.dump(catalog, f, ensure_ascii=False, indent=2)

print("Successfully injected 25 Brick Wall questions into football.json and updated catalog.json!")
