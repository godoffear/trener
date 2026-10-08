// Тесты прогрессии: node dev/test_progression.js
const { suggest } = require('../js/progression.js');
const S = (...p) => p.map(([kg, reps]) => ({ kg, reps }));
const ses = (sets, extra) => Object.assign({ sets, disc: [], light: false }, extra);
let bad = 0;
const t = (name, got, want) => {
  const ok = Object.entries(want).every(([k, v]) => got[k] === v);
  if (!ok) bad++;
  console.log(ok ? 'OK  ' : 'FAIL', name, '→', JSON.stringify(got), ok ? '' : 'ждали ' + JSON.stringify(want));
};
const W = { lo: 6, hi: 10, step: 2.5, planSets: 4 };

// Реальные тренировки Андрея 5–6 октября
t('жим лёжа 20×10 во всех 4 → прибавка 22,5', suggest({ ...W, sessions: [ses(S([20, 10], [20, 10], [20, 10], [20, 10]))] }), { kind: 'up', kg: 22.5 });
t('жим плеч 15×12, 25×12, 25×13 (верх 12) → 30', suggest({ lo: 8, hi: 12, step: 5, planSets: 3, sessions: [ses(S([15, 12], [25, 12], [25, 13]))] }), { kind: 'up', kg: 30 });
t('бабочка 30×13,13,13,12 (верх 15) → тот же вес, цель 13', suggest({ lo: 12, hi: 15, step: 5, planSets: 4, sessions: [ses(S([30, 13], [30, 13], [30, 13], [30, 12]))] }), { kind: 'same', kg: 30, goal: 13 });
t('наклонная 7,5×12 ×3, потом 10×12 — один подход на 10 → остаёмся на 10', suggest({ lo: 8, hi: 12, step: 2, planSets: 4, sessions: [ses(S([7.5, 12], [7.5, 12], [7.5, 12], [10, 12]))] }), { kind: 'same', kg: 10 });
t('гравитрон помощь 40×10,40×10,35×6 → рабочая помощь 35, цель 7', suggest({ ...W, assist: true, step: 5, planSets: 3, sessions: [ses(S([40, 10], [40, 10], [35, 6]))] }), { kind: 'same', kg: 35, goal: 7 });

// Гравитрон: помощь, обратная логика
t('гравитрон 35×10,35×10,35×10 → помощь 30', suggest({ ...W, assist: true, step: 5, planSets: 3, sessions: [ses(S([35, 10], [35, 10], [35, 10]))] }), { kind: 'up', kg: 30 });
t('помощь не уходит ниже нуля', suggest({ ...W, assist: true, step: 5, planSets: 3, sessions: [ses(S([5, 10], [5, 10], [5, 10]))] }), { kind: 'up', kg: 0 });

// Нет истории
t('первой тренировки нет — подбор', suggest({ ...W, sessions: [] }), { kind: 'start' });

// Не дотянул до низа диапазона
t('первый раз: 5 повторов при низе 6 → сбавить', suggest({ ...W, sessions: [ses(S([60, 5], [60, 4], [60, 4]))] }), { kind: 'down', kg: 55 });
t('один провал после хорошей → тот же вес', suggest({ ...W, sessions: [ses(S([60, 8], [60, 8])), ses(S([60, 5], [60, 4]))] }), { kind: 'same', kg: 60 });
t('два провала подряд → −10%', suggest({ ...W, sessions: [ses(S([60, 5], [60, 4])), ses(S([60, 5], [60, 5]))] }), { kind: 'down', kg: 55 });
t('помощь: два провала → помощи больше', suggest({ ...W, assist: true, step: 5, sessions: [ses(S([30, 4], [30, 3])), ses(S([30, 4], [30, 4]))] }), { kind: 'down', kg: 35 });

// Нельзя прибавлять
t('дискомфорт в прошлый раз → без прибавки', suggest({ ...W, sessions: [ses(S([20, 10], [20, 10], [20, 10], [20, 10]), { disc: [{ zone: 'Плечо', lvl: 2 }] })] }), { kind: 'same', kg: 20, held: 'disc' });
t('облегчённая тренировка в прошлый раз → без прибавки', suggest({ ...W, sessions: [ses(S([20, 10], [20, 10], [20, 10]), { light: true })] }), { kind: 'same', held: 'light' });
t('сегодня облегчённо → без прибавки', suggest({ ...W, light: true, sessions: [ses(S([20, 10], [20, 10], [20, 10], [20, 10]))] }), { kind: 'same', held: 'light' });

// Мелочи
t('на рабочем весе всего один подход на верху — не хватает для прибавки', suggest({ ...W, sessions: [ses(S([20, 8], [20, 8], [22.5, 10]))] }), { kind: 'same', kg: 22.5 });
t('в плане 1 подход — достаточно одного', suggest({ lo: 30, hi: 45, step: 0, planSets: 1, sessions: [ses(S([10, 45]))] }).kind === 'up' ? { kind: 'up' } : { kind: '?' }, { kind: 'up' });
t('шаг гантелей 2 кг', suggest({ lo: 8, hi: 12, step: 2, planSets: 3, sessions: [ses(S([10, 12], [10, 12], [10, 12]))] }), { kind: 'up', kg: 12 });
process.exit(bad ? 1 : 0);
