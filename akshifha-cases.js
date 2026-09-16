// Original bilingual starter cases. See docs/AKSHIFHA-PILOT.md for validation scope.
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
];
