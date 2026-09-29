// Original, intentionally curated house vocabulary. No third-party game data.
export type DuelLanguage = "en" | "ar";
export const BOARD_SIZE = 9;
export const RACK_SIZE = 7;
export const VOCABULARY_VERSION = 1;
const ENGLISH = `am an as at be by do go he if in is it me my no of oh on or ox so to up us we
ace act add age ago aid aim air all and ant any ape arc are arm art ash ask ate awe axe bad bag ban bar bat bay bed bee beg bet bid big bin bit boa bog bow box boy bud bug bun bus but buy cab can cap car cat cob cod cog cop cot cow cry cub cue cup cut dad dam day den dew did die dig dim dip dog dot dry due dug dye ear eat eel egg ego elf elk end era eve eye fan far fat fax fed fee few fig fin fit fix fly fog for fox fun fur gap gas gel gem get gig gin god got gum gun gut guy gym had ham has hat hay hen her hid him hip his hit hog hop hot how hub hue hug hum hut ice icy ill ink inn ion its ivy jab jam jar jaw jet job jog jot joy jug key kid kin kit lab lad lag lap law lay led leg let lid lie lip lit log lot low mad man map mat may men met mix mob mop mud mug nap net new nod nor not now nut oak oar oat odd off oil old one opt orb ore our out owl own pad pal pan pat paw pay pea peg pen pet pie pig pin pit ply pod pop pot pro pry pub pug pun pup put rag ram ran rap rat raw ray red rib rid rig rim rip rob rod rot row rub rug run rye sad sag sap sat saw say sea see set sew she shy sin sip sir sit six ski sky sly sob sod son sow soy spa spy sub sue sum sun sup tab tag tan tap tar tax tea ten the tie tin tip toe ton too top toy try tub tug two use van vat vet vow war was wax way web wed wee wet who why wig win wit woe won wow yak yam yap yes yet you zap zip zoo
able acid acre aged also area army away baby back bake ball band bank bare bark barn base bath bean bear beat been bell belt bend bent best bike bill bird bite blow blue boat body boil bold bolt bone book boom boot born boss both bowl bulk burn bush busy cake call calm came camp care cart case cash cave chat chef chin chip city clay clip club coal coat code coin cold come cook cool cope copy cord core corn cost cozy crab crew crop cure cute dark dart data date dawn days dead deal dear deep deer deny desk dial dice diet dirt dish does done door down draw drew drop drum duck dune dust each earn ears ease east easy edge else even ever evil exam exit face fact fair fall fame farm fast fate fear feed feel feet fell felt file fill film find fine fire fish five flat flea flew flow foam fold food fool foot form fort four free frog from fuel full fund game gate gave gaze gear gene gift girl give glad glow glue goal goat gold golf gone good gray grew grid grow hair half hall hand hang hard harm hate have head heal hear heat held help herb here hero hide high hill hint hold hole home hope horn host hour huge hunt idea inch into iron item jade jazz join joke jump just keep kept kind king kite knee knew know lace lack lady lake lamb lamp land lane last late lawn lazy lead leaf lean leap left lens less life lift like lime line link lion list live load loan lock logo lone long look loop lord lose loss lost loud love luck made mail main make male many mark mask mass mate math maze meal mean meat meet melt menu mess mice mile milk mind mine mint miss mode moon more most move much must name near neat neck need nest news next nice nine nose note okay once only onto open over pack page paid pain pair pale palm park part pass past path peak pear peel peer pick pine pink pipe plan play plot plum poem poet pole pond pool poor port pose post pour pray pull pure push race rack rain rank rare read real rear reef rent rest rice rich ride ring rise risk road roam roar rock rode role roof room root rope rose rows rule rush safe said sail sake sale salt same sand sang save scan scar seal seat seed seek seem seen self sell send sent shed ship shoe shop shot show shut sick side sign silk sing sink site size skin skip slam slip slow snow soap soft soil sold sole some song soon sort soul soup sour spin spot star stay stem step stop such suit sure swim take tale talk tall tame tank tape task team tear tell tend tent term test text than that them then they thin this time tiny tire told tone took tool torn tour town trap tree trim trio trip true tune turn twin type unit upon used user vast very view vine vote wage wait wake walk wall want warm wash wave weak wear week well went were west what when wide wife wild will wind wine wing wipe wire wise wish with wolf wood wool word wore work worm yard year your zero zone
about after again alone along angry apple beach began begin below black block blood board brain bread break bring broad brown build built chair charm chase check chest child clean clear climb clock close cloud coast color count cover craft cream cross crowd dance dream drink drive earth eight empty enjoy enter equal every exact extra faith false field fifty fight final first flame floor flour focus force forty found fresh front fruit giant glass globe grade grain grand grape grass great green group grown guard guess guide happy heart heavy hello honey horse hotel house human image index inner input issue juice knife known large later laugh layer learn least leave lemon level light limit lines local logic loose magic major march match maybe meant metal might minor model money month moral motor mouth moved music never night noise north novel nurse ocean often olive onion order other outer owner paint panel paper party peace pearl phase phone photo piano piece pilot pitch place plain plane plant plate point power press price pride prime print prize proof proud queen query quick quiet quite radio raise range reach ready refer relax reply reset right river roast robot rocky round route royal scale scene score sense seven shade shape share sharp sheep sheet shelf shell shift shine shirt shock shore short shout shown sight since skill sleep slice slide small smile smoke snake solid solve sound south space spare speak speed spell spend spent spice spill split spoke sport staff stage stair stand start state steam steel stick still stock stone stood store storm story strip study style sugar sunny super sweet table taken taste teach teeth thank their theme there these thick thing think third those three tight timer title toast today topic total touch tough tower trace track trade train treat trend trial tried trust truth twice under union unite until upper upset urban usage usual value video visit voice waste watch water wheel where which while white whole whose woman women words world worry worth would write wrong wrote young
animal answer artist basket beauty better bottle branch bridge bright broken camera candle carpet castle center chance change cherry choice circle coffee corner cotton course cousin create desert design detail doctor double dragon drawer driver during eleven family famous farmer father fellow filter finish flower forest forget formal friday friend frozen future garden gentle golden ground growth hammer hardly health hidden higher honest hunger inside island itself jacket jungle kitten ladder latter lawyer leader legend length lesson letter little living market matter medium member memory middle minute mirror mobile modern moment monkey mother motion museum myself nature nearly needle number object office orange origin parent people period person phrase planet player please pocket police pretty public purple puzzle rabbit random rather reason recipe record remain remind remove repair repeat result return rhythm ripple rocket rotate safety school screen search second secret select senior series settle shadow shared silver simple single sister smooth social source speech spring square stairs status sticky street string strong studio summer switch symbol system temple tennis thanks theory thirty though thread ticket timber tissue toward travel twelve twenty unique update useful valley vendor vision visual volume waiters warmth wealth weekly weight window winter wisdom within wonder wooden writer yellow
balance between brother cabinet capital careful central century chicken choices citizen collect college combine company compass compare complex connect contain content correct country crystal current decimal develop diamond digital distant drawing evening exactly example excited explain explore factory failure fashion feature feeling fifteen flowers fortune freedom gallery general genuine grammar graphic healthy history hundred imagine improve include journey justice kitchen lantern largest leather library logical machine manager meaning measure meeting message million mineral missing morning mystery natural network nothing nowhere nursery officer opening opinion outside painter partner pattern perfect picture players playing popular present prevent privacy problem process project promise protect purpose quarter quality quickly rainbow reading reality regular release remains replace require respect respond restore reverse routine science seconds section serious service sharing shelter similar sixteen solving someone special station stories strange student subject success suggest teacher texture thought through tonight traffic trouble unknown usually variety village visitor waiting weather welcome whisper windows winning without working written`;
const ARABIC = `اب اخ ام ان او اي به بل بي ثم حب حد حر حق حل حي خبز خط دم رب رد زر سن سر شد شر صف ضد ظل عد عز عن عم غد فم قد قل كل كم كن لا لك لم لن لو لي ما مد مر من مو نحن هو هي هم هن يد يا
ابا ابد اثر اجل احد اذن ارض ارز اسد اسم اصل امل امن انا انت اول باب بئر برد برق بصل بطل بعد بغل بقي بلد بنت بيت بحر بدر بشر تاج تبن تحت تمر توت ثلج جبل جسر جمل جمع جزر جفن جهد حبر حجر حذر حرب حرث حزن حسن حظي حقل حكم حلم حمد حمل حوت حول حيث حين خبر ختم خجل خرج خرف خطب خلق خلف خمر خيط دار درس درع درج دلو دمع دهن دور دوم ذئب ذهب راس ربح ربط رجل ردع رزق رسم رسل رشد رعد رغب رغم ركن رمل رمح رهن روح روز ريش زرع زعم زهر زيت زين سار سحب سحر سخي سدس سرج سعد سفر سقف سكر سكن سلم سمع سهم سهل سور سوق سير شاب شاي شجر شحم شرب شرح شرط شرف شرك شطر شعر شغل شكر شكل شمس شهر شهد شوق شيخ صبر صحن صخر صدر صدق صرف صعب صغر صقر صلح صمت صنع صوت صوم صيف ضحك ضخم ضرب ضرس ضعف ضوء طاب طبع طبق طفل طلب طمع طنن طول طيب طير ظهر عبد عبر عجب عدد عدم عرب عرس عرض عرف عرق عزم عسل عشق عصر عضو عطر عظم عقل علم علو عمر عمل عنب عند عهد عود عين غاب غار غاز غدا غرب غرس غرف غزل غسل غصن غضب غنم غير فاز فتح فجر فخر فرد فرض فرح فرق فصل فضل فعل فكر فلك فهم فوق فيل قبل قبر قدر قدم قرد قرن قسم قشر قصد قصر قطع قطن قفل قلب قلم قمح قمر قوم قوي كتب كبر كحل كرم كسر كشف كعب كلب كلف كمل كنز كوكب كيف لعب لحم لحن لسان لطف لعل لقب لمس لون ليل ليمون ماء مات مثل مجد مرح مرن مزح مسك مشي مطر ملك ملح منع مهر موج موز نال نجم نحل نخل ندى نذر نزل نسب نسر نصف نصر نظر نظم نعم نغم نقل نمط نمو نهر نور نون نوم نيل هبط هجر هدم هرب هرم هزم هضم هنا هوى وجه وجد وحش وحد ورد ورق وزن وسط وصف وصل وضع وطن وعد وفق وقت وقف وعي ولد يوم
ابرة اجمل احمر اخضر ازرق اصفر ابيض اسود اكبر اصغر احسن امام امير انسان امان امطار انهار ايام بحر بحار بارد بذور بريد بسيط بطاطا بطريق بطيخ بعيد بقاء بلبل بناء بنين بيوت تاريخ تفاح تلميذ تمثال توابل جواب جوار جزيرة جميل جديد جدار جمال جهاز جنوب جناح حديث حديد حروف حديقة حليب حكمة حمام حصان حضور حياة حيوان خريف خيار خشب خفيف خيال خروف خريطة خباز داخل دفتر دجاج دقيقة دليل دواء دقيق دروس دراجة ربيع رمان رمال رسالة رفيق ركاب رخيص رياض زجاج زهرة زهور زيادة زيتون سبيل سحاب سعادة سريع سلام سماء سمك سمين سيارة سليم سوال سعيد سكان سماء شتاء شجرة شراب شرقي شمال شمعة شباب شعاع شديد شلال شاطئ صباح صديق صغير صادق صابون صورة صيف صفاء صعود طابع طريق طبيب طويل طعام طيور طالب طبخ عادل عاقل عالم عامر عاجل عظيم علوم علامة عميق عنوان عيون غابة غريب غزال غروب غذاء غمام فارس فاصل فاكهة فلاح فصول فضاء فضول فندق فنون فريق قريب قارب قراءة قصير قصة قطيع قلوب قماش قليل قوائم قائم قطار كتاب كبير كريم كاتب كرسي كامل كلام كلاب كمان كثيف لطيف لوحة لوز ليالي لعبة لاعب لحن ماعز مبارك مبنى متجر مثال محبة مدرسة مدينة مرحبا مركب مرصد مسجد مصباح مطبخ معلم معنى مفتاح مكتب مكان ملاك منار منزل منطق مهارة ميدان ميزان ناجح نافذة نبات نجوم نحاس نسيم نشاط نصيب نظام نظيف نغمة نهار نهضة نهاية هادي هدية هلال هواء واحد واسع واضح واجب والد وجود وحيد وجوه ورود ورقة وسادة وصول وعد وليد يابس يمين يسار يقين`;

export function normalizeWord(value: string, lang: DuelLanguage): string {
  const normalized = value.normalize("NFKC").trim().toLowerCase();
  return lang === "ar" ? normalized.replace(/[\u064b-\u065f\u0670\u0640]/gu, "").replace(/[أإآٱ]/gu, "ا").replace(/ى/gu, "ي") : normalized;
}
const vocabularies = {
  en: [...new Set(ENGLISH.split(/\s+/u))].sort(),
  ar: [...new Set(ARABIC.split(/\s+/u).map((word) => normalizeWord(word, "ar")))].sort(),
};
const wordSets = { en: new Set(vocabularies.en), ar: new Set(vocabularies.ar) };
export function vocabulary(lang: DuelLanguage): string[] { return vocabularies[lang]; }
export function letterValue(letter: string, lang: DuelLanguage): number {
  if (lang === "ar") return "اظضظغثذؤئء".includes(letter) ? 3 : "جحخقشطزص".includes(letter) ? 2 : 1;
  return "QZ".includes(letter.toUpperCase()) ? 8 : "JKX".includes(letter.toUpperCase()) ? 5 : "BCFHVWY".includes(letter.toUpperCase()) ? 3 : "DGMP".includes(letter.toUpperCase()) ? 2 : 1;
}
export interface Placement { row: number; col: number; letter: string }
export interface DuelPlayer { id: string; name: string; tokenHash: string; rack: string[]; score: number }
export interface DuelRoomState {
  code: string; lang: DuelLanguage; board: (string | null)[]; players: DuelPlayer[];
  bag: string[]; phase: "waiting" | "playing" | "finished"; turn: number; revision: number;
  scoreless: number; turns: number; expiresAt: number; createdAt: number;
  lastMove: { playerId: string; kind: string; words: string[]; score: number; cells: number[] } | null;
  reason?: string; winnerId?: string | null;
}
export class DuelError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}
export function premium(index: number): "2W" | "2L" | "" {
  if (index === 40 || index === 0 || index === 8 || index === 72 || index === 80) return "2W";
  return [12, 14, 28, 34, 46, 52, 66, 68].includes(index) ? "2L" : "";
}
export function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const random = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / (i + 1)) * (i + 1);
    do { crypto.getRandomValues(random); } while (random[0]! >= limit);
    const j = random[0]! % (i + 1);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
export function makeDeck(lang: DuelLanguage): { racks: string[][]; bag: string[] } {
  // Both opening racks contain an ordinary three-letter word, then play uses a finite bag.
  const starters = lang === "ar" ? ["قمر", "بحر", "نجم", "قلم", "نهر", "ورد", "شمس", "عسل"] : ["cat", "sun", "sea", "pen", "hat", "run", "ten", "dog"];
  const filler = lang === "ar" ? [..."االمنوريبتسعكحدف"] : [..."aaaaeeeeiiioonrrssttlludgmcp"];
  const selected = shuffled(starters);
  const racks = selected.slice(0, 2).map((word) => shuffled([...word, ...shuffled(filler).slice(0, 4)]));
  const bag = shuffled([...filler, ...filler, ...shuffled(starters).slice(0, 3).join("")]).slice(0, 54);
  return { racks, bag };
}
function ensure(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new DuelError(code, message);
}
export function scorePlacement(room: DuelRoomState, player: DuelPlayer, input: unknown): { placements: Placement[]; score: number; words: string[]; rack: string[] } {
  ensure(Array.isArray(input) && input.length > 0 && input.length <= RACK_SIZE, "INVALID_TILES", "Place between one and seven tiles.");
  const placements: Placement[] = [];
  const rack = [...player.rack];
  const used = new Set<number>();
  for (const item of input) {
    ensure(item && typeof item === "object" && !Array.isArray(item), "INVALID_TILES", "Invalid tile placement.");
    const { row, col, letter } = item as Placement;
    ensure(Number.isInteger(row) && row >= 0 && row < BOARD_SIZE && Number.isInteger(col) && col >= 0 && col < BOARD_SIZE && typeof letter === "string", "INVALID_TILES", "Place tiles inside the board.");
    const normalized = normalizeWord(letter, room.lang);
    ensure([...normalized].length === 1, "INVALID_TILES", "Each tile has one letter.");
    const index = row * BOARD_SIZE + col;
    ensure(!used.has(index) && !room.board[index], "OCCUPIED_CELL", "That square is already occupied.");
    const rackIndex = rack.indexOf(normalized);
    ensure(rackIndex >= 0, "MISSING_TILE", "Use letters from your own rack.");
    rack.splice(rackIndex, 1);
    used.add(index);
    placements.push({ row, col, letter: normalized });
  }
  const horizontal = placements.every((p) => p.row === placements[0]!.row);
  const vertical = placements.every((p) => p.col === placements[0]!.col);
  ensure(horizontal || vertical, "NOT_STRAIGHT", "Place tiles in one row or column.");
  const board = [...room.board];
  for (const p of placements) board[p.row * BOARD_SIZE + p.col] = p.letter;
  const indices = placements.map((p) => horizontal ? p.col : p.row);
  for (let offset = Math.min(...indices); offset <= Math.max(...indices); offset++) {
    const index = horizontal ? placements[0]!.row * BOARD_SIZE + offset : offset * BOARD_SIZE + placements[0]!.col;
    ensure(Boolean(board[index]), "GAP", "Words cannot contain empty squares.");
  }
  if (!room.board.some(Boolean)) {
    ensure(used.has(40), "CENTER_REQUIRED", "The opening word must cross the star.");
  } else {
    ensure(placements.some(({ row, col }) => [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]].some(([r, c]) => r! >= 0 && r! < BOARD_SIZE && c! >= 0 && c! < BOARD_SIZE && Boolean(room.board[r! * BOARD_SIZE + c!]))), "NOT_CONNECTED", "Connect your word to a letter already on the board.");
  }
  const formed = new Map<string, number[]>();
  for (const p of placements) {
    for (const [dr, dc] of [[0, 1], [1, 0]]) {
      let row = p.row, col = p.col;
      while (row - dr! >= 0 && col - dc! >= 0 && board[(row - dr!) * BOARD_SIZE + col - dc!]) { row -= dr!; col -= dc!; }
      const cells: number[] = [];
      while (row < BOARD_SIZE && col < BOARD_SIZE && board[row * BOARD_SIZE + col]) { cells.push(row * BOARD_SIZE + col); row += dr!; col += dc!; }
      if (cells.length > 1) formed.set(cells.join(","), cells);
    }
  }
  ensure(formed.size > 0, "WORD_TOO_SHORT", "Make a word of at least two letters.");
  let score = 0;
  const words: string[] = [];
  for (const cells of formed.values()) {
    const word = cells.map((index) => board[index]).join("");
    ensure(wordSets[room.lang].has(word), "WORD_NOT_LISTED", `“${word}” is outside this room’s curated vocabulary.`);
    let points = 0, multiplier = 1;
    for (const index of cells) {
      const bonus = used.has(index) ? premium(index) : "";
      points += letterValue(board[index]!, room.lang) * (bonus === "2L" ? 2 : 1);
      if (bonus === "2W") multiplier *= 2;
    }
    score += points * multiplier;
    words.push(word);
  }
  if (placements.length === RACK_SIZE) score += 15;
  return { placements, score, words, rack };
}
export function finishRoom(room: DuelRoomState, reason: string, now: number): void {
  room.phase = "finished"; room.reason = reason; room.expiresAt = now + 60 * 60_000;
  if (reason !== "resigned") {
    let deductions = 0;
    for (const player of room.players) {
      const penalty = player.rack.reduce((sum, letter) => sum + letterValue(letter, room.lang), 0);
      player.score -= penalty; deductions += penalty;
    }
    const emptied = room.players.find((p) => p.rack.length === 0);
    if (emptied) emptied.score += deductions;
    const [first, second] = room.players;
    room.winnerId = first!.score === second!.score ? null : first!.score > second!.score ? first!.id : second!.id;
  }
}
export function playAction(room: DuelRoomState, playerId: string, action: Record<string, unknown>, now = Date.now()): DuelRoomState {
  const state = structuredClone(room);
  ensure(state.phase === "playing", "NOT_PLAYING", "This match is not in progress.");
  ensure(Number.isInteger(action.revision) && action.revision === state.revision, "STALE_REVISION", "The board changed. Review it and try again.");
  const index = state.players.findIndex((p) => p.id === playerId);
  ensure(index >= 0, "UNAUTHORIZED", "Rejoin using this device’s saved room.");
  const player = state.players[index]!;
  if (action.kind === "resign") {
    state.winnerId = state.players[1 - index]!.id;
    finishRoom(state, "resigned", now);
    state.lastMove = { playerId, kind: "resign", words: [], score: 0, cells: [] };
    state.revision++;
    return state;
  }
  ensure(index === state.turn, "NOT_YOUR_TURN", "Wait for your turn.");
  let score = 0, words: string[] = [], cells: number[] = [];
  if (action.kind === "place") {
    const result = scorePlacement(state, player, action.placements);
    ({ score, words } = result);
    player.rack = result.rack; player.score += score;
    for (const p of result.placements) { const cell = p.row * BOARD_SIZE + p.col; state.board[cell] = p.letter; cells.push(cell); }
    while (player.rack.length < RACK_SIZE && state.bag.length) player.rack.push(state.bag.pop()!);
  } else if (action.kind === "swap") {
    ensure(Array.isArray(action.indices) && action.indices.length > 0 && action.indices.length <= player.rack.length, "INVALID_SWAP", "Select tiles to exchange.");
    const indices = action.indices as number[];
    ensure(indices.every((i) => Number.isInteger(i) && i >= 0 && i < player.rack.length) && new Set(indices).size === indices.length, "INVALID_SWAP", "Select tiles to exchange.");
    ensure(state.bag.length >= RACK_SIZE, "BAG_TOO_SMALL", "Exchange needs at least seven tiles in the bag.");
    const returned = indices.map((i) => player.rack[i]!);
    for (const i of indices) player.rack[i] = state.bag.pop()!;
    state.bag = shuffled([...state.bag, ...returned]);
  } else ensure(action.kind === "pass", "INVALID_ACTION", "Choose a valid action.");
  state.turn = 1 - state.turn;
  state.turns++; state.revision++; state.scoreless = score > 0 ? 0 : state.scoreless + 1;
  state.lastMove = { playerId, kind: String(action.kind), words, score, cells };
  state.expiresAt = now + 24 * 60 * 60_000;
  if (state.scoreless >= 6) finishRoom(state, "scoreless", now);
  else if (!state.bag.length && state.players.some((p) => p.rack.length === 0)) finishRoom(state, "empty-rack", now);
  else if (state.turns >= 80) finishRoom(state, "turn-limit", now);
  return state;
}
export function privateSnapshot(room: DuelRoomState, playerId: string) {
  const you = room.players.find((p) => p.id === playerId);
  if (!you) throw new DuelError("UNAUTHORIZED", "Room access could not be verified.", 403);
  return {
    code: room.code, lang: room.lang, board: room.board, phase: room.phase, revision: room.revision,
    players: room.players.map(({ id, name, score, rack }) => ({ id, name, score, tiles: rack.length })),
    you: you.id, rack: you.rack, turnId: room.players[room.turn]?.id || null,
    remaining: room.bag.length, scoreless: room.scoreless, turns: room.turns, expiresAt: room.expiresAt,
    lastMove: room.lastMove, reason: room.reason || null, winnerId: room.winnerId ?? null,
    vocabularyVersion: VOCABULARY_VERSION,
  };
}
