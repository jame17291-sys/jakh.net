// Riddle Arabia’s bounded learning release. These are self-contained,
// authored activities, not projections from the legacy question corpus. The
// provenance is deliberately explicit: no human, educator, or specialist
// approval is implied by this file.

export const LEARNING_PROGRAM_VERSION = '2026-09-21.1';

const b = (en, ar) => ({ en, ar });
const choice = (en, ar) => b(en, ar);

function activity(id, stage, prompt, choices, correct, explanation) {
  return { id, stage, prompt, choices, correct, explanation };
}

function unit({ id, audience, pathway, title, objective, prerequisites, instruction, example, activities, summary }) {
  return {
    id,
    audience,
    pathway,
    title,
    objective,
    prerequisites,
    instruction,
    example,
    activities,
    summary,
    publication: {
      status: 'eligible-authored-learning-release',
      contentVersion: LEARNING_PROGRAM_VERSION,
      languages: ['en', 'ar'],
      ageBands: audience.startsWith('children-') ? [audience.slice('children-'.length)] : ['adult'],
      restrictions: audience.startsWith('children-') ? ['no-open-chat', 'no-stranger-matching'] : [],
    },
    provenance: {
      authoring: 'Riddle Arabia self-contained learning release',
      review: 'automated solution and bilingual consistency review; human editorial, educator, and participant validation pending',
      humanApproval: false,
    },
  };
}

const P = (id, prompt, choices, correct, explanation) => activity(id, 'practice', prompt, choices, correct, explanation);
const A = (id, prompt, choices, correct, explanation) => activity(id, 'application', prompt, choices, correct, explanation);
const R = (id, prompt, choices, correct, explanation) => activity(id, 'retrieval', prompt, choices, correct, explanation);

export const LEARNING_UNITS = [
  unit({
    id: 'uni-quant-ratios', audience: 'university', pathway: 'quantitative',
    title: b('Ratios and scale', 'النِّسَب والمقياس'), objective: b('Use a ratio to compare quantities and scale a result.', 'استخدم النسبة لمقارنة الكميات وتكبير النتيجة أو تصغيرها.'),
    prerequisites: b('Whole-number multiplication and division.', 'الضرب والقسمة بالأعداد الصحيحة.'),
    instruction: b('Keep the relationship the same: multiply or divide both parts by the same number.', 'حافظ على العلاقة نفسها: اضرب أو اقسم الطرفين بالعدد نفسه.'),
    example: b('A 2:3 paint mix becomes 4:6 when both parts are doubled.', 'خليط طلاء 2:3 يصبح 4:6 عند مضاعفة الطرفين.'),
    activities: [
      P('mix', b('A trail mix uses 2 cups of nuts for every 3 cups of fruit. With 6 cups of nuts, how much fruit keeps the ratio?', 'يستخدم خليط وجبات خفيفة كوبين من المكسرات لكل 3 أكواب من الفاكهة. مع 6 أكواب مكسرات، كم كوب فاكهة يحافظ على النسبة؟'), [choice('6 cups','6 أكواب'),choice('9 cups','9 أكواب'),choice('12 cups','12 كوباً'),choice('18 cups','18 كوباً')], 1, b('2 becomes 6 by multiplying by 3, so 3 also becomes 9.', 'تحول 2 إلى 6 بالضرب في 3، لذا تتحول 3 أيضاً إلى 9.')),
      P('unit', b('A map scale says 1 cm represents 4 km. What distance does 7 cm represent?', 'يقول مقياس الخريطة إن 1 سم يمثل 4 كم. ما المسافة التي يمثلها 7 سم؟'), [choice('11 km','11 كم'),choice('21 km','21 كم'),choice('28 km','28 كم'),choice('32 km','32 كم')], 2, b('Multiply the map length by the scale: 7 × 4 = 28.', 'اضرب طول الخريطة في المقياس: 7 × 4 = 28.')),
      A('recipe', b('A recipe for 4 people needs 300 g of rice. You are cooking for 6 people. What amount keeps the portions equal?', 'تحتاج وصفة لأربعة أشخاص إلى 300 غ من الأرز. ستطبخ لستة أشخاص. ما الكمية التي تحافظ على الحصص نفسها؟'), [choice('350 g','350 غ'),choice('400 g','400 غ'),choice('450 g','450 غ'),choice('600 g','600 غ')], 2, b('Six is 1.5 times four, so use 300 × 1.5 = 450 g.', 'العدد 6 يساوي 1.5 من 4، لذا نستخدم 300 × 1.5 = 450 غ.')),
      R('retrieve', b('If 5 tickets cost 40, what is the cost of 8 tickets at the same price per ticket?', 'إذا كانت 5 تذاكر تكلف 40، فما تكلفة 8 تذاكر بالسعر نفسه للتذكرة؟'), [choice('56','56'),choice('64','64'),choice('72','72'),choice('80','80')], 1, b('One ticket costs 8; 8 tickets cost 64.', 'تكلفة التذكرة الواحدة 8؛ تكلفة 8 تذاكر هي 64.')),
    ], summary: b('You kept a relationship constant instead of adding a fixed amount.', 'حافظت على علاقة ثابتة بدلاً من إضافة مقدار ثابت.')
  }),
  unit({
    id: 'uni-quant-averages', audience: 'university', pathway: 'quantitative',
    title: b('Averages and spread', 'المتوسطات والتشتّت'), objective: b('Compute a mean and notice when a single value can mislead it.', 'احسب المتوسط ولاحظ متى يمكن لقيمة واحدة أن تضلله.'),
    prerequisites: b('Addition and division.', 'الجمع والقسمة.'), instruction: b('The mean is the total divided by the number of values. Check the individual values before interpreting it.', 'المتوسط هو المجموع مقسوماً على عدد القيم. افحص القيم الفردية قبل تفسيره.'), example: b('For 2, 4, and 6, the mean is 12 ÷ 3 = 4.', 'للقيم 2 و4 و6، المتوسط هو 12 ÷ 3 = 4.'),
    activities: [
      P('mean', b('What is the mean of 4, 6, and 8?', 'ما متوسط 4 و6 و8؟'), [choice('5','5'),choice('6','6'),choice('7','7'),choice('18','18')], 1, b('The total is 18 and there are 3 values, so 18 ÷ 3 = 6.', 'المجموع 18 وهناك 3 قيم، إذن 18 ÷ 3 = 6.')),
      P('outlier', b('Which set has a mean that is most affected by an outlier?', 'أي مجموعة يتأثر متوسطها أكثر بقيمة شاذة؟'), [choice('8, 9, 10','8، 9، 10'),choice('8, 9, 100','8، 9، 100'),choice('8, 9, 10, 11','8، 9، 10، 11'),choice('9, 9, 9','9، 9، 9')], 1, b('100 is far from the other two values, so it pulls the mean upward.', 'القيمة 100 بعيدة جداً عن القيمتين الأخريين، فتسحب المتوسط إلى الأعلى.')),
      A('median', b('Daily steps were 4,000; 4,500; 5,000; 5,200; and 30,000. Which number better describes a typical day?', 'كانت الخطوات اليومية 4,000 و4,500 و5,000 و5,200 و30,000. أي رقم يصف يوماً نموذجياً بشكل أفضل؟'), [choice('4,000','4,000'),choice('5,000','5,000'),choice('9,740','9,740'),choice('30,000','30,000')], 1, b('The median is 5,000. The unusually high 30,000 makes the mean less typical here.', 'الوسيط هو 5,000. القيمة المرتفعة غير المعتادة 30,000 تجعل المتوسط أقل تمثيلاً هنا.')),
      R('retrieve', b('Four quiz scores total 32. What is their mean?', 'مجموع أربع درجات اختبار هو 32. ما متوسطها؟'), [choice('4','4'),choice('8','8'),choice('16','16'),choice('32','32')], 1, b('Divide the total by four: 32 ÷ 4 = 8.', 'اقسم المجموع على أربعة: 32 ÷ 4 = 8.')),
    ], summary: b('A mean summarizes a total; a typical value may need the median when one result is extreme.', 'يلخّص المتوسط المجموع؛ وقد تحتاج إلى الوسيط لقيمة نموذجية عندما تكون نتيجة واحدة متطرفة.')
  }),
  unit({
    id: 'uni-quant-probability', audience: 'university', pathway: 'quantitative',
    title: b('Probability and uncertainty', 'الاحتمال وعدم اليقين'), objective: b('Express simple chance as favourable outcomes over all equally likely outcomes.', 'عبّر عن الاحتمال البسيط بكون النتائج المواتية على جميع النتائج المتساوية الاحتمال.'),
    prerequisites: b('Fractions.', 'الكسور.'), instruction: b('List the possible outcomes first. A probability is not a promise about one trial.', 'اكتب النتائج الممكنة أولاً. الاحتمال ليس وعداً بنتيجة محاولة واحدة.'), example: b('A fair coin has one heads outcome out of two: 1/2.', 'لعملة عادلة نتيجة صورة واحدة من اثنتين: 1/2.'),
    activities: [
      P('die', b('For a fair six-sided die, what is the chance of rolling an even number?', 'في نرد عادل بستة أوجه، ما احتمال رمي عدد زوجي؟'), [choice('1/6','1/6'),choice('1/3','1/3'),choice('1/2','1/2'),choice('2/3','2/3')], 2, b('Even outcomes are 2, 4, and 6: three of six, which is 1/2.', 'النتائج الزوجية هي 2 و4 و6: ثلاث من ست، أي 1/2.')),
      P('impossible', b('A bag has only red and blue counters. What is the probability of drawing green?', 'يحتوي كيس على قطع حمراء وزرقاء فقط. ما احتمال سحب قطعة خضراء؟'), [choice('0','0'),choice('1/2','1/2'),choice('1','1'),choice('Unknown','غير معروف')], 0, b('Green is not a possible outcome in this stated bag, so its probability is zero.', 'الأخضر ليس نتيجة ممكنة في الكيس المذكور، لذا احتماله صفر.')),
      A('planning', b('A game has 3 winning cards and 9 non-winning cards. Which statement is justified before one draw?', 'تحتوي لعبة على 3 بطاقات رابحة و9 بطاقات غير رابحة. أي عبارة مبررة قبل سحب بطاقة واحدة؟'), [choice('You will lose.','ستخسر بالتأكيد.'),choice('You have a 1 in 4 chance to win.','لديك فرصة 1 من 4 للفوز.'),choice('You have a 3 in 9 chance to win.','لديك فرصة 3 من 9 للفوز.'),choice('Winning is impossible.','الفوز مستحيل.')], 1, b('There are 3 winners among 12 cards, so 3/12 = 1/4. It does not predict the single draw.', 'هناك 3 بطاقات رابحة من 12، لذا 3/12 = 1/4. لا يتنبأ ذلك بالسحبة الواحدة.')),
      R('retrieve', b('A spinner has 8 equal sections and 2 are stars. What is the chance of a star?', 'لدوّارة 8 أقسام متساوية وقسمان منها نجوم. ما احتمال النجمة؟'), [choice('1/8','1/8'),choice('1/4','1/4'),choice('1/2','1/2'),choice('2/3','2/3')], 1, b('Two favourable sections out of eight is 2/8 = 1/4.', 'قسمان مواتيان من ثمانية يساوي 2/8 = 1/4.')),
    ], summary: b('You separated the size of a chance from certainty about one result.', 'فصلت بين حجم الاحتمال واليقين بشأن نتيجة واحدة.')
  }),
  unit({
    id: 'uni-evidence-claims', audience: 'university', pathway: 'evidence',
    title: b('Claims and evidence', 'الادعاءات والأدلة'), objective: b('Tell a claim from the evidence that could support or challenge it.', 'ميّز بين الادعاء والدليل الذي يمكن أن يدعمه أو يتحداه.'), prerequisites: b('Careful reading.', 'قراءة متأنية.'), instruction: b('A claim says something is true. Evidence is information you can inspect to judge that claim.', 'الادعاء يقول إن شيئاً ما صحيح. الدليل معلومات يمكنك فحصها للحكم على الادعاء.'), example: b('“The library is busiest at noon” is a claim; hourly visitor counts are relevant evidence.', '«المكتبة تكون أكثر ازدحاماً عند الظهر» ادعاء؛ وعدد الزوار في كل ساعة دليل ذو صلة.'),
    activities: [
      P('label', b('Which is evidence for the claim “The plants grew faster near the window”?', 'أي مما يلي دليل على ادعاء «النباتات نمت أسرع قرب النافذة»؟'), [choice('Plants like sunlight.','النباتات تحب ضوء الشمس.'),choice('Height measurements for both groups over four weeks.','قياسات طول المجموعتين خلال أربعة أسابيع.'),choice('The window is clean.','النافذة نظيفة.'),choice('Someone prefers window seats.','شخص ما يفضّل الجلوس قرب النافذة.')], 1, b('Comparable measurements over time can test the growth claim.', 'القياسات القابلة للمقارنة عبر الزمن يمكن أن تختبر ادعاء النمو.')),
      P('relevance', b('A post says a study proves a new method works. What should you look for first?', 'يقول منشور إن دراسة تثبت نجاح طريقة جديدة. ما الذي ينبغي البحث عنه أولاً؟'), [choice('The post’s colours.','ألوان المنشور.'),choice('The study’s method and results.','منهج الدراسة ونتائجها.'),choice('The number of shares.','عدد المشاركات.'),choice('The author’s photo.','صورة الكاتب.')], 1, b('The method and results show what was actually tested and found.', 'يبين المنهج والنتائج ما الذي اختُبر فعلاً وما الذي وُجد.')),
      A('counter', b('A café says “Everyone prefers our new menu.” Which finding most directly challenges that claim?', 'يقول مقهى «الجميع يفضّل قائمتنا الجديدة». أي نتيجة تتحدى هذا الادعاء مباشرة؟'), [choice('The menu has 12 items.','القائمة فيها 12 صنفاً.'),choice('One customer says the chairs are comfortable.','زبون واحد يقول إن الكراسي مريحة.'),choice('A survey of customers includes many who prefer the old menu.','استبيان للزبائن يشمل كثيرين يفضلون القائمة القديمة.'),choice('The café opened at 8 a.m.','افتتح المقهى الساعة 8 صباحاً.')], 2, b('A credible group of customers preferring the old menu conflicts with “everyone.”', 'مجموعة موثوقة من الزبائن تفضّل القائمة القديمة تتعارض مع كلمة «الجميع».')),
      R('retrieve', b('A statement you can test with observations or records is called a…', 'العبارة التي يمكنك اختبارها بالملاحظات أو السجلات تسمى…'), [choice('claim','ادعاء'),choice('colour','لون'),choice('rumour only','إشاعة فقط'),choice('password','كلمة مرور')], 0, b('A claim is a statement that evidence may support, weaken, or leave unresolved.', 'الادعاء عبارة قد يدعمها الدليل أو يضعفها أو يتركها غير محسومة.')),
    ], summary: b('You asked what information could actually test a statement.', 'سألت عن المعلومة التي يمكن أن تختبر العبارة فعلاً.')
  }),
  unit({
    id: 'uni-evidence-causation', audience: 'university', pathway: 'evidence',
    title: b('Correlation is not causation', 'الارتباط ليس سببية'), objective: b('Recognize when two changing values do not by themselves show that one caused the other.', 'تعرّف متى لا يثبت تغير قيمتين وحده أن إحداهما سببت الأخرى.'), prerequisites: b('Claims and evidence.', 'الادعاءات والأدلة.'), instruction: b('Two things can move together because of a third factor, coincidence, or a reverse relationship.', 'يمكن أن يتحرك شيئان معاً بسبب عامل ثالث أو مصادفة أو علاقة عكسية.'), example: b('Ice-cream sales and sunburns can rise together because hot weather affects both.', 'قد ترتفع مبيعات المثلجات وحروق الشمس معاً لأن الطقس الحار يؤثر في كليهما.'),
    activities: [
      P('identify', b('A town finds more umbrellas are sold on days with more wet roads. What is a likely third factor?', 'وجدت بلدة أن مزيداً من المظلات يباع في الأيام التي تكون فيها الطرق أكثر بللاً. ما العامل الثالث المحتمل؟'), [choice('Rain','المطر'),choice('Road paint','طلاء الطريق'),choice('Music','الموسيقى'),choice('Homework','الواجبات')], 0, b('Rain can make roads wet and lead people to buy umbrellas.', 'المطر قد يبلل الطرق ويدفع الناس إلى شراء المظلات.')),
      P('wording', b('Which conclusion is most careful after seeing two variables rise together?', 'أي استنتاج هو الأكثر حذراً بعد رؤية متغيرين يرتفعان معاً؟'), [choice('One definitely causes the other.','أحدهما يسبب الآخر بالتأكيد.'),choice('They are related, but we need more evidence about cause.','هما مرتبطان، لكننا نحتاج دليلاً أكثر عن السبب.'),choice('The data are useless.','البيانات بلا فائدة.'),choice('They will always rise together.','سيرتفعان معاً دائماً.')], 1, b('The pattern may matter, but it does not settle why it happened.', 'قد يكون للنمط أهمية، لكنه لا يحسم سبب حدوثه.')),
      A('design', b('To test whether a study playlist helps concentration, what comparison is strongest?', 'لاختبار ما إذا كانت قائمة موسيقية للدراسة تساعد على التركيز، ما المقارنة الأقوى؟'), [choice('Ask one friend who likes music.','اسأل صديقاً واحداً يحب الموسيقى.'),choice('Compare similar tasks with and without the playlist, keeping other conditions similar.','قارن مهاماً متشابهة مع القائمة وبدونها مع إبقاء الظروف الأخرى متشابهة.'),choice('Count playlist followers.','احسب متابعي القائمة.'),choice('Choose the fastest result only.','اختر أسرع نتيجة فقط.')], 1, b('A controlled comparison reduces other explanations.', 'المقارنة المضبوطة تقلل التفسيرات الأخرى.')),
      R('retrieve', b('When a third factor may explain a pattern, what should you avoid claiming?', 'عندما قد يفسر عامل ثالث نمطاً ما، ما الذي ينبغي تجنب ادعائه؟'), [choice('That correlation alone proves cause.','أن الارتباط وحده يثبت السبب.'),choice('That a question is worth testing.','أن السؤال يستحق الاختبار.'),choice('That data can be compared.','أن البيانات يمكن مقارنتها.'),choice('That conditions matter.','أن الظروف مهمة.')], 0, b('A correlation can suggest a question but cannot by itself prove a cause.', 'يمكن للارتباط أن يقترح سؤالاً لكنه لا يثبت السبب وحده.')),
    ], summary: b('You kept a pattern separate from an explanation of why it occurred.', 'فصلت بين النمط وتفسير سبب حدوثه.')
  }),
  unit({
    id: 'uni-evidence-sampling', audience: 'university', pathway: 'evidence',
    title: b('Sampling and fair questions', 'العينات والأسئلة العادلة'), objective: b('Spot when a sample or question cannot fairly support a broad conclusion.', 'اكتشف متى لا يمكن لعينة أو سؤال أن يدعم استنتاجاً واسعاً بعدل.'), prerequisites: b('Claims and evidence.', 'الادعاءات والأدلة.'), instruction: b('Ask who was included, who was left out, and whether the wording pushes an answer.', 'اسأل من شملته العينة ومن استُبعد منها وما إذا كانت الصياغة تدفع إلى إجابة.'), example: b('A lunchtime survey of one club cannot automatically describe every student.', 'استبيان وقت الغداء لنادٍ واحد لا يمكنه وصف كل الطلاب تلقائياً.'),
    activities: [
      P('sample', b('Which sample best represents a whole school’s lunch preferences?', 'أي عينة تمثل تفضيلات الغداء في مدرسة كاملة بصورة أفضل؟'), [choice('Ten members of the cooking club.','عشرة أعضاء من نادي الطبخ.'),choice('Students chosen from several year groups and lunch times.','طلاب مختارون من عدة صفوف وأوقات غداء.'),choice('The principal’s family.','عائلة المدير.'),choice('Only students who complain online.','فقط الطلاب الذين يشتكون عبر الإنترنت.')], 1, b('Including varied groups reduces the chance that one group speaks for everyone.', 'إدراج مجموعات متنوعة يقلل احتمال أن تتحدث مجموعة واحدة باسم الجميع.')),
      P('leading', b('Which question is least leading?', 'أي سؤال هو الأقل توجيهاً؟'), [choice('Don’t you agree the new app is amazing?','ألا توافق أن التطبيق الجديد رائع؟'),choice('Why is the old system so bad?','لماذا النظام القديم سيئ جداً؟'),choice('How satisfied are you with the new app, from 1 to 5?','ما مدى رضاك عن التطبيق الجديد من 1 إلى 5؟'),choice('Everyone uses it—do you?','الجميع يستخدمه، أليس كذلك؟')], 2, b('It asks for an assessment without telling the respondent what to think.', 'يطلب تقييماً من دون أن يلقّن المجيب ما يفكر به.')),
      A('interpret', b('A poll of 25 volunteers at a technology event says 92% love a new device. What is the careful conclusion?', 'يقول استطلاع لـ25 متطوعاً في فعالية تقنية إن 92% يحبون جهازاً جديداً. ما الاستنتاج الحذر؟'), [choice('All adults love it.','كل البالغين يحبونه.'),choice('These volunteers were positive; a wider sample is needed for a broader claim.','كان هؤلاء المتطوعون إيجابيين؛ نحتاج عينة أوسع لادعاء أشمل.'),choice('The device is objectively best.','الجهاز هو الأفضل موضوعياً.'),choice('The poll proves nothing at all.','لا يثبت الاستطلاع شيئاً مطلقاً.')], 1, b('The result describes the sampled volunteers, not necessarily everyone.', 'تصف النتيجة المتطوعين الذين شملتهم العينة، وليس بالضرورة الجميع.')),
      R('retrieve', b('Before generalising from a survey, what is a key question?', 'قبل التعميم من استبيان، ما السؤال الأساسي؟'), [choice('Who was sampled?','من شملته العينة؟'),choice('What colour was the form?','ما لون النموذج؟'),choice('Was it printed?','هل طُبع؟'),choice('Who named the survey?','من سمّى الاستبيان؟')], 0, b('Who was included determines what population the result may describe.', 'من شملته العينة يحدد أي مجموعة قد تصفها النتيجة.')),
    ], summary: b('You checked both the people in a sample and the wording of the question.', 'فحصت الأشخاص في العينة وصياغة السؤال معاً.')
  }),
];

// The first six university units above establish the executable engine. The
// remaining units are declared in the next authoring batch, kept separate so
// every addition receives its own content and bilingual review checkpoint.

export function learningUnitById(id) {
  return LEARNING_UNITS.find((entry) => entry.id === id) || null;
}

export function eligibleLearningUnits({ audience = null } = {}) {
  return LEARNING_UNITS.filter((entry) => (
    entry.publication.status === 'eligible-authored-learning-release'
    && (!audience || entry.audience === audience)
  ));
}
