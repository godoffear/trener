// v9: достижения. Считаются по истории тренировок (и сну из часов), открытые хранятся в settings.ach = { id: 'ГГГГ-ММ-ДД' }.
const wkKey = w => dk(weekStart(pk(w.date)));
function achCtx() {
  const done = doneW().sort((a, b) => a.date < b.date ? -1 : 1), weeks = {};
  for (const w of done) weeks[wkKey(w)] = (weeks[wkKey(w)] || 0) + 1;
  const keys = Object.keys(weeks).sort();
  // самая длинная серия подряд идущих недель, где тренировок >= min
  const run = min => { let best = 0, cur = 0, prev = null; for (const k of keys) { if (weeks[k] < min) { cur = 0; prev = null; continue; }
    cur = prev && dk(addDays(pk(prev), 7)) === k ? cur + 1 : 1; prev = k; best = Math.max(best, cur); } return best; };
  const recs = done.reduce((a, w) => a + (w.records || []).length, 0), recEx = new Set(done.flatMap(w => (w.records || []).map(r => r.ex)));
  const tons = done.map(w => tonnage(w)), total = tons.reduce((a, b) => a + b, 0);
  let progBest = 0;
  for (const id in EX) { if (EX[id].type !== 'w') continue; const v = exHistory(id).map(x => sessionValue(id, x.it)).filter(x => x != null); let c = 1;
    for (let i = 1; i < v.length; i++) { c = v[i] > v[i - 1] + 0.01 ? c + 1 : 1; progBest = Math.max(progBest, c); } }
  const bw = D.settings.weight, grav = exHistory('gravitron').map(x => { const s = workSets(x.it).filter(y => y.reps >= 6).map(y => y.kg); return s.length ? Math.min(...s) : null; }).filter(x => x != null);
  const minAssist = grav.length ? Math.min(...grav) : null;
  const unassisted = exHistory('gravitron').some(x => workSets(x.it).some(s => s.kg === 0 && s.reps >= 1));
  const sleep = D.settings.sleepLog || {}; let sl = 0, slBest = 0;
  Object.keys(sleep).sort().forEach((k, i, a) => { const ok = sleep[k] >= 420; sl = ok && (i === 0 || dk(addDays(pk(a[i - 1]), 1)) === k) ? sl + 1 : ok ? 1 : 0; slBest = Math.max(slBest, sl); });
  const allSets = done.flatMap(w => w.items.flatMap(i => workSets(i))), allItems = done.flatMap(w => w.items);
  const best = id => Math.max(0, ...allItems.filter(i => i.ex === id).flatMap(i => workSets(i)).map(s => s.kg || 0));
  const hl = D.hlog || {}, dists = Object.values(hl).map(d => d.dist || 0);
  const ex2 = {
    sets: allSets.length, reps: allSets.reduce((a, s) => a + (s.reps || 0), 0), rated: allSets.filter(s => s.feel).length,
    run4: run(4), bench: best('bench'), lpress: best('leg_press'), rowKg: best('row'),
    legs: done.filter(w => w.items.some(i => ['leg_press', 'machine_squat', 'rdl', 'smith_rdl'].includes(i.ex) && workSets(i).length)).length,
    variety: new Set(allItems.filter(i => workSets(i).length).map(i => i.ex)).size,
    notes: allItems.filter(i => i.note).length, warm: allItems.filter(i => i.warm).length,
    maxMin: Math.max(0, ...done.map(w => Math.round((w.end - w.start - (w.paused || 0)) / 60000))),
    maxDist: Math.max(0, ...dists),
  };
  return Object.assign(ex2, { n: done.length, maxWeek: Math.max(0, ...Object.values(weeks)), run3: run(3), run1: run(1), maxTon: Math.max(0, ...tons), total, recs, recEx: recEx.size, progBest,
    early: done.some(w => new Date(w.start).getHours() < 8), late: done.some(w => new Date(w.start).getHours() >= 21),
    a50: bw && minAssist != null ? minAssist < bw * 0.5 : false, a30: bw && minAssist != null ? minAssist < bw * 0.3 : false, unassisted, sleepRun: slBest });
}
const ACH = [
  ['first', 'Первый шаг', 'Первая тренировка', c => [c.n, 1]],
  ['n10', 'Десятка', '10 тренировок', c => [c.n, 10]],
  ['n50', 'Полтинник', '50 тренировок', c => [c.n, 50]],
  ['n100', 'Сотня', '100 тренировок', c => [c.n, 100]],
  ['run3x4', 'Месяц без пропусков', '4 недели подряд минимум по 3 тренировки', c => [c.run3, 4]],
  ['week4', 'Железная неделя', '4 тренировки за одну неделю', c => [c.maxWeek, 4]],
  ['run12', 'Стальная привычка', '12 недель подряд хотя бы с одной тренировкой', c => [c.run1, 12]],
  ['t1', 'Тонна', 'Тренировка с тоннажем 1 000 кг', c => [c.maxTon, 1000]],
  ['t10', 'Десять тонн', 'Тренировка с тоннажем 10 000 кг', c => [c.maxTon, 10000]],
  ['t100', 'Сто тонн', '100 тонн суммарно за всё время', c => [c.total, 100000]],
  ['rec1', 'Рекордсмен', 'Первый рекорд', c => [c.recs, 1]],
  ['rec10', 'Коллекционер', '10 рекордов', c => [c.recs, 10]],
  ['rec5ex', 'Собиратель', 'Рекорды в 5 разных упражнениях', c => [c.recEx, 5]],
  ['prog4', 'Прогрессия', 'Рабочий максимум рос 4 тренировки подряд в одном упражнении', c => [c.progBest, 4]],
  ['a50', 'Шаг к подтягиванию', 'Помощь в гравитроне меньше 50% веса тела', c => [c.a50 ? 1 : 0, 1]],
  ['a30', 'Почти там', 'Помощь меньше 30% веса — открылись негативы', c => [c.a30 ? 1 : 0, 1]],
  ['pull', 'Подтянулся', 'Первое подтягивание без помощи', c => [c.unassisted ? 1 : 0, 1]],
  ['early', 'Ранняя пташка', 'Тренировка, начатая до 8 утра', c => [c.early ? 1 : 0, 1]],
  ['late', 'Сова', 'Тренировка, начатая после 21:00', c => [c.late ? 1 : 0, 1]],
  ['sleep30', 'Железное здоровье', '30 дней подряд сон 7 часов и больше (по часам)', c => [c.sleepRun, 30]],
  ['s500', 'Пятьсот подходов', '500 рабочих подходов за всё время', c => [c.sets, 500]],
  ['s1000', 'Тысяча подходов', '1 000 рабочих подходов', c => [c.sets, 1000]],
  ['s2500', 'Две с половиной тысячи', '2 500 рабочих подходов', c => [c.sets, 2500]],
  ['reps5k', 'Пять тысяч повторов', '5 000 повторений суммарно', c => [c.reps, 5000]],
  ['reps10k', 'Десять тысяч повторов', '10 000 повторений суммарно', c => [c.reps, 10000]],
  ['n25', 'Четверть сотни', '25 тренировок', c => [c.n, 25]],
  ['n200', 'Двести', '200 тренировок', c => [c.n, 200]],
  ['t250', 'Четверть килотонны', '250 тонн суммарно за всё время', c => [c.total, 250000]],
  ['t500', 'Полкилотонны', '500 тонн суммарно за всё время', c => [c.total, 500000]],
  ['tk15', 'Тяжёлый день', 'Тренировка с тоннажем 15 000 кг', c => [c.maxTon, 15000]],
  ['rec25', 'Охотник за рекордами', '25 рекордов', c => [c.recs, 25]],
  ['rec50', 'Хозяин зала', '50 рекордов', c => [c.recs, 50]],
  ['rec10ex', 'Везде первый', 'Рекорды в 10 разных упражнениях', c => [c.recEx, 10]],
  ['prog8', 'Лестница', 'Рабочий максимум рос 8 тренировок подряд в одном упражнении', c => [c.progBest, 8]],
  ['week5', 'Пять из пяти', '5 тренировок за одну неделю', c => [c.maxWeek, 5]],
  ['run4x8', 'Два месяца в строю', '8 недель подряд минимум по 4 тренировки', c => [c.run4, 8]],
  ['run3x12', 'Квартал дисциплины', '12 недель подряд минимум по 3 тренировки', c => [c.run3, 12]],
  ['bench40', 'Жим сорок', 'Жим лёжа 40 кг и больше', c => [c.bench, 40]],
  ['bench60', 'Жим шестьдесят', 'Жим лёжа 60 кг и больше', c => [c.bench, 60]],
  ['lp100', 'Сто в жиме ногами', 'Жим ногами 100 кг и больше', c => [c.lpress, 100]],
  ['lp150', 'Полтора центнера', 'Жим ногами 150 кг и больше', c => [c.lpress, 150]],
  ['row60', 'Тяга шестьдесят', 'Тяга нижнего блока 60 кг и больше', c => [c.rowKg, 60]],
  ['legs10', 'Ноги не забыты', '10 тренировок с днём ног', c => [c.legs, 10]],
  ['var20', 'Разнообразие', '20 разных упражнений в тренировках', c => [c.variety, 20]],
  ['notes10', 'Дневник техники', '10 заметок к упражнениям', c => [c.notes, 10]],
  ['warm20', 'Разминка — святое', '20 раз отмечена разминка', c => [c.warm, 20]],
  ['rated300', 'Честный дневник', '300 подходов с оценкой «легко / нормально / тяжело»', c => [c.rated, 300]],
  ['marathon', 'Марафон в зале', 'Тренировка длиннее 90 минут', c => [c.maxMin, 90]],
  ['run5km', 'Первые 5 км', 'День с пробежкой от 5 км (по часам)', c => [c.maxDist, 5000]],
  ['run10km', 'Десятка', 'День с пробежкой от 10 км (по часам)', c => [c.maxDist, 10000]],
];
// Проверка: что открылось нового. silent — не показывать окно (первый запуск: просто запоминаем уже заработанное)
async function checkAch(silent) {
  if (!D.settings) return;
  const c = achCtx(), have = D.settings.ach || {}, fresh = [], today = dk(new Date());
  for (const [id, name, desc, f] of ACH) { const [v, m] = f(c); if (v >= m && !have[id]) { have[id] = today; fresh.push({ id, name, desc }); } }
  if (!fresh.length) return;
  const first = !D.settings.ach; D.settings.ach = have; await saveKV('settings');
  if (silent || first) { if (!first || fresh.length) render(); return; }
  openSheet(`<h2>${fresh.length > 1 ? 'Новые достижения' : 'Новое достижение'}</h2>${fresh.map(a => `<div class="ach-new"><b>${esc(a.name)}</b><span class="muted small">${esc(a.desc)}</span></div>`).join('')}<button class="btn main" data-a="close-sheet" style="margin-top:12px">Класс</button>`);
}
const ACH_ICON = {"s500": "M5 19V10M10 19V6M15 19v-6M20 19v-3", "s1000": "M4 20h16M7 20V9M12 20V4M17 20v-8", "s2500": "M3 19l5-6 4 3 5-9 4 4", "reps5k": "M12 4v16M4 12h16M7 7l10 10M17 7 7 17", "reps10k": "M5 12a7 7 0 1 0 14 0 7 7 0 0 0-14 0zM12 8v4l3 2", "n25": "M12 3l2.5 6 6.5.5-5 4.2 1.6 6.3L12 16.7 6.4 20l1.6-6.3-5-4.2 6.5-.5z", "n200": "M4 20V10l4 3 4-7 4 7 4-3v10z", "t250": "M6 20h12l-2-9H8zM9 11V8a3 3 0 0 1 6 0v3", "t500": "M5 20h14l-3-8H8zM8 12 12 4l4 8", "tk15": "M3 12h3M18 12h3M6 8v8M18 8v8M6 12h12M9 5v14M15 5v14", "rec25": "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z", "rec50": "M12 3l3 6 6 1-4.5 4.2 1 6.3L12 17.5 6.5 20.5l1-6.3L3 10l6-1z", "rec10ex": "M4 20 12 4l8 16zM9 14h6", "prog8": "M4 20h4v-4h4v-4h4V8h4V4", "week5": "M4 5h16v15H4zM4 9h16M8 3v4M16 3v4M8 13h2M12 13h2M16 13h2M8 17h2M12 17h2", "run4x8": "M3 12h4l2-6 4 12 2-6h6", "run3x12": "M5 20V8l7-5 7 5v12zM9 20v-6h6v6", "bench40": "M3 10v4M6 8v8M18 8v8M21 10v4M6 12h12", "bench60": "M2 9v6M5 7v10M19 7v10M22 9v6M5 12h14M9 4v16M15 4v16", "lp100": "M4 18l6-12 4 8 6-4M4 20h16", "lp150": "M3 19h18M5 19l3-9 4 5 3-7 4 11", "row60": "M4 12h10M10 8l4 4-4 4M17 6v12", "legs10": "M9 3v8l-3 10M15 3v8l3 10M8 11h8", "var20": "M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4", "notes10": "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7", "warm20": "M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z", "rated300": "M5 4h14v16H5zM9 9l2 2 4-4M9 15h6", "marathon": "M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "run5km": "M13 4a2 2 0 1 0 0 .1zM9 21l3-6-2-3 3-4 3 3 3 1M7 12l3-2", "run10km": "M4 20h16M6 20V8l6-4 6 4v12M10 20v-6h4v6", "first": "M5 21V4M5 4h11l-2 4 2 4H5", "n10": "M6 8v8M3 10v4M18 8v8M21 10v4M6 12h12", "n50": "M12 15a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM8.5 14 7 21l5-3 5 3-1.5-7", "n100": "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3", "run3x4": "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M9 15l2 2 4-4", "week4": "M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z", "run12": "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4", "t1": "M10 6a2 2 0 1 0 4 0 2 2 0 1 0-4 0M8 20l1.5-10h5L16 20z", "t10": "M3 20h18M5 20v-6h6v6M13 20v-9h6v9", "t100": "M3 20l6-10 4 6 3-4 5 8z", "rec1": "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z", "rec10": "M3 8l4 4 5-7 5 7 4-4-2 11H5z", "rec5ex": "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z", "prog4": "M3 17l6-6 4 4 8-8M15 7h6v6", "a50": "M4 16a8 8 0 0 1 16 0M12 16l4-5", "a30": "M6 11h12v9H6zM9 11V8a3 3 0 0 1 5.5-1.7", "pull": "M3 5h18M8 5v4M16 5v4M10 12a2 2 0 1 0 4 0 2 2 0 1 0-4 0M12 14v4M9 21l3-3 3 3", "early": "M3 18h18M7 18a5 5 0 0 1 10 0M12 5v3M5 10l2 2M19 10l-2 2", "late": "M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10z", "sleep30": "M12 20S4 15 4 9a4 4 0 0 1 8-1 4 4 0 0 1 8 1c0 6-8 11-8 11z"};
const achIcon = id => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${ACH_ICON[id] || ''}"/></svg>`;
function vAch() {
  const c = achCtx(), have = D.settings.ach || {}, got = ACH.filter(a => have[a[0]]).length;
  return `<div class="top"><div><div class="muted">${got} из ${ACH.length} открыто</div><h1>Награды</h1></div></div>
    <div class="ach-prog"><i style="width:${Math.round(got / ACH.length * 100)}%"></i></div>
    <div class="ach-g">${ACH.map(([id, name, desc, f]) => {
    const [v, m] = f(c), ok = !!have[id], p = Math.min(100, Math.round(v / m * 100));
    return `<div class="ach${ok ? ' on' : ''}"><div class="ach-i">${achIcon(id)}</div><b>${esc(name)}</b><span>${esc(desc)}</span>${ok ? `<em>Открыто ${have[id].slice(8)}.${have[id].slice(5, 7)}.${have[id].slice(2, 4)}</em>` : `<div class="bar"><i style="width:${p}%"></i></div><small>${p}%</small>`}</div>`; }).join('')}</div>`;
}
document.addEventListener('click', ev => { const a = ev.target.closest && ev.target.closest('[data-a="close-sheet"]'); if (a) closeSheet(); });
(function () {
  const baseFinish = finishWorkout;
  finishWorkout = async function (...a) { const n = D.workouts.length; await baseFinish(...a); if (D.workouts.length > n) setTimeout(() => checkAch(false), 1500); };
  const baseHc = hcRefresh;
  hcRefresh = async function () { await baseHc(); await sleepLogUpdate(); };
  const t = setInterval(() => { if (!(typeof D !== 'undefined' && D.settings)) return; clearInterval(t); checkAch(true); }, 700);
})();
// Сон по ночам за 30 дней — копим в settings.sleepLog, чтобы ачивка видела серию
async function sleepLogUpdate() {
  const h = HCp(); if (!h || !D.settings.hc) return;
  try {
    const now = Date.now(), s = (await h.readSamples({ dataType: 'sleep', startDate: iso(now - 30 * 864e5), endDate: iso(now), limit: 600 })).samples || [], by = {};
    for (const x of s) { const k = dk(new Date(new Date(x.endDate).getTime())); (by[k] = by[k] || []).push(x); }
    const log = Object.assign({}, D.settings.sleepLog || {});
    for (const k in by) log[k] = sleepMinutes(by[k]);
    D.settings.sleepLog = log; await saveKV('settings'); checkAch(false);
  } catch (e) { /* нет данных */ }
}
