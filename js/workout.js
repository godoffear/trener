// Экран тренировки: по одному упражнению на экран, подходы, таймер отдыха, голос, итог.
// Незавершённая тренировка лежит в D.active (store kv) и сохраняется после каждого действия —
// закрыл приложение посреди тренировки, открыл — продолжаешь с того же места.
let entry = null, restTimer = 0, wakeLock = null, audioCtx = null, recNow = null, checkSt = null;
const saveActive = () => saveKV('active');
const curItem = () => D.active.items[D.active.cur];
const itemStep = it => it.plan.step != null ? it.plan.step : EX[it.ex].step;
const workSets = it => (it.sets || []).filter(s => !s.warm);
const e1rm = (kg, reps) => kg * (1 + reps / 30);
const lastSession = ex => { const h = exHistory(ex); return h.length ? h[h.length - 1] : null; };

function setText(e, s) {
  const r = s.rir != null && e.type !== 'time' ? ` · з${s.rir}` : '';
  if (e.type === 'time') return `${s.sec} с`;
  if (e.type === 'bw') return `${s.reps} раз${r}`;
  if (e.type === 'assist') return `помощь ${fmt(s.kg)} × ${s.reps}${r}`;
  return `${fmt(s.kg)} × ${s.reps}${r}`;
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
    sets: [], warm: false, note: '', disc: [],
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
  const rec = lastWork(it.ex, it.plan);
  entry = {
    key,
    kg: last ? last.kg : rec != null ? rec : prevSet ? prevSet.kg : null,
    reps: last ? last.reps : prevSet ? prevSet.reps : it.plan.lo,
    rir: last && last.rir != null ? last.rir : 2,
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
  const done = workSets(it).length, need = it.plan.sets, src = i => `img/ex/${e.img}/${i}.jpg`;
  const prev = lastSession(it.ex), rec = lastWork(it.ex, it.plan);
  let h = `<div class="wo-top"><button class="ibtn" data-a="wo-back" aria-label="Выйти на главную">‹</button>
    <div class="wo-title"><b class="num">${w.cur + 1} / ${n}</b><span>${esc(day ? day.name : '')}${w.light ? ' · облегчённо' : ''}</span></div>
    <button class="btn small-btn" data-a="wo-finish">Завершить</button></div>
    <div class="wo-dots">${w.items.map((x, i) => `<button data-a="wo-go" data-i="${i}" class="${i === w.cur ? 'on' : ''}${workSets(x).length >= x.plan.sets ? ' done' : ''}" aria-label="Упражнение ${i + 1}">${i + 1}</button>`).join('')}</div>`;

  h += `<div class="card wo">
    <div class="pics small" data-a="tech" data-ex="${it.ex}"><img src="${src(0)}" alt=""><img src="${src(1)}" alt=""></div>
    <h2>${esc(e.name)}${it.orig ? ' <span class="tag">замена</span>' : ''}</h2>
    <div class="cue"><b>${esc(e.cue)}</b><span class="muted small">Темп: ${esc(e.tempo)}</span></div>
    <div class="wo-info"><div><span class="muted">Сегодня</span> ${repsLabel(Object.assign({ ex: it.ex }, it.plan))}${rec != null && (e.type === 'w' || e.type === 'assist') ? ` · ${e.type === 'assist' ? 'помощь ' : ''}${fmt(rec)} кг` : ''}${e.equip === 'dumbbell' ? ' · на гантель' : ''}</div>
      ${prev ? `<div><span class="muted">В прошлый раз</span> ${workSets(prev.it).map(s => setText(e, s)).join(', ')}</div>` : ''}
      ${prev && prev.it.note ? `<div class="wo-note">${esc(prev.it.note)}</div>` : ''}</div>`;
  if (!prev && (e.type === 'w' || e.type === 'assist'))
    h += `<p class="hint">Подбери ${e.type === 'assist' ? 'помощь' : 'вес'}, с которым сделаешь нужное число повторов и останется 2–3 в запасе. Начни с лёгкого и добавляй от подхода к подходу.</p>`;
  if (it.disc.length) h += `<div class="warnbox">Дискомфорт: ${esc(it.disc.map(d => `${d.zone} ${d.lvl}/5`).join(', '))}. Прибавки не будет.</div>`;
  if (e.base && e.type === 'w')
    h += `<button class="warm${it.warm ? ' on' : ''}" data-a="wo-warm"><i>${it.warm ? I.check : ''}</i>Разминочный подход — ${e.equip === 'barbell' ? 'пустой гриф' : 'лёгкий вес'} × 10–12</button>`;
  if (it.sets.length) h += `<div class="sets">${it.sets.map((s, i) => `<button class="setchip" data-a="wo-set" data-i="${i}"><b>${i + 1}</b>${setText(e, s)}</button>`).join('')}</div>`;

  // Ввод подхода
  const kgLabel = e.type === 'assist' ? 'Помощь, кг' : e.equip === 'dumbbell' ? 'Кг на гантель' : 'Кг';
  const stepper = (f, label, val, mode) => `<div class="field line"><label>${label}</label><div class="stepper">
    <button class="ibtn" data-a="wo-dec" data-f="${f}">−</button><input class="inp num" id="e-${f}" inputmode="${mode}" value="${val != null ? fmt(val) : ''}">
    <button class="ibtn" data-a="wo-inc" data-f="${f}">+</button></div></div>`;
  h += `<div class="entry"><div class="muted small">Подход ${done + 1} из ${need}${done >= need ? ' · сверх плана' : ''}</div>`;
  if (e.type === 'time') h += stepper('sec', 'Секунд', entry.sec, 'numeric');
  else {
    h += e.type === 'bw' ? stepper('reps', 'Повторы', entry.reps, 'numeric')
      : stepper('kg', kgLabel, entry.kg, 'decimal') + stepper('reps', 'Повторы', entry.reps, 'numeric');
    h += `<div class="field line"><label>Запас</label><div class="chips rir">${[0, 1, 2, 3, 4].map(r => `<button class="chip${entry.rir === r ? ' on' : ''}" data-a="wo-rir" data-v="${r}">${r}</button>`).join('')}</div></div>`;
  }
  if (e.equip === 'barbell' && entry.kg) h += `<p class="note" style="margin:-6px 0 10px">${plates(entry.kg)}</p>`;
  h += `<div class="row2"><button class="btn${recNow ? ' on' : ''}" data-a="wo-mic">${I.mic} ${recNow ? 'Слушаю…' : 'Голосом'}</button>
      <button class="btn" data-a="wo-like" ${prev ? '' : 'disabled'}>Как в прошлый</button></div>
    <button class="btn main" style="margin-top:8px" data-a="wo-log">Записать подход</button></div>
    <div class="wo-tools"><button class="btn ghost" data-a="wo-swap">Заменить</button><button class="btn ghost" data-a="wo-disc">Дискомфорт</button><button class="btn ghost" data-a="wo-note">Заметка${it.note ? ' ✓' : ''}</button></div>`;
  const last = w.cur === n - 1;
  h += `<button class="btn ${done >= need ? 'main' : 'ghost'}" style="margin-top:8px" data-a="${last ? 'wo-finish' : 'wo-next'}">${last ? 'Завершить тренировку' : 'Следующее упражнение →'}</button></div>`;
  if (w.restUntil > Date.now()) h += `<div class="rest" id="rest"><div><span class="muted small">Отдых</span><b class="num" id="rest-t">${mmss(w.restUntil - Date.now())}</b></div>
    <button class="btn" data-a="wo-rest-add">+30 с</button><button class="btn" data-a="wo-rest-skip">Хватит</button></div>`;
  return h;
}
const plural = (n, one, few, many) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };
const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// ───── Таймер отдыха ─────
function restLoop() {
  clearInterval(restTimer);
  if (!D.active || !D.active.restUntil) return;
  restTimer = setInterval(() => {
    const w = D.active; if (!w) return clearInterval(restTimer);
    const left = w.restUntil - Date.now(), el = $('#rest-t');
    if (left <= 0) {
      clearInterval(restTimer); w.restUntil = 0; saveActive();
      alarm(); if (tab === 'workout') { const r = $('#rest'); if (r) r.remove(); }
      toast('Отдых закончился — следующий подход');
      return;
    }
    if (el) el.textContent = mmss(left);
  }, 250);
}
function alarm() {
  if (navigator.vibrate) navigator.vibrate([250, 120, 250, 120, 400]);
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  for (let i = 0; i < 3; i++) {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = 880; g.gain.setValueAtTime(0.25, t + i * 0.28); g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.28 + 0.2);
    o.connect(g); g.connect(audioCtx.destination); o.start(t + i * 0.28); o.stop(t + i * 0.28 + 0.22);
  }
}

// Экран не гаснет, пока открыта тренировка
async function keepAwake() {
  try {
    if (tab === 'workout' && D.active && 'wakeLock' in navigator && !wakeLock && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (tab !== 'workout' && wakeLock) { wakeLock.release(); wakeLock = null; }
  } catch (e) { /* нет поддержки — не страшно */ }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) { keepAwake(); restLoop(); } });

// ───── Запись подхода ─────
function readEntry() {
  for (const f of ['kg', 'reps', 'sec']) { const el = $('#e-' + f); if (el) entry[f] = num(el.value); }
}
function logSet() {
  const w = D.active, it = curItem(), e = EX[it.ex];
  readEntry();
  const s = { t: Date.now() };
  if (e.type === 'time') { if (!entry.sec) return toast('Впиши секунды'); s.sec = Math.round(entry.sec); }
  else {
    if (!entry.reps) return toast('Впиши повторы');
    s.reps = Math.round(entry.reps); s.rir = entry.rir;
    if (e.type !== 'bw') { if (entry.kg == null) return toast(e.type === 'assist' ? 'Впиши помощь' : 'Впиши вес'); s.kg = entry.kg; }
  }
  it.sets.push(s);
  const more = workSets(it).length < it.plan.sets || w.cur < w.items.length - 1;
  w.restUntil = more ? Date.now() + it.plan.rest * 1000 : 0;
  saveActive(); render(); restLoop();
}

// ───── Итог ─────
function tonnage(w) {
  let t = 0;
  for (const it of w.items) { const e = EX[it.ex]; if (e.type === 'w') for (const s of workSets(it)) t += (s.kg || 0) * s.reps * (e.equip === 'dumbbell' ? 2 : 1); }
  return Math.round(t);
}
// Рекорды: лучше всех прошлых тренировок (по расчётному 1ПМ; в гравитроне — меньше помощь; на время — дольше)
function findRecords(w) {
  const out = [];
  for (const it of w.items) {
    const e = EX[it.ex], sets = workSets(it); if (!sets.length) continue;
    const prior = exHistory(it.ex).flatMap(h => workSets(h.it)); // текущая ещё не в истории
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
  const rec = { id: w.id, date: w.date, day: w.day, start: w.start, end: Date.now(), check: w.check, light: w.light, done: true,
    items: w.items.filter(it => it.sets.length || it.warm).map(it => ({ ex: it.ex, orig: it.orig || null, plan: it.plan, warm: it.warm, sets: it.sets, note: it.note, disc: it.disc })) };
  rec.records = findRecords(rec);
  D.workouts.push(rec); await dbPut('workouts', rec);
  D.active = null; await saveActive();
  clearInterval(restTimer); tab = 'today'; selDay = null; render(); keepAwake();
  sheetSummary(rec);
}
function sheetSummary(w) {
  const min = Math.max(1, Math.round((w.end - w.start) / 60000)), ton = tonnage(w), sets = w.items.reduce((a, it) => a + workSets(it).length, 0);
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
      ${f('s-rir', 'Запас (0–4)', s.rir, 'numeric')}`}
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
    <ul class="exl ex-pick">${swapChoices(it.ex).map(id => `<li data-a="wo-swap-to" data-ex="${id}"><div class="n"><b>${esc(EX[id].name)}</b><span>${esc(EX[id].muscles)}</span></div><div class="w muted">›</div></li>`).join('')}</ul>`);
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
    <div class="chips" style="margin-bottom:14px">${subs.map(id => `<button class="chip" data-a="wo-swap-to" data-ex="${id}">${esc(EX[id].name)}</button>`).join('')}</div>
    ${twice ? `<div class="warnbox">Второй раз подряд на этом упражнении. Заменить его в программе насовсем?</div>
      <div class="chips" style="margin-bottom:14px">${subs.map(id => `<button class="chip" data-a="wo-prog-swap" data-ex="${id}">${esc(EX[id].name)}</button>`).join('')}</div>` : ''}
    <button class="btn" data-a="sheetclose">Продолжить как есть</button>`);
}
function sheetNote() {
  const it = curItem();
  openSheet(`<h2>Заметка</h2><p class="muted small" style="margin:-4px 0 10px">Покажется в следующий раз на этом упражнении.</p>
    <div class="field"><input class="inp" id="n-text" maxlength="120" value="${esc(it.note || '')}" placeholder="сиденье на 4, хват уже"></div>
    <button class="btn main" data-a="wo-note-save">Сохранить</button>`);
}

// ───── Голос ─────
function micToggle() {
  if (recNow) { try { recNow.stop(); } catch (e) {} recNow = null; render(); return; }
  readEntry();
  const it = curItem(), e = EX[it.ex];
  recNow = listen(text => {
    recNow = null;
    const p = parseSpoken(text, e.type);
    Object.assign(entry, p);
    const full = e.type === 'time' ? p.sec : e.type === 'bw' ? p.reps : p.kg != null && p.reps;
    if (full) { toast(`Записал: «${text}»`); logSet(); }
    else { toast(`Услышал: «${text}» — проверь и запиши`); render(); }
  }, err => { recNow = null; if (err) toast(err); render(); });
  render();
}

// ───── Клики экрана тренировки ─────
document.addEventListener('click', async ev => {
  const el = ev.target.closest('[data-a]'); if (!el) return;
  const a = el.dataset.a, ds = el.dataset;
  if (!/^(wo-|ck$|dz$|dl$|sheetclose$)/.test(a)) return;
  if (!audioCtx && window.AudioContext) try { audioCtx = new AudioContext(); } catch (e) {}
  const w = D.active;
  switch (a) {
    case 'sheetclose': closeSheet(); break;
    case 'ck': checkSt[ds.k] = +ds.v; sheetCheck(checkSt.dayId); break;
    case 'wo-begin': startWorkout(checkSt.dayId, !!ds.light); break;
    case 'wo-back': readEntry(); tab = 'today'; render(); keepAwake(); break;
    case 'wo-go': readEntry(); w.cur = +ds.i; saveActive(); render(); scrollTo(0, 0); break;
    case 'wo-next': readEntry(); w.cur = Math.min(w.items.length - 1, w.cur + 1); saveActive(); render(); scrollTo(0, 0); break;
    case 'wo-finish': readEntry(); finishWorkout(); break;
    case 'wo-warm': { const it = curItem(); it.warm = !it.warm; saveActive(); render(); break; }
    case 'wo-inc': case 'wo-dec': {
      readEntry(); const it = curItem(), d = a === 'wo-inc' ? 1 : -1;
      if (ds.f === 'kg') entry.kg = Math.max(0, Math.round(((entry.kg || 0) + d * (itemStep(it) || 1)) * 100) / 100);
      if (ds.f === 'reps') entry.reps = Math.max(1, (entry.reps || 0) + d);
      if (ds.f === 'sec') entry.sec = Math.max(5, (entry.sec || 0) + d * 5);
      render(); break;
    }
    case 'wo-rir': readEntry(); entry.rir = +ds.v; render(); break;
    case 'wo-log': logSet(); break;
    case 'wo-like': {
      const it = curItem(), prev = lastSession(it.ex); if (!prev) return;
      const ps = workSets(prev.it), s = ps[workSets(it).length] || ps[ps.length - 1];
      Object.assign(entry, { kg: s.kg != null ? s.kg : entry.kg, reps: s.reps || entry.reps, rir: s.rir != null ? s.rir : entry.rir, sec: s.sec || entry.sec });
      render(); break;
    }
    case 'wo-mic': micToggle(); break;
    case 'wo-rest-add': w.restUntil = Math.max(w.restUntil, Date.now()) + 30000; saveActive(); restLoop(); { const t = $('#rest-t'); if (t) t.textContent = mmss(w.restUntil - Date.now()); } break;
    case 'wo-rest-skip': w.restUntil = 0; saveActive(); clearInterval(restTimer); render(); break;
    case 'wo-set': sheetSet(+ds.i); break;
    case 'wo-set-save': {
      const s = curItem().sets[+ds.i], g = id => { const x = $(id); return x ? num(x.value) : null; };
      if ($('#s-sec')) s.sec = g('#s-sec'); else { if ($('#s-kg')) s.kg = g('#s-kg'); s.reps = g('#s-reps'); const r = g('#s-rir'); s.rir = r != null ? Math.max(0, Math.min(4, Math.round(r))) : s.rir; }
      saveActive(); entry = null; closeSheet(); render(); break;
    }
    case 'wo-set-del': curItem().sets.splice(+ds.i, 1); saveActive(); entry = null; closeSheet(); render(); break;
    case 'wo-swap': sheetSwap(); break;
    case 'wo-swap-to': {
      const it = curItem();
      if (it.sets.length && !confirm('Записанные подходы этого упражнения сбросятся. Заменить?')) return;
      it.orig = it.orig || it.ex; it.ex = ds.ex; it.sets = []; it.warm = false; delete it.plan.step;
      if (EX[ds.ex].type === 'time' && EX[it.orig].type !== 'time') { it.plan.lo = 30; it.plan.hi = 45; }
      if (EX[ds.ex].type !== 'time' && EX[it.orig].type === 'time') { it.plan.lo = 10; it.plan.hi = 15; }
      entry = null; saveActive(); closeSheet(); render(); toast('Заменил на сегодня'); break;
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
    case 'wo-note': sheetNote(); break;
    case 'wo-note-save': curItem().note = $('#n-text').value.trim(); saveActive(); closeSheet(); render(); break;
  }
});
document.addEventListener('input', ev => { if (entry && /^e-/.test(ev.target.id)) entry[ev.target.id.slice(2)] = num(ev.target.value); });
