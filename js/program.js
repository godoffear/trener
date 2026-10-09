// Программа по умолчанию. Хранится в базе как редактируемые данные (store kv, ключ 'program').
// days — тренировочные дни, week — что стоит в каждый день недели (1 = пн … 0 = вс):
// id дня, 'walk' — ходьба, 'rest' — отдых.
// Упражнение дня: ex — id из EX, sets, lo–hi — повторы (у 'time' — секунды), rest — отдых в секундах.
const REST_BASE = 90, REST_ISO = 60, REST_HOLD = 45;  // 0.5: Андрею 2 мин много — база 90 с, изоляция 60 с
const it = (ex, sets, lo, hi, extra) => Object.assign({ ex, sets, lo, hi, rest: EX[ex].base ? REST_BASE : REST_ISO }, extra || {});

// v6 (0.17): решение Андрея — Пн A, Вт B, Чт C, Пт D; на рост мышц, каждая мышца 2 раза в неделю.
// Турника нет: без виса и подъёма ног в висе; путь к подтягиванию — гравитрон Вт/Пт + «доп. подходы» в конце любой тренировки.
// ss: true — суперсет: делается в паузах предыдущего упражнения, своего времени и своего отдыха не имеет.
// pull: 'neg' — негативы в гравитроне (в программе v6 не стоят, код оставлен).
const PROGRAM_V = 6;
function defaultProgram() {
  return {
    v: PROGRAM_V,
    days: {
      A: { name: 'Грудь, плечи, трицепс', items: [
        it('bench', 4, 6, 10), it('calf', 3, 12, 15, { ss: true }), it('incl_db', 3, 8, 12), it('sh_press', 3, 8, 12), it('fly', 3, 12, 15),
        it('lat_raise', 3, 12, 15), it('pushdown', 3, 10, 15),
      ] },
      B: { name: 'Спина, бицепс', items: [
        it('gravitron', 4, 6, 10), it('row', 3, 8, 12), it('lat_pd', 3, 10, 12),
        it('rear_fly', 3, 12, 15), it('curl', 4, 10, 15), it('rev_crunch', 3, 12, 15),
      ] },
      C: { name: 'Ноги', items: [
        it('leg_press', 4, 8, 12), it('leg_curl', 3, 10, 15), it('leg_ext', 3, 12, 15), it('hyper', 3, 10, 12),
        it('calf', 3, 12, 15), it('rev_crunch', 3, 12, 15),
      ] },
      D: { name: 'Всё тело', items: [
        it('leg_press', 3, 10, 12), it('chest_press', 3, 8, 12), it('gravitron', 3, 6, 10), it('row', 3, 10, 12),
        it('lat_raise', 3, 12, 15), it('curl', 3, 10, 15), it('rope_ovh', 3, 10, 15, { ss: true }),
      ] },
    },
    week: { 1: 'A', 2: 'B', 3: 'walk', 4: 'C', 5: 'D', 6: 'walk', 0: 'rest' },
  };
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
