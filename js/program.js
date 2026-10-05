// Программа по умолчанию. Хранится в базе как редактируемые данные (store kv, ключ 'program').
// days — тренировочные дни, week — что стоит в каждый день недели (1 = пн … 0 = вс):
// id дня, 'walk' — ходьба, 'rest' — отдых.
// Упражнение дня: ex — id из EX, sets, lo–hi — повторы (у 'time' — секунды), rest — отдых в секундах.
// pull: 'hang' — вис, который заменяется негативами, когда помощь в гравитроне < 30% веса тела.
const REST_BASE = 90, REST_ISO = 60, REST_HOLD = 45;  // 0.5: Андрею 2 мин много — база 90 с, изоляция 60 с
const it = (ex, sets, lo, hi, extra) => Object.assign({ ex, sets, lo, hi, rest: EX[ex].base ? REST_BASE : REST_ISO }, extra || {});

// v4 (0.9): по реальной тренировке Андрея 5 окт (80 мин, 25 подходов, 2 упражнения не успел)
// — каждый день ≈ 20–22 подхода, 7–8 упражнений, ≈ час по его темпу.
const PROGRAM_V = 4;
function defaultProgram() {
  const hold = { rest: REST_HOLD };
  return {
    v: PROGRAM_V,
    days: {
      A: { name: 'Грудь, плечи, трицепс', items: [
        it('bench', 4, 6, 10), it('incl_db', 3, 8, 12), it('fly', 3, 12, 15), it('sh_press', 3, 8, 12),
        it('lat_raise', 3, 12, 15), it('pushdown', 3, 10, 15),
      ] },
      B: { name: 'Спина, задняя дельта, бицепс', items: [
        it('gravitron', 4, 6, 10), it('row', 3, 8, 12), it('lat_pd', 3, 10, 12), it('rear_fly', 3, 12, 15),
        it('curl', 3, 10, 15), it('hlr', 2, 10, 15), it('hang', 2, 20, 40, { pull: 'hang', rest: 60 }),
      ] },
      C: { name: 'Ноги', items: [
        it('leg_press', 3, 8, 12), it('goblet', 3, 10, 12), it('leg_ext', 3, 12, 15), it('leg_curl', 3, 10, 15),
        it('calf', 3, 12, 15), it('rev_crunch', 2, 12, 15), it('side_plank', 2, 30, 45, hold),
      ] },
      D: { name: 'Всё тело', items: [
        it('goblet', 3, 10, 12), it('chest_press', 3, 8, 12), it('gravitron', 3, 6, 10), it('row', 3, 8, 12),
        it('face_pull', 3, 12, 15), it('pushdown', 2, 12, 15), it('plank', 2, 45, 45, hold),
      ] },
    },
    week: { 1: 'A', 2: 'B', 3: 'walk', 4: 'C', 5: 'D', 6: 'walk', 0: 'rest' },
  };
}

// Расчётная длительность (без разминочных подходов), по реальному темпу Андрея 5 окт:
// подход ~65 с (с подготовкой), отдых по плану, переход к новому упражнению ~3,5 мин.
const SET_SEC = 65, MOVE_SEC = 210;
function dayMinutes(day) {
  let s = 0;
  for (const x of day.items) {
    const e = EX[x.ex]; if (!e) continue;
    const work = e.type === 'time' ? x.hi * (e.id === 'side_plank' ? 2 : 1) + 15 : SET_SEC;
    s += x.sets * work + (x.sets - 1) * x.rest + MOVE_SEC;
  }
  return Math.round(s / 60);
}
const MAX_MIN = 70;
