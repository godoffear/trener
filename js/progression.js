// Прогрессия весов: чистые функции, без экрана и базы. Тесты — node dev/test_progression.js
// Только подсказка: решение всегда за Андреем.
// Правила (двойная прогрессия; «запаса повторов» в приложении нет):
//  1. Все подходы на рабочем весе дошли до верха диапазона → «пора прибавить» (в гравитроне — снизить помощь).
//  2. Иначе тот же вес, цель +1 повтор в каждом подходе.
//  3. Ни один подход не дошёл до низа диапазона: в первый раз — предложить сбавить, два раза подряд — сбавить на 10 %.
//  4. Был дискомфорт или облегчённый день — без прибавки.
//  5. «Рабочий вес» = самый тяжёлый вес, на котором повторов хватило до низа диапазона
//     (в гравитроне — самая лёгкая помощь). Прибавка возможна, если на нём сделано хотя бы 2 подхода (или все, если их меньше).
(function (root) {
  const clean = x => Math.round(x * 100) / 100;
  const toStep = (x, step) => clean(Math.round(x / step) * step);

  // session: { sets: [{kg, reps}], disc: [..], light: bool } — от старых к новым
  function analyse(sets, lo, assist) {
    const withKg = sets.filter(s => s.kg != null && s.reps != null);
    const ok = withKg.filter(s => s.reps >= lo);
    const pool = ok.length ? ok : withKg;
    if (!pool.length) return null;
    const ks = pool.map(s => s.kg);
    const kg = assist ? Math.min(...ks) : Math.max(...ks);
    return { kg, failed: !ok.length, atKg: withKg.filter(s => s.kg === kg) };
  }

  function suggest({ assist = false, sessions = [], lo, hi, step = 2.5, planSets = 3, light = false }) {
    if (!sessions.length) return { kind: 'start' };
    const last = sessions[sessions.length - 1], a = analyse(last.sets, lo, assist);
    if (!a) return { kind: 'start' };
    const prev = sessions.length > 1 ? analyse(sessions[sessions.length - 2].sets, lo, assist) : null;
    const minReps = Math.min(...a.atKg.map(s => s.reps));
    const need = Math.min(2, planSets);

    if (a.failed) {                       // ни один подход не дошёл до низа диапазона
      if (!prev || prev.failed) {
        const kg = assist ? Math.max(a.kg + step, toStep(a.kg * 1.1, step)) : Math.max(0, Math.min(a.kg - step, toStep(a.kg * 0.9, step)));
        return { kind: 'down', kg, from: a.kg };
      }
      return { kind: 'same', kg: a.kg, goal: lo };
    }
    const topReached = a.atKg.length >= need && minReps >= hi;
    if (topReached) {
      const kg = assist ? Math.max(0, clean(a.kg - step)) : clean(a.kg + step);
      const held = (last.disc && last.disc.length) ? 'disc' : (last.light || light) ? 'light' : null;
      if (held) return { kind: 'same', kg: a.kg, goal: hi, held };
      return { kind: 'up', kg, from: a.kg, reps: minReps };
    }
    return { kind: 'same', kg: a.kg, goal: Math.min(hi, minReps + 1) };
  }

  const api = { suggest, analyse };
  if (typeof module !== 'undefined') module.exports = api; else root.Progression = api;
})(typeof window !== 'undefined' ? window : globalThis);
