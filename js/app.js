// Тренер — экраны и навигация. Ванильный JS без зависимостей.
// Отрисовка: функции v*() возвращают HTML-строку, клики ловит один обработчик по data-a.
const APP_VERSION = '0.3.1';

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
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>',
};

// ───── План ─────
const planOf = d => D.program.week[d.getDay()] || 'rest';
const isTrain = p => !!D.program.days[p];

// Подходы упражнения по всем завершённым тренировкам: [{date, it:{ex,sets,…}}], новые в конце.
function exHistory(ex) {
  const out = [];
  for (const w of D.workouts) if (w.done) for (const it of w.items) if (it.ex === ex && it.sets && it.sets.some(s => !s.warm)) out.push({ date: w.date, it });
  return out;
}
// Последний рабочий вес (до этапа прогрессии — просто лучший подход прошлой тренировки).
// Для гравитрона — наименьшая помощь.
function lastWork(ex, item) {
  const h = exHistory(ex); if (!h.length) return null;
  const sets = h[h.length - 1].it.sets.filter(s => !s.warm);
  const inRange = sets.filter(s => s.reps >= item.lo && s.reps <= item.hi);
  const pool = inRange.length ? inRange : sets;
  const ws = pool.map(s => s.kg).filter(x => x != null);
  if (!ws.length) return null;
  return EX[ex].type === 'assist' ? Math.min(...ws) : Math.max(...ws);
}
const curAssist = () => lastWork('gravitron', { lo: 1, hi: 99 });
// Пора ли менять вис на негативы: помощь меньше 30% веса тела.
function negReady() {
  const a = curAssist(), bw = D.settings.weight;
  return a != null && bw && a < bw * 0.3;
}
// Упражнения дня с учётом этапа пути к подтягиванию.
function dayItems(dayId) {
  const day = D.program.days[dayId]; if (!day) return [];
  return day.items.map(x => x.pull === 'hang' && negReady() ? Object.assign({}, x, { ex: 'neg', sets: 3, lo: 3, hi: 5, rest: 90 }) : x);
}

function repsLabel(x) {
  const e = EX[x.ex], r = x.lo === x.hi ? x.lo : `${x.lo}–${x.hi}`;
  return `${x.sets}×${r}${e.type === 'time' ? ' с' : ''}`;
}
// Вес справа в строке упражнения. Пусто, если истории нет — подсказка одна на всю карточку.
function workLabel(x) {
  const e = EX[x.ex];
  if (e.type !== 'w' && e.type !== 'assist') return '';
  const w = lastWork(x.ex, x);
  if (w == null) return '';
  return (e.type === 'assist' ? 'помощь ' : '') + fmt(w) + ' кг';
}
const needsPick = x => (EX[x.ex].type === 'w' || EX[x.ex].type === 'assist') && lastWork(x.ex, x) == null;
const perDb = x => EX[x.ex].equip === 'dumbbell' && workLabel(x) ? ' · на гантель' : '';

// ───── Состояние экрана ─────
let tab = 'today';
const $ = s => document.querySelector(s);

function render() {
  const v = { today: vToday, prog: vProgram, stats: vStats, more: vMore }[tab];
  $('#app').innerHTML = v();
  $('#tabs').innerHTML = [['today', 'Сегодня'], ['prog', 'Программа'], ['stats', 'Прогресс'], ['more', 'Ещё']]
    .map(([k, t]) => `<button data-a="tab" data-k="${k}" class="${tab === k ? 'on' : ''}">${I[k]}${t}</button>`).join('');
}

// ───── Сегодня ─────
// Полоса недели: буква дня, число и точка — силовая (контур), сделана (заливка), ходьба (голубая).
function vWeek(now) {
  const m = monday(now), tk = dk(now);
  let h = '<div class="week">';
  for (let i = 0; i < 7; i++) {
    const d = addDays(m, i), key = dk(d), p = planOf(d);
    const trained = D.workouts.some(w => w.date === key && w.done);
    const dot = trained ? 'done' : isTrain(p) ? 'train' : p === 'walk' ? 'walk' : '';
    h += `<div class="wd${key === tk ? ' today' : ''}"><b>${WD[d.getDay()]}</b><span class="num">${d.getDate()}</span><i class="${dot}"></i></div>`;
  }
  return h + '</div>';
}

function vToday() {
  const now = new Date(), p = planOf(now), key = dk(now);
  let h = `<div class="top"><h1>${fmtDate(now)}</h1></div>` + vWeek(now);
  if (isTrain(p)) {
    const day = D.program.days[p], items = dayItems(p), done = D.workouts.find(w => w.date === key && w.done);
    h += `<div class="card"><div class="card-h"><h2>${esc(day.name)}</h2><span class="tag">≈ ${dayMinutes({ items })} мин</span></div>`;
    const pick = items.filter(needsPick).length, weighted = items.filter(x => EX[x.ex].type === 'w' || EX[x.ex].type === 'assist').length;
    if (pick) h += `<p class="hint">${pick === weighted ? 'Первая тренировка — веса подберёшь по ходу' : 'Где веса нет — подберёшь по ходу'}</p>`;
    h += '<ul class="exl">';
    for (const x of items) h += `<li class="tap" data-a="tech" data-ex="${x.ex}"><div class="n"><b>${esc(EX[x.ex].name)}</b><span>${repsLabel(x)}${perDb(x)}</span></div><div class="w">${workLabel(x)}</div></li>`;
    h += '</ul>';
    h += done ? `<div class="btn ghost">${I.check} Тренировка сделана</div>` : `<button class="btn main" data-a="start">Начать тренировку</button>`;
    h += '</div>';
  } else {
    const next = nextTraining(now);
    h += `<div class="card"><h2>${p === 'walk' ? 'Ходьба' : 'Отдых'}</h2>
      <p class="muted" style="margin:6px 0 0">${p === 'walk' ? '45–60 минут спокойным шагом.' : 'Силовой сегодня нет.'}</p>
      ${next ? `<p class="note">Дальше — ${WD_FULL[next.d.getDay()]}: ${esc(next.day.name.toLowerCase())}.</p>` : ''}</div>`;
  }
  return h;
}
function nextTraining(now) {
  for (let i = 1; i <= 7; i++) { const d = addDays(now, i), p = planOf(d); if (isTrain(p)) return { d, day: D.program.days[p] }; }
  return null;
}

// ───── Программа ─────
// По умолчанию только просмотр; правка включается кнопкой «Изменить», чтобы не задеть в зале.
let progEdit = false;
function vProgram() {
  const P = D.program;
  let h = `<div class="top"><h1>Программа</h1><button class="btn small-btn${progEdit ? ' on' : ''}" data-a="progedit">${progEdit ? 'Готово' : 'Изменить'}</button></div>`;
  for (const id of Object.keys(P.days)) {
    const day = P.days[id], min = dayMinutes(day);
    const when = [1, 2, 3, 4, 5, 6, 0].filter(i => P.week[i] === id).map(i => WD[i]).join(', ') || 'не стоит в неделе';
    h += `<div class="card"><div class="card-h"><div><div class="muted small">${when}</div><h2>${esc(day.name)}</h2></div>
      <span class="tag${min > MAX_MIN ? ' warn' : ''}">≈ ${min} мин</span></div>`;
    if (min > MAX_MIN) h += `<div class="warnbox">Выходит больше ${MAX_MIN} минут — убери подход или упражнение.</div>`;
    h += '<ul class="exl">';
    day.items.forEach((x, i) => {
      const act = progEdit ? `data-a="edit" data-d="${id}" data-i="${i}"` : `data-a="tech" data-ex="${x.ex}"`;
      h += `<li class="tap" ${act}><div class="n"><b>${esc(EX[x.ex].name)}</b><span>${repsLabel(x)}</span></div>${progEdit ? '<div class="w muted">›</div>' : ''}</li>`;
    });
    h += '</ul>';
    if (progEdit) h += `<button class="btn ghost" data-a="add" data-d="${id}">+ Упражнение</button>`;
    h += '</div>';
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
  for (const id in EX) if (id !== ex && !out.includes(id) && EX[id].group === e.group && id !== 'hang' && id !== 'neg') out.push(id);
  return out;
}

function sheetAdd(dayId) {
  let h = '<h2>Добавить упражнение</h2>';
  for (const g in GROUPS) {
    h += `<div class="sec">${GROUPS[g]}</div><ul class="exl ex-pick">`;
    for (const id in EX) if (EX[id].group === g && id !== 'neg')
      h += `<li data-a="add-ex" data-d="${dayId}" data-ex="${id}"><div class="n"><b>${esc(EX[id].name)}</b><span>${esc(EX[id].muscles)}</span></div><div class="w muted">+</div></li>`;
    h += '</ul>';
  }
  openSheet(h);
}

// ───── Техника упражнения ─────
function sheetTech(id) {
  const e = EX[id], src = n => `img/ex/${e.img}/${n}.jpg`;
  const subs = e.subs.map(s => `<button class="chip" data-a="tech" data-ex="${s}">${esc(EX[s].name)}</button>`).join('');
  const fold = (t, body) => `<details class="fold"><summary>${t}</summary>${body}</details>`;
  openSheet(`<h2>${esc(e.name)}</h2>
    <div class="pics"><figure><img src="${src(0)}" alt="Старт" loading="lazy"><figcaption>Старт</figcaption></figure>
      <figure><img src="${src(1)}" alt="Финиш" loading="lazy"><figcaption>Финиш</figcaption></figure></div>
    ${e.photo ? `<p class="note" style="margin:0 0 8px">${esc(e.photo)}</p>` : ''}
    <div class="cue"><b>${esc(e.cue)}</b><span class="muted small">Темп: ${esc(e.tempo)}</span></div>
    <p class="muted small" style="margin:0 0 6px">${esc(e.muscles)}</p>
    ${fold('Техника', `<ol class="tech">${e.tech.map(t => `<li>${esc(t)}</li>`).join('')}</ol>`)}
    ${fold('Дыхание', `<p>${esc(e.breath)}</p>`)}
    ${fold('Типичные ошибки', `<ul class="err">${e.errors.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`)}
    ${fold('Замены', `<div class="chips">${subs}</div>`)}`);
}

// ───── Прогресс (этап 4) ─────
function vStats() {
  const n = D.workouts.filter(w => w.done).length;
  return `<div class="top"><div><div class="muted">графики, рекорды, путь к подтягиванию</div><h1>Прогресс</h1></div></div>
    <div class="card empty"><div class="num">${n}</div><div>тренировок записано</div>
    <p class="note">Графики появятся, когда будет что рисовать — после первых тренировок.</p></div>`;
}

// ───── Ещё ─────
// Всё редкое: вес тела, дни недели, сброс программы, бэкап.
function vMore() {
  const s = D.settings, P = D.program;
  const opts = Object.keys(P.days).map(id => [id, P.days[id].name]).concat([['walk', 'Ходьба'], ['rest', 'Отдых']]);
  return `<div class="top"><h1>Ещё</h1></div>
    <div class="card"><h2>Вес тела</h2>
      <p class="muted small" style="margin:4px 0 10px">Нужен для пути к подтягиванию.</p>
      <div class="stepper"><input class="inp" id="s-weight" inputmode="decimal" value="${s.weight != null ? fmt(s.weight) : ''}" placeholder="кг">
        <button class="btn" style="width:auto" data-a="savesettings">Сохранить</button></div></div>
    <div class="card"><h2 style="margin-bottom:8px">Дни недели</h2><ul class="sched">${[1, 2, 3, 4, 5, 6, 0].map(i =>
      `<li><b>${WD[i]}</b><select class="inp" data-a="sched" data-wd="${i}">${opts.map(([v, t]) => `<option value="${v}"${P.week[i] === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></li>`).join('')}</ul></div>
    <div class="card"><h2 style="margin-bottom:6px">Бэкап</h2>
      <p class="muted small" style="margin:0 0 12px">Все данные одним файлом. Сохрани в Google Диск или Telegram — восстановишь на любом телефоне.</p>
      <div class="row2"><button class="btn" data-a="export">Скачать</button><button class="btn" data-a="import">Загрузить</button></div>
      <input type="file" id="importfile" accept="application/json,.json" hidden></div>
    <button class="btn ghost danger" data-a="progreset">Вернуть программу по умолчанию</button>
    <p class="muted small" style="text-align:center;margin-top:16px">Тренер ${APP_VERSION} · фото упражнений — free-exercise-db (public domain)</p>`;
}

// ───── Нижний лист ─────
// Кнопка «Назад» на Android закрывает лист: при открытии кладём запись в историю.
// Окно, открытое без нажатия (приветствие), в историю не кладём — Chrome такую запись пропускает.
let sheetOpen = false, sheetPushed = false;
function openSheet(html) {
  $('#sheet').innerHTML = `<div class="sheet-bg" data-a="sheetbg"><div class="sheet" role="dialog"><div class="grip"></div>${html}</div></div>`;
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
function sheetWelcome() {
  openSheet(`<h2>Привет, Андрей!</h2>
    <p class="muted" style="margin:0 0 14px">Впиши вес тела — по нему видно, когда в гравитроне пора переходить к негативным подтягиваниям.</p>
    <div class="field"><input class="inp" id="s-weight" inputmode="decimal" placeholder="82,5 кг"></div>
    <button class="btn main" data-a="welcome">Готово</button>`);
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
    case 'tab': tab = ds.k; progEdit = false; render(); scrollTo(0, 0); break;
    case 'progedit': progEdit = !progEdit; render(); break;
    case 'tech': sheetTech(ds.ex); break;
    case 'start': toast('Экран тренировки — следующий этап'); break;
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
    case 'progreset':
      if (!confirm('Вернуть программу по умолчанию? Твои правки программы пропадут, история тренировок останется.')) return;
      D.program = defaultProgram(); await saveProgram(); render(); toast('Программа по умолчанию'); break;

    case 'welcome': case 'savesettings': {
      const w = num($('#s-weight').value);
      if (!w || w < 35 || w > 250) { toast('Впиши вес тела в кг'); return; }
      D.settings.weight = w;
      if (!D.settings.start) D.settings.start = dk(monday(new Date()));
      await saveKV('settings');
      if (a === 'welcome') closeSheet();
      render(); toast('Сохранил'); break;
    }
    case 'export': {
      const data = await dbExport();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
      const l = document.createElement('a'); l.href = url; l.download = `trener-${dk(new Date())}.json`; l.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000); break;
    }
    case 'import': $('#importfile').click(); break;
  }
});
document.addEventListener('change', async ev => {
  const el = ev.target;
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
  if (D.settings.weight == null) sheetWelcome();
  // Приложение могли оставить открытым с вечера: при возврате на экран и в полночь перерисовываем день
  let shown = dk(new Date());
  const refreshDay = () => { const k = dk(new Date()); if (k !== shown) { shown = k; if (!sheetOpen) render(); } };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshDay(); });
  setInterval(refreshDay, 60000);
  // Офлайн и установка как приложение: service worker из корня (sw.js)
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
