// Копия данных в приватный репозиторий GitHub — тот же, что у Рациона (godoffear/racion-data), папка trener/.
// Токен и имя репозитория Андрей подключил в Рационе: они лежат в localStorage['racion-gh'] (общий сайт godoffear.github.io).
// Тренер их только читает; свой статус отправки хранит отдельно — localStorage['trener-gh'] = { last, err, pending }.
// Claude читает trener/latest.json через GitHub MCP.
const GH_CFG = 'racion-gh', GH_ST = 'trener-gh';
const ghCfg = () => { try { return JSON.parse(localStorage.getItem(GH_CFG) || 'null') || {}; } catch (e) { return {}; } };
const ghSt = () => { try { return JSON.parse(localStorage.getItem(GH_ST) || 'null') || {}; } catch (e) { return {}; } };
const ghSetSt = o => { try { localStorage.setItem(GH_ST, JSON.stringify(Object.assign(ghSt(), o))); } catch (e) {} };
const ghOn = () => { const c = ghCfg(); return !!(c.token && c.repo); };
const b64 = s => btoa(unescape(encodeURIComponent(s)));
function ghReq(c, method, path, body) {
  return fetch('https://api.github.com/repos/' + c.repo + path, { method,
    headers: Object.assign({ Authorization: 'Bearer ' + c.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, body ? { 'Content-Type': 'application/json' } : {}),
    body: body ? JSON.stringify(body) : undefined });
}
const ghWhy = s => s === 401 || s === 403 ? 'нет доступа: проверь токен в Рационе' : s === 404 ? 'репозиторий не найден' : s === 409 || s === 422 ? 'конфликт записи, нажми ещё раз' : 'GitHub ответил ' + s;
async function ghPut(c, path, content, msg) {
  let sha; const g = await ghReq(c, 'GET', '/contents/' + path);
  if (g.ok) sha = (await g.json()).sha; else if (g.status !== 404) throw new Error(ghWhy(g.status));
  const p = await ghReq(c, 'PUT', '/contents/' + path, { message: msg, content, sha });
  if (!p.ok) throw new Error(ghWhy(p.status));
}
let ghBusy = false;
async function ghPush() {
  const c = ghCfg(); if (!c.token || !c.repo || ghBusy) return false;
  ghBusy = true;
  try {
    if (!navigator.onLine) throw new Error('нет сети');
    const data = await dbExport(); data.body = (data.body || []).map(b => Object.assign({}, b, { photo: b.photo ? '(фото не отправляется)' : null }));
    const now = new Date(), day = dk(now), stamp = `${day} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const body = b64(JSON.stringify(Object.assign(data, { _meta: { app: APP_VERSION, at: now.toISOString() } })));
    await ghPut(c, 'trener/latest.json', body, 'Тренер: копия ' + stamp);
    await ghPut(c, `trener/history/trener_${day}.json`, body, 'Тренер: копия за ' + day);
    ghSetSt({ last: Date.now(), err: '', pending: 0 });
    return true;
  } catch (e) { ghSetSt({ err: String(e && e.message || e), pending: 1 }); return false; }
  finally { ghBusy = false; }
}
// Не ушло (нет сети) — повторяем при следующем открытии
document.addEventListener('visibilitychange', () => { if (!document.hidden && ghOn() && ghSt().pending && navigator.onLine) ghPush(); });

function ghCard() {
  const st = ghSt(), c = ghCfg(), t = st.last ? new Date(st.last) : null;
  if (!ghOn()) return `<div class="card"><h2 style="margin-bottom:6px">Копия в GitHub</h2>
    <p class="muted small" style="margin:0">Не подключено. Подключи в Рационе: «Ещё» → «Копия в GitHub» — Тренер возьмёт тот же доступ сам.</p></div>`;
  return `<div class="card"><h2 style="margin-bottom:6px">Копия в GitHub</h2>
    <p class="small" style="margin:0 0 4px">${esc(c.repo)} · папка <b>trener/</b> · доступ из Рациона</p>
    <p class="small ${st.err ? 'warn-t' : 'muted'}" style="margin:0 0 12px">${st.err ? 'Не отправилось: ' + esc(st.err) + (st.pending ? ' — повторю при следующем открытии' : '')
      : t ? `Отправлено: ${fmtDate(t)}, ${pad(t.getHours())}:${pad(t.getMinutes())}` : 'Ещё не отправлял'}. Отправляется само после каждой тренировки.</p>
    <button class="btn" data-a="ghnow">Отправить сейчас</button></div>`;
}
