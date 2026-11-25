// Тренер — экраны и навигация. Ванильный JS без зависимостей.
// Отрисовка: функции v*() возвращают HTML-строку, клики ловит один обработчик по data-a.
const APP_VERSION = '41.0';
const UPDATE_REPO = 'godoffear/trener';

// ───── Даты ─────
const pad = n => String(n).padStart(2, '0');
const dk = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const pk = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const monday = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return addDays(x, -((x.getDay() + 6) % 7)); };
const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const WD_FULL = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const MON = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const fmtDate = d => `${WD[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]}`;

// ───── Числа ─────
const fmt = x => String(Math.round(x * 100) / 100).replace('.', ',');
const num = s => { const x = parseFloat(String(s).replace(',', '.')); return isFinite(x) ? x : null; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ───── Иконки ─────
const I = {
  today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  prog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12"/></svg>',
  stats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19h16M6 15l4-5 4 3 5-7"/></svg>',
  ach: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>',
};

// ───── План ─────
const planOf = d => D.program.week[d.getDay()] || 'rest';
const isTrain = p => !!D.program.days[p];

// Подходы упражнения по всем завершённым тренировкам: [{date, it:{ex,sets,…}}], новые в конце.
function exHistory(ex) {
  const out = [];
  for (const w of D.workouts) if (w.done) for (const it of w.items) if (it.ex === ex && !it.extra && it.sets && it.sets.some(s => !s.warm)) out.push({ date: w.date, it, light: w.light });
  return out;
}
// Список доступных весов для упражнения (гантели — только когда вес считается на одну гантель)
const stackOf = ex => { const e = EX[ex]; return e.stack && !(e.equip === 'dumbbell' && modeOf(ex) !== 'each') ? STACKS[e.stack] : null; };
// Подсказка по весу на сегодня — js/progression.js (двойная прогрессия по повторам)
function progOf(ex, item, light) {
  const e = EX[ex]; if (e.type !== 'w' && e.type !== 'assist') return { kind: 'none' };
  const sessions = exHistory(ex).filter(h => sameMode(h, ex)).map(h => { const ws = workSets(h.it), rated = ws.filter(x => x.feel); return { sets: ws, disc: h.it.disc || [], light: !!h.light, hard: rated.length >= 2 && rated.filter(x => x.feel === 3).length * 2 >= rated.length, easy: rated.length >= 2 && rated.every(x => x.feel === 1) }; });
  return Progression.suggest({ assist: e.type === 'assist', sessions, lo: item.lo, hi: item.hi,
    step: item.step != null ? item.step : e.step, planSets: item.sets, light: !!light, stack: stackOf(ex) });
}
// Короткая подпись веса и подсказка для экрана тренировки
function progText(r, e) {
  const unit = e.type === 'assist' ? 'помощь ' : '', kg = v => unit + fmt(v) + ' кг';
  if (r.kind === 'up') return { w: '↑ ' + kg(r.kg), hint: `${e.type === 'assist' ? 'Пора снизить помощь' : 'Пора прибавить'}: в прошлый раз ${fmt(r.from)} кг × ${r.reps}+ во всех подходах` };
  if (r.kind === 'down') return { w: kg(r.kg), hint: `Повторов не хватило при ${fmt(r.from)} кг — ${e.type === 'assist' ? 'добавь помощи' : 'сбавь вес'}` };
  if (r.kind === 'same') return { w: kg(r.kg), hint: (r.held === 'disc' ? 'Без прибавки: был дискомфорт. ' : r.held === 'light' ? 'Без прибавки: облегчённый день. ' : r.held === 'hard' ? 'Без прибавки: подходы были тяжёлыми. ' : '') + `Цель: ${r.goal} повт. в каждом подходе` };
  return { w: '', hint: '' };
}
// Помощь в гравитроне на прошлой тренировке — по самому тяжёлому подходу (все подходы должны быть с этой помощью или меньше)
function curAssist() {
  const h = exHistory('gravitron'); if (!h.length) return null;
  const ks = workSets(h[h.length - 1].it).map(s => s.kg).filter(x => x != null);
  return ks.length ? Math.max(...ks) : null;
}
// Пора добавлять негативы: во всех подходах прошлого раза помощь меньше 30% веса тела
function negReady() {
  const a = curAssist(), bw = D.settings.weight;
  return a != null && bw && a < bw * 0.3;
}
// Упражнения дня с учётом этапа пути к подтягиванию.
function dayItems(dayId) {
  const day = D.program.days[dayId]; if (!day) return [];
  const neg = negReady();
  return day.items.filter(x => x.pull !== 'neg' || neg);
}

function repsLabel(x) {
  const e = EX[x.ex], r = x.lo === x.hi ? x.lo : `${x.lo}–${x.hi}`;
  return `${x.sets}×${r}${e.type === 'time' ? ' с' : ''}`;
}
// Вес справа в строке упражнения. Пусто, если истории нет — подсказка одна на всю карточку.
function workLabel(x) { const r = progOf(x.ex, x); return r.kind === 'none' || r.kind === 'start' ? '' : progText(r, EX[x.ex]).w; }
const needsPick = x => (EX[x.ex].type === 'w' || EX[x.ex].type === 'assist') && progOf(x.ex, x).kind === 'start';
// Как считается вес: 'total' — общий (штанга, блок, стек тренажёра), 'each' — на каждую сторону / одну гантель.
// В подходе запоминается (s.wm), чтобы прошлые записи не менялись, если потом переключить; сравниваются только подходы в одном режиме.
const defMode = ex => EX[ex].defWm || (EX[ex].equip === 'dumbbell' ? 'each' : 'total');
const modeOf = ex => (D.settings.wmode && D.settings.wmode[ex]) || defMode(ex);
const setMode = (s, ex) => s.wm || defMode(ex);
const sameMode = (h, ex) => { const ws = workSets(h.it); return !ws.length || setMode(ws[0], ex) === modeOf(ex); };
const modeNote = ex => { const e = EX[ex], m = modeOf(ex); if (e.type !== 'w') return '';
  return m === 'each' ? (e.equip === 'dumbbell' ? ' · на гантель' : ' · на каждую сторону') : (e.equip === 'dumbbell' ? ' · обе вместе' : ''); };
const perDb = x => (modeOf(x.ex) !== defMode(x.ex) || (EX[x.ex].equip === 'dumbbell' && workLabel(x))) ? modeNote(x.ex) : '';

// ───── Состояние экрана ─────
let tab = 'today';
const $ = s => document.querySelector(s);

const THEMES = { lime: ['Лайм', null], gold: ['Золото', { '--bg': '#14120B', '--card': '#221E12', '--card2': '#2C2718', '--line': '#3A3320', '--acc': '#F5C542', '--on-acc': '#14120B' }] };
function applyTheme() {
  const t = THEMES[D.settings.theme] || THEMES.lime, st = document.documentElement.style;
  for (const k of ['--bg', '--card', '--card2', '--line', '--acc', '--on-acc']) st.removeProperty(k);
  if (t[1]) for (const k in t[1]) st.setProperty(k, t[1][k]);
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = t[1] ? t[1]['--bg'] : '#101214';
}
const spoil = new Set(['a-ex']);
const spoilOpen = k => spoil.has(k) ? ' open' : '';
document.addEventListener('click', ev => { const sm = ev.target.closest && ev.target.closest('details.spoil>summary'); if (!sm) return; const d = sm.parentElement, k = d.dataset.k; if (k) d.open ? spoil.delete(k) : spoil.add(k); });
function render() {
  applyTheme();
  const v = { today: vToday, prog: vProgram, stats: vStats, ach: vAch, more: vMore, workout: vWorkout }[tab];
  $('#app').innerHTML = v();
  document.body.classList.toggle('in-workout', tab === 'workout');
  keepAwake(); clockLoop();
  $('#tabs').innerHTML = [['today', 'Сегодня'], ['prog', 'Программа'], ['stats', 'Прогресс'], ['ach', 'Награды'], ['more', 'Ещё']]
    .map(([k, t]) => `<button data-a="tab" data-k="${k}" class="${tab === k ? 'on' : ''}">${I[k]}${t}</button>`).join('');
}

// ───── Сегодня ─────
// selDay — выбранный день (ключ ГГГГ-ММ-ДД) или null = сегодня. Полоса недели листается стрелками и свайпом.
let selDay = null;
const doneOn = key => D.workouts.find(w => w.date === key && w.done);

function vWeek(sel, now) {
  const m = monday(sel), tk = dk(now), sk = dk(sel);
  let h = '<div class="weekbar"><button class="wnav" data-a="wk" data-v="-7" aria-label="Прошлая неделя">‹</button><button class="wnav" data-a="wk" data-v="7" aria-label="Следующая неделя">›</button></div><div class="week" id="week">';
  for (let i = 0; i < 7; i++) {
    const d = addDays(m, i), key = dk(d), p = planOf(d);
    const dot = doneOn(key) ? 'done' : isTrain(p) ? 'train' : p === 'walk' ? 'walk' : '';
    h += `<button class="wd${key === tk ? ' today' : ''}${key === sk ? ' sel' : ''}" data-a="day" data-k="${key}"><b>${WD[d.getDay()]}</b><span class="num">${d.getDate()}</span><i class="${dot}"></i></button>`;
  }
  return h + '</div>';
}

function vToday() {
  const now = new Date(), tk = dk(now);
  if (selDay === tk) selDay = null;
  const sel = selDay ? pk(selDay) : now, key = dk(sel), p = planOf(sel);
  const isToday = key === tk, past = key < tk;
  let h = `<div class="top"><h1>${fmtDate(sel)}</h1>${isToday ? '' : '<button class="btn small-btn" data-a="day" data-k="">Сегодня</button>'}</div>` + vWeek(sel, now) + '';
  if (isToday && D.active) {
    const w = D.active, day = D.program.days[w.day], n = w.items.reduce((a, it) => a + workSets(it).length, 0);
    return h + `<div class="card"><div class="card-h"><h2>${esc(day ? day.name : 'Тренировка')}</h2><span class="tag acc">идёт</span></div>
      <p class="muted" style="margin:0 0 14px">Записано подходов: ${n}. Упражнение ${w.cur + 1} из ${w.items.length}.</p>
      <button class="btn main" data-a="resume">Продолжить тренировку</button></div>`;
  }
  const done = doneOn(key);
  if (done) return h + vDone(done);
  if (isTrain(p)) {
    const day = D.program.days[p], items = dayItems(p);
    h += `<div class="card"><div class="card-h"><h2>${esc(day.name)}</h2>${past ? '<span class="tag warn">пропущено</span>' : `<span class="tag dur">≈ ${dayMinutes({ items })} мин</span>`}</div>`;
    if (sel.getDay() === 1 && !past) h += isToday && weighedOn(key)
      ? `<p class="weigh-line done">${I.check} Взвесился — ${fmt(D.settings.weight)} кг</p>`
      : `<p class="weigh-line"${isToday ? ' data-a="weighopen"' : ''}>⚖ Понедельник — сначала взвесься${isToday ? ' <b>›</b>' : ', потом тренировка'}</p>`;
    const todayFree = !doneOn(tk) && !D.active;
    const pick = items.filter(needsPick).length, weighted = items.filter(x => EX[x.ex].type === 'w' || EX[x.ex].type === 'assist').length;
    if (pick && !past) h += `<p class="hint">${pick === weighted ? 'Первая тренировка — веса подберёшь по ходу' : 'Где веса нет — подберёшь по ходу'}</p>`;
    h += '<ul class="exl">';
    for (const x of items) h += `<li class="tap" data-a="tech" data-ex="${x.ex}"><div class="n"><b>${esc(EX[x.ex].name)}</b><span>${repsLabel(x)}${perDb(x)}</span></div><div class="w${progOf(x.ex, x).kind === 'up' ? ' up' : ''}">${workLabel(x)}</div></li>`;
    h += '</ul>';
    h += '</div>';
    if (isToday && items.some(x => x.ex === 'gravitron')) h += vPull();
    if (isToday) h += `<div class="dock"><button class="btn main" data-a="start" data-d="${p}">Начать тренировку</button></div>`;
    else if (past && todayFree) h += `<div class="dock"><button class="btn" data-a="start" data-d="${p}">Сделать сегодня</button></div>`;
  } else {
    const next = nextTraining(sel);
    h += `<div class="card"><h2>${p === 'walk' ? 'Бег' : 'Отдых'}</h2>
      <p class="muted" style="margin:6px 0 0">${p === 'walk' ? 'Лёгкий бег или быстрая ходьба — по самочувствию.' : 'Силовой нет.'}</p>
      ${p === 'walk' ? walkHTML(key, isToday) : ''}
      ${next ? `<p class="note">Дальше — ${WD_FULL[next.d.getDay()]}: ${esc(next.day.name.toLowerCase())}.</p>` : ''}</div>`;
  }
  return h;
}
function nextTraining(from) {
  for (let i = 1; i <= 7; i++) { const d = addDays(from, i), p = planOf(d); if (isTrain(p)) return { d, day: D.program.days[p] }; }
  return null;
}

// Фраза дня: номер тренировочного дня от QUOTE_FROM → без повторов, пока не кончится список
const QUOTE_FROM = new Date(2026, 9, 5);
function quoteFor(d) {
  let n = 0; const x = new Date(QUOTE_FROM);
  if (d >= x) for (; dk(x) < dk(d); x.setDate(x.getDate() + 1)) { if (isTrain(planOf(x))) n++; }
  else for (; dk(x) > dk(d); x.setDate(x.getDate() - 1)) { if (isTrain(planOf(x))) n--; }
  return QUOTES[((n % QUOTES.length) + QUOTES.length) % QUOTES.length];
}

// ───── Взвешивание по понедельникам ─────
function maybeWeigh() {
  const now = new Date(), key = dk(now);
  if (now.getDay() !== 1 || D.settings.weight == null || sheetOpen || tab === 'workout') return;
  if (D.settings.weighSkip === key || weighedOn(key) || doneOn(key)) return;
  sheetWeigh();
}
const weighedOn = key => D.settings.weighed === key;
function sheetWeigh() {
  openSheet(`<h2>Понедельник — сначала взвесься</h2>
    <p class="muted" style="margin:0 0 14px">Встань на весы до тренировки. Вес запишу сюда — для пути к подтягиванию.</p>
    <div class="field"><input class="inp" id="wg" inputmode="decimal" placeholder="${fmt(D.settings.weight)} кг"></div>
    <button class="btn main" data-a="weigh">Записать</button>
    <button class="btn ghost" style="margin-top:8px" data-a="weighskip">Сегодня без весов</button>`);
}

// Сделанная тренировка: что и как, рекорды — звёздочкой
function vDone(w) {
  const day = D.program.days[w.day], recs = new Set((w.records || []).map(r => r.ex));
  const min = w.end && w.start ? Math.round((w.end - w.start - (w.paused || 0)) / 60000) : null, ton = tonnage(w);
  let h = `<div class="card"><div class="card-h"><div><h2>${esc(day ? day.name : 'Тренировка')}</h2>
    <div class="muted small">${[min ? min + ' мин' : '', ton ? ton.toLocaleString('ru-RU') + ' кг' : '', w.light ? 'облегчённо' : ''].filter(Boolean).join(' · ')}</div></div>
    <span class="tag acc">сделано</span></div><ul class="exl">`;
  for (const it of w.items) {
    const e = EX[it.ex], sets = workSets(it); if (!sets.length) continue;
    h += `<li class="tap" data-a="tech" data-ex="${it.ex}"><div class="n"><b>${esc(e.name)}</b><span>${sets.map(s => setText(e, s)).join(', ')}</span>
      ${it.note ? `<span class="wo-note">${esc(it.note)}</span>` : ''}</div>${recs.has(it.ex) ? '<div class="w acc">★</div>' : ''}</li>`;
  }
  return h + `</ul><div class="row2"><button class="btn" data-a="summary" data-id="${w.id}">Итог</button><button class="btn ghost danger" data-a="wdel" data-id="${w.id}">Удалить</button></div></div>`;
}

// Путь к первому подтягиванию: помощь в гравитроне → негативы (помощь < 30% веса) → чистое подтягивание
function vPull() {
  const bw = D.settings.weight, h = exHistory('gravitron');
  const step = (D.program.days.B && (D.program.days.B.items.find(x => x.ex === 'gravitron') || {}).step) || EX.gravitron.step;
  const best = it => { const s = workSets(it).filter(x => x.reps >= 6).map(x => x.kg); return s.length ? Math.min(...s) : null; };
  const hist = h.map(x => best(x.it)).filter(x => x != null);
  let body;
  if (!hist.length || !bw) body = '<p class="muted" style="margin:0">Сегодня подбери помощь, с которой сделаешь 6–10 повторов. С неё начнётся путь.</p>';
  else {
    const first = hist[0], cur = hist[hist.length - 1], target = bw * 0.3;
    const stage = cur <= 0 ? 3 : cur < target ? 2 : 1;
    const left = stage === 1 ? Math.ceil((cur - target) / step + 0.0001) : Math.ceil(cur / step);
    const pct = first > 0 ? Math.round((first - cur) / first * 100) : 100;
    body = `<div><span class="num big">${fmt(cur)}</span> <span class="muted">кг помощи</span></div>
      <div class="bar"><i style="width:${Math.max(4, pct)}%"></i></div>
      <p class="muted small" style="margin:0">${stage === 1 ? `Этап 1 из 3: снижаешь помощь в гравитроне. До негативов — помощь меньше ${fmt(Math.round(target * 10) / 10)} кг, ≈ ${left} ${left === 1 ? 'шаг' : left < 5 ? 'шага' : 'шагов'} по ${fmt(step)} кг.`
        : stage === 2 ? `Этап 2 из 3: + негативы в гравитроне (вниз 4–5 с). До подтягивания без помощи ≈ ${left} ${left === 1 ? 'шаг' : left < 5 ? 'шага' : 'шагов'} по ${fmt(step)} кг.`
        : 'Этап 3: подтягиваешься сам — на рукоятях гравитрона без платформы! 🎉'}</p>`;
  }
  return `<div class="card"><div class="card-h"><h2>Путь к подтягиванию</h2></div>${body}</div>`;
}

// ───── Программа ─────
// По умолчанию только просмотр; правка включается кнопкой «Изменить», чтобы не задеть в зале.
let progEdit = false;
function vProgram() {
  const P = D.program, todayId = planOf(new Date());
  let h = `<div class="top"><h1>Программа</h1><button class="btn small-btn${progEdit ? ' on' : ''}" data-a="progedit">${progEdit ? 'Готово' : 'Изменить'}</button></div>`;
  for (const id of Object.keys(P.days)) {
    const day = P.days[id], min = dayMinutes(day), k = 'day-' + id;
    if (!spoil.has(k) && !spoil.has('seen-' + id) && (id === todayId || progEdit)) { spoil.add(k); }
    spoil.add('seen-' + id);
    const when = [1, 2, 3, 4, 5, 6, 0].filter(i => P.week[i] === id).map(i => WD[i]).join(', ') || 'не стоит в неделе';
    h += `<details class="card spoil day" data-k="${k}"${spoilOpen(k)}><summary><span class="dbadge${id === todayId ? ' now' : ''}">${when.split(',')[0].slice(0, 2)}</span>
      <div class="sum-t"><b>${esc(day.name)}</b><span class="muted small">${day.items.length} упр. · <span class="${min > MAX_MIN ? 'warn-t' : ''}">≈ ${min} мин</span>${when.includes(',') ? ' · ' + when : ''}</span></div></summary>`;
    if (min > MAX_MIN) h += `<div class="warnbox">Выходит больше ${MAX_MIN} минут — убери подход или упражнение.</div>`;
    h += '<ul class="exl">';
    day.items.forEach((x, i) => {
      const act = progEdit ? `data-a="edit" data-d="${id}" data-i="${i}"` : `data-a="tech" data-ex="${x.ex}"`;
      h += `<li class="tap" ${act}><div class="n"><b>${esc(EX[x.ex].name)}</b><span>${repsLabel(x)}${x.pull === 'neg' ? ' · появятся, когда помощь < 30% веса' : ''}${x.ss ? ' · суперсет, в паузах предыдущего' : ''}</span></div>${progEdit ? '<div class="w muted">›</div>' : ''}</li>`;
    });
    h += '</ul>';
    if (progEdit) h += `<button class="btn ghost" data-a="add" data-d="${id}">+ Упражнение</button>`;
    h += '</details>';
  }
  return h;
}

function sheetEdit(dayId, i) {
  const x = D.program.days[dayId].items[i], e = EX[x.ex];
  const timed = e.type === 'time';
  const rests = [45, 60, 75, 90, 120, 150, 180];
  let h = `<h2>${esc(e.name)}</h2>
    <div class="field"><label>Подходы</label><div class="stepper"><button class="ibtn" data-a="ed-n" data-f="sets" data-v="-1">−</button>
      <input class="inp" id="f-sets" inputmode="numeric" value="${x.sets}"><button class="ibtn" data-a="ed-n" data-f="sets" data-v="1">+</button></div></div>
    <div class="row2"><div class="field"><label>${timed ? 'Секунд от' : 'Повторов от'}</label><input class="inp" id="f-lo" inputmode="numeric" value="${x.lo}"></div>
      <div class="field"><label>до</label><input class="inp" id="f-hi" inputmode="numeric" value="${x.hi}"></div></div>
    <div class="field"><label>Отдых между подходами</label><div class="chips">${rests.map(r => `<button class="chip${x.rest === r ? ' on' : ''}" data-a="ed-rest" data-v="${r}">${r >= 120 ? fmt(r / 60) + ' мин' : r + ' с'}</button>`).join('')}</div></div>`;
  if (e.type === 'w' || e.type === 'assist')
    h += `<div class="field"><label>Шаг ${e.type === 'assist' ? 'снижения помощи' : 'прибавки'}, кг${e.equip === 'dumbbell' ? ' (на гантель)' : ''}</label>
      <input class="inp" id="f-step" inputmode="decimal" value="${fmt(x.step != null ? x.step : e.step)}"></div>`;
  h += `<div class="field"><label>Заменить на</label><div class="chips">${replaceOptions(x.ex).map(id => `<button class="chip" data-a="ed-swap" data-ex="${id}">${esc(EX[id].name)}</button>`).join('')}</div></div>
    <button class="btn main" data-a="ed-save" data-d="${dayId}" data-i="${i}">Сохранить</button>
    <div class="row2" style="margin-top:8px"><button class="btn" data-a="ed-move" data-d="${dayId}" data-i="${i}" data-v="-1">↑ Выше</button>
      <button class="btn" data-a="ed-move" data-d="${dayId}" data-i="${i}" data-v="1">↓ Ниже</button></div>
    <button class="btn ghost danger" style="margin-top:8px" data-a="ed-del" data-d="${dayId}" data-i="${i}">Убрать из дня</button>`;
  edit = { dayId, i, rest: x.rest, ex: x.ex };
  openSheet(h);
}
let edit = null;
// Замены: сначала из справочника упражнения, потом остальные той же группы.
function replaceOptions(ex) {
  const e = EX[ex], out = e.subs.slice();
  for (const id in EX) if (id !== ex && !out.includes(id) && EX[id].group === e.group && !['hang', 'neg', 'hlr', 'grav_neg'].includes(id)) out.push(id);
  return out;
}

function sheetAdd(dayId) {
  let h = '<h2>Добавить упражнение</h2>';
  for (const g in GROUPS) {
    h += `<div class="sec">${GROUPS[g]}</div><ul class="exl ex-pick">`;
    for (const id in EX) if (EX[id].group === g && !['hang', 'neg', 'hlr'].includes(id))
      h += `<li data-a="add-ex" data-d="${dayId}" data-ex="${id}"><div class="n"><b>${esc(EX[id].name)}</b><span>${esc(EX[id].muscles)}</span></div><div class="w muted">+</div></li>`;
    h += '</ul>';
  }
  openSheet(h);
}

// ───── Техника упражнения ─────
// Фото старт/финиш на всю ширину, целиком, без обрезки — везде под спойлером «Фото»
// withMap — схема мышц внутри спойлера (экран тренировки); в «Технике» и при замене схема видна сразу под спойлером
const keyHTML = e => e.key ? `<ul class="keys">${e.key.map(k => `<li>${esc(k)}</li>`).join('')}</ul>` : '';
function photosHTML(e, withMap) {
  const mus = musclesHTML(e);
  return `<details class="fold photos"><summary>Анимация упражнения</summary><div class="anim" title="Нажми, чтобы остановить"><img src="img/ex/${e.img}/0.webp" alt="Старт"><img class="b" src="img/ex/${e.img}/1.webp" alt="Финиш"></div>${e.photo ? `<p class="note" style="margin:0 0 8px">${esc(e.photo)}</p>` : ''}</details>`
    + (mus ? `<details class="fold photos"><summary>Мышцы</summary>${mus}</details>` : '');
}
function sheetTech(id) {
  const e = EX[id];
  const subs = e.subs.map(s => `<button class="chip" data-a="tech" data-ex="${s}">${esc(EX[s].name)}</button>`).join('');
  const fold = (t, body) => `<details class="fold"><summary>${t}</summary>${body}</details>`;
  openSheet(`<h2>${esc(e.name)}</h2>
    ${photosHTML(e)}
    <div class="cue">${keyHTML(e)}<b>${esc(e.cue)}</b><span class="muted small">Темп: ${esc(e.tempo)}</span></div>
    <p class="muted small" style="margin:0 0 6px">${esc(e.muscles)}</p>
    ${fold('Техника', `<ol class="tech">${e.tech.map(t => `<li>${esc(t)}</li>`).join('')}</ol>`)}
    ${fold('Дыхание', `<p>${esc(e.breath)}</p>`)}
    ${fold('Типичные ошибки', `<ul class="err">${e.errors.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`)}
    ${fold('Замены', `<div class="chips">${subs}</div>`)}`);
}

// ───── Прогресс (этап 4) ─────
let statEx = null;
// Метрика сессии: вес — расчётный максимум на 1 повтор (Эпли), гравитрон — помощь, свой вес — повторы, планка — секунды
function sessionValue(ex, it) {
  const e = EX[ex], ss = (it.sets || []).filter(x => !x.warm); if (!ss.length) return null;
  if (e.type === 'w') return Math.max(...ss.map(x => (x.kg || 0) * (1 + x.reps / 30)));
  if (e.type === 'assist') return Math.min(...ss.map(x => x.kg || 0));
  if (e.type === 'bw') return Math.max(...ss.map(x => x.reps || 0));
  return Math.max(...ss.map(x => x.sec || 0));
}
function chartSVG(pts, unit, lowerBetter) {
  const W = 320, H = 150, L = 34, R = 10, T = 12, B = 22;
  const vs = pts.map(p => p.v), mn = Math.min(...vs), mx = Math.max(...vs), pad = (mx - mn) * 0.15 || 1, lo = mn - pad, hi = mx + pad;
  const x = i => pts.length === 1 ? (L + W - R) / 2 : L + (W - L - R) * i / (pts.length - 1), y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const line = pts.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.v).toFixed(1)).join(' ');
  const best = pts.reduce((m, p, i) => (lowerBetter ? p.v < pts[m].v : p.v > pts[m].v) ? i : m, 0);
  const d = k => { const [, m, dd] = pts[k].date.split('-'); return dd + '.' + m; };
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="График прогресса">
    <line x1="${L}" y1="${T}" x2="${L}" y2="${H - B}" stroke="var(--line)"/><line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="var(--line)"/>
    <text x="${L - 4}" y="${T + 4}" text-anchor="end" font-size="12" fill="var(--muted)">${fmt(Math.round(hi * 10) / 10)}</text>
    <text x="${L - 4}" y="${H - B}" text-anchor="end" font-size="12" fill="var(--muted)">${fmt(Math.round(lo * 10) / 10)}</text>
    <text x="${L}" y="${H - 6}" font-size="12" fill="var(--muted)">${d(0)}</text><text x="${W - R}" y="${H - 6}" text-anchor="end" font-size="12" fill="var(--muted)">${d(pts.length - 1)}</text>
    <path d="${line}" fill="none" stroke="var(--acc)" stroke-width="2.5" stroke-linejoin="round"/>
    ${pts.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="${i === best ? 5 : 3}" fill="${i === best ? 'var(--acc)' : 'var(--bg)'}" stroke="var(--acc)" stroke-width="2"/>`).join('')}</svg>`;
}
const weekStart = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
function barsSVG(items, fmtv) {   // items: [{l, v, hi}]
  const W = 320, H = 130, L = 6, R = 6, T = 16, B = 20, mx = Math.max(1, ...items.map(i => i.v)), n = items.length, bw = (W - L - R) / n;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img">${items.map((it, i) => { const h = (H - T - B) * it.v / mx, x = L + i * bw;
    return `<rect x="${(x + bw * 0.15).toFixed(1)}" y="${(H - B - h).toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${Math.max(h, it.v ? 2 : 0).toFixed(1)}" rx="3" fill="${it.hi ? 'var(--acc)' : 'var(--card2)'}" stroke="var(--acc)" stroke-width="${it.hi ? 0 : 1}"/>
    ${it.v ? `<text x="${(x + bw / 2).toFixed(1)}" y="${(H - B - h - 4).toFixed(1)}" text-anchor="middle" font-size="12" fill="var(--muted)">${fmtv(it.v)}</text>` : ''}
    <text x="${(x + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="12" fill="var(--muted)">${it.l}</text>`; }).join('')}</svg>`;
}
function hbars(rows) {   // rows: [[name, value, max]]
  return rows.map(([n, v, mx]) => `<div class="hb"><span>${esc(n)}</span><i><u style="width:${mx ? Math.round(100 * v / mx) : 0}%"></u></i><b>${v}</b></div>`).join('');
}
function analyticsHTML() {
  const done = D.workouts.filter(w => w.done).sort((a, b) => a.date < b.date ? -1 : 1); if (!done.length) return '';
  const now = new Date(), ws = weekStart(now), ton = w => tonnage(w);
  const month = dk(now).slice(0, 7), inMonth = done.filter(w => w.date.startsWith(month)).length;
  const totalT = done.reduce((a, w) => a + ton(w), 0);
  // серия недель подряд хотя бы с 1 тренировкой
  const weeks = new Set(done.map(w => dk(weekStart(pk(w.date))))); let streak = 0, c = new Date(ws);
  if (!weeks.has(dk(c))) c = addDays(c, -7);
  while (weeks.has(dk(c))) { streak++; c = addDays(c, -7); }
  let h = `<div class="tiles"><div><b class="num">${done.length}</b><span>тренировок всего</span></div><div><b class="num">${inMonth}</b><span>в этом месяце</span></div><div><b class="num">${streak}</b><span>недель подряд</span></div><div><b class="num">${fmt(Math.round(totalT / 100) / 10)}</b><span>тонн всего</span></div></div>`;
  let ch = '';
  // тоннаж последних тренировок
  const last = done.slice(-10);
  ch += `<details class="card spoil" data-k="a-ton"${spoilOpen('a-ton')}><summary>Тоннаж тренировок, кг</summary>${barsSVG(last.map((w, i) => ({ l: w.date.slice(8) + '.' + w.date.slice(5, 7), v: ton(w), hi: i === last.length - 1 })), v => v >= 1000 ? (Math.round(v / 100) / 10) + 'т' : v)}<p class="muted small" style="margin:6px 0 0">Вес × повторы по всем подходам. Растёт — работаешь больше.</p></details>`;
  // тренировок по неделям (8)
  const wk = []; for (let i = 7; i >= 0; i--) { const s0 = addDays(ws, -7 * i), k = dk(s0); wk.push({ l: k.slice(8) + '.' + k.slice(5, 7), v: done.filter(w => dk(weekStart(pk(w.date))) === k).length, hi: i === 0 }); }
  ch += `<details class="card spoil" data-k="a-wk"${spoilOpen('a-wk')}><summary>Тренировок по неделям</summary>${barsSVG(wk, v => v)}<p class="muted small" style="margin:6px 0 0">Подпись — понедельник недели.</p></details>`;
  // подходов по группам за 4 недели
  const from = dk(addDays(ws, -21)), cnt = {};
  for (const w of done) if (w.date >= from) for (const it of w.items) { const g = EX[it.ex] && EX[it.ex].group; if (g) cnt[g] = (cnt[g] || 0) + workSets(it).length; }
  const rows = Object.keys(GROUPS).map(g => [GROUPS[g], cnt[g] || 0]), mx = Math.max(1, ...rows.map(r => r[1]));
  ch += `<details class="card spoil" data-k="a-grp"${spoilOpen('a-grp')}><summary>Подходов по мышцам, 4 недели</summary>${hbars(rows.map(r => [r[0], r[1], mx]))}<p class="muted small" style="margin:6px 0 0">Помогает заметить перекос: что качаешь меньше всего.</p></details>`;
  // самые частые упражнения
  const freq = {}; for (const w of done) for (const it of w.items) if (!it.extra && workSets(it).length) freq[it.ex] = (freq[it.ex] || 0) + 1;
  h += groupSpoil('a-charts', 'Графики', [feelHTML(), ch]);
  return h;
}
function vStats() {
  const n = D.workouts.filter(w => w.done).length;
  const exs = Object.keys(EX).filter(id => exHistory(id).length);
  let h = `<div class="top"><div><h1>Прогресс</h1><div class="muted">графики, рекорды, путь к подтягиванию</div></div></div>
    ${statsExtraHTML()}${analyticsHTML()}${statsExtra2HTML()}`;
  if (!exs.length) return h + `<div class="card empty"><div class="num">0</div><p class="note">Графики появятся, когда будет что рисовать — после первых тренировок.</p></div>`;
  if (!exs.includes(statEx)) statEx = exs[0];
  const e = EX[statEx], pts = exHistory(statEx).map(x => ({ date: x.date, v: sessionValue(statEx, x.it) })).filter(p => p.v != null);
  const unit = e.type === 'w' ? 'кг (расчётный максимум на 1 повтор)' : e.type === 'assist' ? 'кг помощи (меньше — лучше)' : e.type === 'bw' ? 'повторов (лучший подход)' : 'секунд (лучший подход)';
  const first = pts[0].v, last = pts[pts.length - 1].v, diff = Math.round((last - first) * 10) / 10;
  h += `<details class="card spoil" data-k="a-ex"${spoilOpen('a-ex')}><summary>Прогресс по упражнению</summary><h2 style="margin:6px 0 8px;font-size:16px">${esc(e.name)}</h2>
    <select class="inp" data-a="stat-ex-sel" style="margin-bottom:10px">${exs.map(id => `<option value="${id}"${id === statEx ? ' selected' : ''}>${esc(EX[id].name)}</option>`).join('')}</select>
    ${chartSVG(pts, unit, e.type === 'assist')}
    <p class="muted small" style="margin:8px 0 0">${unit}. Тренировок: ${pts.length}${pts.length > 1 ? ` · с начала ${diff > 0 ? '+' : ''}${fmt(diff)}` : ''}</p></details>`;
  return h;
}

// ───── Ещё ─────
// Всё редкое: вес тела, дни недели, сброс программы, бэкап.
function vMore() {
  const s = D.settings, P = D.program;
  const opts = Object.keys(P.days).map(id => [id, P.days[id].name]).concat([['walk', 'Бег / ходьба'], ['rest', 'Отдых']]);
  return `<div class="top"><h1>Ещё</h1></div>
    <details class="card spoil" data-k="weight"${spoilOpen('weight')}><summary>Вес тела<span class="sum-r">${s.weight != null ? fmt(s.weight) + ' кг' : 'не указан'}</span></summary>
      <p class="muted small" style="margin:0 0 10px">Нужен, чтобы считать, какую часть своего веса ты уже поднимаешь сам в гравитроне. Когда помощь станет меньше 30% веса тела, добавлю негативные подтягивания — это путь к первому подтягиванию.</p>
      <div class="stepper"><input class="inp" id="s-weight" inputmode="decimal" value="${s.weight != null ? fmt(s.weight) : ''}" placeholder="кг">
        <button class="btn" style="width:auto" data-a="savesettings">Сохранить</button></div></details>
    <div class="sec">Приложение</div>
    <details class="card spoil" data-k="sched"${spoilOpen('sched')}><summary>Расписание и программа</summary><ul class="sched">${[1, 2, 3, 4, 5, 6, 0].map(i =>
      `<li><b>${WD[i]}</b><select class="inp" data-a="sched" data-wd="${i}">${opts.map(([v, t]) => `<option value="${v}"${P.week[i] === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></li>`).join('')}</ul><button class="btn ghost danger" data-a="progpick" style="margin-top:10px">Выбрать другую программу</button></details>
    <details class="card spoil" data-k="theme"${spoilOpen('theme')}><summary>Оформление<span class="sum-r">${THEMES[D.settings.theme || 'lime'][0]}</span></summary><div class="chips">${Object.keys(THEMES).map(k => `<button class="chip${(D.settings.theme || 'lime') === k ? ' on' : ''}" data-a="theme" data-v="${k}">${THEMES[k][0]}</button>`).join('')}</div></details>
    ${soundCard()}

    <div class="sec">Данные и подключения</div>
    ${moreExtrasHTML()}
    ${UPDATE_REPO ? '<button class="btn" data-a="chkupd" style="margin-top:12px">Проверить обновление</button>' : ''}
    <p class="muted small" style="text-align:center;margin-top:16px">Тренер ${APP_VERSION} · фото упражнений — free-exercise-db (public domain)</p>`;
}

// Звук конца отдыха и таймера планки: 10 на выбор, ▶ — послушать
function soundCard() {
  const cur = soundId(), vol = [1, 2, 3].includes(D.settings.soundVol) ? D.settings.soundVol : 2;
  return `<details class="card spoil" data-k="sound"${spoilOpen('sound')}><summary>Звук отдыха</summary>
    <p class="muted small" style="margin:0 0 10px">Играет, когда закончился отдых между подходами и когда отсчитал таймер планки.</p>
    <div class="chips" style="margin-bottom:10px">${[['Тихо', 1], ['Средне', 2], ['Громко', 3]].map(([t, v]) => `<button class="chip${vol === v ? ' on' : ''}" data-a="snd-vol" data-v="${v}">${t}</button>`).join('')}</div>
    <ul class="snd">${SOUNDS.map(s => `<li class="${s.id === cur ? 'on' : ''}"><button class="snd-pick" data-a="snd-pick" data-id="${s.id}"><i></i>${esc(s.name)}</button><button class="ibtn" data-a="snd-play" data-id="${s.id}" aria-label="Послушать">▶</button></li>`).join('')}</ul>
    <label class="snd-pips"><input type="checkbox" data-a="snd-pips" ${D.settings.pips !== false ? 'checked' : ''}> Тихий писк за 3, 2, 1 секунды до конца отдыха</label></details>`;
}

// Обновление через GitHub Releases: берём последний релиз, сравниваем версию, предлагаем скачать APK
const verNum = v => String(v).replace(/^v/i, '').split('.').map(x => parseInt(x, 10) || 0);
const isNewer = (a, b) => { const x = verNum(a), y = verNum(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
async function checkUpdate() {
  if (!UPDATE_REPO) return;
  if (!navigator.onLine) return toast('Нет сети');
  toast('Проверяю…');
  try {
    const r = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
    if (r.status === 404) return toast('Релизов пока нет');
    if (!r.ok) throw new Error(r.status);
    const rel = await r.json(), apk = (rel.assets || []).find(a => /\.apk$/i.test(a.name));
    if (!isNewer(rel.tag_name, APP_VERSION)) return toast('Установлена последняя версия ' + APP_VERSION);
    if (!apk) return toast('Версия ' + rel.tag_name + ' есть, но без APK');
    openSheet(`<h2>Вышла версия ${esc(String(rel.tag_name).replace(/^v/i, ''))}</h2>
      <p class="muted" style="margin:0 0 14px">${esc((rel.body || 'Обновление приложения.').slice(0, 400))}</p>
      <div id="upd-box">      <button class="btn main" data-a="getupd" data-url="${esc(apk.browser_download_url)}">Скачать и установить</button>
      <p class="muted small" style="margin-top:10px">Файл скачается прямо здесь, потом откроется установка — нажми «Обновить». Данные сохранятся, приложение удалять не надо.</p></div>`);
  } catch (e) { toast('Не получилось проверить — попробуй позже'); }
}
let updFile = null;
const updBox = h => { const b = $('#upd-box'); if (b) b.innerHTML = h; };
async function updateApp(url) {
  const U = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Updater;
  if (!U) { const b = window.Capacitor && Capacitor.Plugins.Browser; if (b) b.open({ url }); else window.open(url, '_blank'); return; }
  updBox(`<div class="bar upd-bar"><i id="upd-i" style="width:3%"></i></div><p class="muted small" id="upd-t" style="margin:8px 0 0">Скачиваю…</p>`);
  let h; try { h = await U.addListener('progress', e => { const i = $('#upd-i'), t = $('#upd-t'); if (i) i.style.width = Math.max(3, e.pct) + '%'; if (t) t.textContent = e.pct >= 0 ? `Скачиваю… ${e.pct}% (${String(e.mb).replace('.', ',')} МБ)` : `Скачиваю… ${String(e.mb).replace('.', ',')} МБ`; }); } catch (e) {}
  try { const r = await U.download({ url }); updFile = r.path; }
  catch (e) { if (h) h.remove(); return updBox(`<p class="muted" style="margin:0 0 10px">Не скачалось: ${esc(String(e && e.message || e))}</p><button class="btn main" data-a="getupd" data-url="${esc(url)}">Повторить</button>`); }
  if (h) h.remove();
  installUpdate();
}
async function installUpdate() {
  const U = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Updater;
  updBox(`<p class="muted" style="margin:0 0 10px">Скачано. Открываю установку — нажми «Обновить».</p><button class="btn main" data-a="instupd">Установить</button>`);
  try { await U.install({ path: updFile }); }
  catch (e) { if (String(e && e.message || e) === 'perm') updBox(`<p class="muted" style="margin:0 0 10px">Разреши Тренеру устанавливать приложения: включи переключатель в открывшихся настройках, вернись сюда и нажми «Установить».</p><button class="btn main" data-a="instupd">Установить</button>`); else toast('Не открылась установка'); }
}
let updChecked = false;   // раз за запуск тихо проверяем и подсказываем, если есть новая версия
async function autoCheckUpdate() {
  if (!UPDATE_REPO || updChecked || !navigator.onLine) return; updChecked = true;
  try {
    const r = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) return; const rel = await r.json();
    if (isNewer(rel.tag_name, APP_VERSION) && (rel.assets || []).some(a => /\.apk$/i.test(a.name))) toast('Вышла новая версия — «Ещё» → «Проверить обновление»');
  } catch (e) {}
}
setTimeout(autoCheckUpdate, 4000);

// ───── Нижний лист ─────
// Кнопка «Назад» на Android закрывает лист: при открытии кладём запись в историю.
// Окно, открытое без нажатия (приветствие), в историю не кладём — Chrome такую запись пропускает.
let sheetOpen = false, sheetPushed = false;
function openSheet(html) {
  $('#sheet').innerHTML = `<div class="sheet-bg" data-a="sheetbg"><div class="sheet" role="dialog"><button class="sheet-x" data-a="sheetclose" aria-label="Закрыть">✕</button><div class="grip"></div>${html}</div></div>`;
  $('#sheet .sheet').scrollTop = 0;
  if (!sheetOpen && navigator.userActivation && navigator.userActivation.isActive) { history.pushState({ sheet: 1 }, ''); sheetPushed = true; }
  sheetOpen = true;
}
function hideSheet() { sheetOpen = false; $('#sheet').innerHTML = ''; edit = null; }
function closeSheet() { if (sheetPushed) { sheetPushed = false; history.back(); } hideSheet(); }
addEventListener('popstate', () => { if (sheetPushed) { sheetPushed = false; hideSheet(); } });

let toastT = 0;
function toast(t) {
  let el = $('.toast'); if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = t; clearTimeout(toastT); toastT = setTimeout(() => el.remove(), 2600);
}

// ───── Первый запуск ─────
let pickP = 'full3';
const presetList = (sel, act) => PRESETS.map(p => `<li class="tap${p.id === sel ? ' sel' : ''}" data-a="${act}" data-p="${p.id}"><div class="n"><b>${esc(p.name)}</b><span>${esc(p.desc)}</span></div><div class="w">${p.id === sel ? '✓' : ''}</div></li>`).join('');
function sheetWelcome() {
  openSheet(`<h2>Привет!</h2>
    <p class="muted" style="margin:0 0 14px">Впиши вес тела и выбери программу. Потом её можно поменять и подправить под себя.</p>
    <div class="field"><input class="inp" id="s-weight" inputmode="decimal" placeholder="Вес тела, кг"></div>
    <ul class="exl ex-pick" id="wl-list">${presetList(pickP, 'wl-pick')}</ul>
    <button class="btn main" data-a="welcome" style="margin-top:12px">Готово</button>`);
}
// Смена программы из «Ещё»: история тренировок остаётся, меняется только план
function sheetPrograms() {
  openSheet(`<h2>Выбрать программу</h2>
    <p class="muted" style="margin:0 0 14px">Текущий план заменится выбранным. История тренировок и записанные веса останутся. Дни недели и упражнения потом можно изменить.</p>
    <ul class="exl ex-pick">${presetList(null, 'prog-set')}</ul>`);
}

// ───── Клики ─────
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
async function saveProgram() { await saveKV('program'); }

document.addEventListener('click', async ev => {
  const el = ev.target.closest('[data-a]'); if (!el) return;
  const a = el.dataset.a, ds = el.dataset;
  if (a === 'sheetbg') { if (ev.target === el) closeSheet(); return; }
  if (a === 'sched') return;
  switch (a) {
    case 'tab': tab = ds.k; progEdit = false; if (ds.k === 'today') selDay = null; render(); scrollTo(0, 0); break;
    case 'progedit': progEdit = !progEdit; render(); break;
    case 'tech': sheetTech(ds.ex); break;
    case 'start': sheetCheck(ds.d); break;
    case 'resume': tab = 'workout'; render(); restLoop(); scrollTo(0, 0); checkIdle(); break;
    case 'day': selDay = ds.k || null; render(); break;
    case 'wk': selDay = dk(addDays(selDay ? pk(selDay) : new Date(), +ds.v)); render(); break;
    case 'wdel': {
      if (!confirm('Удалить эту тренировку из истории? Вернуть будет нельзя.')) return;
      D.workouts = D.workouts.filter(x => x.id !== ds.id); await dbDel('workouts', ds.id); render(); toast('Тренировка удалена'); break;
    }
    case 'summary': { const w = D.workouts.find(x => x.id === ds.id); if (w) sheetSummary(w); break; }
    case 'weigh': {
      const v = num($('#wg').value), key = dk(new Date());
      if (!v || v < 35 || v > 250) { toast('Впиши вес в кг'); return; }
      D.settings.weight = Math.round(v * 10) / 10; D.settings.weighed = key; await saveKV('settings');
      closeSheet(); render(); toast(`${fmt(D.settings.weight)} кг — записал`); break;
    }
    case 'weighopen': sheetWeigh(); break;
    case 'weighskip': D.settings.weighSkip = dk(new Date()); await saveKV('settings'); closeSheet(); break;
    case 'edit': sheetEdit(ds.d, +ds.i); break;
    case 'ed-n': { const f = $('#f-' + ds.f); f.value = Math.max(1, Math.min(8, (num(f.value) || 0) + +ds.v)); break; }
    case 'ed-rest': edit.rest = +ds.v; document.querySelectorAll('[data-a="ed-rest"]').forEach(c => c.classList.toggle('on', c === el)); break;
    case 'ed-swap': {
      const x = D.program.days[edit.dayId].items[edit.i], ne = EX[ds.ex];
      x.ex = ds.ex; delete x.step; delete x.pull;
      if (ne.type === 'time' && EX[edit.ex].type !== 'time') { x.lo = 30; x.hi = 45; }
      if (ne.type !== 'time' && EX[edit.ex].type === 'time') { x.lo = 10; x.hi = 15; }
      await saveProgram(); sheetEdit(edit.dayId, edit.i); render(); toast('Заменил на «' + ne.name + '»'); break;
    }
    case 'ed-save': {
      const x = D.program.days[ds.d].items[+ds.i];
      const sets = num($('#f-sets').value), lo = num($('#f-lo').value), hi = num($('#f-hi').value);
      if (!sets || !lo || !hi || lo > hi) { toast('Проверь подходы и диапазон'); return; }
      Object.assign(x, { sets: Math.round(sets), lo: Math.round(lo), hi: Math.round(hi), rest: edit.rest });
      const st = $('#f-step'); if (st) { const v = num(st.value); if (v && v !== EX[x.ex].step) x.step = v; else delete x.step; }
      await saveProgram(); closeSheet(); render();
      const min = dayMinutes(D.program.days[ds.d]);
      toast(min > MAX_MIN ? `Сохранил, но день выходит ≈ ${min} мин — больше ${MAX_MIN}` : 'Сохранил');
      break;
    }
    case 'ed-move': {
      const arr = D.program.days[ds.d].items, i = +ds.i, j = i + +ds.v;
      if (j < 0 || j >= arr.length) return;
      [arr[i], arr[j]] = [arr[j], arr[i]]; await saveProgram(); closeSheet(); render(); break;
    }
    case 'ed-del': {
      if (!confirm('Убрать упражнение из этого дня?')) return;
      D.program.days[ds.d].items.splice(+ds.i, 1); await saveProgram(); closeSheet(); render(); break;
    }
    case 'add': sheetAdd(ds.d); break;
    case 'add-ex': {
      const e = EX[ds.ex], day = D.program.days[ds.d];
      day.items.push(e.type === 'time' ? { ex: ds.ex, sets: 2, lo: 30, hi: 45, rest: 45 } : { ex: ds.ex, sets: 3, lo: e.base ? 8 : 10, hi: e.base ? 12 : 15, rest: e.base ? REST_BASE : REST_ISO });
      await saveProgram(); closeSheet(); render();
      const min = dayMinutes(day);
      toast(min > MAX_MIN ? `Добавил. День ≈ ${min} мин — больше ${MAX_MIN}` : 'Добавил'); break;
    }
    case 'progpick': sheetPrograms(); break;
    case 'wl-pick': { pickP = ds.p; const l = $('#wl-list'); if (l) l.innerHTML = presetList(pickP, 'wl-pick'); break; }
    case 'prog-set': {
      if (!confirm('Заменить текущую программу на «' + PRESETS.find(x => x.id === ds.p).name + '»? Твои правки программы пропадут, история тренировок останется.')) return;
      if (D.active && !confirm('Сейчас идёт тренировка — она продолжится по старому плану. Продолжить?')) return;
      D.program = buildPreset(ds.p); await saveProgram(); closeSheet(); tab = 'prog'; render(); toast('Программа заменена'); break;
    }

    case 'welcome': case 'savesettings': {
      const w = num($('#s-weight').value);
      if (!w || w < 35 || w > 250) { toast('Впиши вес тела в кг'); return; }
      D.settings.weight = w;
      if (!D.settings.start) D.settings.start = dk(monday(new Date()));
      await saveKV('settings');
      if (a === 'welcome') { D.program = buildPreset(pickP); await saveProgram(); closeSheet(); }
      render(); toast('Сохранил'); break;
    }
    case 'export': {
      const data = await dbExport(), t = new Date(), name = `Тренер_${dk(t)}_${pad(t.getHours())}-${pad(t.getMinutes())}.json`;
      const cap = window.Capacitor && Capacitor.Plugins;
      try {
        if (cap && cap.Filesystem && cap.Share) {   // APK: файл в кэш и системное «Поделиться» (Диск, Telegram…)
          const f = await cap.Filesystem.writeFile({ path: name, data: JSON.stringify(data), directory: 'CACHE', encoding: 'utf8' });
          await cap.Share.share({ title: 'Бэкап Тренера', files: [f.uri], dialogTitle: 'Сохранить бэкап' });
        } else {
          const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
          const l = document.createElement('a'); l.href = url; l.download = name; l.click();
          setTimeout(() => URL.revokeObjectURL(url), 5000);
        }
      } catch (e) { if (!/cancel/i.test(String(e && e.message || e))) toast('Не получилось сохранить бэкап'); }
      break;
    }
    case 'chkupd': checkUpdate(); break;
    case 'getupd': updateApp(ds.url); break;
    case 'instupd': installUpdate(); break;
    case 'theme': D.settings.theme = ds.v; await saveKV('settings'); render(); break;
    case 'stat-ex': statEx = ds.ex; render(); break;
    case 'snd-play': playSound(ds.id); break;
    case 'snd-pick': D.settings.sound = ds.id; await saveKV('settings'); playSound(ds.id); render(); break;
    case 'snd-vol': D.settings.soundVol = +ds.v; await saveKV('settings'); playSound(soundId()); render(); break;
    case 'import': $('#importfile').click(); break;
  }
});
document.addEventListener('change', async ev => {
  const el = ev.target;
  if (el.dataset.a === 'snd-pips') { D.settings.pips = el.checked; await saveKV('settings'); }
  if (el.dataset.a === 'stat-ex-sel') { statEx = el.value; render(); }
  if (el.dataset.a === 'sched') { D.program.week[el.dataset.wd] = el.value; await saveProgram(); render(); }
  if (el.id === 'importfile' && el.files[0]) {
    try {
      const o = JSON.parse(await el.files[0].text());
      if (!confirm('Заменить все данные на этом телефоне данными из файла?')) return;
      await dbImport(o); render(); toast('Данные восстановлены');
    } catch (e) { toast(e.message || 'Не получилось прочитать файл'); }
  }
});

// ───── Запуск ─────
(async () => {
  try { await dbLoad(); }
  catch (e) { $('#app').innerHTML = `<div class="card">Не открылась база данных: ${esc(e.message)}</div>`; return; }
  render();
  if (D.settings.weight == null) sheetWelcome(); else maybeWeigh();
  // Приложение могли оставить открытым с вечера: при возврате на экран и в полночь перерисовываем день
  let shown = dk(new Date());
  const refreshDay = () => { const k = dk(new Date()); if (k !== shown) { shown = k; if (!sheetOpen) render(); } };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { refreshDay(); maybeWeigh(); } });
  setInterval(refreshDay, 60000);
  if (D.active) restLoop();
  // Свайп по полосе недели — соседняя неделя
  let tx = null;
  document.addEventListener('touchstart', e => { tx = e.target.closest('#week') ? e.touches[0].clientX : null; }, { passive: true });
  document.addEventListener('touchend', e => {
    if (tx == null) return; const dx = e.changedTouches[0].clientX - tx; tx = null;
    if (Math.abs(dx) > 50) { selDay = dk(addDays(selDay ? pk(selDay) : new Date(), dx < 0 ? 7 : -7)); render(); }
  }, { passive: true });
})();
