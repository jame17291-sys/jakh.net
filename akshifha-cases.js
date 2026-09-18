// Five original cases plus six reviewed bilingual expansion cases. See docs/AKSHIFHA-CASEBOOK.md.
// Evidence order is presentation order only; the UI must not mark proof cards.
export const CASES = [
  {
    id: 'the-first-van',
    number: 1,
    title: { ar: 'توصيل كعكة الحفل', en: 'The party cake delivery' },
    intro: {
      ar: 'يقول منسق الحفل: «كعكتنا خرجت مع أول سيارة توصيل». أمامك أوراق هذا الطلب. أي دليلين يكشفان المشكلة في كلامه؟',
      en: 'The party organizer says, “Our cake left on the first delivery van.” These records belong to that order. Which two reveal a problem with that claim?',
    },
    rule: {
      ar: 'كل السجلات المعروضة صحيحة وتخص اليوم نفسه. توقيتا الإغلاق والمغادرة دقيقان ومن الساعة نفسها. لا تُحمّل الكعكة قبل إغلاق علبتها، ولا تعود السيارة بعد مغادرتها لتحميل طلبات أخرى.',
      en: 'All displayed records are accurate and from the same day. Sealing and departure times are exact and use the same clock. A cake cannot be loaded before its box is sealed, and a departed van does not return to collect more orders.',
    },
    difficulty: { ar: 'بداية خفيفة', en: 'Warm-up' },
    evidence: [
      { id: 'cake-seal', kind: 'record', label: { ar: 'سجل إغلاق العلبة', en: 'Box-sealing log' }, text: { ar: 'أُغلقت علبة كعكة هذا الطلب للمرة الأولى داخل المخبز في 14:12.', en: 'This order’s cake box was sealed for the first time inside the bakery at 14:12.' } },
      { id: 'cake-greeting', kind: 'note', label: { ar: 'بطاقة التهنئة', en: 'Greeting card' }, text: { ar: 'النص المطلوب على البطاقة: «مبروك النجاح!»', en: 'Requested card message: “Congratulations on passing!”' } },
      { id: 'cake-van', kind: 'record', label: { ar: 'سجل أول سيارة', en: 'First-van log' }, text: { ar: 'غادرت أول سيارة توصيل المخبز في 14:08.', en: 'The first delivery van left the bakery at 14:08.' } },
      { id: 'cake-decoration', kind: 'receipt', label: { ar: 'إيصال الزينة', en: 'Decoration receipt' }, text: { ar: 'الزينة المختارة: شموع زرقاء ونجوم ورقية.', en: 'Selected decorations: blue candles and paper stars.' } },
    ],
    options: [
      { id: 'arrival-late', text: { ar: 'وصلت الكعكة إلى الحفل بعد موعده.', en: 'The cake arrived after the party started.' } },
      { id: 'missed-first-van', text: { ar: 'لا يمكن أن تكون هذه الكعكة قد خرجت مع أول سيارة.', en: 'This cake could not have left on the first van.' } },
      { id: 'never-packed', text: { ar: 'لم تُوضع الكعكة في علبة أصلًا.', en: 'The cake was never packed in a box.' } },
    ],
    solution: { evidenceIds: ['cake-seal', 'cake-van'], optionId: 'missed-first-van' },
    hints: [
      { ar: 'ابحث عن حدث يجب أن يسبق حدثًا آخر. لون الزينة لا يغيّر ترتيب الأحداث.', en: 'Look for an event that must happen before another. Decoration colors do not change that order.' },
      { ar: 'لا بد من إغلاق العلبة قبل تحميلها. قارن وقت الإغلاق بوقت مغادرة أول سيارة.', en: 'The box must be sealed before loading. Compare its sealing time with the first van’s departure.' },
    ],
    explanation: {
      ar: 'غادرت أول سيارة في 14:08، لكن العلبة لم تُغلق إلا في 14:12، أي بعد المغادرة بأربع دقائق. وبما أن التحميل لا يسبق الإغلاق والسيارة لا تعود، فلا يمكن أن تكون الكعكة قد خرجت معها. لا نعرف من هذه الأوراق متى وصلت الكعكة إلى الحفل.',
      en: 'The first van left at 14:08, but the box was not sealed until 14:12—four minutes later. Loading cannot precede sealing, and the van does not return, so this cake could not have been on it. These records do not establish when the cake reached the party.',
    },
  },
  {
    id: 'one-table-please',
    number: 2,
    title: { ar: 'حجز ليلة المسابقة', en: 'The quiz-night booking' },
    intro: {
      ar: 'خطتكم لعشاء المسابقة واضحة: أربعة أصدقاء على طاولة واحدة. وصلت تفاصيل الحجز، ويقول صديقك إن كل شيء مناسب. أين الخلل؟',
      en: 'The quiz-night dinner plan is simple: four friends at one table. The booking details have arrived, and your friend says everything fits the plan. What does not add up?',
    },
    rule: {
      ar: 'التأكيد والمخطط صحيحان ونهائيان، ورموز الباقات متطابقة بينهما. كل مقعد مذكور متاح لكم. لا يمكن ضم الطاولات أو نقل الكراسي أو إضافة مقاعد. المطلوب تقييم هذا الحجز كما هو.',
      en: 'The confirmation and layout are accurate and final, with matching package codes. Every listed seat is available to your group. Tables cannot be joined, and chairs cannot be moved or added. Evaluate this booking as it stands.',
    },
    difficulty: { ar: 'اربط التفاصيل', en: 'Connect the details' },
    evidence: [
      { id: 'table-menu', kind: 'note', label: { ar: 'اختيار العشاء', en: 'Dinner choice' }, text: { ar: 'طلب المجموعة نباتي، والماء متاح على كل طاولة.', en: 'The group requested vegetarian food. Water is available at every table.' } },
      { id: 'table-layout', kind: 'record', label: { ar: 'مخطط الباقات', en: 'Package layouts' }, text: { ar: 'A: أربعة مقاعد على طاولة واحدة. B: مقعدان على طاولة ومقعدان على طاولة منفصلة. C: ثلاثة مقاعد على طاولة ومقعد على طاولة منفصلة.', en: 'A: four seats at one table. B: two seats at one table and two at a separate table. C: three seats at one table and one at a separate table.' } },
      { id: 'table-booking', kind: 'receipt', label: { ar: 'تأكيد الحجز', en: 'Booking confirmation' }, text: { ar: 'حجز مجموعتكم مؤكد للباقة B.', en: 'Your group’s booking is confirmed for package B.' } },
      { id: 'table-music', kind: 'note', label: { ar: 'برنامج الأمسية', en: 'Evening program' }, text: { ar: 'تعزف فرقة موسيقية مقطوعة ترحيبية قبل المسابقة.', en: 'A band will play a welcome piece before the quiz.' } },
    ],
    options: [
      { id: 'split-group', text: { ar: 'المقاعد تكفي الأربعة، لكن الحجز يقسمهم على طاولتين.', en: 'There are enough seats, but the booking splits the four friends across two tables.' } },
      { id: 'two-standing', text: { ar: 'سيضطر اثنان من الأصدقاء إلى الوقوف.', en: 'Two friends will have to stand.' } },
      { id: 'single-table', text: { ar: 'الحجز يضع الأصدقاء الأربعة على طاولة واحدة.', en: 'The booking puts all four friends at one table.' } },
    ],
    solution: { evidenceIds: ['table-layout', 'table-booking'], optionId: 'split-group' },
    hints: [
      { ar: 'عدد المقاعد ليس المشكلة الوحيدة. أين تقع تلك المقاعد؟', en: 'The number of seats is not the only issue. Where are those seats?' },
      { ar: 'خذ رمز الباقة من تأكيد الحجز، ثم ابحث عن الرمز نفسه في المخطط.', en: 'Take the package code from the confirmation and find that same code in the layout.' },
    ],
    explanation: {
      ar: 'التأكيد يحدد الباقة B. وفي المخطط، تعني B مقعدين على طاولة ومقعدين على طاولة منفصلة. إذن توجد أربعة مقاعد فعلًا، لكن ليست على طاولة واحدة. لا يكفي تأكيد الحجز وحده لمعرفة الترتيب، ولا يكفي المخطط وحده لمعرفة الباقة المحجوزة.',
      en: 'The confirmation selects package B. In the layout, B means two seats at one table and two at a separate table. There really are four seats, but not at one table. The confirmation alone does not reveal the arrangement, and the layout alone does not identify the booked package.',
    },
  },
  {
    id: 'the-wrong-invitation',
    number: 3,
    title: { ar: 'دفعة الدعوات المطبوعة', en: 'The invitation print run' },
    intro: {
      ar: 'نُقلت أمسية نادي القراءة إلى قاعة الحديقة. يقول المنظم إن الدعوات المطبوعة تحمل هذا العنوان الجديد. افحص أثر الملف الذي وصل إلى المطبعة.',
      en: 'The book club’s evening has moved to Garden Hall. The organizer says the printed invitations show that new venue. Follow the file that reached the printer.',
    },
    rule: {
      ar: 'سجل النسخ وإيصال الطباعة موثوقان. يشير كل رقم نسخة إلى ملف ثابت لا يتغير. طبعت المطبعة الملف المسجل في إيصالها دون تعديل، ولا توجد ملصقات تصحيح على الدعوات.',
      en: 'The version history and print receipt are reliable. Each version number identifies an unchanging file. The printer printed the file named on its receipt without editing it, and no correction stickers were added.',
    },
    difficulty: { ar: 'تتبّع الأثر', en: 'Follow the trail' },
    evidence: [
      { id: 'invitation-paper', kind: 'receipt', label: { ar: 'مواصفات الورق', en: 'Paper specification' }, text: { ar: 'ورق أبيض سميك، مع طباعة بالأزرق الداكن.', en: 'Thick white paper, printed in dark blue.' } },
      { id: 'invitation-print', kind: 'receipt', label: { ar: 'إيصال تنفيذ الطباعة', en: 'Completed print receipt' }, text: { ar: 'تمت طباعة ملف الدعوة، النسخة 4.', en: 'Invitation file, version 4, was printed.' } },
      { id: 'invitation-books', kind: 'note', label: { ar: 'اختيار الكتاب', en: 'Book selection' }, text: { ar: 'ستناقش الأمسية مجموعة قصصية، لا رواية طويلة.', en: 'The evening will discuss a short-story collection, not a long novel.' } },
      { id: 'invitation-versions', kind: 'record', label: { ar: 'سجل نسخ الدعوة', en: 'Invitation version history' }, text: { ar: 'النسخة 4: العنوان المكتوب «قاعة الأرز». النسخة 5: استُبدل العنوان بـ«قاعة الحديقة».', en: 'Version 4: venue reads “Cedar Hall.” Version 5: venue changed to “Garden Hall.”' } },
      { id: 'invitation-envelopes', kind: 'note', label: { ar: 'تجهيز الأظرف', en: 'Envelope preparation' }, text: { ar: 'الأظرف سادة، بلا عنوان مكان مطبوع عليها.', en: 'The envelopes are plain, with no venue printed on them.' } },
    ],
    options: [
      { id: 'all-guests-misdirected', text: { ar: 'ذهب جميع المدعوين بالفعل إلى المكان الخطأ.', en: 'Every guest has already gone to the wrong venue.' } },
      { id: 'new-venue-printed', text: { ar: 'الدعوات المطبوعة تحمل اسم قاعة الحديقة.', en: 'The printed invitations name Garden Hall.' } },
      { id: 'old-venue-printed', text: { ar: 'الدعوات المطبوعة ما زالت تحمل اسم قاعة الأرز.', en: 'The printed invitations still name Cedar Hall.' } },
    ],
    solution: { evidenceIds: ['invitation-print', 'invitation-versions'], optionId: 'old-venue-printed' },
    hints: [
      { ar: 'وجود نسخة مصححة لا يعني أنها النسخة التي طُبعت.', en: 'An updated file can exist without being the file that was printed.' },
      { ar: 'طابق رقم النسخة في إيصال الطباعة مع العنوان المقابل له في سجل النسخ.', en: 'Match the version number on the print receipt to its venue in the version history.' },
    ],
    explanation: {
      ar: 'إيصال التنفيذ يحدد النسخة 4، وسجل النسخ يثبت أن هذه النسخة تحمل اسم قاعة الأرز. التعديل إلى قاعة الحديقة موجود في النسخة 5، لا في الملف المطبوع. هذا يثبت خطأ العنوان على الدعوات، لكنه لا يخبرنا بما فعله المدعوون.',
      en: 'The completed receipt names version 4, and the version history says that file names Cedar Hall. Garden Hall appears in version 5, not the printed file. This establishes the wrong venue on the invitations, but tells us nothing about what guests have done.',
    },
  },
  {
    id: 'the-aquarium-shortcut',
    number: 4,
    title: { ar: 'رحلة مباشرة… إلى أين؟', en: 'A direct ride… to where?' },
    intro: {
      ar: 'الوجهة هي حوض الأحياء المائية. يقول صديقك: «حجزت لنا حافلة تصل إليه مباشرة، ولن نحتاج إلى أي وسيلة أخرى». هل يدعم الحجز هذه الخطة؟',
      en: 'You are heading to the aquarium. Your friend says, “I booked a bus that takes us straight there. We will not need any other transport.” Does the booking support that plan?',
    },
    rule: {
      ar: 'التذكرة ودليل المسارات صحيحان. قائمة محطات كل خط كاملة، ولا توجد تحويلات أو محطات إضافية. للوصول مباشرة بالحافلة يجب أن تتوقف في محطة حوض الأحياء المائية نفسها؛ محطة الحديقة ليست المحطة نفسها.',
      en: 'The ticket and route directory are accurate. Every line’s stop list is complete, with no detours or extra stops. A direct bus ride must stop at the aquarium stop itself; the park is not the same stop.',
    },
    difficulty: { ar: 'دقّق في الخطة', en: 'Check the plan' },
    evidence: [
      { id: 'bus-ticket', kind: 'receipt', label: { ar: 'التذكرة المحجوزة', en: 'Booked ticket' }, text: { ar: 'الخط المحجوز: الأزرق. محطة الركوب: المتحف.', en: 'Booked line: Blue. Boarding stop: Museum.' } },
      { id: 'bus-departures', kind: 'schedule', label: { ar: 'لوحة المغادرة', en: 'Departure board' }, text: { ar: 'الأزرق والأخضر: يغادر كلا الخطين محطة المتحف في 18:20.', en: 'Blue and Green: both lines leave the Museum stop at 18:20.' } },
      { id: 'bus-admission', kind: 'receipt', label: { ar: 'حجز دخول حوض الأحياء المائية', en: 'Aquarium admission booking' }, text: { ar: 'موعد دخول مجموعتكم: 19:00. حجز الدخول منفصل عن تذاكر المواصلات ولا يتضمن وسيلة نقل.', en: 'Your group’s admission time: 19:00. Admission is separate from transport tickets and does not include a ride.' } },
      { id: 'bus-routes', kind: 'record', label: { ar: 'دليل المسارات الكامل', en: 'Complete route directory' }, text: { ar: 'الأزرق: المتحف ← المكتبة ← الحديقة، نهاية الخط. الأخضر: المتحف ← السوق ← حوض الأحياء المائية، نهاية الخط.', en: 'Blue: Museum → Library → Park, end of line. Green: Museum → Market → Aquarium, end of line.' } },
    ],
    options: [
      { id: 'not-direct', text: { ar: 'الخط المحجوز لا يصل مباشرة إلى محطة حوض الأحياء المائية.', en: 'The booked line does not take you directly to the aquarium stop.' } },
      { id: 'wrong-date', text: { ar: 'التذكرة محجوزة ليوم آخر.', en: 'The ticket is booked for a different day.' } },
      { id: 'extra-charge', text: { ar: 'ستدفعون حتمًا رسومًا إضافية لتصحيح الحجز.', en: 'Correcting the booking will definitely cost an extra fee.' } },
    ],
    solution: { evidenceIds: ['bus-ticket', 'bus-routes'], optionId: 'not-direct' },
    hints: [
      { ar: 'وقت المغادرة وموعد الدخول لا يحددان محطات الحافلة. ابحث عن اسم الخط المحجوز وأين يصل.', en: 'Departure and admission times do not identify a bus’s stops. Find the booked line and where it goes.' },
      { ar: 'هل تظهر محطة الوجهة في القائمة الكاملة لمحطات الخط الموجود على التذكرة؟', en: 'Does the destination appear in the complete stop list for the line on the ticket?' },
    ],
    explanation: {
      ar: 'التذكرة للخط الأزرق، ودليله الكامل ينتهي عند الحديقة ولا يتضمن حوض الأحياء المائية. الخط الأخضر يتضمن الوجهة، لكنه ليس الخط المحجوز. إذن الحجز الحالي لا يحقق وعد الرحلة المباشرة. لا تحدد الأدلة تاريخًا خاطئًا أو رسوم تعديل.',
      en: 'The ticket is for the Blue line. Its complete route ends at the park and does not include the aquarium. Green includes the destination, but it is not the booked line. The current booking therefore does not deliver the promised direct ride. The evidence establishes neither a wrong date nor a change fee.',
    },
  },
  {
    id: 'the-photo-caption',
    number: 5,
    title: { ar: 'من على اليسار؟', en: 'Who is on the left?' },
    intro: {
      ar: 'كتب نادي التصوير تحت صورة الفريق: «أمينة على الطرف الأيسر». ضاعت الصورة الأصلية، لكن بقيت ملاحظتان موثوقتان عن ترتيب الأشخاص. هل يمكن تصحيح التعليق؟',
      en: 'The photography club captioned its team photo, “Amina is on the far left.” The original image is missing, but two reliable notes about the lineup remain. Can you correct the caption?',
    },
    rule: {
      ar: 'في الصورة ثلاثة أشخاص فقط: سلمى ونور وأمينة، في صف واحد وبمواضع مختلفة. ملاحظات الترتيب صحيحة. اليسار واليمين دائمًا من جهة من ينظر إلى الصورة، والصورة غير معكوسة.',
      en: 'Exactly three people appear: Salma, Noor, and Amina, in one row at distinct positions. The lineup notes are accurate. Left and right always mean the viewer’s perspective, and the image is not mirrored.',
    },
    difficulty: { ar: 'خطوتان منطقيتان', en: 'Two-step deduction' },
    evidence: [
      { id: 'photo-attendance', kind: 'record', label: { ar: 'سجل الحضور', en: 'Attendance register' }, text: { ar: 'الأسماء المسجلة: أمينة، نور، سلمى. يسجل هذا المستند الحاضرين فقط، لا ترتيبهم في الصورة.', en: 'Names listed: Amina, Noor, Salma. This document records attendance only, not positions in the photo.' } },
      { id: 'photo-neighbors', kind: 'record', label: { ar: 'ملاحظة المصور', en: 'Photographer’s lineup note' }, text: { ar: 'تقف سلمى مباشرة إلى يسار نور، ولا أحد بينهما.', en: 'Salma stands immediately to Noor’s left, with nobody between them.' } },
      { id: 'photo-editing', kind: 'record', label: { ar: 'سجل معالجة الصورة', en: 'Image-editing log' }, text: { ar: 'عُدلت ألوان الصورة فقط. لم تُقص الصورة، ولم تُعكس أفقيًا، ولم يُنقل أي شخص داخلها.', en: 'Only the colors were adjusted. The image was not cropped or horizontally flipped, and no person was moved within it.' } },
      { id: 'photo-order', kind: 'record', label: { ar: 'ملاحظة المساعد', en: 'Assistant’s lineup note' }, text: { ar: 'تقف نور إلى يسار أمينة، وليس بالضرورة بجوارها.', en: 'Noor stands to Amina’s left, not necessarily immediately beside her.' } },
      { id: 'photo-album', kind: 'note', label: { ar: 'عنوان الألبوم', en: 'Album title' }, text: { ar: 'عنوان الألبوم: «يوم النادي المفتوح».', en: 'Album title: “Club Open Day.”' } },
    ],
    options: [
      { id: 'noor-left', text: { ar: 'نور هي الشخص الموجود على الطرف الأيسر.', en: 'Noor is the person on the far left.' } },
      { id: 'salma-left', text: { ar: 'سلمى هي الشخص الموجود على الطرف الأيسر.', en: 'Salma is the person on the far left.' } },
      { id: 'amina-left', text: { ar: 'أمينة هي الشخص الموجود على الطرف الأيسر.', en: 'Amina is the person on the far left.' } },
    ],
    solution: { evidenceIds: ['photo-neighbors', 'photo-order'], optionId: 'salma-left' },
    hints: [
      { ar: 'رتّب الأسماء بدلًا من تخمين صاحب التعليق. توجد ثلاثة مواضع فقط.', en: 'Arrange the names instead of guessing who wrote the caption. There are only three positions.' },
      { ar: 'سلمى تأتي قبل نور، ونور تأتي قبل أمينة عند القراءة من اليسار إلى اليمين. أين يمكن وضع سلمى؟', en: 'From left to right, Salma comes before Noor, and Noor before Amina. Where must Salma go?' },
    ],
    explanation: {
      ar: 'الملاحظة الأولى تضع سلمى مباشرة إلى يسار نور. والثانية تضع نور إلى يسار أمينة. ومع وجود ثلاثة أشخاص فقط، فالترتيب من اليسار إلى اليمين هو: سلمى، ثم نور، ثم أمينة. إذن سلمى على الطرف الأيسر. كل ملاحظة وحدها تترك أكثر من ترتيب ممكن.',
      en: 'The first note places Salma immediately left of Noor. The second places Noor left of Amina. With only three people, the order from left to right must be Salma, then Noor, then Amina. Salma is therefore on the far left. Either note alone permits more than one lineup.',
    },
  },

{
  "id": "two-stages-one-host",
  "number": 6,
  "title": {
    "ar": "فقرتان ومقدّمة واحدة",
    "en": "Two stages, one host"
  },
  "intro": {
    "ar": "ستشارك هناء في بروفة عرض الدمى، ثم تقدّم نهائي مسابقة الألغاز. يقول المنظم: «المواعيد متتابعة، فلا مشكلة». لكن القاعتين تستخدمان ساعتين مختلفتين. ما الذي يكشفه الجدول؟",
    "en": "Hana will rehearse a puppet show, then host the puzzle final. The organizer says, “The slots run one after the other. No problem.” But the two rooms use different clocks. What does the schedule reveal?"
  },
  "rule": {
    "ar": "الموعدان في اليوم نفسه، وأوقاتهما دقيقة. يجب أن تبقى هناء شخصيًا في كل قاعة طوال فقرتها، بلا فواصل. يتوقف الالتزام في لحظة نهاية الفقرة. فرق التوقيت بين الساعتين ثابت طوال الموعدين.",
    "en": "Both slots are on the same day and their times are exact. Hana must be physically present throughout each slot, with no breaks. A slot releases her at its end time. The difference between the two clocks stays constant throughout."
  },
  "difficulty": {
    "ar": "وحّد التوقيت",
    "en": "Sync the clocks"
  },
  "evidence": [
    {
      "id": "host-rehearsal-clock",
      "kind": "schedule",
      "label": {
        "ar": "ورقة البروفة",
        "en": "Rehearsal sheet"
      },
      "text": {
        "ar": "البروفة: من 18:12 إلى 18:27، بحسب ساعة قاعة الدمى. هذه الساعة متقدمة خمس دقائق على ساعة البهو.",
        "en": "Rehearsal: 18:12–18:27 by the puppet room clock. That clock is five minutes ahead of the foyer clock."
      }
    },
    {
      "id": "host-sound-check",
      "kind": "record",
      "label": {
        "ar": "تجهيز الصوت",
        "en": "Sound check"
      },
      "text": {
        "ar": "في كل قاعة ميكروفون خاص بها، وقد جُهّزا قبل وصول هناء. لا يلزم نقل معدات بين الفقرتين.",
        "en": "Each room has its own microphone, set up before Hana arrives. No equipment needs moving between slots."
      }
    },
    {
      "id": "host-final-slot",
      "kind": "schedule",
      "label": {
        "ar": "موعد النهائي",
        "en": "Final running order"
      },
      "text": {
        "ar": "تقديم هناء لنهائي الألغاز: من 18:20 إلى 18:26 في قاعة المسابقة. هذا الجدول يستخدم ساعة البهو.",
        "en": "Hana hosts the puzzle final from 18:20 to 18:26 in the quiz room. This running order uses the foyer clock."
      }
    },
    {
      "id": "host-costume-note",
      "kind": "note",
      "label": {
        "ar": "ملاحظة الملابس",
        "en": "Wardrobe note"
      },
      "text": {
        "ar": "سترتدي هناء ملابسها نفسها في البروفة والنهائي. لا يوجد تبديل ملابس ضمن الخطة.",
        "en": "Hana will wear the same outfit for rehearsal and the final. No costume change is planned."
      }
    }
  ],
  "options": [
    {
      "id": "host-six-overlap",
      "text": {
        "ar": "يقع النهائي كله، ومدته ست دقائق، داخل وقت البروفة.",
        "en": "The entire six-minute final falls inside the rehearsal slot."
      }
    },
    {
      "id": "host-five-gap",
      "text": {
        "ar": "توجد خمس دقائق خالية بين الموعدين.",
        "en": "There is a five-minute gap between the slots."
      }
    },
    {
      "id": "host-two-overlap",
      "text": {
        "ar": "يتداخل الموعدان دقيقتين، فلا تستطيع هناء الالتزام بكليهما كاملًا.",
        "en": "The slots overlap for two minutes, so Hana cannot complete both in full."
      }
    }
  ],
  "solution": {
    "evidenceIds": [
      "host-rehearsal-clock",
      "host-final-slot"
    ],
    "optionId": "host-two-overlap"
  },
  "hints": [
    {
      "ar": "لا تقارن الأرقام قبل أن تجعلها تشير إلى الساعة نفسها. قراءة الساعة المتقدمة تكون أكبر من قراءة الساعة الأخرى في اللحظة نفسها.",
      "en": "Put both slots on the same clock before comparing numbers. A clock that is ahead displays a later time than the reference clock."
    },
    {
      "ar": "اطرح خمس دقائق من وقتي البروفة، ثم ابحث عن الجزء المشترك بينها وبين فترة النهائي.",
      "en": "Subtract five minutes from both rehearsal times, then find the part that falls inside the final's time slot."
    }
  ],
  "explanation": {
    "ar": "بحسب ساعة البهو، تمتد البروفة من 18:07 إلى 18:22. والنهائي من 18:20 إلى 18:26، لذا يشترك الموعدان في الفترة من 18:20 إلى 18:22: دقيقتان. تجهيز الميكروفونات وعدم تبديل الملابس لا يحلان هذا التداخل. يبدو أن النهائي يقع كله داخل البروفة إذا قارنت الأرقام دون تصحيح فرق الساعتين، لكنه لا يقع كله داخلها بعد توحيد التوقيت.",
    "en": "On the foyer clock, rehearsal runs from 18:07 to 18:22. The final runs from 18:20 to 18:26, so both require Hana from 18:20 to 18:22: two minutes. Ready microphones and no costume change cannot remove that overlap. Comparing the printed times without correcting the clocks makes the entire final appear to fall inside rehearsal; after correction, it does not."
  }
},
{
  "id": "the-mascots-last-turn",
  "number": 7,
  "title": {
    "ar": "الانعطاف الأخير",
    "en": "The mascot's last turn"
  },
  "intro": {
    "ar": "أوصلت شخصية المهرجان صندوق الجوائز، ثم غادرت قبل أن تخبركم أين تركته. بقيت صورة الانطلاق وورقة الطريق. في أي جناح تجدون الصندوق؟",
    "en": "The festival mascot delivered the prize box, then left without saying where it was dropped off. You have a departure photo and the route sheet. Which stall has the box?"
  },
  "rule": {
    "ar": "الساحة شبكة من بلاطات مربعة متساوية، والمسارات مفتوحة. بالنسبة إلى النافورة: خيمة القراءة تبعد ثلاث بلاطات غربًا وبلاطة جنوبًا؛ جناح الشاي ثلاثًا شرقًا وواحدة شمالًا؛ وجناح الموسيقى واحدة غربًا وثلاثًا شمالًا. نُفّذ الطريق حرفيًا، وتُرك الصندوق عند نهايته ولم يُنقل. كل انعطاف ربع دورة من اتجاه السير الحالي.",
    "en": "The courtyard is an open grid of equal square tiles. From the fountain, the Reading Tent is three tiles west and one south; the Tea Stall is three east and one north; the Music Stall is one west and three north. The route was followed exactly, and the box stayed at its endpoint. Every turn is a quarter turn relative to the current heading."
  },
  "difficulty": {
    "ar": "تتبّع الانعطافات",
    "en": "Follow the turns"
  },
  "evidence": [
    {
      "id": "mascot-stall-roster",
      "kind": "schedule",
      "label": {
        "ar": "سجل المناوبة",
        "en": "Stall roster"
      },
      "text": {
        "ar": "كانت خيمة القراءة وجناح الشاي وجناح الموسيقى جميعها مفتوحة وبها موظفون طوال فترة التوصيل.",
        "en": "The Reading Tent, Tea Stall, and Music Stall were all open and staffed throughout the delivery."
      }
    },
    {
      "id": "mascot-route-sheet",
      "kind": "note",
      "label": {
        "ar": "ورقة الطريق",
        "en": "Route sheet"
      },
      "text": {
        "ar": "تقدّم بلاطتين. انعطف يسارًا وتقدّم بلاطة. انعطف يمينًا وتقدّم بلاطة أخرى. اترك الصندوق عند الجناح هناك.",
        "en": "Go forward two tiles. Turn left and go forward one tile. Turn right and go forward one more tile. Leave the box at the stall there."
      }
    },
    {
      "id": "mascot-parcel-slip",
      "kind": "receipt",
      "label": {
        "ar": "ورقة الصندوق",
        "en": "Parcel slip"
      },
      "text": {
        "ar": "المحتوى: جوائز نهائي المهرجان. خانة اسم جناح التسليم تُركت فارغة.",
        "en": "Contents: prizes for the festival final. The delivery-stall name was left blank."
      }
    },
    {
      "id": "mascot-start-photo",
      "kind": "record",
      "label": {
        "ar": "صورة لحظة الانطلاق",
        "en": "Departure photo"
      },
      "text": {
        "ar": "بدأت الشخصية الطريق عند النافورة، متجهة بوجهها نحو الغرب. التُقطت الصورة قبل أول خطوة مباشرة.",
        "en": "The mascot began at the fountain, facing west. The photo was taken immediately before the first step."
      }
    }
  ],
  "options": [
    {
      "id": "mascot-reading-tent",
      "text": {
        "ar": "الصندوق عند خيمة القراءة.",
        "en": "The box is at the Reading Tent."
      }
    },
    {
      "id": "mascot-music-stall",
      "text": {
        "ar": "الصندوق عند جناح الموسيقى.",
        "en": "The box is at the Music Stall."
      }
    },
    {
      "id": "mascot-tea-stall",
      "text": {
        "ar": "الصندوق عند جناح الشاي.",
        "en": "The box is at the Tea Stall."
      }
    }
  ],
  "solution": {
    "evidenceIds": [
      "mascot-route-sheet",
      "mascot-start-photo"
    ],
    "optionId": "mascot-reading-tent"
  },
  "hints": [
    {
      "ar": "اليسار ليس الغرب دائمًا. ابدأ بتحديد الجهة التي تواجهها الشخصية قبل أول خطوة.",
      "en": "Left does not always mean west. First establish which way the mascot faces before taking a step."
    },
    {
      "ar": "عندما تتجه غربًا، يكون الانعطاف يسارًا نحو الجنوب. وبعد ذلك، إلى أين يأخذك الانعطاف يمينًا؟ اجمع الحركة في كل اتجاه.",
      "en": "Facing west, a left turn points south. Which way does the next right turn point? Add up the movement in each direction."
    }
  ],
  "explanation": {
    "ar": "بدأت الشخصية نحو الغرب، فسارت بلاطتين غربًا. انعطفت يسارًا إلى الجنوب وسارت بلاطة، ثم يمينًا إلى الغرب وسارت بلاطة أخرى. المحصلة ثلاث بلاطات غرب النافورة وبلاطة جنوبها، وهو موقع خيمة القراءة. الوصول إلى جناح الموسيقى ينتج عن افتراض بداية نحو الشمال، وهو افتراض تنفيه صورة الانطلاق. فتح الأجنحة جميعًا لا يحدد أيها استقبل الصندوق.",
    "en": "Starting west, the mascot walks two tiles west, turns left to walk one south, then turns right to walk one more west. That ends three tiles west and one south of the fountain: the Reading Tent. The Music Stall would fit a north-facing start, but the departure photo rules that out. Knowing that all the stalls were open does not identify the delivery."
  }
},
{
  "id": "who-has-the-last-clue",
  "number": 8,
  "title": {
    "ar": "مع من الدليل الأخير؟",
    "en": "Who has the last clue?"
  },
  "intro": {
    "ar": "وصلتم إلى آخر مرحلة في لعبة البحث عن الكنز. الدليل الأخير داخل الظرف الأزرق، والأظرف مع ميرا وزيد ولينا وعمر. سجل التوزيع ناقص، لكن رسالة من لينا قد تكمله. إلى من تذهبون؟",
    "en": "You have reached the last stage of the treasure trail. The final clue is in the blue envelope, and Mira, Zaid, Lina, and Omar have the envelopes. The distribution notes are incomplete, but a message from Lina may finish the job. Who should you find?"
  },
  "rule": {
    "ar": "توجد أربعة أظرف فقط: ذهبي وأخضر وبنفسجي وأزرق. مع كل شخص ظرف واحد، ولم يتبادلوا الأظرف. السجل والرسالة صحيحان، وكل اختيارات الألوان الواردة في السجل نُفذت كما طُلبت.",
    "en": "There are exactly four envelopes: gold, green, purple, and blue. Each person holds one, and nobody has exchanged envelopes. The notes and message are accurate, and every color choice recorded in the notes was honored."
  },
  "difficulty": {
    "ar": "استبعد ثم اربط",
    "en": "Eliminate and connect"
  },
  "evidence": [
    {
      "id": "envelope-color-requests",
      "kind": "record",
      "label": {
        "ar": "ملاحظات التوزيع",
        "en": "Distribution notes"
      },
      "text": {
        "ar": "ميرا: اختارت ظرفًا أخضر أو بنفسجيًا. زيد: اختار ظرفًا ذهبيًا أو أزرق. لم يُدوَّن لون ظرف لينا أو عمر.",
        "en": "Mira: chose either a green or a purple envelope. Zaid: chose either a gold or a blue envelope. Lina's and Omar's colors were not recorded."
      }
    },
    {
      "id": "envelope-seal-check",
      "kind": "record",
      "label": {
        "ar": "فحص الأظرف",
        "en": "Envelope check"
      },
      "text": {
        "ar": "الأظرف الأربعة بالحجم نفسه، وهي معتمة ومغلقة. لا يمكن قراءة الدليل من خارج الظرف.",
        "en": "All four envelopes are the same size, opaque, and sealed. The clue cannot be read through an envelope."
      }
    },
    {
      "id": "envelope-lina-message",
      "kind": "note",
      "label": {
        "ar": "رسالة لينا",
        "en": "Lina's message"
      },
      "text": {
        "ar": "«الظرف الذي معي أخضر. ورأيت ظرف عمر؛ ليس ذهبيًا».",
        "en": "“My envelope is green. I saw Omar’s envelope; his is not gold.”"
      }
    },
    {
      "id": "envelope-collection-note",
      "kind": "schedule",
      "label": {
        "ar": "موعد تسليم الأظرف",
        "en": "Collection window"
      },
      "text": {
        "ar": "يبقى الأصدقاء الأربعة متاحين طوال الجولة الأخيرة لتسليم الأظرف التي معهم. مواعيد تواجدهم واحدة.",
        "en": "All four friends remain available throughout the final round to hand over their own envelopes. They share the same collection window."
      }
    }
  ],
  "options": [
    {
      "id": "envelope-zaid",
      "text": {
        "ar": "الظرف الأزرق مع زيد.",
        "en": "Zaid has the blue envelope."
      }
    },
    {
      "id": "envelope-omar",
      "text": {
        "ar": "الظرف الأزرق مع عمر.",
        "en": "Omar has the blue envelope."
      }
    },
    {
      "id": "envelope-lina",
      "text": {
        "ar": "الظرف الأزرق مع لينا.",
        "en": "Lina has the blue envelope."
      }
    }
  ],
  "solution": {
    "evidenceIds": [
      "envelope-color-requests",
      "envelope-lina-message"
    ],
    "optionId": "envelope-omar"
  },
  "hints": [
    {
      "ar": "كل لون يُستخدم مرة واحدة فقط. إذا كان الأخضر مع لينا، فكيف يؤثر ذلك في اختيار ميرا؟",
      "en": "Each color is used only once. If Lina has green, what does that do to Mira's choices?"
    },
    {
      "ar": "بعد تحديد ظرفي لينا وميرا، يبقى لونان لزيد وعمر. رسالة لينا تستبعد أحدهما عن عمر.",
      "en": "After placing Lina's and Mira's envelopes, two colors remain for Zaid and Omar. Lina's message rules out one of those colors for Omar."
    }
  ],
  "explanation": {
    "ar": "لينا معها الأخضر. ميرا اختارت الأخضر أو البنفسجي، وبما أن الأخضر مع لينا فلا يبقى لميرا إلا البنفسجي. يتبقى الذهبي والأزرق لزيد وعمر. رسالة لينا تستبعد الذهبي عن عمر، إذن عمر معه الأزرق، وزيد معه الذهبي. السجل وحده يسمح بأن يكون الأزرق مع زيد أو لينا أو عمر. والرسالة وحدها لا تستبعد أن يكون ظرف عمر بنفسجيًا؛ لذا نحتاج إلى الدليلين.",
    "en": "Lina has green. Mira chose green or purple, so with green taken, Mira must have purple. Gold and blue remain for Zaid and Omar. Lina's message says Omar does not have gold, so Omar has blue and Zaid has gold. The notes alone allow blue to belong to Zaid, Lina, or Omar. The message alone leaves purple possible for Omar, so both cards are needed."
  }
},
{
  "id": "the-sealed-final-score",
  "number": 9,
  "title": {
    "ar": "الكيس الأخير",
    "en": "The last sealed bag"
  },
  "intro": {
    "ar": "انتهت ليلة الألعاب، وكيس فريق اللؤلؤ ما زال مغلقًا. يتصدر فريق الأزرق الأرصدة المسجلة حتى الآن، وأفراده يستعدون لاستلام الكأس. هل يمكنك تحديد الفائز من دون فتح الكيس الأخير؟",
    "en": "Game night is over, and Pearl team's bag is still sealed. Blue leads among the bags counted so far, and its players are getting ready to collect the trophy. Can you name the winner without opening the last bag?"
  },
  "rule": {
    "ar": "تتنافس أربعة فرق فقط: العنبر، والأزرق، والأخضر، واللؤلؤ. وُزعت قطع اللعب كلها عليها عند البداية. خلال اللعب تنتقل القطع بين الفرق فقط؛ لا تُضاف قطع ولا تُفقد ولا تُعاد إلى المخزن. عند النهاية، يحتوي كيس كل فريق على جميع قطعه، ويفوز من يملك أكبر عدد. السجلات صحيحة، ولم تنتقل أي قطعة بعد النهاية.",
    "en": "There are exactly four teams: Amber, Blue, Green, and Pearl. All playing tokens were distributed among them at the start. During play, tokens only move between teams; none are added, lost, or returned to storage. Each team's final bag holds all its tokens. The largest final total wins. The records are accurate, and no tokens moved after play ended."
  },
  "difficulty": {
    "ar": "احفظ المجموع",
    "en": "Follow the total"
  },
  "evidence": [
    {
      "id": "sealed-score-halftime",
      "kind": "record",
      "label": {
        "ar": "لقطة من منتصف اللعب",
        "en": "Halftime snapshot"
      },
      "text": {
        "ar": "كان لدى فريق الأزرق 12 قطعة في منتصف اللعب. لا تسجل هذه اللقطة أرصدة بقية الفرق.",
        "en": "Blue held 12 tokens at halftime. This snapshot does not record the other teams' balances."
      }
    },
    {
      "id": "sealed-score-inventory",
      "kind": "record",
      "label": {
        "ar": "جرد البداية",
        "en": "Opening inventory"
      },
      "text": {
        "ar": "دخلت اللعب 31 قطعة بالضبط، ووُزعت كلها على الفرق الأربعة قبل الجولة الأولى.",
        "en": "Exactly 31 tokens entered play. All were distributed among the four teams before round one."
      }
    },
    {
      "id": "sealed-score-transfer",
      "kind": "receipt",
      "label": {
        "ar": "إيصال صفقة مبكرة",
        "en": "Early trade receipt"
      },
      "text": {
        "ar": "في الجولة الثالثة، نقل فريق اللؤلؤ قطعتين إلى فريق العنبر. لا يذكر الإيصال رصيد أي منهما، واستمر اللعب بعد الصفقة.",
        "en": "In round three, Pearl transferred two tokens to Amber. The receipt gives neither team's balance, and play continued after the trade."
      }
    },
    {
      "id": "sealed-score-final-count",
      "kind": "record",
      "label": {
        "ar": "محضر العد النهائي",
        "en": "Final count sheet"
      },
      "text": {
        "ar": "عُدّت ثلاثة أكياس: العنبر 7 قطع، والأزرق 9، والأخضر 5. لم يُفتح كيس اللؤلؤ بعد.",
        "en": "Three bags have been counted: Amber has 7 tokens, Blue has 9, and Green has 5. Pearl's bag has not yet been opened."
      }
    }
  ],
  "options": [
    {
      "id": "blue-alone-wins",
      "text": {
        "ar": "فريق الأزرق هو الفائز الوحيد، برصيد 9 قطع.",
        "en": "Blue is the sole winner, with 9 tokens."
      }
    },
    {
      "id": "pearl-ten-wins",
      "text": {
        "ar": "في كيس اللؤلؤ 10 قطع؛ لذا يفوز وحده.",
        "en": "Pearl's bag holds 10 tokens, so Pearl wins outright."
      }
    },
    {
      "id": "pearl-blue-tie",
      "text": {
        "ar": "يتعادل اللؤلؤ والأزرق، برصيد 9 قطع لكل منهما.",
        "en": "Pearl and Blue tie, with 9 tokens each."
      }
    }
  ],
  "solution": {
    "evidenceIds": [
      "sealed-score-inventory",
      "sealed-score-final-count"
    ],
    "optionId": "pearl-ten-wins"
  },
  "hints": [
    {
      "ar": "تغيّر توزيع القطع أثناء اللعب. ما العدد الذي لم يتغيّر؟",
      "en": "The tokens changed hands during play. Which total never changed?"
    },
    {
      "ar": "اجمع الأكياس الثلاثة المفتوحة، ثم اطرح مجموعها من جرد البداية. كل القطع الباقية في الكيس الرابع.",
      "en": "Add the three counted bags, then subtract that sum from the opening inventory. Every remaining token is in the fourth bag."
    }
  ],
  "explanation": {
    "ar": "تحتوي الأكياس المفتوحة على 7 + 9 + 5 = 21 قطعة. جرد البداية 31 قطعة، والصفقات تغيّر مالك القطع ولا تغيّر مجموعها. إذن يحتوي كيس اللؤلؤ على 31 − 21 = 10 قطع، وهو أكبر من أرصدة الفرق الأخرى. لقطة منتصف اللعب والصفقة المبكرة لا تحددان الرصيد النهائي. من دون جرد البداية لا نعرف كم بقي، ومن دون العد النهائي لا نعرف كم نطرح.",
    "en": "The counted bags contain 7 + 9 + 5 = 21 tokens. The opening inventory was 31, and trades change ownership without changing that total. Pearl therefore holds 31 − 21 = 10 tokens, more than any other team. The halftime snapshot and early trade do not establish final balances. Without the inventory, the remainder is unknown; without the final count, there is no amount to subtract."
  }
},
{
  "id": "the-chest-with-two-controls",
  "number": 10,
  "title": {
    "ar": "متى ينفتح صندوق الكنز؟",
    "en": "What opens the treasure chest?"
  },
  "intro": {
    "ar": "في بروفة ليلة الألغاز، جُهّز صندوق الكنز بزرّ وحصيرة أرضية، لكن المنظم نسي الإعداد المختار. أمامك نتائج التجارب. أي دليلين يكشفان طريقة فتحه؟",
    "en": "At puzzle-night rehearsal, a treasure chest is connected to a button and a floor mat, but the organizer has forgotten its selected setting. You have the trial records. Which two identify how to open it?"
  },
  "rule": {
    "ar": "للصندوق إعداد واحد ثابت من الإعدادات الثلاثة المذكورة في خيارات الإجابة. يستجيب فورًا، ولا توجد أعطال أو مؤقتات أو شروط أخرى. تبدأ كل تجربة بالصندوق مغلقًا، في الظروف نفسها، وتختلف فقط حالة الضغط على الزر والوقوف على الحصيرة. جميع النتائج دقيقة.",
    "en": "The chest uses exactly one fixed setting from the three answer options. It responds immediately, with no faults, timers, or other conditions. Every trial starts with the chest closed under identical conditions, changing only whether the button is pressed and whether someone stands on the mat. All results are accurate."
  },
  "difficulty": {
    "ar": "اختبر الاحتمالات",
    "en": "Test the explanations"
  },
  "evidence": [
    {
      "id": "chest-neither-trial",
      "kind": "record",
      "label": {
        "ar": "تجربة بلا تدخل",
        "en": "Neither control used"
      },
      "text": {
        "ar": "لم يضغط أحد الزر ولم يقف أحد على الحصيرة. بقي الصندوق مغلقًا.",
        "en": "Nobody pressed the button or stood on the mat. The chest stayed closed."
      }
    },
    {
      "id": "chest-button-trial",
      "kind": "record",
      "label": {
        "ar": "تجربة الزر وحده",
        "en": "Button-only trial"
      },
      "text": {
        "ar": "ضغط طارق الزر، ولم يكن أحد على الحصيرة. بقي الصندوق مغلقًا.",
        "en": "Tariq pressed the button while nobody stood on the mat. The chest stayed closed."
      }
    },
    {
      "id": "chest-together-trial",
      "kind": "record",
      "label": {
        "ar": "تجربة الزر والحصيرة",
        "en": "Both controls used"
      },
      "text": {
        "ar": "ضغط طارق الزر بينما كانت نور واقفة على الحصيرة. انفتح الصندوق.",
        "en": "Tariq pressed the button while Noor stood on the mat. The chest opened."
      }
    },
    {
      "id": "chest-mat-trial",
      "kind": "record",
      "label": {
        "ar": "تجربة الحصيرة وحدها",
        "en": "Mat-only trial"
      },
      "text": {
        "ar": "وقفت نور على الحصيرة، ولم يضغط أحد الزر. بقي الصندوق مغلقًا.",
        "en": "Noor stood on the mat while nobody pressed the button. The chest stayed closed."
      }
    }
  ],
  "options": [
    {
      "id": "chest-button-setting",
      "text": {
        "ar": "ينفتح عند ضغط الزر؛ ولا يؤثر الوقوف على الحصيرة في فتحه.",
        "en": "Pressing the button opens it; the mat makes no difference."
      }
    },
    {
      "id": "chest-mat-setting",
      "text": {
        "ar": "ينفتح عند الوقوف على الحصيرة؛ ولا يؤثر ضغط الزر في فتحه.",
        "en": "Standing on the mat opens it; the button makes no difference."
      }
    },
    {
      "id": "chest-both-setting",
      "text": {
        "ar": "ينفتح عندما يُضغط الزر ويقف شخص على الحصيرة في الوقت نفسه، ويبقى مغلقًا فيما عدا ذلك.",
        "en": "It opens when the button is pressed and the mat is occupied together, and stays closed otherwise."
      }
    }
  ],
  "solution": {
    "evidenceIds": [
      "chest-button-trial",
      "chest-mat-trial"
    ],
    "optionId": "chest-both-setting"
  },
  "hints": [
    {
      "ar": "نجاح تجربة ما لا يثبت وحده أي عامل كان ضروريًا. ابحث عن التجارب التي تغيّر عاملًا واحدًا فقط.",
      "en": "A successful trial does not by itself reveal which factor was necessary. Look at the trials using just one control."
    },
    {
      "ar": "فشل الزر وحده يستبعد إعدادًا، وفشل الحصيرة وحدها يستبعد إعدادًا آخر. أي إعداد يبقى؟",
      "en": "The button-only failure rules out one setting. The mat-only failure rules out another. Which setting remains?"
    }
  ],
  "explanation": {
    "ar": "لو كان الزر وحده هو شرط الفتح، لانفتح الصندوق في تجربة الزر وحده؛ لكنه بقي مغلقًا. ولو كانت الحصيرة وحدها هي الشرط، لانفتح في تجربتها؛ لكنه بقي مغلقًا أيضًا. وبما أن الإعدادات الممكنة محصورة في الثلاثة المعروضة، فلا يبقى إلا اشتراط الزر والحصيرة معًا. تجربة استخدامهما معًا تنجح في الإعدادات الثلاثة، وتجربة تركهما تنتهي بالإغلاق في الإعدادات الثلاثة، لذا لا تميز أي منهما الإعداد المختار. نحتاج إلى تجربتي الاستخدام المنفرد، لا إلى تجربة النجاح فقط.",
    "en": "If the button alone controlled opening, the button-only trial would have opened the chest. It did not. If the mat alone controlled opening, the mat-only trial would have opened it. That also failed. Since the three listed settings are exhaustive, both controls must be required together. Using both would succeed under all three settings, and using neither would fail under all three, so neither of those trials distinguishes the settings. The two single-control failures are the decisive pair."
  }
},
{
  "id": "one-entry-left",
  "number": 11,
  "title": {
    "ar": "محاولة أخيرة",
    "en": "One entry left"
  },
  "intro": {
    "ar": "في غرفة ألغاز، يقف فريقك أمام صندوق الجائزة. يقترح أحدهم إدخال الرمز 132 فورًا. افحص السجل واختر الدليلين اللذين يحددان ما يمكن الجزم به قبل الضغط على زر التأكيد.",
    "en": "In an escape room, your team has reached the prize box. A teammate wants to enter 132 immediately. Inspect the records and choose the two clues that establish what you can be certain of before pressing Enter."
  },
  "rule": {
    "ar": "يتكون الرمز الحالي من الأرقام 1 و2 و3، ويُستخدم كل رقم مرة واحدة. تُقرأ خانات الرمز من اليسار إلى اليمين؛ الخانة الأولى هي الموجودة أقصى اليسار. جميع الأدلة صحيحة وتخص الرمز الحالي نفسه، ولم يتغير الرمز بين المحاولات. لا توجد قاعدة أخرى لاختيار ترتيب الأرقام.",
    "en": "The current code uses the digits 1, 2, and 3 exactly once each. Read the code from left to right; the first digit is the leftmost digit. Every clue is accurate and concerns this same current code, which has not changed between attempts. No other rule determines the digit order."
  },
  "difficulty": {
    "ar": "اعرف حدود الدليل",
    "en": "Know what is proved"
  },
  "evidence": [
    {
      "id": "last-entry-rejected",
      "kind": "record",
      "label": {
        "ar": "سجل المحاولة السابقة",
        "en": "Previous attempt log"
      },
      "text": {
        "ar": "أُدخل الرمز 321، وظهرت رسالة «رمز غير صحيح».",
        "en": "The code 321 was entered. The display reported “Incorrect code.”"
      }
    },
    {
      "id": "last-entry-end-digits",
      "kind": "note",
      "label": {
        "ar": "تلميح الخانتين الطرفيتين",
        "en": "Outer-digits clue"
      },
      "text": {
        "ar": "الرقم في الخانة الأولى أصغر من الرقم في الخانة الأخيرة.",
        "en": "The first digit is smaller than the last digit."
      }
    },
    {
      "id": "last-entry-budget",
      "kind": "record",
      "label": {
        "ar": "عداد المحاولات",
        "en": "Attempt counter"
      },
      "text": {
        "ar": "بقيت محاولة واحدة. إذا كانت خاطئة، فلن يمكن إدخال رمز آخر حتى يعود مشرف اللعبة.",
        "en": "One attempt remains. If it is wrong, no further code can be entered until the game host returns."
      }
    },
    {
      "id": "last-entry-middle-digit",
      "kind": "note",
      "label": {
        "ar": "تلميح الخانة الوسطى",
        "en": "Middle-digit clue"
      },
      "text": {
        "ar": "الرقم الأوسط ليس 2.",
        "en": "The middle digit is not 2."
      }
    }
  ],
  "options": [
    {
      "id": "last-entry-123-or-132",
      "text": {
        "ar": "لم يبق إلا 123 و132، وكلاهما يوافق الأدلة؛ نحتاج إلى معلومة أخرى للاختيار بينهما.",
        "en": "Only 123 and 132 remain, and both fit every clue; another piece of information is needed to choose between them."
      }
    },
    {
      "id": "last-entry-two-possible",
      "text": {
        "ar": "لم يبق إلا 132 و213، وكلاهما يوافق الأدلة؛ نحتاج إلى معلومة أخرى للاختيار بينهما.",
        "en": "Only 132 and 213 remain, and both fit every clue; another piece of information is needed to choose between them."
      }
    },
    {
      "id": "last-entry-132-or-231",
      "text": {
        "ar": "لم يبق إلا 132 و231، وكلاهما يوافق الأدلة؛ نحتاج إلى معلومة أخرى للاختيار بينهما.",
        "en": "Only 132 and 231 remain, and both fit every clue; another piece of information is needed to choose between them."
      }
    }
  ],
  "solution": {
    "evidenceIds": [
      "last-entry-end-digits",
      "last-entry-middle-digit"
    ],
    "optionId": "last-entry-two-possible"
  },
  "hints": [
    {
      "ar": "لا تكتفِ بإيجاد رمز ينجح مع التلميحين. اسأل: هل يوجد رمز آخر ينجح أيضًا؟",
      "en": "Finding one code that fits both clues is not enough. Could a different code fit them too?"
    },
    {
      "ar": "ابدأ بالترتيبات الستة للأرقام. احتفظ بما يكون رقمه الأول أصغر من الأخير، ثم استبعد كل ترتيب رقمه الأوسط 2.",
      "en": "Start with all six digit arrangements. Keep those whose first digit is smaller than their last, then remove any with 2 in the middle."
    }
  ],
  "explanation": {
    "ar": "الترتيبات الممكنة أولًا هي 123 و132 و213 و231 و312 و321. شرط أن يكون الأول أصغر من الأخير يُبقي 123 و132 و213. وشرط ألا يكون الأوسط 2 يستبعد 123، فيبقى 132 و213. يحقق كلاهما الشرطين، وكلاهما ينسجم مع رفض 321. لذلك لا يثبت السجل أيهما الرمز الصحيح، ولا يبرر تفضيل أحدهما. التلميح الأول وحده يترك ثلاثة رموز، والثاني وحده يترك أربعة؛ اجتماعهما هو ما يحصر الاحتمالين بالضبط. عداد المحاولات يفسر أهمية التريث، لكنه لا يكشف رقمًا إضافيًا.",
    "en": "The starting possibilities are 123, 132, 213, 231, 312, and 321. Requiring the first digit to be smaller than the last leaves 123, 132, and 213. Excluding 2 from the middle removes 123, leaving exactly 132 and 213. Both satisfy both clues and are consistent with the rejection of 321. The records therefore do not identify which is correct or justify preferring one. The outer-digits clue alone leaves three codes; the middle-digit clue alone leaves four. Together they establish the exact two remaining possibilities. The attempt counter explains why guessing matters, but supplies no further digit information."
  }
},
];
