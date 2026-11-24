// Программа по умолчанию. Хранится в базе как редактируемые данные (store kv, ключ 'program').
// days — тренировочные дни, week — что стоит в каждый день недели (1 = пн … 0 = вс):
// id дня, 'walk' — ходьба, 'rest' — отдых.
// Упражнение дня: ex — id из EX, sets, lo–hi — повторы (у 'time' — секунды), rest — отдых в секундах.
const REST_BASE = 90, REST_ISO = 60, REST_HOLD = 45;  // 0.5: Андрею 2 мин много — база 90 с, изоляция 60 с
const it = (ex, sets, lo, hi, extra) => Object.assign({ ex, sets, lo, hi, rest: EX[ex].base ? REST_BASE : REST_ISO }, extra || {});

// v7 (0.19): в пятницу добавлены скручивания в тренажёре с блинами на рычаге (3×10–15).
// v6 (0.17): решение Андрея — Пн A, Вт B, Чт C, Пт D; на рост мышц, каждая мышца 2 раза в неделю.
// Турника нет: без виса и подъёма ног в висе; путь к подтягиванию — гравитрон Вт/Пт + «доп. подходы» в конце любой тренировки.
// ss: true — суперсет: делается в паузах предыдущего упражнения, своего времени и своего отдыха не имеет.
// pull: 'neg' — негативы в гравитроне (в программе v6 не стоят, код оставлен).
const PROGRAM_V = 17;  // v17 (40.0): косые — в Пн диагональные подъёмы ног, в Чт дровосек на блоке, в Пт боковая планка;   // v16 (38.0): разгибание из-за головы идёт первым и отдельно, разгибание на блоке — в суперсете с прессом на блоке;   // v15 (36.0): в пятницу добавлен наклонный жим в рычажном тренажёре;   // v14 (34.0): время отдыха 120/75/60 с;   // v13 (33.0): в пятницу (день D) задняя дельта в кроссовере → обратная бабочка;   // v12 (29.0): во вторник и четверг сгибание на блоке → подъём EZ-штанги;   // v11 (26.0): румынская тяга → тяга в Смите;   // v10 (24.0): 5 дней, ноги в субботу, бег в среду; v9 (21.0): в четверг присед в тренажёре вместо жима ногами; v8 (16.0): разведение в стороны — на нижнем блоке
// v14 (34.0): отдых — 2 мин у тяжёлых базовых, 75 с у изоляции (диапазон 60–90), 60 с у пресса
const REST_HEAVY = new Set(['bench', 'incl_db', 'sh_press', 'chest_press', 'incl_press_m', 'gravitron', 'row', 'lat_pd', 'db_row', 'machine_squat', 'smith_rdl', 'leg_press']);
const REST_ABS = new Set(['cable_crunch', 'chair_lr']);
const restOf = ex => REST_HEAVY.has(ex) ? 120 : REST_ABS.has(ex) ? 60 : 75;
function defaultProgram() {
  const P = {
    v: PROGRAM_V,
    days: {
      A: { name: 'Грудь, трицепс, пресс', items: [
        it('bench', 4, 6, 10), it('calf', 3, 12, 15, { ss: true }), it('incl_db', 3, 8, 12), it('low_crossover', 3, 12, 15),
        it('cable_lat_raise', 3, 12, 20), it('rope_ovh', 3, 10, 15), it('pushdown', 3, 10, 15), it('cable_crunch', 3, 10, 15, { ss: true }), it('chair_lr_diag', 3, 10, 15),
      ] },
      B: { name: 'Спина, бицепс, трапеции', items: [
        it('gravitron', 4, 6, 10), it('row', 3, 8, 12), it('lat_pd', 3, 10, 12), it('pullover', 3, 12, 15),
        it('rear_fly', 3, 12, 15), it('shrug', 3, 10, 15), it('ez_curl', 3, 10, 15),
      ] },
      C: { name: 'Плечи и руки', items: [
        it('sh_press', 3, 8, 12), it('cable_lat_raise', 4, 12, 20), it('lat_raise', 3, 12, 15, { ss: true }), it('face_pull', 3, 12, 15),
        it('ez_curl', 3, 10, 15), it('rope_ovh', 2, 10, 15), it('pushdown', 3, 10, 15), it('cable_crunch', 3, 10, 15, { ss: true }), it('cable_woodchop', 3, 10, 12),
      ] },
      D: { name: 'Верх: грудь, спина, дельты', items: [
        it('chest_press', 3, 8, 12), it('incl_press_m', 3, 8, 12), it('gravitron', 3, 6, 10), it('db_row', 3, 8, 12), it('incl_fly', 3, 12, 15),
        it('cable_lat_raise', 3, 12, 15), it('side_plank', 3, 30, 40, { ss: true }), it('rear_fly', 3, 12, 15), it('chair_lr', 3, 10, 15),
      ] },
      E: { name: 'Ноги', items: [
        it('machine_squat', 4, 8, 12), it('smith_rdl', 3, 8, 12), it('leg_press', 3, 10, 12), it('leg_curl', 4, 10, 15),
        it('leg_ext', 3, 12, 15), it('calf', 4, 12, 15),
      ] },
    },
    week: { 1: 'A', 2: 'B', 3: 'walk', 4: 'C', 5: 'D', 6: 'E', 0: 'rest' },
  };
  for (const d of Object.values(P.days)) for (const x of d.items) x.rest = restOf(x.ex);
  return P;
}

// Расчётная длительность (без разминочных подходов), сверена по двум реальным тренировкам Андрея (5 и 6 окт):
// подход вместе с записью — базовое ~65 с, изоляция ~90 с, плюс отдых по плану, плюс переход к новому упражнению ~2,5 мин.
// Проверка: Пн 5 окт модель 75 мин (+7 мин разминки) — факт 80; Вт 6 окт модель 53 (+2,5 разминка) — факт 55.
// Каждая разминка в жизни добавляет ~2,5 мин к показанному времени.
const SET_BASE = 65, SET_ISO = 90, MOVE_SEC = 170;
function dayMinutes(day) {
  let s = 0;
  for (const x of day.items) {
    const e = EX[x.ex]; if (!e || x.pull === 'neg' || x.ss) continue;  // негативы позже; суперсет идёт в паузах основного — времени не добавляет
    const work = e.type === 'time' ? x.hi * (e.id === 'side_plank' ? 2 : 1) + 15 : e.base ? SET_BASE : SET_ISO;
    s += x.sets * work + (x.sets - 1) * x.rest + MOVE_SEC;
  }
  return Math.round(s / 60);
}
const MAX_MIN = 70;

// ───── Готовые программы на выбор (первый запуск и «Ещё → Расписание и программа») ─────
const WEEKS = {
  d4: { 1: 'A', 2: 'B', 3: 'rest', 4: 'C', 5: 'D', 6: 'rest', 0: 'rest' },
  d3: { 1: 'A', 2: 'rest', 3: 'B', 4: 'rest', 5: 'A', 6: 'rest', 0: 'rest' },
  d3x: { 1: 'A', 2: 'rest', 3: 'B', 4: 'rest', 5: 'C', 6: 'rest', 0: 'rest' },
  d2: { 1: 'A', 2: 'rest', 3: 'rest', 4: 'B', 5: 'rest', 6: 'rest', 0: 'rest' },
};
const PRESETS = [
  { id: 'full3', name: 'Всё тело — 3 дня', desc: 'Пн, Ср, Пт. Каждая тренировка на всё тело. Лучший старт для большинства.',
    build: () => ({ days: {
      A: { name: 'Всё тело A', items: [it('leg_press', 3, 8, 12), it('bench', 3, 6, 10), it('row', 3, 8, 12), it('sh_press', 3, 8, 12), it('curl', 2, 10, 15), it('crunch_m', 3, 10, 15)] },
      B: { name: 'Всё тело B', items: [it('leg_curl', 3, 10, 15), it('chest_press', 3, 8, 12), it('lat_pd', 3, 8, 12), it('cable_lat_raise', 3, 12, 15), it('pushdown', 2, 10, 15), it('rev_crunch', 3, 12, 15)] } }, week: WEEKS.d3 }) },
  { id: 'ul4', name: 'Верх / низ — 4 дня', desc: 'Пн, Вт, Чт, Пт. Верх тела и низ по очереди, каждая мышца 2 раза в неделю.',
    build: () => ({ days: {
      A: { name: 'Верх A', items: [it('bench', 3, 6, 10), it('row', 3, 8, 12), it('sh_press', 3, 8, 12), it('lat_pd', 3, 10, 12), it('curl', 2, 10, 15), it('pushdown', 2, 10, 15)] },
      B: { name: 'Низ A', items: [it('leg_press', 4, 8, 12), it('leg_curl', 3, 10, 15), it('leg_ext', 3, 12, 15), it('calf', 3, 12, 15), it('crunch_m', 3, 10, 15)] },
      C: { name: 'Верх B', items: [it('incl_db', 3, 8, 12), it('vbar_pd', 3, 8, 12), it('db_sh_press', 3, 8, 12), it('db_row', 3, 10, 12), it('rope_hammer', 2, 10, 15), it('rope_ovh', 2, 10, 15)] },
      D: { name: 'Низ B', items: [it('goblet', 3, 8, 12), it('sldl', 3, 8, 12), it('hyper', 3, 10, 12), it('calf_lp', 3, 12, 15), it('cable_crunch', 3, 10, 15)] } }, week: WEEKS.d4 }) },
  { id: 'ppl3', name: 'Жим / тяга / ноги — 3 дня', desc: 'Пн, Ср, Пт. День жимов, день тяг и день ног.',
    build: () => ({ days: {
      A: { name: 'Жим (грудь, плечи, трицепс)', items: [it('bench', 4, 6, 10), it('incl_db', 3, 8, 12), it('sh_press', 3, 8, 12), it('cable_lat_raise', 3, 12, 15), it('pushdown', 3, 10, 15)] },
      B: { name: 'Тяга (спина, бицепс)', items: [it('lat_pd', 4, 8, 12), it('row', 3, 8, 12), it('rear_fly', 3, 12, 15), it('curl', 3, 10, 15), it('hammer', 2, 10, 15)] },
      C: { name: 'Ноги и пресс', items: [it('leg_press', 4, 8, 12), it('leg_curl', 3, 10, 15), it('leg_ext', 3, 12, 15), it('calf', 3, 12, 15), it('rev_crunch', 3, 12, 15)] } }, week: WEEKS.d3x }) },
  { id: 'easy2', name: 'Начало — 2 дня', desc: 'Пн и Чт. Короткие тренировки на всё тело, чтобы втянуться.',
    build: () => ({ days: {
      A: { name: 'Всё тело A', items: [it('leg_press', 3, 10, 12), it('chest_press', 3, 8, 12), it('lat_pd', 3, 10, 12), it('crunch_m', 2, 10, 15)] },
      B: { name: 'Всё тело B', items: [it('goblet', 3, 8, 12), it('db_sh_press', 3, 8, 12), it('row', 3, 10, 12), it('rev_crunch', 2, 12, 15)] } }, week: WEEKS.d2 }) },
  { id: 'mine', name: 'Авторская — 5 дней, ноги в субботу', desc: 'Пн грудь, Вт спина, Чт плечи и руки, Пт верх, Сб ноги, Ср бег; путь к подтягиванию через гравитрон.',
    build: () => defaultProgram() },
];
function buildPreset(id) {
  const p = (PRESETS.find(x => x.id === id) || PRESETS[0]).build();
  p.v = PROGRAM_V; return p;
}
const hasGrav = () => Object.values(D.program.days).some(d => d.items.some(x => x.ex === 'gravitron'));
