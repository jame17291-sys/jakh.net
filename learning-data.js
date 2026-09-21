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

function sharedPublication(audience) {
  return {
    status: 'eligible-authored-learning-release',
    contentVersion: LEARNING_PROGRAM_VERSION,
    languages: ['en', 'ar'],
    ageBands: audience.startsWith('children-') ? [audience.slice('children-'.length)] : ['adult'],
    restrictions: audience.startsWith('children-') ? ['no-open-chat', 'no-stranger-matching'] : [],
  };
}

function sharedProvenance() {
  return {
    authoring: 'Riddle Arabia self-contained learning release',
    review: 'automated solution and bilingual consistency review; human editorial, educator, and participant validation pending',
    humanApproval: false,
  };
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
    publication: sharedPublication(audience),
    provenance: sharedProvenance(),
  };
}

const P = (id, prompt, choices, correct, explanation) => activity(id, 'practice', prompt, choices, correct, explanation);
const A = (id, prompt, choices, correct, explanation) => activity(id, 'application', prompt, choices, correct, explanation);
const R = (id, prompt, choices, correct, explanation) => activity(id, 'retrieval', prompt, choices, correct, explanation);
const compact = (id, stage, en, ar, optionsEn, optionsAr, correct, explainEn, explainAr) => activity(
  id, stage, b(en, ar), optionsEn.map((value, index) => choice(value, optionsAr[index])), correct, b(explainEn, explainAr),
);
function childUnit({ id, audience, title, objective, instruction, example, first, application }) {
  return unit({
    id, audience, pathway: audience.replace('children-', 'ages-'), title, objective,
    prerequisites: b('None. An adult may read the prompt aloud if helpful.', 'لا شيء. يمكن لشخص بالغ قراءة السؤال بصوت عالٍ عند الحاجة.'), instruction, example,
    activities: [
      compact('notice', 'practice', first.en, first.ar, first.options.en, first.options.ar, first.correct, first.explain.en, first.explain.ar),
      compact('strategy', 'practice', 'What helps you solve a new challenge?', 'ما الذي يساعدك على حل تحدٍّ جديد؟', ['Look for the rule or clue', 'Rush without reading', 'Hide the question', 'Choose at random'], ['ابحث عن القاعدة أو التلميح', 'استعجل من دون قراءة', 'أخف السؤال', 'اختر عشوائياً'], 0, 'A careful clue gives you a reason for your choice.', 'يعطيك التلميح المتأني سبباً لاختيارك.'),
      compact('apply', 'application', application.en, application.ar, application.options.en, application.options.ar, application.correct, application.explain.en, application.explain.ar),
      compact('remember', 'retrieval', 'When you meet a similar puzzle later, what should you do first?', 'عندما تقابل لغزاً مشابهاً لاحقاً، ماذا تفعل أولاً؟', ['Notice the clue and try the idea', 'Ask for the answer immediately', 'Skip it', 'Change every rule'], ['لاحظ التلميح وجرب الفكرة', 'اطلب الإجابة فوراً', 'تجاوزه', 'غيّر كل القواعد'], 0, 'Trying the idea in a later situation helps you remember it.', 'تجربة الفكرة في موقف لاحق تساعدك على تذكرها.'),
    ], summary: b('You noticed a clue, used an idea, and will return to it later.', 'لاحظت تلميحاً واستخدمت فكرة وستعود إليها لاحقاً.')
  });
}

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
  unit({
    id: 'uni-digital-data', audience: 'university', pathway: 'digital-ai',
    title: b('Data minimisation', 'تقليل البيانات'), objective: b('Choose only the information an activity genuinely needs.', 'اختر فقط المعلومات التي يحتاجها النشاط فعلاً.'), prerequisites: b('Everyday app use.', 'استخدام التطبيقات اليومي.'), instruction: b('Collect the smallest useful set, explain why, and avoid reusing it for a different purpose.', 'اجمع أصغر مجموعة مفيدة، واشرح السبب، وتجنب استخدامها لغرض مختلف.'), example: b('A timer needs a duration; it does not need a home address.', 'يحتاج المؤقت إلى مدة؛ ولا يحتاج إلى عنوان المنزل.'), activities: [
      compact('timer','practice','Which detail is necessary for a 10-minute reminder?','أي معلومة ضرورية لتذكير مدته 10 دقائق؟',['Reminder time','Home address','Favourite colour','Contact list'],['وقت التذكير','عنوان المنزل','اللون المفضل','قائمة جهات الاتصال'],0,'The reminder needs a time, not unrelated personal details.','يحتاج التذكير إلى وقت لا إلى تفاصيل شخصية غير مرتبطة.'),
      compact('purpose','practice','What is the clearest reason to explain before collecting data?','ما السبب الأوضح الذي ينبغي شرحه قبل جمع البيانات؟',['What the data will be used for','Which phone is newest','Who types fastest','What colour the page is'],['الغرض الذي ستستخدم البيانات من أجله','أي هاتف هو الأحدث','من يكتب أسرع','ما لون الصفحة'],0,'People can judge whether the requested data fits the stated purpose.','يمكن للناس الحكم على ما إذا كانت البيانات المطلوبة تناسب الغرض المعلن.'),
      compact('club','application','A club sign-up only needs a name and a way to send meeting details. Which field should it leave out?','يحتاج تسجيل النادي إلى اسم وطريقة لإرسال تفاصيل الاجتماع. أي حقل ينبغي تركه؟',['Preferred contact method','Name','Home address','Meeting choice'],['طريقة التواصل المفضلة','الاسم','عنوان المنزل','اختيار الاجتماع'],2,'A home address is not needed to send meeting information.','عنوان المنزل غير مطلوب لإرسال معلومات الاجتماع.'),
      compact('retrieve','retrieval','Data minimisation means collecting…','يعني تقليل البيانات جمع…',['the smallest useful amount','every available detail','only public details','no explanation'],['أصغر قدر مفيد','كل التفاصيل المتاحة','التفاصيل العامة فقط','من دون شرح'],0,'The principle is to keep collection proportionate to the purpose.','المبدأ هو أن يكون الجمع متناسباً مع الغرض.'),
    ], summary: b('You matched each requested detail to a real purpose.', 'ربطت كل تفصيل مطلوب بغرض حقيقي.')
  }),
  unit({
    id: 'uni-digital-ai-check', audience: 'university', pathway: 'digital-ai',
    title: b('Checking AI output', 'التحقق من مخرجات الذكاء الاصطناعي'), objective: b('Treat an AI response as a draft that needs checking, not as evidence by itself.', 'تعامل مع استجابة الذكاء الاصطناعي كمسودة تحتاج إلى تحقق، لا كدليل بحد ذاتها.'), prerequisites: b('Claims and evidence.', 'الادعاءات والأدلة.'), instruction: b('Check important claims against suitable sources and keep responsibility for the final decision.', 'تحقق من الادعاءات المهمة بمصادر مناسبة وتحمل مسؤولية القرار النهائي.'), example: b('A fluent answer can still contain a wrong date or invented citation.', 'قد تحتوي إجابة سلسة على تاريخ خاطئ أو استشهاد مختلق.'), activities: [
      compact('source','practice','What is the best next step after an AI tool gives a factual claim?','ما أفضل خطوة تالية بعد أن تقدم أداة ذكاء اصطناعي ادعاءً واقعياً؟',['Check a credible source for that claim','Copy it without reading','Count its adjectives','Share it immediately'],['تحقق من مصدر موثوق لذلك الادعاء','انسخه من دون قراءة','احسب صفاته','شاركه فوراً'],0,'A response is not a source; verify the specific claim independently.','الاستجابة ليست مصدراً؛ تحقق من الادعاء المحدد باستقلال.'),
      compact('citation','practice','An answer lists a citation you cannot find. What should you conclude?','تسرد الإجابة استشهاداً لا يمكنك العثور عليه. ما الاستنتاج؟',['Do not rely on it until it is verified','It must be correct','The topic is impossible','The citation is optional evidence'],['لا تعتمد عليه حتى يتم التحقق منه','لا بد أنه صحيح','الموضوع مستحيل','الاستشهاد دليل اختياري'],0,'An unlocatable citation does not support the claim.','الاستشهاد الذي لا يمكن العثور عليه لا يدعم الادعاء.'),
      compact('email','application','An AI draft writes a polite email but names the wrong meeting date. What should you change before sending?','تكتب مسودة ذكاء اصطناعي بريداً مهذباً لكنها تسمي تاريخ اجتماع خاطئاً. ماذا تغيّر قبل الإرسال؟',['The verified date','Only the greeting','Nothing because it sounds fluent','The recipient name only'],['التاريخ المتحقق منه','التحية فقط','لا شيء لأنها تبدو سلسة','اسم المستلم فقط'],0,'Fluency does not remove the need to verify consequential details.','السلاسة لا تلغي الحاجة إلى التحقق من التفاصيل المهمة.'),
      compact('retrieve','retrieval','Who remains responsible for a decision made using AI assistance?','من يبقى مسؤولاً عن قرار اتخذ بمساعدة الذكاء الاصطناعي؟',['The person making the decision','The autocomplete box','The screen','No one'],['الشخص الذي يتخذ القرار','مربع الإكمال التلقائي','الشاشة','لا أحد'],0,'Tools can assist, but people remain accountable for the final use.','يمكن للأدوات أن تساعد، لكن الناس يبقون مسؤولين عن الاستخدام النهائي.'),
    ], summary: b('You separated a useful draft from verified evidence.', 'فصلت بين مسودة مفيدة ودليل متحقق منه.')
  }),
  unit({
    id: 'uni-digital-instructions', audience: 'university', pathway: 'digital-ai',
    title: b('Clear instructions and constraints', 'تعليمات وقيود واضحة'), objective: b('State a task, audience, constraints, and a way to check the result.', 'اذكر المهمة والجمهور والقيود وطريقة للتحقق من النتيجة.'), prerequisites: b('Clear writing.', 'كتابة واضحة.'), instruction: b('A useful request names the outcome, context, limits, and a check for important details.', 'يذكر الطلب المفيد النتيجة والسياق والحدود وطريقة لفحص التفاصيل المهمة.'), example: b('“Summarise this for first-year students in five bullets; mark uncertain claims” is more checkable than “make it good.”', '«لخّص هذا لطلاب السنة الأولى في خمس نقاط وحدد الادعاءات غير المؤكدة» أوضح من «اجعله جيداً».') , activities: [
      compact('goal','practice','Which request gives the clearest constraint?','أي طلب يقدّم القيد الأوضح؟',['Explain the idea in three bullets for a beginner','Make it better','Write something about it','Use nice words'],['اشرح الفكرة في ثلاث نقاط لمبتدئ','اجعله أفضل','اكتب شيئاً عنها','استخدم كلمات جميلة'],0,'It gives an audience, format, and limit that can be checked.','يحدد جمهوراً وشكلاً وحداً يمكن فحصه.'),
      compact('uncertain','practice','Why ask a tool to mark uncertain information?','لماذا تطلب من الأداة تحديد المعلومات غير المؤكدة؟',['So you know what needs checking','So every answer is longer','So it can skip the task','So sources are unnecessary'],['لكي تعرف ما يحتاج إلى تحقق','لكي تكون كل إجابة أطول','لكي تتجاوز المهمة','لكي لا نحتاج إلى مصادر'],0,'Uncertainty labels direct human checking; they do not prove correctness.','توجّه علامات عدم اليقين التحقق البشري؛ ولا تثبت الصحة.'),
      compact('brief','application','You need a study-plan draft. Which brief is strongest?','تحتاج إلى مسودة خطة دراسة. أي موجز هو الأقوى؟',['Create a one-week plan for two subjects with 30-minute sessions and a review day','Make a perfect plan','Study harder','List every subject in the world'],['أنشئ خطة أسبوعية لمادتين بجلسات 30 دقيقة ويوم مراجعة','اكتب خطة مثالية','ادرس أكثر','اكتب كل مواد العالم'],0,'The first brief supplies outcome, scope, time limit, and structure.','يقدّم الموجز الأول النتيجة والنطاق والحد الزمني والبنية.'),
      compact('retrieve','retrieval','A checkable instruction includes an outcome and…','تتضمن التعليمة القابلة للفحص نتيجة و…',['clear constraints','a promise of perfection','hidden context','no audience'],['قيود واضحة','وعداً بالكمال','سياقاً مخفياً','بلا جمهور'],0,'Constraints make it possible to judge whether a result fits the task.','تجعل القيود من الممكن الحكم على ما إذا كانت النتيجة تناسب المهمة.'),
    ], summary: b('You made a request easier to assess and safer to revise.', 'جعلت الطلب أسهل للتقييم وأكثر أماناً للمراجعة.')
  }),
  unit({
    id: 'uni-study-retrieval', audience: 'university', pathway: 'study',
    title: b('Retrieval before rereading', 'الاسترجاع قبل إعادة القراءة'), objective: b('Use a short attempt to recall before checking notes.', 'استخدم محاولة قصيرة للتذكر قبل فحص الملاحظات.'), prerequisites: b('A topic you have already encountered.', 'موضوع سبق أن مررت به.'), instruction: b('Close the notes, recall what you can, then check and repair gaps.', 'أغلق الملاحظات وتذكر ما تستطيع، ثم افحص الثغرات وأصلحها.'), example: b('Write three points from memory, then compare them with the source.', 'اكتب ثلاث نقاط من الذاكرة ثم قارنها بالمصدر.'), activities: [
      compact('first','practice','What comes first in a retrieval-practice cycle?','ما الذي يأتي أولاً في دورة تدريب الاسترجاع؟',['Attempt to recall','Read the same page repeatedly','Delete the notes','Guess a grade'],['محاولة التذكر','قراءة الصفحة نفسها مراراً','حذف الملاحظات','تخمين درجة'],0,'An attempt reveals what is available now and what needs repair.','تكشف المحاولة ما هو متاح الآن وما يحتاج إلى إصلاح.'),
      compact('feedback','practice','What should you do after a recall attempt?','ماذا ينبغي أن تفعل بعد محاولة التذكر؟',['Check feedback or notes','Assume every answer was right','Stop studying forever','Hide mistakes'],['افحص التغذية الراجعة أو الملاحظات','افترض أن كل الإجابات صحيحة','توقف عن الدراسة نهائياً','أخف الأخطاء'],0,'Checking turns an attempt into targeted learning.','الفحص يحول المحاولة إلى تعلم موجه.'),
      compact('lecture','application','After a lecture, which plan uses retrieval?','بعد محاضرة، أي خطة تستخدم الاسترجاع؟',['List key ideas from memory, then check the slides','Highlight every slide again','Watch unrelated videos','Wait for a score'],['اكتب الأفكار الأساسية من الذاكرة ثم افحص الشرائح','ظلّل كل شريحة من جديد','شاهد فيديوهات غير مرتبطة','انتظر درجة'],0,'Recall first creates useful feedback about the lesson.','التذكر أولاً ينتج تغذية راجعة مفيدة عن الدرس.'),
      compact('retrieve','retrieval','Retrieval practice means trying to…','يعني تدريب الاسترجاع محاولة…',['bring information to mind','make notes look tidy','avoid feedback','read faster only'],['إحضار المعلومة إلى الذهن','جعل الملاحظات مرتبة','تجنب التغذية الراجعة','القراءة أسرع فقط'],0,'The central action is recalling, not merely seeing the information again.','الفعل الأساسي هو التذكر لا مجرد رؤية المعلومة مرة أخرى.'),
    ], summary: b('You used an attempt and feedback as separate steps.', 'استخدمت المحاولة والتغذية الراجعة كخطوتين منفصلتين.')
  }),
  unit({
    id: 'uni-study-spacing', audience: 'university', pathway: 'study',
    title: b('Spacing and review dates', 'التباعد ومواعيد المراجعة'), objective: b('Plan a return after elapsed time instead of calling the next screen a review.', 'خطط للعودة بعد وقت منقضٍ بدلاً من اعتبار الشاشة التالية مراجعة.'), prerequisites: b('Retrieval practice.', 'تدريب الاسترجاع.'), instruction: b('Schedule a later recall. The delay makes the next attempt a new check, not a duplicate click.', 'حدد استرجاعاً لاحقاً. يجعل التأخير المحاولة التالية فحصاً جديداً لا نقرة مكررة.'), example: b('Review a concept tomorrow after practising it today.', 'راجع مفهوماً غداً بعد التدرب عليه اليوم.'), activities: [
      compact('delay','practice','Which plan includes real spacing?','أي خطة تتضمن تباعداً حقيقياً؟',['Practise today and return tomorrow','Tap next immediately four times','Read once and never return','Open four tabs at once'],['تدرب اليوم وعد غداً','اضغط التالي فوراً أربع مرات','اقرأ مرة ولا تعد أبداً','افتح أربع علامات تبويب معاً'],0,'Spacing requires elapsed time between attempts.','يتطلب التباعد وقتاً منقضياً بين المحاولات.'),
      compact('due','practice','What should a review record store?','ماذا ينبغي أن يسجل سجل المراجعة؟',['A due date','Only a badge','A public ranking','A random colour'],['تاريخ استحقاق','شارة فقط','ترتيباً عاماً','لوناً عشوائياً'],0,'A due date makes a later retrieval session possible.','يتيح تاريخ الاستحقاق جلسة استرجاع لاحقة.'),
      compact('plan','application','You finish a difficult topic on Monday. Which next step best supports later retrieval?','أنهيت موضوعاً صعباً يوم الاثنين. أي خطوة تالية تدعم الاسترجاع لاحقاً؟',['Set a review for Tuesday','Call the current answer mastery','Remove the topic','Compare your score with strangers'],['حدد مراجعة ليوم الثلاثاء','سمِّ الإجابة الحالية إتقاناً','احذف الموضوع','قارن نتيجتك بغرباء'],0,'A scheduled return creates a later opportunity to recall.','العودة المجدولة تنشئ فرصة لاحقة للتذكر.'),
      compact('retrieve','retrieval','A later retrieval needs…','يحتاج الاسترجاع اللاحق إلى…',['a persisted due time','a faster animation','a new badge','a public chat'],['وقت استحقاق محفوظ','رسوم متحركة أسرع','شارة جديدة','دردشة عامة'],0,'Without a persisted time, a later session cannot be distinguished from the same moment.','من دون وقت محفوظ لا يمكن تمييز الجلسة اللاحقة من اللحظة نفسها.'),
    ], summary: b('You turned “later” into a stored time, not a slogan.', 'حوّلت «لاحقاً» إلى وقت محفوظ لا إلى شعار.')
  }),
  unit({
    id: 'uni-study-errors', audience: 'university', pathway: 'study',
    title: b('Learning from errors', 'التعلم من الأخطاء'), objective: b('Use an error to identify the step to repair before trying a new case.', 'استخدم الخطأ لتحديد الخطوة التي تحتاج إلى إصلاح قبل تجربة حالة جديدة.'), prerequisites: b('Willingness to check work.', 'الاستعداد لفحص العمل.'), instruction: b('Name the mistaken step, correct it, and try a related but different problem.', 'سمِّ الخطوة الخاطئة وصححها وجرب مسألة مرتبطة لكنها مختلفة.'), example: b('If you added before multiplying, redo the order and then solve a new expression.', 'إذا جمعت قبل الضرب فأعد ترتيب العمليات ثم حل تعبيراً جديداً.'), activities: [
      compact('identify','practice','After an incorrect answer, what is the most useful first question?','بعد إجابة غير صحيحة، ما السؤال الأول الأكثر فائدة؟',['Which step led me here?','How can I hide it?','Who is faster?','Can I skip feedback?'],['أي خطوة أوصلتني إلى هنا؟','كيف أخفيها؟','من الأسرع؟','هل يمكنني تجاوز التغذية الراجعة؟'],0,'Finding the step makes a correction specific.','تحديد الخطوة يجعل التصحيح محدداً.'),
      compact('transfer','practice','Why try a different example after correcting an error?','لماذا تجرب مثالاً مختلفاً بعد تصحيح خطأ؟',['To check whether the idea transfers','To memorise one screen only','To avoid thinking','To raise a speed score'],['للتحقق من انتقال الفكرة','لحفظ شاشة واحدة فقط','لتجنب التفكير','لرفع نتيجة السرعة'],0,'A new situation tests the idea rather than a copied answer.','الموقف الجديد يختبر الفكرة لا إجابة منسوخة.'),
      compact('math','application','You forgot to divide a total by the number of values when finding a mean. What repair is best?','نسيت قسمة المجموع على عدد القيم عند إيجاد المتوسط. ما الإصلاح الأفضل؟',['State the missing division and solve a new mean','Keep the total as the answer','Change the question name','Ignore the mistake'],['اذكر القسمة الناقصة وحل متوسطاً جديداً','أبقِ المجموع كإجابة','غيّر اسم السؤال','تجاهل الخطأ'],0,'The repair names the rule and tests it in a fresh calculation.','يسمي الإصلاح القاعدة ويختبرها في حساب جديد.'),
      compact('retrieve','retrieval','A useful correction includes the mistaken step and…','يتضمن التصحيح المفيد الخطوة الخاطئة و…',['a new attempt','a public score','an excuse','a hidden answer'],['محاولة جديدة','نتيجة عامة','عذراً','إجابة مخفية'],0,'A new attempt shows whether the repaired idea can be used.','تظهر المحاولة الجديدة ما إذا أمكن استخدام الفكرة المصححة.'),
    ], summary: b('You used an error as information for the next attempt.', 'استخدمت الخطأ كمعلومة للمحاولة التالية.')
  }),
  childUnit({
    id: 'kids68-patterns', audience: 'children-6-8', title: b('Spot the pattern', 'اكتشف النمط'), objective: b('Notice what repeats or changes in a simple sequence.', 'لاحظ ما يتكرر أو يتغير في تسلسل بسيط.'), instruction: b('Look at each step and say what changes.', 'انظر إلى كل خطوة وقل ما الذي يتغير.'), example: b('Red, blue, red, blue: the colours take turns.', 'أحمر، أزرق، أحمر، أزرق: الألوان تتناوب.'),
    first: { en: 'What comes next: circle, square, circle, square, …?', ar: 'ما الذي يأتي بعد: دائرة، مربع، دائرة، مربع، …؟', options: { en: ['circle','triangle','square','star'], ar: ['دائرة','مثلث','مربع','نجمة'] }, correct: 0, explain: b('The two shapes repeat in the same order.', 'يتكرر الشكلان بالترتيب نفسه.') },
    application: { en: 'What comes next: 2, 4, 6, …?', ar: 'ما الذي يأتي بعد: 2، 4، 6، …؟', options: { en: ['7','8','9','10'], ar: ['7','8','9','10'] }, correct: 1, explain: b('The number goes up by two each time.', 'يزيد العدد بمقدار اثنين كل مرة.') },
  }),
  childUnit({
    id: 'kids68-sorting', audience: 'children-6-8', title: b('Sort by a rule', 'صنّف وفق قاعدة'), objective: b('Put objects into groups using one stated feature.', 'ضع الأشياء في مجموعات باستخدام صفة واحدة محددة.'), instruction: b('Say the rule before you put anything in a group.', 'قل القاعدة قبل أن تضع أي شيء في مجموعة.'), example: b('Apples and bananas belong in a fruit group.', 'التفاح والموز ينتميان إلى مجموعة الفاكهة.'),
    first: { en: 'Which belongs with apple and banana?', ar: 'أي شيء ينتمي مع التفاح والموز؟', options: { en: ['carrot','orange','spoon','sock'], ar: ['جزرة','برتقالة','ملعقة','جورب'] }, correct: 1, explain: b('Apple, banana, and orange are fruits.', 'التفاح والموز والبرتقال فواكه.') },
    application: { en: 'Which belongs in a group called “things that float”?', ar: 'أي شيء ينتمي إلى مجموعة اسمها «أشياء تطفو»؟', options: { en: ['stone','coin','leaf','key'], ar: ['حجر','عملة','ورقة شجر','مفتاح'] }, correct: 2, explain: b('A leaf can float on water; the other listed objects usually sink.', 'يمكن لورقة الشجر أن تطفو على الماء؛ والأشياء الأخرى المذكورة تغرق عادة.') },
  }),
  childUnit({
    id: 'kids68-directions', audience: 'children-6-8', title: b('Follow directions', 'اتبع الاتجاهات'), objective: b('Use simple left, right, forward, and back directions.', 'استخدم اتجاهات بسيطة: يسار ويمين وأمام وخلف.'), instruction: b('Start where the arrow starts, then do one direction at a time.', 'ابدأ من مكان السهم ثم نفّذ اتجاهاً واحداً في كل مرة.'), example: b('If you face north, your right side is east.', 'إذا كنت تواجه الشمال فجهتك اليمنى هي الشرق.'),
    first: { en: 'You face up the page. Which way is your right hand?', ar: 'أنت تواجه أعلى الصفحة. أين تكون يدك اليمنى؟', options: { en: ['left','right','behind','down'], ar: ['يسار','يمين','خلف','أسفل'] }, correct: 1, explain: b('Your right hand points to the right side of the page.', 'تشير يدك اليمنى إلى الجانب الأيمن من الصفحة.') },
    application: { en: 'A robot takes two steps forward, then one step right. Which instruction happened last?', ar: 'يتقدم روبوت خطوتين إلى الأمام ثم خطوة واحدة إلى اليمين. أي تعليمة حدثت أخيراً؟', options: { en: ['forward','right','back','stop'], ar: ['أمام','يمين','خلف','توقف'] }, correct: 1, explain: b('The last instruction named is one step right.', 'آخر تعليمة مذكورة هي خطوة واحدة إلى اليمين.') },
  }),
  childUnit({
    id: 'kids911-fractions', audience: 'children-9-11', title: b('Fair shares', 'حصص عادلة'), objective: b('Use fractions to describe equal parts of one whole.', 'استخدم الكسور لوصف أجزاء متساوية من كل واحد.'), instruction: b('The bottom number tells how many equal parts; the top number tells how many are chosen.', 'يخبرك العدد السفلي بعدد الأجزاء المتساوية؛ ويخبرك العلوي بعدد الأجزاء المختارة.'), example: b('One of four equal slices is 1/4.', 'شريحة واحدة من أربع شرائح متساوية هي 1/4.'),
    first: { en: 'A pizza is cut into 8 equal slices. You eat 2. What fraction did you eat?', ar: 'قُطعت بيتزا إلى 8 شرائح متساوية. أكلت شريحتين. ما الكسر الذي أكلته؟', options: { en: ['1/8','2/8','6/8','8/2'], ar: ['1/8','2/8','6/8','8/2'] }, correct: 1, explain: b('You chose 2 of the 8 equal slices.', 'اخترت شريحتين من 8 شرائح متساوية.') },
    application: { en: 'Four friends share 12 equal grapes fairly. How many grapes does each get?', ar: 'يتقاسم أربعة أصدقاء 12 حبة عنب متساوية بعدل. كم حبة يحصل عليها كل واحد؟', options: { en: ['2','3','4','6'], ar: ['2','3','4','6'] }, correct: 1, explain: b('12 divided into 4 equal shares is 3 each.', '12 مقسمة إلى 4 حصص متساوية تساوي 3 لكل واحد.') },
  }),
  childUnit({
    id: 'kids911-source-clues', audience: 'children-9-11', title: b('Ask about the source', 'اسأل عن المصدر'), objective: b('Notice who made a claim and what evidence they show.', 'لاحظ من قدم الادعاء وما الدليل الذي يعرضه.'), instruction: b('Ask: who said this, how do they know, and can I check it?', 'اسأل: من قال هذا، وكيف يعرف، وهل يمكنني التحقق؟'), example: b('A photo with a date and place gives more to check than “trust me.”', 'الصورة ذات التاريخ والمكان تعطيك ما تتحقق منه أكثر من عبارة «صدقني».') ,
    first: { en: 'Which question helps you check an online claim?', ar: 'أي سؤال يساعدك على التحقق من ادعاء على الإنترنت؟', options: { en: ['Who made it and what is their evidence?','Is the text colourful?','How fast did it arrive?','Is it very long?'], ar: ['من قدمه وما دليله؟','هل النص ملون؟','كم وصل بسرعة؟','هل هو طويل جداً؟'] }, correct: 0, explain: b('The maker and evidence help you judge a claim.', 'يساعدك صاحب الادعاء والدليل على الحكم عليه.') },
    application: { en: 'A post says a school will close tomorrow but gives no source. What is a good next step?', ar: 'يقول منشور إن المدرسة ستغلق غداً لكنه لا يقدم مصدراً. ما الخطوة الجيدة التالية؟', options: { en: ['Check the school’s official message','Forward it to everyone','Assume it is true','Change the date'], ar: ['تحقق من رسالة المدرسة الرسمية','أرسله إلى الجميع','افترض أنه صحيح','غيّر التاريخ'] }, correct: 0, explain: b('An official school message can confirm or correct the claim.', 'يمكن لرسالة رسمية من المدرسة أن تؤكد الادعاء أو تصححه.') },
  }),
  childUnit({
    id: 'kids911-algorithms', audience: 'children-9-11', title: b('Steps and algorithms', 'الخطوات والخوارزميات'), objective: b('Put instructions in an order another person can follow.', 'رتب التعليمات في تسلسل يستطيع شخص آخر اتباعه.'), instruction: b('Use small, clear steps and test what happens when one is missing.', 'استخدم خطوات صغيرة وواضحة واختبر ما يحدث عند غياب واحدة منها.'), example: b('To draw a square: draw one side, turn a corner, and repeat four times.', 'لرسم مربع: ارسم ضلعاً ثم انعطف عند زاوية وكرر ذلك أربع مرات.'),
    first: { en: 'Why does the order of steps matter in a recipe?', ar: 'لماذا يهم ترتيب الخطوات في وصفة؟', options: { en: ['A later step can need an earlier result','Order never matters','It makes words shorter','It changes the colour only'], ar: ['قد تحتاج خطوة لاحقة إلى نتيجة سابقة','لا يهم الترتيب أبداً','يجعل الكلمات أقصر','يغير اللون فقط'] }, correct: 0, explain: b('Some actions depend on something being ready first.', 'تعتمد بعض الأفعال على جاهزية شيء ما أولاً.') },
    application: { en: 'Which is the best first step for washing hands?', ar: 'أي خطوة هي الأفضل أولاً لغسل اليدين؟', options: { en: ['Dry them','Turn on water','Put on gloves','Leave the room'], ar: ['جففهما','افتح الماء','ارتد قفازات','غادر الغرفة'] }, correct: 1, explain: b('Turning on water makes the next washing steps possible.', 'فتح الماء يجعل خطوات الغسل التالية ممكنة.') },
  }),
  childUnit({
    id: 'kids1214-data-graphs', audience: 'children-12-14', title: b('Read a data display', 'اقرأ عرض البيانات'), objective: b('Compare values in a simple table before making a claim.', 'قارن القيم في جدول بسيط قبل إصدار ادعاء.'), instruction: b('Read labels, units, and all relevant values before deciding what the display shows.', 'اقرأ التسميات والوحدات وكل القيم ذات الصلة قبل تقرير ما الذي يظهره العرض.'), example: b('If A is 12 and B is 9, A is larger by 3—not necessarily “much better.”', 'إذا كانت أ تساوي 12 وب تساوي 9، فأ أكبر بمقدار 3، وليس بالضرورة «أفضل كثيراً».') ,
    first: { en: 'A table shows 12 books borrowed on Monday and 9 on Tuesday. Which statement is supported?', ar: 'يوضح جدول استعارة 12 كتاباً يوم الاثنين و9 يوم الثلاثاء. أي عبارة يدعمها الجدول؟', options: { en: ['Monday had 3 more books than Tuesday','Monday was always busier','Tuesday had no books','Books are more popular everywhere'], ar: ['كان يوم الاثنين أكثر بثلاثة كتب من الثلاثاء','كان الاثنين أكثر ازدحاماً دائماً','لم تكن هناك كتب يوم الثلاثاء','الكتب أكثر شعبية في كل مكان'] }, correct: 0, explain: b('12 minus 9 is 3; the table says nothing about every other day or place.', '12 ناقص 9 يساوي 3؛ ولا يقول الجدول شيئاً عن كل يوم أو مكان آخر.') },
    application: { en: 'Two groups have average scores of 70 and 72. What is the most careful claim?', ar: 'لدى مجموعتين متوسطا درجتين 70 و72. ما الادعاء الأكثر حذراً؟', options: { en: ['The second average is 2 points higher','The second group is smarter','Every person scored higher','The first group failed'], ar: ['متوسط المجموعة الثانية أعلى بنقطتين','المجموعة الثانية أذكى','كل شخص سجل درجة أعلى','المجموعة الأولى رسبت'] }, correct: 0, explain: b('The averages differ by two; they do not describe every individual.', 'يختلف المتوسطان بنقطتين؛ ولا يصفان كل فرد.') },
  }),
  childUnit({
    id: 'kids1214-counterexamples', audience: 'children-12-14', title: b('Test a broad claim', 'اختبر ادعاءً واسعاً'), objective: b('Use a counterexample to check a claim that says “all” or “never.”', 'استخدم مثالاً مضاداً لفحص ادعاء يقول «كل» أو «لا يحدث أبداً».'), instruction: b('One valid example that breaks an “all” claim is enough to challenge it.', 'يكفي مثال صحيح واحد يخالف ادعاء «كل» لتحديه.'), example: b('“All birds fly” is challenged by a penguin, a bird that does not fly.', 'يتحدى البطريق، وهو طائر لا يطير، عبارة «كل الطيور تطير».') ,
    first: { en: 'Which example challenges “Every triangle has three equal sides”?', ar: 'أي مثال يتحدى عبارة «كل مثلث له ثلاثة أضلاع متساوية»؟', options: { en: ['A scalene triangle','An equilateral triangle','A square','A circle'], ar: ['مثلث مختلف الأضلاع','مثلث متساوي الأضلاع','مربع','دائرة'] }, correct: 0, explain: b('A scalene triangle has sides of different lengths, so the “every” claim fails.', 'للمثلث مختلف الأضلاع أطوال مختلفة، لذا يفشل ادعاء «كل».') },
    application: { en: 'A friend says “No one uses paper maps.” What would be a counterexample?', ar: 'يقول صديق «لا أحد يستخدم الخرائط الورقية». ما المثال المضاد؟', options: { en: ['One person using a paper map','A phone with a map app','A blank sheet','A compass picture'], ar: ['شخص واحد يستخدم خريطة ورقية','هاتف به تطبيق خرائط','ورقة فارغة','صورة بوصلة'] }, correct: 0, explain: b('One real person using a paper map is enough to disprove “no one.”', 'يكفي شخص حقيقي واحد يستخدم خريطة ورقية لنقض عبارة «لا أحد».') },
  }),
  childUnit({
    id: 'kids1214-digital-decisions', audience: 'children-12-14', title: b('Pause before sharing', 'توقف قبل المشاركة'), objective: b('Choose a safer response to a surprising online message.', 'اختر استجابة أكثر أماناً لرسالة مفاجئة على الإنترنت.'), instruction: b('Pause, check the source, and ask a trusted adult when a message asks for personal information or urgent action.', 'توقف وتحقق من المصدر واسأل شخصاً بالغاً موثوقاً عندما تطلب الرسالة معلومات شخصية أو تصرفاً عاجلاً.'), example: b('An urgent prize message can wait while you verify it through an official route.', 'يمكن لرسالة جائزة عاجلة أن تنتظر بينما تتحقق منها عبر طريق رسمي.'),
    first: { en: 'A message asks for your password to claim a prize today. What is the safest response?', ar: 'تطلب رسالة كلمة مرورك للمطالبة بجائزة اليوم. ما الاستجابة الأكثر أماناً؟', options: { en: ['Do not share it; check with a trusted adult or official site','Send it quickly','Post it in a group','Forward it to friends'], ar: ['لا تشاركها؛ تحقق مع بالغ موثوق أو موقع رسمي','أرسلها بسرعة','انشرها في مجموعة','أرسلها للأصدقاء'] }, correct: 0, explain: b('Passwords are private, and urgency is a reason to pause and check.', 'كلمات المرور خاصة، والاستعجال سبب للتوقف والتحقق.') },
    application: { en: 'A video makes a dramatic claim but shows no source. What is a good next step?', ar: 'يقدم فيديو ادعاءً مثيراً لكنه لا يعرض مصدراً. ما الخطوة الجيدة التالية؟', options: { en: ['Look for a reliable source before sharing','Share it because it is dramatic','Assume comments prove it','Add a new claim'], ar: ['ابحث عن مصدر موثوق قبل المشاركة','شاركه لأنه مثير','افترض أن التعليقات تثبته','أضف ادعاءً جديداً'] }, correct: 0, explain: b('A reliable source can support, correct, or qualify the claim.', 'يمكن لمصدر موثوق أن يدعم الادعاء أو يصححه أو يقيّده.') },
  }),
];

export const SOCIAL_COLLECTIONS = [
  {
    id: 'social-logic-sprints',
    title: b('Logic sprints', 'جولات منطقية قصيرة'),
    objective: b('Compare reasons before choosing an answer.', 'قارنوا الأسباب قبل اختيار إجابة.'),
    format: b('Private link, two to four players, untimed by default.', 'رابط خاص، من لاعبين إلى أربعة، ومن دون مؤقّت افتراضياً.'),
    replay: b('Replay changes the order and asks for a written reason before showing the group result.', 'تغيّر الإعادة الترتيب وتطلب سبباً مكتوباً قبل عرض نتيجة المجموعة.'),
    prompt: b('Two friends give different answers. What should the group compare first?', 'يعطي صديقان إجابتين مختلفتين. ما أول شيء ينبغي أن تقارنه المجموعة؟'),
    choices: [choice('The reasons behind each answer', 'الأسباب خلف كل إجابة'), choice('Who answered fastest', 'من أجاب أسرع'), choice('Whose phone is newer', 'هاتف من أحدث'), choice('Who speaks louder', 'من يتكلم بصوت أعلى')],
    correct: 0,
    explanation: b('A social reasoning round should reward evidence and explanation, not speed or status.', 'ينبغي أن تكافئ جولة التفكير الجماعي الدليل والتفسير لا السرعة أو المكانة.'),
  },
  {
    id: 'social-data-talk',
    title: b('Data talk', 'حوار البيانات'),
    objective: b('Use a small table to agree on the safest claim.', 'استخدموا جدولاً صغيراً للاتفاق على الادعاء الأكثر حذراً.'),
    format: b('Co-operative answer, then optional individual replay.', 'إجابة تعاونية ثم إعادة فردية اختيارية.'),
    replay: b('Replay swaps the numbers while keeping the same reasoning pattern.', 'تبدّل الإعادة الأرقام مع إبقاء نمط التفكير نفسه.'),
    prompt: b('A table shows 18 votes for A and 20 for B. Which group claim is best?', 'يعرض جدول 18 صوتاً لـ أ و20 صوتاً لـ ب. أي ادعاء جماعي أفضل؟'),
    choices: [choice('B has two more votes in this table', 'لدى ب صوتان أكثر في هذا الجدول'), choice('Everyone prefers B', 'الجميع يفضل ب'), choice('A has no support', 'لا دعم لـ أ'), choice('The table proves tomorrow will match today', 'يثبت الجدول أن الغد سيطابق اليوم')],
    correct: 0,
    explanation: b('The table supports the exact difference, not a broad claim about everyone or the future.', 'يدعم الجدول الفرق المحدد، لا ادعاء واسعاً عن الجميع أو المستقبل.'),
  },
  {
    id: 'social-word-clues',
    title: b('Word clues', 'تلميحات الكلمات'),
    objective: b('Solve a clue together while preserving bilingual meaning.', 'حلوا تلميحاً معاً مع الحفاظ على المعنى ثنائي اللغة.'),
    format: b('One player proposes a clue; others test whether both languages still fit.', 'يقترح لاعب تلميحاً ويختبر الآخرون هل ما زال يناسب اللغتين.'),
    replay: b('Replay asks for a cleaner clue, not a faster response.', 'تطلب الإعادة تلميحاً أوضح لا استجابة أسرع.'),
    prompt: b('A clue works in English but not Arabic. What should the group do?', 'يعمل تلميح بالإنجليزية ولا يعمل بالعربية. ماذا تفعل المجموعة؟'),
    choices: [choice('Rewrite it so both language versions point to the same idea', 'أعد صياغته بحيث تشير النسختان إلى الفكرة نفسها'), choice('Keep only English', 'أبقِ الإنجليزية فقط'), choice('Mark Arabic players wrong', 'اعتبر لاعبي العربية مخطئين'), choice('Hide the clue', 'أخفِ التلميح')],
    correct: 0,
    explanation: b('Bilingual play needs equivalent clues, not one language treated as secondary.', 'اللعب ثنائي اللغة يحتاج تلميحات متكافئة، لا لغة تعامل كأنها ثانوية.'),
  },
  {
    id: 'social-memory-chain',
    title: b('Memory chain', 'سلسلة الذاكرة'),
    objective: b('Build a shared pattern and recall it later.', 'ابنوا نمطاً مشتركاً واسترجعوه لاحقاً.'),
    format: b('Co-operative chain, no public leaderboard.', 'سلسلة تعاونية بلا لوحة ترتيب عامة.'),
    replay: b('Replay starts from the missed link and records whether help was used.', 'تبدأ الإعادة من الحلقة التي فاتت وتسجل هل استُخدمت مساعدة.'),
    prompt: b('The group misses the third item in a chain. What is the fairest outcome?', 'تفوت المجموعة العنصر الثالث في سلسلة. ما النتيجة الأعدل؟'),
    choices: [choice('Record assisted recall and try a related chain', 'سجل استرجاعاً بمساعدة وجرب سلسلة مرتبطة'), choice('Call it mastery', 'سمّه إتقاناً'), choice('Erase the attempt', 'امسح المحاولة'), choice('Blame one player', 'لُم لاعباً واحداً')],
    correct: 0,
    explanation: b('Honest assisted outcomes make practice useful without pretending the recall was independent.', 'تجعل النتائج الصادقة بمساعدة التدريب مفيداً دون ادعاء أن الاسترجاع كان مستقلاً.'),
  },
  {
    id: 'social-fair-choice',
    title: b('Fair choice', 'اختيار عادل'),
    objective: b('Choose a rule before comparing preferences.', 'اختاروا قاعدة قبل مقارنة التفضيلات.'),
    format: b('Group decision prompt with an explicit fairness rule.', 'سؤال قرار جماعي مع قاعدة عدالة واضحة.'),
    replay: b('Replay changes the preference mix and keeps the rule visible.', 'تغيّر الإعادة مزيج التفضيلات وتُبقي القاعدة ظاهرة.'),
    prompt: b('Four players pick between two games. Two choose each game. What should happen before deciding?', 'يختار أربعة لاعبين بين لعبتين. يختار اثنان كل لعبة. ماذا يحدث قبل القرار؟'),
    choices: [choice('Use the agreed tie rule', 'استخدم قاعدة التعادل المتفق عليها'), choice('Let the loudest choose', 'دع الأعلى صوتاً يختار'), choice('Ignore two players', 'تجاهل لاعبين'), choice('Pretend there was no tie', 'تظاهر أنه لا يوجد تعادل')],
    correct: 0,
    explanation: b('A rule chosen before the result is fairer than changing rules after seeing preferences.', 'القاعدة المختارة قبل النتيجة أعدل من تغيير القواعد بعد رؤية التفضيلات.'),
  },
  {
    id: 'social-calm-debate',
    title: b('Calm debate', 'نقاش هادئ'),
    objective: b('Disagree with a claim by asking for a checkable reason.', 'اختلفوا مع ادعاء عبر طلب سبب قابل للتحقق.'),
    format: b('Untimed discussion with reveal/cancel before the final answer.', 'نقاش بلا مؤقّت مع كشف/إلغاء قبل الإجابة النهائية.'),
    replay: b('Replay separates changed minds from corrected facts.', 'تفصل الإعادة بين تغيّر الرأي وتصحيح المعلومة.'),
    prompt: b('A teammate says “this must be true because many people shared it.” What is the best reply?', 'يقول زميل: «لا بد أن هذا صحيح لأن كثيرين شاركوه». ما أفضل رد؟'),
    choices: [choice('What source can we check?', 'ما المصدر الذي يمكننا التحقق منه؟'), choice('Shares are proof', 'المشاركات دليل'), choice('Stop discussing', 'أوقف النقاش'), choice('Choose the funniest answer', 'اختر الإجابة الأظرف')],
    correct: 0,
    explanation: b('Popularity can point to interest, but a checkable source is needed for truth claims.', 'قد تشير الشعبية إلى الاهتمام، لكن ادعاءات الحقيقة تحتاج مصدراً قابلاً للتحقق.'),
  },
].map((collection) => ({
  ...collection,
  audience: 'friends',
  publication: sharedPublication('adult'),
  provenance: sharedProvenance(),
}));

export function learningUnitById(id) {
  return LEARNING_UNITS.find((entry) => entry.id === id) || null;
}

export function socialCollectionById(id) {
  return SOCIAL_COLLECTIONS.find((entry) => entry.id === id) || null;
}

export function eligibleLearningUnits({ audience = null } = {}) {
  return LEARNING_UNITS.filter((entry) => (
    entry.publication.status === 'eligible-authored-learning-release'
    && (!audience || entry.audience === audience)
  ));
}

export function eligibleSocialCollections() {
  return SOCIAL_COLLECTIONS.filter((entry) => entry.publication.status === 'eligible-authored-learning-release');
}
