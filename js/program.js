// Программа по умолчанию. Хранится в базе как редактируемые данные (store kv, ключ 'program').
// days — тренировочные дни, week — что стоит в каждый день недели (1 = пн … 0 = вс):
// id дня, 'walk' — ходьба, 'rest' — отдых.
// Упражнение дня: ex — id из EX, sets, lo–hi — повторы (у 'time' — секунды), rest — отдых в секундах.
// pull: 'hang' — вис, который заменяется негативами, когда помощь в гравитроне < 30% веса тела.
const REST_BASE = 150, REST_ISO = 75;
const it = (ex, sets, lo, hi, extra) => Object.assign({ ex, sets, lo, hi, rest: EX[ex].base ? REST_BASE : REST_ISO }, extra || {});

function defaultProgram() {
  return {
    v: 1,
    days: {
      A: { name: 'Грудь, плечи, трицепс', items: [
        it('bench', 4, 6, 10), it('incl_db', 3, 8, 12), it('fly', 3, 12, 15), it('sh_press', 3, 8, 12),
        it('lat_raise', 3, 12, 15), it('pushdown', 3, 10, 15), it('crunch_m', 3, 10, 15),
      ] },
      B: { name: 'Спина, задняя дельта, бицепс', items: [
        it('gravitron', 4, 6, 10), it('row', 4, 8, 12), it('lat_pd', 3, 10, 12, { rest: 90 }), it('hyper', 3, 12, 15),
        it('rear_fly', 3, 12, 15), it('curl', 3, 10, 15), it('hlr', 3, 10, 15), it('hang', 2, 20, 40, { pull: 'hang', rest: 60 }),
      ] },
      C: { name: 'Ноги', items: [
        it('leg_press', 4, 8, 12), it('leg_ext', 3, 12, 15), it('leg_curl', 3, 10, 15), it('calf', 4, 12, 15),
        it('rev_crunch', 3, 12, 15), it('side_plank', 3, 30, 45, { rest: 45 }),
      ] },
      D: { name: 'Всё тело', items: [
        it('goblet', 3, 10, 12), it('chest_press', 3, 8, 12), it('gravitron', 3, 6, 10), it('row', 3, 8, 12),
        it('fly', 3, 12, 15), it('pushdown', 2, 12, 15), it('curl', 2, 12, 15), it('crunch_m', 3, 10, 15),
        it('plank', 2, 45, 45, { rest: 45 }),
      ] },
    },
    week: { 1: 'A', 2: 'B', 3: 'walk', 4: 'C', 5: 'D', 6: 'walk', 0: 'rest' },
  };
}

// Расчётная длительность тренировки в минутах:
// подход ~40 с (у упражнений на время — их секунды), отдых между подходами, переход 1 мин,
// плюс один лёгкий разминочный подход перед первым базовым упражнением.
const SET_SEC = 40, MOVE_SEC = 60, WARM_SEC = 90;
function dayMinutes(day) {
  let s = 0, warm = false;
  for (const x of day.items) {
    const e = EX[x.ex]; if (!e) continue;
    const work = e.type === 'time' ? x.hi * (e.id === 'side_plank' ? 2 : 1) : SET_SEC;
    s += x.sets * work + (x.sets - 1) * x.rest + MOVE_SEC;
    if (e.base && !warm) { s += WARM_SEC; warm = true; }
  }
  return Math.round(s / 60);
}
const MAX_MIN = 70;
