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

  function suggest({ assist = false, sessions = [], lo, hi, step = 2.5, planSets = 3, light = false, stack = null }) {
    if (!sessions.length) return { kind: 'start' };
    const last = sessions[sessions.length - 1], a = analyse(last.sets, lo, assist);
    if (!a) return { kind: 'start' };
    const prev = sessions.length > 1 ? analyse(sessions[sessions.length - 2].sets, lo, assist) : null;
    const minReps = Math.min(...a.atKg.map(s => s.reps));
    // Стопка с неровными плитами (кроссовер): вес берём только из списка; если следующая плита далеко (>20 %), сначала +2 повтора сверх верха (+4, если плита дальше чем на 40 %)
    const st = stack && stack.length && !assist ? stack : null;
    const nextUp = st ? st.find(x => x > a.kg + 0.001) : null;
    const jump = st && nextUp ? nextUp / a.kg : 1, bigJump = jump > 1.2;
    const topReps = hi + (jump > 1.4 ? 4 : bigJump ? 2 : 0);
    const need = Math.min(2, planSets);

    if (a.failed) {                       // ни один подход не дошёл до низа диапазона
      if (!prev || prev.failed) {
        let kg = assist ? Math.max(a.kg + step, toStep(a.kg * 1.1, step)) : Math.max(0, Math.min(a.kg - step, toStep(a.kg * 0.9, step)));
        if (st) { const lim = a.kg * 0.9, below = st.filter(x => x <= lim + 0.001); kg = below.length ? below[below.length - 1] : (st[0] < a.kg ? st[0] : a.kg); }
        return { kind: 'down', kg, from: a.kg };
      }
      return { kind: 'same', kg: a.kg, goal: lo };
    }
    const topReached = a.atKg.length >= need && minReps >= topReps;
    if (topReached) {
      if (st && !nextUp) return { kind: 'same', kg: a.kg, goal: hi };   // выше плиты нет
      const kg = assist ? Math.max(0, clean(a.kg - step)) : st ? nextUp : clean(a.kg + step);
      const held = (last.disc && last.disc.length) ? 'disc' : (last.light || light) ? 'light' : last.hard ? 'hard' : null;
      if (held) return { kind: 'same', kg: a.kg, goal: hi, held };
      return { kind: 'up', kg, from: a.kg, reps: minReps };
    }
    return { kind: 'same', kg: a.kg, goal: Math.min(topReps, minReps + 1), easy: !!last.easy };
  }

  const api = { suggest, analyse };
  if (typeof module !== 'undefined') module.exports = api; else root.Progression = api;
})(typeof window !== 'undefined' ? window : globalThis);
