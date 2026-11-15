// v8: часы (Health Connect), автокопии, уведомления на экране блокировки и итоги, нагрузка, календарь, рекорды.
const LNp = () => window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.LocalNotifications;
const HCp = () => window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Health;
const BKp = () => window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Backup;
const hhmm = t => { const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const ru = (n, a, b, c) => { const m = Math.abs(n) % 100, k = m % 10; return m > 10 && m < 20 ? c : k > 1 && k < 5 ? b : k === 1 ? a : c; };
const doneW = () => D.workouts.filter(w => w.done);

// ───── Уведомления: каналы, закреплённое на экране блокировки, итоги ─────
let lnOk = false, ongoingSig = '';
async function lnInit(ask) {
  const ln = LNp(); if (!ln) return false;
  try {
    let p = await ln.checkPermissions();
    if (p.display !== 'granted' && ask) p = await ln.requestPermissions();
    lnOk = p.display === 'granted';
    if (typeof lnReady !== 'undefined') lnReady = lnOk;
    if (lnOk) {
      await ln.createChannel({ id: 'rest', name: 'Конец отдыха', importance: 5, vibration: true, visibility: 1 });
      await ln.createChannel({ id: 'workout', name: 'Текущая тренировка', importance: 2, vibration: false, visibility: 1 });
      await ln.createChannel({ id: 'summary', name: 'Итоги недели и месяца', importance: 3, visibility: 1 });
    }
  } catch (e) { lnOk = false; }
  return lnOk;
}
// Закреплённое уведомление: упражнение, подход и время конца отдыха — видно на экране блокировки
async function updateOngoing() {
  const ln = LNp(); if (!ln || !lnOk) return;
  const w = D.active;
  try {
    if (!w) { if (ongoingSig) { ongoingSig = ''; await ln.cancel({ notifications: [{ id: 2 }] }); } return; }
    const it = w.items[w.cur], e = EX[it.ex], done = workSets(it).length;
    const rest = w.restUntil > Date.now() ? ' · отдых до ' + hhmm(w.restUntil) : '';
    const body = `${e.name} · ${it.extra ? 'доп. подход' : `подход ${Math.min(done + 1, it.plan.sets)} из ${it.plan.sets}`}${rest}`;
    const title = `Тренировка · упражнение ${w.cur + 1} из ${w.items.length}`;
    if (body === ongoingSig) return; ongoingSig = body;
    await ln.schedule({ notifications: [{ id: 2, title, body, channelId: 'workout', ongoing: true, autoCancel: false }] });
  } catch (e) { /* не страшно */ }
}
function periodStats(a, b) {
  let n = 0, ton = 0, sets = 0, rec = 0, min = 0;
  for (const w of doneW()) if (w.date >= a && w.date <= b) {
    n++; ton += tonnage(w); rec += (w.records || []).length;
    sets += w.items.reduce((s, it) => s + workSets(it).length, 0);
    min += Math.max(0, Math.round((w.end - w.start - (w.paused || 0)) / 60000));
  }
  return { n, ton, sets, rec, min };
}
const pctDiff = (a, b) => b > 0 ? Math.round((a - b) / b * 100) : null;
const tons = v => (Math.round(v / 100) / 10).toString().replace('.', ',') + ' т';
function summaryText(a, b, pa, pb, label) {
  const s = periodStats(a, b), p = periodStats(pa, pb);
  if (!s.n) return `${label}: тренировок не было. Новая неделя — новый шанс.`;
  const d = pctDiff(s.ton, p.ton);
  return `${label}: ${s.n} ${ru(s.n, 'тренировка', 'тренировки', 'тренировок')}, ${tons(s.ton)}${d != null ? ` (${d > 0 ? '+' : ''}${d}% к прошлому периоду)` : ''}${s.rec ? `, рекордов: ${s.rec}` : ''}.`;
}
// Итоги приходят в воскресенье в 20:00 (неделя) и в последний день месяца в 20:00 — текст готовим заранее и обновляем после каждой тренировки
async function schedSummaries() {
  const ln = LNp(); if (!ln || !lnOk || !D.settings) return;
  try {
    await ln.cancel({ notifications: [{ id: 10 }, { id: 11 }] });
    const now = new Date(), sun = new Date(now); sun.setHours(20, 0, 0, 0); sun.setDate(sun.getDate() + ((7 - sun.getDay()) % 7)); if (sun <= now) sun.setDate(sun.getDate() + 7);
    const mon = weekStart(sun), pm = addDays(mon, -7), ps = addDays(mon, -1);
    const list = [{ id: 10, title: 'Итоги недели', body: summaryText(dk(mon), dk(sun), dk(pm), dk(ps), 'Неделя'), schedule: { at: sun, allowWhileIdle: true }, channelId: 'summary' }];
    let me = new Date(now.getFullYear(), now.getMonth() + 1, 0, 20, 0, 0); if (me <= now) me = new Date(now.getFullYear(), now.getMonth() + 2, 0, 20, 0, 0);
    const ms = new Date(me.getFullYear(), me.getMonth(), 1), pms = new Date(me.getFullYear(), me.getMonth() - 1, 1), pme = new Date(me.getFullYear(), me.getMonth(), 0);
    list.push({ id: 11, title: 'Итоги месяца', body: summaryText(dk(ms), dk(me), dk(pms), dk(pme), 'Месяц'), schedule: { at: me, allowWhileIdle: true }, channelId: 'summary' });
    await ln.schedule({ notifications: list });
  } catch (e) { /* не страшно */ }
}

// ───── Часы: Health Connect (Mi Fitness → Health Connect → Тренер) ─────
const HC = { sleepMin: null, sleep7: null, rhr: null, rhrBase: null, at: 0 };
const HC_READ = ['heartRate', 'sleep', 'restingHeartRate', 'steps', 'distance', 'calories'];
async function hcConnect() {
  const h = HCp(); if (!h) return toast('Health Connect работает только в приложении');
  try {
    const a = await h.isAvailable();
    if (!a.available) return toast('Health Connect не найден на телефоне');
    await h.requestAuthorization({ read: HC_READ, write: [] });
    D.settings.hc = true; await saveKV('settings'); for (const k in walkCache) delete walkCache[k]; toast('Подключено. Загружаю данные…');
    await hcRefresh(); render();
  } catch (e) { toast('Не получилось подключить: ' + String(e && e.message || e).slice(0, 80)); }
}
const iso = d => new Date(d).toISOString();
function sleepMinutes(samples) {
  // записи из разных источников (часы, телефон) дублируют одну ночь — берём источник с наибольшим временем, а не сумму
  const by = {};
  for (const s of samples) (by[s.sourceName || s.sourceId || '?'] = by[s.sourceName || s.sourceId || '?'] || []).push(s);
  let best = 0;
  for (const list of Object.values(by)) {
    const hasStages = list.some(s => s.stages && s.stages.length);
    let m = 0;
    for (const s of list) {
      if (hasStages) { if (s.stages) for (const g of s.stages) if (g.stage !== 'awake' && g.stage !== 'inBed') m += g.durationMinutes || 0; }
      else if (s.sleepState !== 'awake' && s.sleepState !== 'inBed') m += s.value || 0;
    }
    best = Math.max(best, m);
  }
  return Math.round(best);
}
async function hcRefresh() {
  const h = HCp(); if (!h || !D.settings || !D.settings.hc) return;
  const now = Date.now();
  try {
    const sl = (await h.readSamples({ dataType: 'sleep', startDate: iso(now - 7 * 864e5), endDate: iso(now), limit: 300 })).samples || [];
    const last = sl.filter(s => new Date(s.endDate).getTime() >= now - 20 * 36e5);
    HC.sleepMin = last.length ? sleepMinutes(last) : null;
    HC.sleep7 = sl.length ? Math.round(sleepMinutes(sl) / 7) : null;
  } catch (e) { HC.sleepMin = HC.sleep7 = null; }
  try {
    const rs = ((await h.readSamples({ dataType: 'restingHeartRate', startDate: iso(now - 14 * 864e5), endDate: iso(now), limit: 100, ascending: true })).samples || []).filter(s => s.value > 30 && s.value < 120);
    if (rs.length) {
      const lastv = rs[rs.length - 1].value, older = rs.slice(0, -1).map(s => s.value);
      HC.rhr = Math.round(lastv); HC.rhrBase = older.length >= 3 ? Math.round(older.reduce((a, b) => a + b, 0) / older.length) : null;
    } else { HC.rhr = HC.rhrBase = null; }
  } catch (e) { HC.rhr = HC.rhrBase = null; }
  HC.at = now;
  if (tab === 'today' && !D.active) render();
}
function readiness() {
  let sc = 0; const why = [];
  if (HC.sleepMin != null) { const hrs = HC.sleepMin / 60; if (hrs < 6) { sc -= 2; why.push('сон меньше 6 часов'); } else if (hrs < 7) { sc -= 1; why.push('сон немного короткий'); } else if (hrs >= 7.5) { sc += 1; why.push('выспался'); } }
  if (HC.rhr != null && HC.rhrBase != null) { const d = HC.rhr - HC.rhrBase; if (d >= 6) { sc -= 2; why.push('пульс покоя заметно выше обычного'); } else if (d >= 3) { sc -= 1; why.push('пульс покоя чуть выше обычного'); } else if (d <= -2) { sc += 1; why.push('пульс покоя ниже обычного'); } }
  const rf = recentFeel(2);
  if (rf.length === 2) { const m = (rf[0] + rf[1]) / 2; if (m >= 2.5) { sc -= 1; why.push('последние тренировки были тяжёлыми'); } else if (m <= 1.6) { sc += 1; why.push('последние тренировки давались легко'); } }
  if (sc <= -2) return { cls: 'bad', t: 'Лучше облегчённую', why };
  if (sc >= 1) return { cls: 'good', t: 'Можно давить', why };
  return { cls: 'mid', t: 'Обычная тренировка', why };
}
function hcCardHTML() {
  if (!D.settings) return '';
  const hasFeel = recentFeel(2).length === 2;
  if (!D.settings.hc && !hasFeel) return '';
  if (D.settings.hc && HC.sleepMin == null && HC.rhr == null && !hasFeel) return '';
  const r = readiness(), hm = m => `${Math.floor(m / 60)} ч ${pad(m % 60)} мин`;
  return `<div class="card ready ${r.cls}"><div class="card-h" style="margin-bottom:6px"><b>Готовность</b><span class="tag">${r.t}</span></div>
    <div class="rd-row">${HC.sleepMin != null ? `<div><span class="muted small">Сон</span><b>${hm(HC.sleepMin)}</b></div>` : ''}${HC.rhr != null ? `<div><span class="muted small">Пульс покоя</span><b>${HC.rhr}${HC.rhrBase ? ` <i class="muted small">обычно ${HC.rhrBase}</i>` : ''}</b></div>` : ''}</div>
    ${r.why.length ? `<p class="muted small" style="margin:8px 0 0">${esc(r.why.join(', '))}</p>` : ''}</div>`;
}
// Пульс за время тренировки — в итоге (часы синхронизируются с задержкой, поэтому подставляем, когда данные придут)
async function hcSummary(w) {
  const h = HCp(); if (!h || !D.settings.hc) return;
  const put = txt => { const sh = $('#sheet'); if (!sh) return; let el = sh.querySelector('#hr-line'); if (!el) { el = document.createElement('p'); el.id = 'hr-line'; el.className = 'muted'; el.style.margin = '0 0 12px'; const h2 = sh.querySelector('h2'); (h2 || sh.firstElementChild).insertAdjacentElement('afterend', el); } el.textContent = txt; };
  try {
    const s = (await h.readSamples({ dataType: 'heartRate', startDate: iso(w.start), endDate: iso(w.end), limit: 2000 })).samples || [];
    if (!s.length) return put('Пульс: данных с часов за тренировку пока нет — они появятся после синхронизации Mi Fitness.');
    const v = s.map(x => x.value).filter(x => x > 30), avg = Math.round(v.reduce((a, b) => a + b, 0) / v.length);
    put(`Пульс на тренировке: средний ${avg}, максимум ${Math.round(Math.max(...v))} уд/мин`);
  } catch (e) { /* нет доступа */ }
}

// ───── Копии: на телефон (Загрузки/Trener) и в GitHub ─────
const GH_KEY = 'trener-gh-cfg';
const ghCfg = () => { try { return JSON.parse(localStorage.getItem(GH_KEY) || 'null') || {}; } catch (e) { return {}; } };
const ghOn = () => { const c = ghCfg(); return !!(c.token && c.repo); };
const b64 = s => btoa(unescape(encodeURIComponent(s)));
async function ghPut(c, path, content, msg) {
  const url = `https://api.github.com/repos/${c.repo}/contents/${path}`, hd = { Authorization: 'Bearer ' + c.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  let sha; const g = await fetch(url, { headers: hd });
  if (g.ok) sha = (await g.json()).sha; else if (g.status !== 404) throw new Error(g.status === 401 ? 'токен не подошёл' : g.status === 403 ? 'нет прав у токена' : 'ошибка ' + g.status);
  const p = await fetch(url, { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, hd), body: JSON.stringify({ message: msg, content, sha }) });
  if (!p.ok) throw new Error(p.status === 404 ? 'репозиторий не найден' : p.status === 403 || p.status === 401 ? 'нет прав записи' : 'ошибка ' + p.status);
}
async function ghPush(data) {
  const c = ghCfg(); if (!c.token || !c.repo) return null;
  try {
    if (!navigator.onLine) throw new Error('нет сети');
    const d = Object.assign({}, data, { body: (data.body || []).map(b => Object.assign({}, b, { photo: b.photo ? '(фото не отправляется)' : null })) });
    const content = b64(JSON.stringify(d)), day = dk(new Date());
    await ghPut(c, 'trener/latest.json', content, 'Тренер: копия ' + day);
    await ghPut(c, `trener/history/trener_${day}.json`, content, 'Тренер: копия за ' + day);
    return '';
  } catch (e) { return String(e && e.message || e); }
}
async function autoBackup(manual) {
  if (!D.settings) return;
  const data = await dbExport(), json = JSON.stringify(data), res = { at: Date.now(), phone: null, gh: null };
  const bk = BKp();
  if (bk) { try { await bk.save({ name: `Trener_backup_${dk(new Date())}.json`, text: json }); res.phone = ''; } catch (e) { res.phone = String(e && e.message || e); } }
  res.gh = await ghPush(data);
  D.settings.bkLast = res; await saveKV('settings');
  if (manual) { toast(`Телефон: ${res.phone === '' ? 'готово' : res.phone === null ? 'нет' : 'не вышло'}${ghOn() ? ` · GitHub: ${res.gh === '' ? 'готово' : 'не вышло'}` : ''}`); render(); }
}
function backupInfo() {
  const b = D.settings.bkLast; if (!b) return 'Копии ещё не делались. Они создаются сами после каждой тренировки.';
  const d = new Date(b.at), when = `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${hhmm(b.at)}`;
  const st = v => v === '' ? '✓' : v === null ? '—' : '✗ ' + esc(v);
  return `Последняя копия ${when}. Телефон: ${st(b.phone)}${ghOn() || b.gh !== null ? ` · GitHub: ${st(b.gh)}` : ''}`;
}
function moreExtrasHTML() {
  const c = ghCfg(), s = D.settings;
  return `<details class="card spoil" data-k="hc"${spoilOpen('hc')}><summary>Часы · Health Connect<span class="sum-r">${s.hc ? 'подключено' : 'выкл'}</span></summary>
      <p class="muted small" style="margin:0 0 10px">Mi Fitness передаёт сон, пульс и шаги в Health Connect, а Тренер читает их: готовность на главном экране, пульс в итоге тренировки, шаги и расстояние в дни ходьбы. В Mi Fitness должна быть включена синхронизация с Health Connect.</p>
      <div class="field" style="margin-bottom:10px"><label class="muted small">Длина шага, см (для расстояния по шагам)</label><input class="inp" id="stride" inputmode="numeric" value="${Math.round(strideM() * 100)}"></div>
      <div class="row2"><button class="btn" data-a="hc-connect">${s.hc ? 'Обновить доступ' : 'Подключить'}</button><button class="btn" data-a="hc-open">Настройки HC</button></div></details>
    <details class="card spoil" data-k="gh"${spoilOpen('gh')}><summary>Бэкап и копии<span class="sum-r">${ghOn() ? 'телефон + GitHub' : 'телефон'}</span></summary>
      <div class="row2" style="margin-bottom:10px"><button class="btn" data-a="export">Отправить файл</button><button class="btn" data-a="import">Загрузить из файла</button></div>
      <input type="file" id="importfile" accept="application/json,.json" hidden>
      <p class="muted small" style="margin:0 0 10px">Кнопки выше — копия файлом (Диск, Telegram). После каждой тренировки копия ещё и сама сохраняется в папку «Загрузки/Trener» на телефоне (последние 7). Вторую копию можно слать в приватный репозиторий GitHub: нужен токен с правом записи только в этот репозиторий.</p>
      <div class="field"><input class="inp" id="gh-repo" placeholder="владелец/репозиторий, например godoffear/trener-data" value="${esc(c.repo || '')}" autocapitalize="off" autocomplete="off"></div>
      <div class="field"><input class="inp" id="gh-token" type="password" placeholder="${c.token ? 'токен сохранён (введи новый, чтобы заменить)' : 'токен GitHub (fine-grained, Contents: Read and write)'}" autocomplete="off"></div>
      <div class="row2"><button class="btn" data-a="gh-save">Сохранить</button><button class="btn" data-a="bk-now">Копия сейчас</button></div>
      <p class="muted small" style="margin:10px 0 0">${backupInfo()}</p></details>`;
}
document.addEventListener('click', async ev => {
  const a = ev.target.closest && ev.target.closest('[data-a]'), an = ev.target.closest && ev.target.closest('.anim');
  if (an && !a) { an.classList.toggle('paused'); return; }
  if (!a) return;
  switch (a.dataset.a) {
    case 'hc-connect': hcConnect(); break;
    case 'hc-open': { const h = HCp(); if (h) h.openHealthConnectSettings().catch(() => toast('Не открылось')); break; }
    case 'gh-save': {
      const c = ghCfg(), repo = ($('#gh-repo').value || '').trim().replace(/^https?:\/\/github\.com\//, ''), tk = ($('#gh-token').value || '').trim();
      if (repo && !/^[\w.-]+\/[\w.-]+$/.test(repo)) return toast('Репозиторий в виде владелец/название');
      try { localStorage.setItem(GH_KEY, JSON.stringify({ repo, token: tk || c.token || '' })); } catch (e) {}
      toast(repo ? 'Сохранил. Проверю при следующей копии' : 'Копия в GitHub выключена'); render(); break;
    }
    case 'bk-now': toast('Делаю копию…'); autoBackup(true); break;
  }
});

// ───── Аналитика: нагрузка, итоги, календарь, рекорды ─────
// Оценка подходов («легко» 1 · «нормально» 2 · «тяжело» 3): среднее по тренировке и по последним тренировкам
const feelAvg = w => { const v = w.items.flatMap(it => workSets(it)).map(x => x.feel).filter(Boolean); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const recentFeel = n => doneW().sort((a, b) => a.date < b.date ? -1 : 1).map(w => feelAvg(w)).filter(x => x != null).slice(-n);
const feelWord = v => v >= 2.5 ? 'тяжело' : v >= 1.8 ? 'нормально' : 'легко';
function loadAnalysis() {
  const done = doneW(); if (done.length < 4) return null;
  const now = new Date(), acute = periodStats(dk(addDays(now, -6)), dk(now)).ton, chronic = periodStats(dk(addDays(now, -27)), dk(addDays(now, -7))).ton / 3;
  let pts = 0; const lines = [];
  const ratio = chronic > 0 ? acute / chronic : null;
  if (ratio != null) {
    if (ratio > 1.5) { pts += 2; lines.push(`За последние 7 дней нагрузка ${Math.round(ratio * 100)}% от обычной — резкий скачок`); }
    else if (ratio > 1.3) { pts += 1; lines.push(`Нагрузка выросла до ${Math.round(ratio * 100)}% от обычной`); }
    else if (ratio < 0.7) lines.push(`Нагрузка снизилась до ${Math.round(ratio * 100)}% от обычной`);
    else lines.push(`Нагрузка в норме: ${Math.round(ratio * 100)}% от обычной`);
  }
  let seen = 0, dips = 0;
  for (const id in EX) { if (EX[id].type !== 'w') continue; const h = exHistory(id); if (h.length < 3) continue;
    const v = h.map(x => sessionValue(id, x.it)).filter(x => x != null); if (v.length < 3) continue; seen++;
    const base = (v[v.length - 2] + v[v.length - 3]) / 2; if (v[v.length - 1] < base * 0.95) dips++; }
  if (seen >= 3 && dips / seen >= 0.4) { pts += 2; lines.push(`Силовые показатели просели в ${dips} из ${seen} упражнений`); }
  const since = dk(addDays(now, -14)); let disc = 0;
  for (const w of done) if (w.date >= since) for (const it of w.items) disc += (it.disc || []).length;
  if (disc >= 3) { pts += 1; lines.push(`Дискомфорт в суставах отмечен ${disc} ${ru(disc, 'раз', 'раза', 'раз')} за две недели`); }
  const rf = recentFeel(3);
  if (rf.length >= 2) { const m = rf.reduce((a, b) => a + b, 0) / rf.length;
    if (m >= 2.6) { pts += 2; lines.push('Последние тренировки подходы в основном «тяжело»'); }
    else if (m >= 2.3) { pts += 1; lines.push('Подходы всё чаще «тяжело»'); }
    else if (m <= 1.5) lines.push('Подходы в основном «легко» — можно смелее прибавлять вес'); }
  if (HC.sleep7 != null && HC.sleep7 < 390) { pts += 1; lines.push(`Сон в среднем ${Math.floor(HC.sleep7 / 60)} ч ${pad(HC.sleep7 % 60)} мин — маловато для восстановления`); }
  const lvl = pts >= 3 ? { cls: 'bad', t: 'Нужна разгрузка', tip: 'Сделай облегчённую неделю: на один подход меньше и веса без прибавки.' }
    : pts >= 1 ? { cls: 'mid', t: 'Следи за нагрузкой', tip: 'Пока без паники: не прибавляй вес в этой неделе и поспи побольше.' }
    : { cls: 'good', t: 'Всё в порядке', tip: 'Восстанавливаешься нормально, можно продолжать по плану.' };
  return Object.assign({ lines }, lvl);
}
function loadHTML() {
  const a = loadAnalysis();
  if (!a) return `<div class="card"><b>Нагрузка и восстановление</b><p class="muted small" style="margin:6px 0 0">Оценка появится после 4 тренировок.</p></div>`;
  return `<div class="card ready ${a.cls}"><div class="card-h" style="margin-bottom:6px"><b>Нагрузка и восстановление</b><span class="tag">${a.t}</span></div>
    <ul class="ll">${a.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul><p class="muted small" style="margin:8px 0 0">${a.tip}</p></div>`;
}
function summariesHTML() {
  const now = new Date(), mon = weekStart(now), pm = addDays(mon, -7), ps = addDays(mon, -1);
  const ms = new Date(now.getFullYear(), now.getMonth(), 1), pms = new Date(now.getFullYear(), now.getMonth() - 1, 1), pme = new Date(now.getFullYear(), now.getMonth(), 0);
  const row = (name, s, p) => { const d = pctDiff(s.ton, p.ton);
    return `<div class="sm"><b>${name}</b><div class="sm-g"><div><span class="num">${s.n}</span><i>тренир.</i></div><div><span class="num">${tons(s.ton)}</span><i>тоннаж${d != null ? ` · ${d > 0 ? '+' : ''}${d}%` : ''}</i></div><div><span class="num">${s.sets}</span><i>подходов</i></div><div><span class="num">${s.rec}</span><i>рекордов</i></div></div></div>`; };
  return `<details class="card spoil" data-k="a-sum"${spoilOpen('a-sum')}><summary>Итоги недели и месяца</summary>${row('Эта неделя', periodStats(dk(mon), dk(now)), periodStats(dk(pm), dk(ps)))}${row('Этот месяц', periodStats(dk(ms), dk(now)), periodStats(dk(pms), dk(pme)))}
    <p class="muted small" style="margin:0">Процент — к прошлой неделе и месяцу. В воскресенье и в конце месяца итоги приходят уведомлением.</p></details>`;
}
function heatmapHTML() {
  const WK = 26, now = new Date(), mon0 = addDays(weekStart(now), -7 * (WK - 1)), cnt = {};
  for (const w of doneW()) cnt[w.date] = (cnt[w.date] || 0) + w.items.reduce((s, it) => s + workSets(it).length, 0);
  const cell = 10, gap = 2, L = 16, W = L + WK * (cell + gap), H = 7 * (cell + gap) + 14; let out = '', last = -1;
  for (let c = 0; c < WK; c++) for (let r = 0; r < 7; r++) {
    const d = addDays(mon0, c * 7 + r), k = dk(d), n = cnt[k] || 0, fut = d > now, lv = n === 0 ? 0 : n <= 10 ? 1 : n <= 20 ? 2 : 3;
    out += `<rect x="${L + c * (cell + gap)}" y="${14 + r * (cell + gap)}" width="${cell}" height="${cell}" rx="2.5" fill="${lv ? 'var(--acc)' : 'var(--card2)'}" opacity="${fut ? .25 : lv === 1 ? .4 : lv === 2 ? .7 : 1}"><title>${k}: ${n} подх.</title></rect>`;
    if (r === 0 && d.getMonth() !== last) { last = d.getMonth(); out += `<text x="${L + c * (cell + gap)}" y="9" font-size="9" fill="var(--muted)">${['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'][last]}</text>`; }
  }
  ['Пн', 'Ср', 'Пт'].forEach((t, i) => out += `<text x="0" y="${14 + i * 2 * (cell + gap) + 9}" font-size="8" fill="var(--muted)">${t}</text>`);
  const total = Object.keys(cnt).filter(k => k >= dk(mon0)).length;
  return `<details class="card spoil" data-k="a-heat"${spoilOpen('a-heat')}><summary>Календарь тренировок<span class="sum-r">${total} дн.</span></summary><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Календарь тренировок">${out}</svg>
    <p class="muted small" style="margin:6px 0 0">Чем ярче клетка, тем больше подходов в этот день.</p></details>`;
}
function allRecordsHTML() {
  const best = {};
  for (const w of doneW()) for (const it of w.items) { const e = EX[it.ex]; if (!e || it.extra) continue;
    for (const s of workSets(it)) {
      let sc; if (e.type === 'w') sc = e1rm((s.kg || 0) * (setMode(s, it.ex) === 'each' ? 2 : 1), s.reps); else if (e.type === 'assist') sc = s.reps >= (it.plan.lo || 1) ? -(s.kg || 0) : null; else if (e.type === 'bw') sc = s.reps; else sc = s.sec;
      if (sc == null) continue; const b = best[it.ex]; if (!b || sc > b.sc) best[it.ex] = { sc, s, date: w.date };
    } }
  const rows = Object.keys(best).map(id => ({ id, b: best[id] })).sort((x, y) => x.b.date < y.b.date ? 1 : -1);
  if (!rows.length) return '';
  return `<details class="card spoil" data-k="a-rec"${spoilOpen('a-rec')}><summary>Рекорды за всё время<span class="sum-r">${rows.length}</span></summary><ul class="exl">${rows.map(r => `<li><div class="n"><b>${esc(EX[r.id].name)}</b><span>${esc(setText(EX[r.id], r.b.s))}</span></div><span class="muted small">${r.b.date.slice(8)}.${r.b.date.slice(5, 7)}.${r.b.date.slice(2, 4)}</span></li>`).join('')}</ul></details>`;
}
function statsExtraHTML() { return loadHTML(); }
function feelHTML() {
  const ws = doneW().sort((a, b) => a.date < b.date ? -1 : 1).map(w => ({ w, v: feelAvg(w) })).filter(x => x.v != null).slice(-10);
  if (ws.length < 2) return `<details class="card spoil" data-k="a-feel"${spoilOpen('a-feel')}><summary>Самочувствие на тренировках</summary><p class="muted small" style="margin:0">После каждого подхода жми «Легко», «Нормально» или «Тяжело» — здесь появится график, а нагрузка и подсказки по весу станут точнее.</p></details>`;
  const last = ws[ws.length - 1].v;
  return `<details class="card spoil" data-k="a-feel"${spoilOpen('a-feel')}><summary>Самочувствие на тренировках<span class="sum-r">${feelWord(last)}</span></summary>${barsSVG(ws.map((x, i) => ({ l: x.w.date.slice(8) + '.' + x.w.date.slice(5, 7), v: Math.round(x.v * 10) / 10, hi: i === ws.length - 1 })), v => String(v).replace('.', ','))}
    <p class="muted small" style="margin:6px 0 0">Среднее по подходам: 1 — легко, 2 — нормально, 3 — тяжело. Если столбики растут при том же весе, организм устаёт.</p></details>`;
}
// Склеиваем несколько спойлеров в один: заголовки частей становятся подзаголовками
function groupSpoil(key, title, parts) {
  const body = parts.filter(Boolean).map(h => h.replace(/<details[^>]*><summary>(.*?)(?:<span class="sum-r">.*?<\/span>)?<\/summary>/g, '<h3 class="sub-h">$1</h3><div class="sub">').replace(/<\/details>/g, '</div>')).join('');
  return body ? `<details class="card spoil" data-k="${key}"${spoilOpen(key)}><summary>${title}</summary>${body}</details>` : '';
}
function statsExtra2HTML() { return groupSpoil('a-sum-all', 'Итоги и рекорды', [summariesHTML(), heatmapHTML(), allRecordsHTML()]); }

// ───── Подключение к приложению ─────
(function () {
  const baseRender = render;
  render = function () { baseRender(); updateOngoing(); };
  const baseSummary = sheetSummary;
  sheetSummary = function (w) { baseSummary(w); hcSummary(w); };
  const baseFinish = finishWorkout;
  finishWorkout = async function (...a) { const n = D.workouts.length; await baseFinish(...a); if (D.workouts.length > n) { autoBackup(false); schedSummaries(); } };
  const baseAsk = askNotify;
  askNotify = async function () { await baseAsk(); await lnInit(true); updateOngoing(); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { hcRefresh(); updateOngoing(); } });
  const t = setInterval(async () => {
    if (!(typeof D !== 'undefined' && D.settings)) return; clearInterval(t);
    await lnInit(false); schedSummaries(); updateOngoing(); hcRefresh();
    if (!D.settings.bkLast || Date.now() - D.settings.bkLast.at > 864e5 * 3) autoBackup(false);
  }, 500);
})();

// ───── Ходьба: шаги, расстояние и калории за день из Health Connect (суммы без дублей между часами и телефоном) ─────
const walkCache = {}, walkBusy = {};
const stepGoal = () => (D.settings && D.settings.stepGoal) || 8000;
const strideM = () => ((D.settings && D.settings.stride) || 72) / 100;
async function walkLoad(key) {
  const h = HCp(); if (!h || !D.settings.hc || walkBusy[key]) return; walkBusy[key] = 1;
  const d0 = pk(key), a = iso(d0), b = iso(addDays(d0, 1)), out = { steps: null, dist: null, kcal: null, src: {}, distSrc: 0, estimated: false, err: '' };
  const agg = async t => { try { const r = await h.queryAggregated({ dataType: t, startDate: a, endDate: b, bucket: 'day', aggregation: 'sum' }); return (r.samples || []).reduce((x, y) => x + (y.value || 0), 0); } catch (e) { if (t === 'steps') out.err = String(e && e.message || e); return null; } };
  let steps = await agg('steps'), dist = await agg('distance'); out.kcal = await agg('calories');
  // Сырые записи по источникам: Mi Fitness, телефон и т. п. Агрегат Health Connect при пересечении источников берёт «главный» и может занижать шаги
  try {
    const r = await h.readSamples({ dataType: 'steps', startDate: a, endDate: b, limit: 5000 });
    for (const x of r.samples || []) { const n = x.sourceName || x.sourceId || 'источник'; out.src[n] = (out.src[n] || 0) + (x.value || 0); }
    const best = Math.max(0, ...Object.values(out.src)); if (steps != null || best) steps = Math.max(steps || 0, best);
  } catch (e) { /* только агрегат */ }
  try { const r = await h.readSamples({ dataType: 'distance', startDate: a, endDate: b, limit: 2000 }); out.distSrc = (r.samples || []).length; if (!dist) dist = (r.samples || []).reduce((x, y) => x + (y.value || 0), 0) || dist; } catch (e) {}
  out.steps = steps;
  if (dist && dist > 0) out.dist = dist; else if (steps) { out.dist = steps * strideM(); out.estimated = true; }
  walkCache[key] = out; walkBusy[key] = 0; if (tab === 'today') render();
}
function walkHTML(key, isToday) {
  if (!D.settings || !D.settings.hc) return `<p class="note">Подключи часы в «Ещё» → «Часы · Health Connect» — тут появятся шаги, расстояние и калории за день.</p>`;
  const w = walkCache[key]; if (!w) { walkLoad(key); return `<p class="muted small" style="margin:10px 0 0">Загружаю данные с часов…</p>`; }
  if (w.steps == null) return `<p class="note">Нет доступа к шагам. Открой «Ещё» → «Часы · Health Connect» → «Обновить доступ» и разреши шаги, расстояние и калории.</p><button class="btn" data-a="walk-reload" data-k="${key}">Обновить</button>`;
  const km = w.dist != null ? (w.dist / 1000).toFixed(1).replace('.', ',') : null;
  return `<div class="walk"><div class="walk-n"><b class="num">${Math.round(w.steps).toLocaleString('ru-RU')}</b><span class="muted small"> шагов</span></div>
    <div class="rd-row">${km ? `<div><span class="muted small">Расстояние${w.estimated ? ' (≈ по шагам)' : ''}</span><b>${w.estimated ? '≈ ' : ''}${km} км</b></div>` : ''}${w.kcal ? `<div><span class="muted small">Активные ккал</span><b>${Math.round(w.kcal)}</b></div>` : ''}</div>
    <details class="fold photos"><summary>Откуда данные</summary><p class="muted small" style="margin:0 0 8px">${Object.keys(w.src).length ? Object.entries(w.src).map(([n, v]) => esc(n) + ': ' + Math.round(v).toLocaleString('ru-RU')).join('<br>') : 'Записей шагов по источникам нет'}<br>Записей расстояния: ${w.distSrc}${w.estimated ? '. Часы не передают расстояние, поэтому оно посчитано по длине шага.' : ''}</p></details>
    ${isToday ? `<button class="btn" data-a="walk-reload" data-k="${key}" style="margin-top:10px">Обновить</button>` : ''}</div>`;
}
document.addEventListener('click', async ev => {
  const a = ev.target.closest && ev.target.closest('[data-a="walk-reload"]'); if (!a) return;
  delete walkCache[a.dataset.k]; walkBusy[a.dataset.k] = 0; render();
});
document.addEventListener('change', async ev => {
  if (ev.target.id === 'stride') { const v = Math.round(num(ev.target.value)); if (v >= 40 && v <= 120) { D.settings.stride = v; await saveKV('settings'); for (const k in walkCache) delete walkCache[k]; toast('Длина шага: ' + v + ' см'); render(); } else toast('Длина шага от 40 до 120 см'); }
  if (ev.target.id === 'step-goal') { const v = Math.round(num(ev.target.value)); if (v >= 1000 && v <= 40000) { D.settings.stepGoal = v; await saveKV('settings'); toast('Цель: ' + v + ' шагов'); render(); } else toast('Цель от 1000 до 40000'); }
});
