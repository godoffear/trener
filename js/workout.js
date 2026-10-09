// Экран тренировки: по одному упражнению на экран, подходы, таймер отдыха, голос, итог.
// Незавершённая тренировка лежит в D.active (store kv) и сохраняется после каждого действия —
// закрыл приложение посреди тренировки, открыл — продолжаешь с того же места.
let entry = null, restTimer = 0, wakeLock = null, checkSt = null;
const saveActive = () => saveKV('active');
let noteT = 0;
const curItem = () => D.active.items[D.active.cur];
const itemStep = it => it.plan.step != null ? it.plan.step : EX[it.ex].step;
const workSets = it => (it.sets || []).filter(s => !s.warm);
const e1rm = (kg, reps) => kg * (1 + reps / 30);
const lastSession = ex => { const h = exHistory(ex).filter(x => sameMode(x, ex)); return h.length ? h[h.length - 1] : null; };

function setText(e, s) {
  const r = s.rir != null && e.type !== 'time' ? ` · з${s.rir}` : '';
  if (e.type === 'time') return `${s.sec} с`;
  if (e.type === 'bw') return `${s.reps} раз${r}`;
  if (e.type === 'assist') return `помощь ${fmt(s.kg)} × ${s.reps}${r}`;
  const m = setMode(s, e.id), pre = m === 'each' && e.equip !== 'dumbbell' ? 'по ' : m === 'total' && e.equip === 'dumbbell' ? 'обе ' : '';
  return `${pre}${fmt(s.kg)} × ${s.reps}${r}`;
}

// ───── Старт: три вопроса ─────
function sheetCheck(dayId) {
  checkSt = checkSt && checkSt.dayId === dayId ? checkSt : { dayId, sleep: 0, energy: 0, sore: 0 };
  const q = (k, t, labels) => `<div class="field"><label>${t}</label><div class="chips">${labels.map((l, i) =>
    `<button class="chip${checkSt[k] === i + 1 ? ' on' : ''}" data-a="ck" data-k="${k}" data-v="${i + 1}">${l}</button>`).join('')}</div></div>`;
  const vals = [checkSt.sleep, checkSt.energy, checkSt.sore], all = vals.every(Boolean);
  const low = all && (vals.filter(v => v === 1).length >= 2 || vals.reduce((a, b) => a + b, 0) <= 5);
  openSheet(`<h2>Как ты сегодня?</h2>
    ${q('sleep', 'Сон', ['Плохо', 'Нормально', 'Хорошо'])}
    ${q('energy', 'Энергия', ['Мало', 'Нормально', 'Много'])}
    ${q('sore', 'Мышцы после прошлой', ['Болят', 'Немного', 'Свежие'])}
    ${low ? `<div class="warnbox">Похоже, ты не восстановился. Облегчённо — те же веса, на подход меньше, без прибавок.</div>
      <button class="btn main" data-a="wo-begin" data-light="1">Облегчённо</button>
      <button class="btn" style="margin-top:8px" data-a="wo-begin">Всё равно обычно</button>`
    : `<button class="btn main" data-a="wo-begin">Поехали</button>`}`);
}

function startWorkout(dayId, light) {
  const items = dayItems(dayId).map(x => ({
    ex: x.ex, plan: { sets: light ? Math.max(1, x.sets - 1) : x.sets, lo: x.lo, hi: x.hi, rest: x.rest, step: x.step },
    sets: [], warm: false, note: '', disc: [], ss: !!x.ss,
  }));
  D.active = { id: uid(), date: dk(new Date()), day: dayId, start: Date.now(), check: checkSt ? { sleep: checkSt.sleep, energy: checkSt.energy, sore: checkSt.sore } : null,
    light: !!light, cur: 0, items, restUntil: 0 };
  checkSt = null; entry = null;
  saveActive(); closeSheet(); tab = 'workout'; render(); scrollTo(0, 0);
}

// ───── Экран упражнения ─────
function ensureEntry() {
  const w = D.active, it = curItem(), key = w.id + ':' + w.cur + ':' + it.ex;
  if (entry && entry.key === key) return;
  const last = it.sets[it.sets.length - 1], prev = lastSession(it.ex);
  const prevSet = prev ? workSets(prev.it)[it.sets.length] || workSets(prev.it).slice(-1)[0] : null;
  const pr = progOf(it.ex, it.plan, w.light), rec = pr.kg != null ? pr.kg : null;
  entry = {
    key,
    kg: last ? last.kg : rec != null ? rec : prevSet ? prevSet.kg : null,
    reps: last ? last.reps : prevSet ? prevSet.reps : it.plan.lo,
    sec: last ? last.sec : prevSet && prevSet.sec ? prevSet.sec : it.plan.lo,
  };
}

// Блины на сторону для штанги (гриф 20 кг)
function plates(kg) {
  const side = (kg - 20) / 2; if (!(side > 0)) return kg === 20 ? 'пустой гриф' : '';
  let r = side; const out = [];
  for (const p of [25, 20, 15, 10, 5, 2.5, 1.25]) while (r >= p - 1e-9) { out.push(p); r -= p; }
  return `гриф 20 + на сторону ${out.map(fmt).join(' + ')}${r > 0.01 ? ' (не собрать точно)' : ''}`;
}

function vWorkout() {
  const w = D.active; if (!w) { tab = 'today'; return vToday(); }
  const it = curItem(), e = EX[it.ex], n = w.items.length, day = D.program.days[w.day];
  ensureEntry();
  const done = workSets(it).length, need = it.plan.sets;
  const prev = lastSession(it.ex), pr = progOf(it.ex, it.plan, w.light), pt = progText(pr, e);
  let h = `<div class="wo-top"><button class="ibtn" data-a="wo-back" aria-label="Выйти на главную">‹</button>
    <div class="wo-title"><b class="num">${w.cur + 1} / ${n}</b><span>${esc(day ? day.name : '')}${w.light ? ' · облегчённо' : ''}</span></div>
    <div class="wo-clock num" id="wo-clock" aria-label="Время тренировки">${clockText()}</div>
    <button class="btn small-btn" data-a="wo-finish">Завершить</button></div>
    <div class="wo-dots">${w.items.map((x, i) => `<button data-a="wo-go" data-i="${i}" class="${i === w.cur ? 'on' : ''}${(x.extra ? workSets(x).length : workSets(x).length >= x.plan.sets) ? ' done' : ''}" aria-label="Упражнение ${i + 1}">${i + 1}</button>`).join('')}</div>`;

  h += `<div class="card wo">
    ${w.cur === 0 ? `<p class="quote">${esc(quoteFor(new Date()))}</p>` : ''}
    <div class="wo-name" data-a="tech" data-ex="${it.ex}"><h2>${esc(e.name)}${it.orig ? ' <span class="tag">замена</span>' : ''}</h2><span class="muted small">Техника ›</span></div>
    ${photosHTML(e, true)}
    <div class="cue"><b>${esc(e.cue)}</b><span class="muted small">Темп: ${esc(e.tempo)}</span></div>
    <div class="wo-info"><div><span class="muted">Сегодня</span> ${repsLabel(Object.assign({ ex: it.ex }, it.plan))}${pt.w ? ` · <b class="${pr.kind === 'up' ? 'acc' : ''}">${pt.w}</b>` : ''}${modeNote(it.ex)}</div>
      ${pt.hint ? `<div class="prog ${pr.kind}">${esc(pt.hint)}</div>` : ''}
      ${prev ? `<div><span class="muted">В прошлый раз</span> ${workSets(prev.it).map(s => setText(e, s)).join(', ')}</div>` : ''}
      ${prev && prev.it.note ? `<div class="wo-note">${esc(prev.it.note)}</div>` : ''}</div>`;
  if (!prev && (e.type === 'w' || e.type === 'assist'))
    h += `<p class="hint">Подбери ${e.type === 'assist' ? 'помощь' : 'вес'}, с которым сделаешь нужное число повторов и останется 2–3 в запасе. Начни с лёгкого и добавляй от подхода к подходу.</p>`;
  if (!e.base && (e.type === 'w' || e.type === 'bw') && !it.extra && need > 0 && done === need - 1)
    h += `<div class="prog same">Последний подход — почти до отказа</div>`;
  if (it.ss && w.cur > 0) h += `<div class="hint">Суперсет: делай в паузах «${esc(EX[w.items[w.cur - 1].ex].name)}».</div>`;
  if (it.disc.length) h += `<div class="warnbox">Дискомфорт: ${esc(it.disc.map(d => `${d.zone} ${d.lvl}/5`).join(', '))}. Прибавки не будет.</div>`;
  if (e.base && e.type === 'w')
    h += it.warm ? `<button class="warm on" data-a="wo-warm">✓ разминка</button>`
      : `<button class="warm" data-a="wo-warm"><i></i>Разминка: ${e.equip === 'barbell' ? 'пустой гриф' : 'лёгкий вес'} × 10–12</button>`;
  if (it.sets.length) h += `<div class="sets">${it.sets.map((s, i) => `<button class="setchip" data-a="wo-set" data-i="${i}"><b>${i + 1}</b>${setText(e, s)}</button>`).join('')}</div>`;

  // Ввод подхода
  const md = modeOf(it.ex);
  const kgLabel = e.type === 'assist' ? 'Помощь' : md === 'each' ? (e.equip === 'dumbbell' ? 'Кг (1 гант.)' : 'Кг (сторона)') : e.equip === 'dumbbell' ? 'Кг (обе)' : 'Кг';
  const stepper = (f, label, val, mode) => `<div class="field line"><label>${label}</label><div class="stepper">
    <button class="ibtn" data-a="wo-dec" data-f="${f}">−</button><input class="inp num" id="e-${f}" inputmode="${mode}" value="${val != null ? fmt(val) : ''}">
    <button class="ibtn" data-a="wo-inc" data-f="${f}">+</button></div></div>`;
  h += `<div class="entry"><div class="muted small">${it.extra ? `Дополнительный подход ${done + 1} · по желанию` : `Подход ${done + 1} из ${need}${done >= need ? ' · сверх плана' : ''}`}</div>`;
  if (e.type === 'time') {
    h += stepper('sec', 'Цель, секунд', entry.sec, 'numeric');
    h += hold ? `<div class="hold"><b class="num" id="hold-t">${Math.ceil((hold.start + hold.target * 1000 - Date.now()) / 1000)}</b><span>из ${hold.target} с</span>
        <button class="btn main" data-a="wo-hold-stop">Стоп — записать</button></div>`
      : `<button class="btn main hold-go" data-a="wo-hold">▶ Старт ${entry.sec || it.plan.lo} с</button>`;
  }
  else {
    h += e.type === 'bw' ? stepper('reps', 'Повторы', entry.reps, 'numeric')
      : stepper('kg', kgLabel, entry.kg, 'decimal') + (e.type === 'w' ? `<div class="wmode"><button class="chip${md === 'total' ? ' on' : ''}" data-a="wo-wmode" data-v="total">${e.equip === 'dumbbell' ? 'Обе вместе' : 'Общий вес'}</button><button class="chip${md === 'each' ? ' on' : ''}" data-a="wo-wmode" data-v="each">${e.equip === 'dumbbell' ? 'Одна гантель' : 'На каждую сторону'}</button></div>` : '') + stepper('reps', 'Повторы', entry.reps, 'numeric');
  }
  if (e.equip === 'barbell' && md === 'total' && entry.kg) h += `<p class="note" style="margin:-6px 0 10px">${plates(entry.kg)}</p>`;
  h += `<div class="row2"><button class="btn" data-a="wo-like" ${prev ? '' : 'disabled'}>Как в прошлый раз</button>
      <button class="btn main" data-a="wo-log">Записать</button></div></div>
    <textarea class="inp note-inp" id="n-text" rows="2" maxlength="300" placeholder="Комментарий: сиденье на 4, хват уже… Покажется в следующий раз">${esc(it.note || '')}</textarea>
    ${it.ss && w.cur > 0 ? `<button class="btn ghost" data-a="wo-go" data-i="${w.cur - 1}">‹ К «${esc(EX[w.items[w.cur - 1].ex].name)}»</button>` : ''}
    ${w.items[w.cur + 1] && w.items[w.cur + 1].ss ? `<button class="btn ghost" data-a="wo-go" data-i="${w.cur + 1}">Суперсет: ${esc(EX[w.items[w.cur + 1].ex].name)} ›</button>` : ''}
    <div class="wo-tools"><button class="btn ghost" data-a="wo-swap">Заменить</button><button class="btn ghost" data-a="wo-disc">Дискомфорт</button></div>`;
  const last = w.cur === n - 1;
  if (autoNext && autoNext.from === w.cur)
    h += `<div class="auto-next"><span>Следующее упражнение через <b id="auto-t">${Math.ceil((autoNext.until - Date.now()) / 1000)}</b> с</span><button class="btn" data-a="wo-stay">Остаться</button></div>`;
  if (last && !it.extra) h += `<button class="btn ghost" style="margin-top:8px" data-a="wo-extra">+ Гравитрон — дополнительные подходы (по желанию)</button>`;
  h += `<button class="btn ${done >= need ? 'main' : 'ghost'}" style="margin-top:8px" data-a="${last ? 'wo-finish' : 'wo-next'}">${last ? 'Завершить тренировку' : 'Следующее упражнение →'}</button></div>
    <button class="btn ghost danger" style="margin-top:4px" data-a="wo-cancel">Отменить без записи</button>`;
  if (w.restUntil > Date.now()) h += `<div class="rest" id="rest"><div><span class="muted small">Отдых</span><b class="num" id="rest-t">${mmss(w.restUntil - Date.now())}</b></div>
    <button class="btn" data-a="wo-rest-add">+30 с</button><button class="btn" data-a="wo-rest-skip">Хватит</button></div>`;
  return h;
}
const plural = (n, one, few, many) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };
const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// ───── Таймер отдыха ─────
// Один таймер раз в секунду: отдых и автопереход к следующему упражнению.
// Когда приложение свёрнуто — таймер не крутится (меньше нагрев), при возврате запускается снова.
let autoNext = null, lastPip = 0;
let hold = null;      // { start, target } — идёт таймер упражнения на время (планка, вис)  // { until, from } — переход через 7 с после последнего подхода
const AUTO_NEXT_MS = 7000;
// Часы всей тренировки в шапке: сколько прошло с «Начать тренировку». Обновляются раз в секунду, только на экране тренировки.
let clockT = 0;
// Чистое время тренировки: без пауз (простой > 10 мин)
const activeMs = w => (w.pauseAt || Date.now()) - w.start - (w.paused || 0);
function clockText() { const s = Math.max(0, Math.floor(activeMs(D.active) / 1000)), m = Math.floor(s / 60); return `${m >= 60 ? Math.floor(m / 60) + ':' + pad(m % 60) : m}:${pad(s % 60)}`; }
function clockLoop() {
  clearInterval(clockT);
  if (document.hidden || tab !== 'workout' || !D.active) return;
  clockT = setInterval(() => { const el = $('#wo-clock'); if (!el || !D.active || tab !== 'workout') return clearInterval(clockT); if (checkIdle()) return; el.textContent = clockText(); }, 1000);
}
// Простой: 10 минут без действий — пауза (часы встают на моменте последнего действия) и вопрос «Продолжить / Завершить»
const IDLE_MS = 10 * 60 * 1000;
const lastAct = w => w.lastAct || Math.max(w.start, ...w.items.flatMap(it => it.sets.map(s => s.t || 0)));
function touch() { const w = D.active; if (w && !w.pauseAt) w.lastAct = Date.now(); }
function checkIdle() {
  const w = D.active; if (!w) return false;
  if (!w.pauseAt && Date.now() - lastAct(w) > IDLE_MS) { w.pauseAt = lastAct(w); w.restUntil = 0; autoNext = null; hold = null; saveActive(); }
  if (w.pauseAt && !(sheetOpen && $('[data-a="wo-resume"]'))) { sheetPaused(); return true; }
  return !!w.pauseAt;
}
function sheetPaused() {
  const w = D.active, min = Math.round(activeMs(w) / 60000);
  openSheet(`<h2>Тренировка на паузе</h2>
    <p class="muted" style="margin:0 0 14px">10 минут без действий — часы остановились на ${min} ${plural(min, 'минуте', 'минутах', 'минутах')}. Время простоя в тренировку не идёт.</p>
    <button class="btn main" data-a="wo-resume">Продолжить</button>
    <button class="btn" style="margin-top:8px" data-a="wo-finish-paused">Завершить тренировку</button>`);
}
function restLoop() {
  clearInterval(restTimer);
  if (document.hidden || !D.active || (!D.active.restUntil && !autoNext && !hold)) return;
  restTimer = setInterval(tick, 1000);
}
function tick() {
  const w = D.active; if (!w) { autoNext = null; return clearInterval(restTimer); }
  const now = Date.now();
  if (w.restUntil) {
    const left = w.restUntil - now, el = $('#rest-t');
    if (left <= 0) {
      w.restUntil = 0; saveActive(); alarm();
      if (tab === 'workout') { const r = $('#rest'); if (r) r.remove(); }
      toast('Отдых закончился — следующий подход');
    } else {
      if (el) el.textContent = mmss(left);
      const sec = Math.ceil(left / 1000); if (sec <= 3 && sec !== lastPip) { lastPip = sec; pip(); }
    }
  }
  if (autoNext) {
    const left = autoNext.until - now, el = $('#auto-t');
    if (autoNext.from !== w.cur || tab !== 'workout') autoNext = null;
    else if (left <= 0) { autoNext = null; w.cur++; saveActive(); entry = null; render(); scrollTo(0, 0); }
    else if (el) el.textContent = Math.ceil(left / 1000);
  }
  if (hold) {
    const left = hold.start + hold.target * 1000 - now, el = $('#hold-t');
    if (left <= 0) { const t = hold.target; hold = null; alarm('Время! Записал ' + t + ' с'); entry.sec = t; logSet(true); return; }
    if (el) el.textContent = Math.ceil(left / 1000);
    const sec = Math.ceil(left / 1000); if (sec <= 3 && sec !== lastPip) { lastPip = sec; pip(); }
  }
  if (!w.restUntil && !autoNext && !hold) clearInterval(restTimer);
}
// Конец отдыха и конец таймера планки: выбранный звук (js/sounds.js), вибрация и системное уведомление —
// его звук Android проигрывает поверх музыки, даже в наушниках. Громкость и выбор звука — «Ещё» → «Звук отдыха».
function pip() { playPip(); }
function alarm(text) {
  if (navigator.vibrate) navigator.vibrate([300, 120, 300]);
  playAlarmSound();
  notify(text || 'Отдых закончился — следующий подход');
}
async function notify(text) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted' || !navigator.serviceWorker) return;
    const reg = await navigator.serviceWorker.ready;
    reg.showNotification('Тренер', { body: text, tag: 'rest', renotify: true, vibrate: [600, 150, 600], icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', silent: false });
  } catch (e) { /* не страшно */ }
}
// Разрешение на уведомления спрашиваем один раз — при старте тренировки (нужно нажатие)
function askNotify() { try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch (e) {} }

// Экран не гаснет, пока открыта тренировка
async function keepAwake() {
  try {
    if (tab === 'workout' && D.active && 'wakeLock' in navigator && !wakeLock && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (tab !== 'workout' && wakeLock) { wakeLock.release(); wakeLock = null; }
  } catch (e) { /* нет поддержки — не страшно */ }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) { keepAwake(); if (tab === 'workout') checkIdle(); } restLoop(); clockLoop(); });

// ───── Запись подхода ─────
function readEntry() {
  for (const f of ['kg', 'reps', 'sec']) { const el = $('#e-' + f); if (el) entry[f] = num(el.value); }
}
function logSet(fromHold) {
  const w = D.active, it = curItem(), e = EX[it.ex];
  if (!fromHold) readEntry();
  const s = { t: Date.now() };
  if (e.type === 'time') { if (!entry.sec) return toast('Впиши секунды'); s.sec = Math.round(entry.sec); }
  else {
    if (!entry.reps) return toast('Впиши повторы');
    s.reps = Math.round(entry.reps);
    if (e.type !== 'bw') { if (entry.kg == null) return toast(e.type === 'assist' ? 'Впиши помощь' : 'Впиши вес'); s.kg = entry.kg; if (e.type === 'w') s.wm = modeOf(it.ex); }
  }
  it.sets.push(s);
  const more = it.extra || workSets(it).length < it.plan.sets || w.cur < w.items.length - 1;
  if (!it.ss) { w.restUntil = more ? Date.now() + it.plan.rest * 1000 : 0; lastPip = 0; }   // суперсет идёт в паузах основного — его таймер не трогаем
  // последний по плану подход — через 7 с сам переходим к следующему упражнению (отдых продолжается)
  autoNext = !it.extra && workSets(it).length === it.plan.sets && w.cur < w.items.length - 1 ? { until: Date.now() + AUTO_NEXT_MS, from: w.cur } : null;
  saveActive(); render(); restLoop();
}

// ───── Итог ─────
function tonnage(w) {
  let t = 0;
  for (const it of w.items) { const e = EX[it.ex]; if (e.type === 'w') for (const s of workSets(it)) t += (s.kg || 0) * s.reps * (setMode(s, it.ex) === 'each' ? 2 : 1); }
  return Math.round(t);
}
// Рекорды: лучше всех прошлых тренировок (по расчётному 1ПМ; в гравитроне — меньше помощь; на время — дольше)
function findRecords(w) {
  const out = [];
  for (const it of w.items) {
    const e = EX[it.ex], sets = workSets(it); if (!sets.length) continue;
    const prior = exHistory(it.ex).filter(h => sameMode(h, it.ex)).flatMap(h => workSets(h.it)); // текущая ещё не в истории
    if (!prior.length) continue;
    let best, old, txt;
    if (e.type === 'w') { const f = s => e1rm(s.kg || 0, s.reps); best = sets.reduce((a, b) => f(b) > f(a) ? b : a); old = Math.max(...prior.map(f)); if (f(best) > old + 0.01) txt = setText(e, best); }
    else if (e.type === 'assist') { const ok = s => s.reps >= it.plan.lo; const t = sets.filter(ok), p = prior.filter(ok); if (t.length && p.length) { best = t.reduce((a, b) => b.kg < a.kg ? b : a); if (best.kg < Math.min(...p.map(s => s.kg))) txt = setText(e, best); } }
    else if (e.type === 'bw') { best = sets.reduce((a, b) => b.reps > a.reps ? b : a); if (best.reps > Math.max(...prior.map(s => s.reps))) txt = setText(e, best); }
    else { best = sets.reduce((a, b) => b.sec > a.sec ? b : a); if (best.sec > Math.max(...prior.map(s => s.sec || 0))) txt = setText(e, best); }
    if (txt) out.push({ ex: it.ex, txt });
  }
  return out;
}
async function finishWorkout() {
  const w = D.active, total = w.items.reduce((a, it) => a + workSets(it).length, 0);
  if (!total) {
    if (!confirm('Ни одного подхода не записано. Отменить тренировку?')) return;
    D.active = null; await saveActive(); tab = 'today'; render(); return;
  }
  const left = w.items.reduce((a, it) => a + Math.max(0, it.plan.sets - workSets(it).length), 0);
  if (left && !confirm(`Осталось подходов: ${left}. Завершить тренировку?`)) return;
  // Забыл нажать «Завершить»: если после последнего действия прошло больше 10 минут, тренировка закончилась тогда
  const idleTail = Date.now() - lastAct(w) > IDLE_MS;
  const end = w.pauseAt || (idleTail ? lastAct(w) + 60000 : Date.now());
  const rec = { id: w.id, date: w.date, day: w.day, start: w.start, end, paused: w.paused || 0, check: w.check, light: w.light, done: true,
    items: w.items.filter(it => it.sets.length || it.warm).map(it => ({ ex: it.ex, orig: it.orig || null, plan: it.plan, warm: it.warm, sets: it.sets, note: it.note, disc: it.disc, extra: it.extra || undefined })) };
  rec.records = findRecords(rec);
  D.workouts.push(rec); await dbPut('workouts', rec);
  if (ghOn()) ghPush();  // копия в GitHub — сама после каждой тренировки
  D.active = null; await saveActive();
  clearInterval(restTimer); tab = 'today'; selDay = null; render(); keepAwake();
  sheetSummary(rec);
}
function sheetSummary(w) {
  const min = Math.max(1, Math.round((w.end - w.start - (w.paused || 0)) / 60000)), ton = tonnage(w), sets = w.items.reduce((a, it) => a + workSets(it).length, 0);
  const prev = D.workouts.filter(x => x.done && x.day === w.day && x.date < w.date).slice(-1)[0];
  let cmp = '';
  if (prev && ton) { const pt = tonnage(prev); if (pt) { const d = Math.round((ton - pt) / pt * 100); cmp = `${d > 0 ? '+' : ''}${d}% к прошлому разу`; } }
  const recs = w.records || [];
  openSheet(`<h2>${recs.length ? 'Есть рекорды!' : 'Тренировка записана'}</h2>
    <div class="sum"><div><span class="num">${min}</span><small>${plural(min, 'минута', 'минуты', 'минут')}</small></div><div><span class="num">${sets}</span><small>${plural(sets, 'подход', 'подхода', 'подходов')}</small></div>
      <div><span class="num">${ton ? ton.toLocaleString('ru-RU') : '—'}</span><small>кг поднято</small></div></div>
    ${cmp ? `<p class="note" style="margin:0 0 10px;text-align:center">${cmp}</p>` : ''}
    ${recs.length ? `<div class="sec">Рекорды</div><ul class="exl">${recs.map(r => `<li><div class="n"><b>${esc(EX[r.ex].name)}</b><span>${esc(r.txt)}</span></div><div class="w acc">★</div></li>`).join('')}</ul>` : ''}
    ${w.light ? '<p class="note">Облегчённая тренировка — прибавок по ней не будет.</p>' : ''}
    <button class="btn main" style="margin-top:12px" data-a="sheetclose">Отлично</button>`);
}

// ───── Листы: подход, замена, дискомфорт, заметка ─────
function sheetSet(i) {
  const it = curItem(), e = EX[it.ex], s = it.sets[i];
  const f = (id, label, v, m) => `<div class="field"><label>${label}</label><input class="inp" id="${id}" inputmode="${m}" value="${v != null ? fmt(v) : ''}"></div>`;
  openSheet(`<h2>Подход ${i + 1}</h2>
    ${e.type === 'time' ? f('s-sec', 'Секунд', s.sec, 'numeric') : `<div class="row2">${e.type !== 'bw' ? f('s-kg', e.type === 'assist' ? 'Помощь, кг' : 'Кг', s.kg, 'decimal') : ''}${f('s-reps', 'Повторы', s.reps, 'numeric')}</div>
`}
    <button class="btn main" data-a="wo-set-save" data-i="${i}">Сохранить</button>
    <button class="btn ghost danger" style="margin-top:8px" data-a="wo-set-del" data-i="${i}">Удалить подход</button>`);
}
function swapChoices(ex) {
  const e = EX[ex], out = e.subs.slice();
  for (const id in EX) if (id !== ex && !out.includes(id) && EX[id].group === e.group && id !== 'hang' && id !== 'neg') out.push(id);
  return out;
}
function sheetSwap() {
  const it = curItem();
  openSheet(`<h2>Заменить на сегодня</h2><p class="muted small" style="margin:-4px 0 10px">Тренажёр занят или неудобно. Программа не меняется.</p>
    <ul class="exl ex-pick">${swapChoices(it.ex).map(id => `<li data-a="wo-swap-view" data-ex="${id}"><div class="n"><b>${esc(EX[id].name)}</b><span>${esc(EX[id].muscles)}</span></div><div class="w muted">›</div></li>`).join('')}</ul>`);
}
// Просмотр упражнения перед заменой: фото, подсказка, техника → «Выбрать» или «К списку»
function sheetSwapView(id) {
  const e = EX[id];
  openSheet(`<h2>${esc(e.name)}</h2>${photosHTML(e)}
    <p class="muted small" style="margin:0 0 6px">${esc(e.muscles)}</p>
    <div class="cue"><b>${esc(e.cue)}</b><span class="muted small">Темп: ${esc(e.tempo)}</span></div>
    <ol class="tech">${e.tech.map(t => `<li>${esc(t)}</li>`).join('')}</ol>
    <div class="row2 sticky-actions"><button class="btn" data-a="wo-swap">← К списку</button><button class="btn main" data-a="wo-swap-to" data-ex="${id}">Выбрать</button></div>`);
}
const ZONES = ['Плечо', 'Локоть', 'Запястье', 'Шея', 'Спина', 'Поясница', 'Колено', 'Другое'];
let discSt = null;
function sheetDisc() {
  discSt = discSt || { zone: null, lvl: null };
  openSheet(`<h2>Дискомфорт</h2>
    <div class="field"><label>Где</label><div class="chips">${ZONES.map(z => `<button class="chip${discSt.zone === z ? ' on' : ''}" data-a="dz" data-v="${z}">${z}</button>`).join('')}</div></div>
    <div class="field"><label>Насколько сильно</label><div class="chips">${[1, 2, 3, 4, 5].map(l => `<button class="chip${discSt.lvl === l ? ' on' : ''}" data-a="dl" data-v="${l}">${l}</button>`).join('')}</div></div>
    <button class="btn main" data-a="wo-disc-save">Отметить</button>`);
}
function sheetDiscAfter() {
  const it = curItem(), prev = lastSession(it.ex), twice = prev && prev.it.disc && prev.it.disc.length;
  const subs = EX[it.ex].subs;
  openSheet(`<h2>Записал</h2><p class="muted" style="margin:0 0 12px">Прибавки по этому упражнению не будет. Если болит — попробуй замену:</p>
    <div class="chips" style="margin-bottom:14px">${subs.map(id => `<button class="chip" data-a="wo-swap-view" data-ex="${id}">${esc(EX[id].name)}</button>`).join('')}</div>
    ${twice ? `<div class="warnbox">Второй раз подряд на этом упражнении. Заменить его в программе насовсем?</div>
      <div class="chips" style="margin-bottom:14px">${subs.map(id => `<button class="chip" data-a="wo-prog-swap" data-ex="${id}">${esc(EX[id].name)}</button>`).join('')}</div>` : ''}
    <button class="btn" data-a="sheetclose">Продолжить как есть</button>`);
}
// ───── Клики экрана тренировки ─────
document.addEventListener('click', async ev => {
  const el = ev.target.closest('[data-a]'); if (!el) return;
  const a = el.dataset.a, ds = el.dataset;
  if (!/^(wo-|ck$|dz$|dl$|sheetclose$)/.test(a)) return;
  ensureAudio();
  const w = D.active;
  if (a !== 'wo-resume' && a !== 'wo-finish-paused' && a !== 'wo-finish') touch();
  switch (a) {
    case 'wo-resume': if (w && w.pauseAt) { w.paused = (w.paused || 0) + Date.now() - w.pauseAt; w.pauseAt = 0; w.lastAct = Date.now(); saveActive(); } closeSheet(); render(); break;
    case 'wo-finish-paused': closeSheet(); finishWorkout(); break;
    case 'sheetclose': closeSheet(); break;
    case 'ck': checkSt[ds.k] = +ds.v; sheetCheck(checkSt.dayId); break;
    case 'wo-begin': askNotify(); startWorkout(checkSt.dayId, !!ds.light); break;
    case 'wo-back': autoNext = null; hold = null; readEntry(); tab = 'today'; render(); keepAwake(); break;
    case 'wo-go': autoNext = null; hold = null; readEntry(); w.cur = +ds.i; saveActive(); render(); scrollTo(0, 0); break;
    case 'wo-next': autoNext = null; hold = null; readEntry(); w.cur = Math.min(w.items.length - 1, w.cur + 1); saveActive(); render(); scrollTo(0, 0); break;
    case 'wo-finish': readEntry(); finishWorkout(); break;
    case 'wo-cancel':
      if (!confirm('Отменить тренировку? Ничего не сохранится.')) return;
      D.active = null; await saveActive(); clearInterval(restTimer); entry = null; tab = 'today'; render(); toast('Тренировка отменена'); break;
    case 'wo-warm': { const it = curItem(); it.warm = !it.warm; saveActive(); render(); break; }
    case 'wo-inc': case 'wo-dec': {
      readEntry(); const it = curItem(), d = a === 'wo-inc' ? 1 : -1;
      if (ds.f === 'kg') entry.kg = Math.max(0, Math.round(((entry.kg || 0) + d * (itemStep(it) || 1)) * 100) / 100);
      if (ds.f === 'reps') entry.reps = Math.max(1, (entry.reps || 0) + d);
      if (ds.f === 'sec') entry.sec = Math.max(5, (entry.sec || 0) + d * 5);
      render(); break;
    }
    case 'wo-log': hold = null; logSet(); break;
    case 'wo-hold': {
      readEntry(); const target = Math.round(entry.sec || curItem().plan.lo);
      w.restUntil = 0; autoNext = null; lastPip = 0; hold = { start: Date.now(), target };
      render(); restLoop(); break;
    }
    case 'wo-hold-stop': {
      if (!hold) return; const done = Math.max(1, Math.round((Date.now() - hold.start) / 1000));
      hold = null; entry.sec = done; logSet(true); toast(`Записал ${done} с`); break;
    }
    case 'wo-wmode': {
      readEntry(); const it = curItem(); D.settings.wmode = Object.assign({}, D.settings.wmode, { [it.ex]: ds.v }); await saveKV('settings');
      if (!it.sets.length) { entry.kg = null; entry = null; }   // прошлые подходы считались иначе — подсказку по весу начинаем заново
      render(); break;
    }
    case 'wo-like': {
      const it = curItem(), prev = lastSession(it.ex); if (!prev) return;
      const ps = workSets(prev.it), s = ps[workSets(it).length] || ps[ps.length - 1];
      Object.assign(entry, { kg: s.kg != null ? s.kg : entry.kg, reps: s.reps || entry.reps, sec: s.sec || entry.sec });
      render(); break;
    }
    case 'wo-rest-add': w.restUntil = Math.max(w.restUntil, Date.now()) + 30000; saveActive(); restLoop(); { const t = $('#rest-t'); if (t) t.textContent = mmss(w.restUntil - Date.now()); } break;
    case 'wo-stay': autoNext = null; render(); break;
    case 'wo-rest-skip': w.restUntil = 0; saveActive(); clearInterval(restTimer); render(); break;
    case 'wo-set': sheetSet(+ds.i); break;
    case 'wo-set-save': {
      const s = curItem().sets[+ds.i], g = id => { const x = $(id); return x ? num(x.value) : null; };
      if ($('#s-sec')) s.sec = g('#s-sec'); else { if ($('#s-kg')) s.kg = g('#s-kg'); s.reps = g('#s-reps'); }
      saveActive(); entry = null; closeSheet(); render(); break;
    }
    case 'wo-set-del': curItem().sets.splice(+ds.i, 1); saveActive(); entry = null; closeSheet(); render(); break;
    case 'wo-extra': {
      readEntry();
      w.items.push({ ex: 'gravitron', extra: true, plan: { sets: 0, lo: 6, hi: 10, rest: 90 }, sets: [], warm: false, note: '', disc: [], ss: false });
      w.cur = w.items.length - 1; entry = null; saveActive(); render(); scrollTo(0, 0); break;
    }
    case 'wo-pin': {   // закрепить замену в программе — только в этом дне
      const it = curItem(), from = ds.from;
      for (const x of D.program.days[w.day].items) if (x.ex === from) { x.ex = it.ex; delete x.step; delete x.pull; }
      await saveKV('program'); delete it.orig; saveActive(); closeSheet(); render(); toast('Закрепил в программе'); break;
    }
    case 'wo-swap': sheetSwap(); break;
    case 'wo-swap-view': sheetSwapView(ds.ex); break;
    case 'wo-swap-to': {
      const it = curItem();
      if (it.sets.length && !confirm('Записанные подходы этого упражнения сбросятся. Заменить?')) return;
      const was = it.orig || it.ex;
      it.orig = it.orig || it.ex; it.ex = ds.ex; it.sets = []; it.warm = false; delete it.plan.step;
      if (EX[ds.ex].type === 'time' && EX[it.orig].type !== 'time') { it.plan.lo = 30; it.plan.hi = 45; }
      if (EX[ds.ex].type !== 'time' && EX[it.orig].type === 'time') { it.plan.lo = 10; it.plan.hi = 15; }
      entry = null; saveActive(); render();
      const pw = D.workouts.filter(x => x.done && x.day === w.day).slice(-1)[0];
      if (pw && pw.items.some(x => x.orig === was)) {   // в прошлый раз это упражнение тоже заменяли — предложим закрепить
        openSheet(`<h2>Закрепить замену?</h2><p class="muted" style="margin:0 0 12px">«${esc(EX[was].name)}» ты заменяешь уже не первый раз подряд. Поставить в программу «${esc(EX[ds.ex].name)}» насовсем?</p>
          <button class="btn main" data-a="wo-pin" data-from="${was}">Закрепить в программе</button>
          <button class="btn ghost" style="margin-top:8px" data-a="sheetclose">Только на сегодня</button>`);
      } else { closeSheet(); toast('Заменил на сегодня'); }   // окно «Закрепить» открываем поверх, не закрывая лист (иначе popstate закроет его)
      break;
    }
    case 'wo-disc': discSt = null; sheetDisc(); break;
    case 'dz': discSt.zone = ds.v; sheetDisc(); break;
    case 'dl': discSt.lvl = +ds.v; sheetDisc(); break;
    case 'wo-disc-save':
      if (!discSt.zone || !discSt.lvl) return toast('Выбери где и насколько');
      curItem().disc.push({ zone: discSt.zone, lvl: discSt.lvl }); saveActive(); render(); sheetDiscAfter(); break;
    case 'wo-prog-swap': {
      const it = curItem(), from = it.orig || it.ex;
      for (const d of Object.values(D.program.days)) for (const x of d.items) if (x.ex === from) { x.ex = ds.ex; delete x.step; }
      await saveKV('program');
      it.orig = it.orig || it.ex; it.ex = ds.ex; if (!it.sets.length) entry = null;
      saveActive(); closeSheet(); render(); toast('Заменил в программе'); break;
    }
  }
});
document.addEventListener('input', ev => {
  if (D.active && /^(e-|n-text)/.test(ev.target.id)) touch();
  if (ev.target.id === 'n-text' && D.active) { curItem().note = ev.target.value.trim(); clearTimeout(noteT); noteT = setTimeout(saveActive, 400); } if (entry && /^e-/.test(ev.target.id)) entry[ev.target.id.slice(2)] = num(ev.target.value); });
