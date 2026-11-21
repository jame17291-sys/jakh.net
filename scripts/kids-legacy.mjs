import fs from 'node:fs';
import { pair } from './kids-resources.mjs';

// Card IDs remain intact for shared links and saved quiz history. One note per card, in the
// order of data/kids-riddles.json. Explanations were checked against every English and Arabic
// source question. On 2026-10-25 kids-riddles-019 and -021 got new puzzles (their old ones
// repeated logic-puzzles templates) and ten riddles were added; their notes were rewritten.
const notes = [
 ['5-6', 'The wax makes a coloured mark. Many crayons have a paper wrapper around the wax.', 'يترك الشمع أثرًا ملوّنًا، وتحيط بكثير من أقلام الشمع ورقة تغليف.'],
 ['5-6', 'A carrot is a root that grows underground. Orange is a common carrot colour, although carrots can have other colours too.', 'الجزر جذر ينمو تحت الأرض. البرتقالي لون شائع له، وقد يكون بألوان أخرى أيضًا.'],
 ['5-6', 'Origami creates shapes by folding paper. A paper bird is one familiar example.', 'يصنع الأوريغامي أشكالًا بطيّ الورق، والطائر الورقي مثال مألوف عليه.'],
 ['5-6', 'A lamp has a base, a shade and a switch. “A small sun” describes its light; it is not a real sun.', 'للمصباح قاعدة وغطاء ومفتاح. «شمس صغيرة» وصف لضوئه وليست شمسًا حقيقية.'],
 ['5-6', 'Socks come as a pair and cover your feet. Shoes usually cover the socks when you put them on.', 'تأتي الجوارب في زوج وتغطّي القدمين، وعادة تغطّيها الأحذية عند ارتدائها.'],
 ['5-6', 'The two clear lenses of eyeglasses can help someone see clearly. Not everyone needs glasses.', 'قد تساعد عدستا النظارة الشفّافتان الشخص على الرؤية بوضوح، ولا يحتاج الجميع إلى نظارات.'],
 ['7-8', 'Your body blocks some sunlight, leaving a darker outline on a surface. Without that light source, that particular shadow disappears.', 'يحجب جسمك جزءًا من ضوء الشمس فيترك شكلًا أغمق على سطح. وبغياب مصدر الضوء هذا يختفي ذلك الظلّ.'],
 ['5-6', 'A sketchbook holds drawings on its pages. “Remember” means the drawings stay there for you to see later.', 'يحتفظ دفتر الرسم بالرسومات على صفحاته. و«يحفظ» هنا تعني أنّك تستطيع رؤيتها لاحقًا.'],
 ['5-6', 'A pen uses ink to make marks. Its tip touches the paper and its cap covers the tip.', 'يستخدم القلم الحبر لترك أثر. يلمس رأسه الورق ويغطّي الغطاء ذلك الرأس.'],
 ['5-6', 'The tongue is the flap beneath the laces of a shoe. It shares a name with a body part but cannot taste.', 'لسان الحذاء هو الجزء الموجود تحت الأربطة. يشترك مع عضو الجسم في الاسم، لكنه لا يتذوّق.'],
 ['7-8', 'Six minus two leaves four red blocks. One blue block on each adds four more: 4 + 4 = 8.', 'ستة ناقص اثنين يترك أربعة مكعّبات حمراء. نضيف أربعة زرقاء، واحدًا فوق كل أحمر: 4 + 4 = 8.'],
 ['5-6', 'A calendar divides a year into months and shows dates. The clue describes a calendar with a grid of date squares.', 'يقسّم التقويم السنة إلى أشهر ويعرض التواريخ. تصف القرينة تقويمًا تُعرض فيه التواريخ في مربّعات.'],
 ['7-8', 'To “break a promise” means not to do what you said you would do. Nothing physical has to snap. Other figurative answers may fit too.', '«إخلاف الوعد» يعني عدم فعل ما قلت إنّك ستفعله. لا ينكسر شيء مادي. وقد تناسب القرينة إجابات مجازية أخرى أيضًا.'],
 ['5-6', 'A countdown counts backwards to a starting moment: three, two, one, go.', 'يعدّ العدّ التنازلي إلى الخلف وصولًا إلى لحظة البدء: ثلاثة، اثنان، واحد، انطلق.'],
 ['7-8', 'Count backwards from Friday: Thursday is one day before it and Wednesday is two days before it.', 'عدّ إلى الخلف من الجمعة: الخميس يسبقه بيوم، والأربعاء يسبقه بيومين.'],
 ['5-6', 'A smartphone can store maps, messages and games digitally. A passcode can lock access to it.', 'يمكن للهاتف الذكي تخزين الخرائط والرسائل والألعاب رقميًا، ويمكن لرمز مرور قفل الوصول إليه.'],
 ['5-6', 'An eraser wears away as it removes pencil marks. It removes writing instead of adding it.', 'تتآكل الممحاة أثناء إزالة آثار القلم الرصاص، فهي تزيل الكتابة بدلًا من إضافتها.'],
 ['5-6', 'A mug has a handle and an open top. Tilting it lets the drink flow out.', 'للكوب ذي المقبض فتحة علوية ومقبض، وتسمح إمالته بخروج الشراب.'],
 ['9-12', 'Each cat catches one mouse every 3 minutes, so the 3 cats together catch one mouse a minute. In 100 minutes the same 3 cats catch 100 mice.', 'تصطاد كل قطة فأرًا واحدًا كل 3 دقائق، فتصطاد القطط الثلاث معًا فأرًا كل دقيقة. وفي 100 دقيقة تصطاد القطط الثلاث نفسها 100 فأر.'],
 ['7-8', 'A chessboard has eight rows of eight squares. Eight times eight equals 64.', 'في رقعة الشطرنج ثمانية صفوف، في كل منها ثمانية مربّعات. ثمانية في ثمانية يساوي 64.'],
 ['7-8', 'Any number multiplied by zero gives zero: 7 × 0 = 0 and 100 × 0 = 0. One does not work, because 7 × 1 = 7.', 'أيّ عدد يُضرب في الصفر يكون ناتجه صفرًا: 7 × 0 = 0 و100 × 0 = 0. أما الواحد فلا يصلح، لأن 7 × 1 = 7.'],
 ['9-12', 'The first factor increases by one each time, with the next whole number beside it. After 4 × 5 comes 5 × 6 = 30.', 'يزداد العامل الأول واحدًا كل مرة ويُضرب في العدد الصحيح الذي يليه. بعد 4 × 5 تأتي 5 × 6 = 30.'],
 ['7-8', 'There are four different corners and four different side midpoints. Add 4 + 4; do not count a corner twice.', 'هناك أربع زوايا مختلفة وأربعة منتصفات للأضلاع. اجمع 4 + 4، ولا تعدّ الزاوية مرتين.'],
 ['9-12', 'Multiples shared by 6 and 8 below 50 are 24 and 48. Only 24 has digits adding to 6: 2 + 4 = 6.', 'المضاعفان المشتركان للعددين 6 و8 تحت 50 هما 24 و48. وحده 24 مجموع رقميه 6، إذ 2 + 4 = 6.'],
 ['9-12', 'From west, a right quarter-turn points north. A right half-turn points south. A left quarter-turn from south points east.', 'من الغرب، ربع دورة يمينًا يصل إلى الشمال. نصف دورة يمينًا يصل إلى الجنوب. ثم ربع دورة يسارًا من الجنوب يصل إلى الشرق.'],
 ['7-8', 'The digit appears once in 1, once in 10, twice in 11, and once in 12: 1 + 1 + 2 + 1 = 5.', 'يظهر الرقم مرة في 1، ومرة في 10، ومرتين في 11، ومرة في 12: 1 + 1 + 2 + 1 = 5.'],
 ['9-12', 'Being greater than 300 puts 3 first. The middle is 1, leaving 2 at the end. The result 312 is even.', 'كون الرمز أكبر من 300 يضع 3 أولًا. الرقم الأوسط 1، فيبقى 2 في النهاية. والعدد 312 زوجي.'],
 ['7-8', 'Remove the four extra marbles from the total of ten. Split the remaining six equally into three and three, then return the four: seven and three.', 'أزل الكرات الأربع الزائدة من المجموع عشرة. قسّم الست الباقية بالتساوي إلى ثلاثة وثلاثة، ثم أعد الأربع: سبعة وثلاثة.'],
 ['7-8', 'Add each hour’s chimes: 1 + 2 + 3 + 4 + 5 = 15.', 'اجمع دقّات كل ساعة: 1 + 2 + 3 + 4 + 5 = 15.'],
 ['5-6', 'The two main hands show hours and minutes on the clock face. Some clocks also have a thinner seconds hand.', 'يشير العقربان الرئيسيان إلى الساعات والدقائق على وجه الساعة. وبعض الساعات لها أيضًا عقرب ثوانٍ أرفع.'],
 // Ten riddles added on 2026-10-25 at the owner's request (kids-riddles-031 to 040).
 // Reviewed by Claude (AI) for accuracy, age fit and Arabic; see
 // docs/content-review/kids-riddles-additions-2026-10-25.md.
 ['5-6', 'A date palm grows tall in hot, dry places. Its long leaves spread out at the top like a crown, and its sweet fruit is the date.', 'تنمو النخلة عاليةً في الأماكن الحارة الجافة، وتنتشر أوراقها الطويلة في أعلاها مثل التاج، وثمرها الحلو هو التمر.'],
 ['7-8', 'Most fish have no eyelids, so their eyes stay open even while they rest. Their gills take oxygen from the water.', 'معظم الأسماك ليس لها جفون، فتبقى عيونها مفتوحة حتى وهي تستريح. وتأخذ خياشيمها الأكسجين من الماء.'],
 ['7-8', 'A ship is shaped to push aside a lot of water, so the water holds it up. A small iron nail is heavier than the water it pushes aside, so it sinks.', 'شُكِّلت السفينة لتزيح كمية كبيرة من الماء، فيحملها الماء. أما المسمار الحديدي الصغير فأثقل من الماء الذي يزيحه، فيغرق.'],
 ['7-8', 'The Sun always lights half of the Moon. As the Moon travels around Earth we see more or less of that lit half, but the Moon itself keeps the same size and weight.', 'تضيء الشمس دائمًا نصف القمر. وحين يدور القمر حول الأرض نرى جزءًا أكبر أو أصغر من ذلك النصف المضيء، لكن القمر نفسه لا يتغيّر حجمه ولا وزنه.'],
 ['7-8', 'Falcons have hooked beaks and excellent eyesight. Falconry, training falcons to hunt, is an old tradition in the Gulf, and the falconer wears a thick glove to protect the hand.', 'للصقر منقار معقوف وبصر حادّ. والصيد بالصقور تقليد قديم في الخليج، ويلبس المدرّب قفازًا سميكًا يحمي يده.'],
 ['7-8', 'Putting all the hay together makes one big pile, so there is one haystack. 5 + 4 = 9 counts the piles before they were joined.', 'عندما يُجمع القش كله معًا يصبح كومة واحدة كبيرة. أما 5 + 4 = 9 فهو عدد الأكوام قبل جمعها.'],
 ['7-8', 'Each child really did take one apple. The fifth child simply took the basket too, so that apple never left the basket.', 'أخذ كل طفل تفاحة فعلًا، لكن الطفل الخامس أخذ السلّة معها، فلم تخرج تفاحته من السلّة.'],
 ['9-12', 'Sara and her 4 sisters make 5 girls. They all share the same single brother, so the family has 5 + 1 = 6 children.', 'سارة وأخواتها الأربع خمس بنات، ولهن جميعًا الأخ نفسه، فيكون في العائلة 5 + 1 = 6 أطفال.'],
 ['9-12', 'The big cube is 2 small cubes long, 2 wide and 2 tall. One layer needs 2 × 2 = 4 cubes, and two layers need 8.', 'طول المكعب الكبير مكعبان صغيران، وعرضه مكعبان، وارتفاعه مكعبان. تحتاج الطبقة الواحدة إلى 2 × 2 = 4 مكعبات، والطبقتان إلى 8.'],
 ['7-8', 'Each step skips one day: Monday, then Wednesday after skipping Tuesday, then Friday after skipping Thursday, then Sunday after skipping Saturday.', 'كل خطوة تتخطّى يومًا: الاثنين، ثم الأربعاء بعد تخطّي الثلاثاء، ثم الجمعة بعد تخطّي الخميس، ثم الأحد بعد تخطّي السبت.'],
];
export function loadLegacy(root) {
  const cards = JSON.parse(fs.readFileSync(`${root}/data/kids-riddles.json`, 'utf8'));
  if (cards.length !== notes.length) throw Error('Legacy kids review must cover every kids riddle.');
  return cards.map((card, i) => ({ id: card.id, question: card.question, answer: card.answer, age: notes[i][0], explanation: pair(notes[i][1], notes[i][2]) }));
}
