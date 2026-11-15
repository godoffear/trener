// Тихий журнал здоровья: раз в несколько часов копирует данные из Health Connect (часы → Mi Fitness → HC)
// в память приложения по дням. На экране не показывается, попадает в бэкап (D.hlog) — чтобы разбирать состояние по запросу.
HC_READ.push('heartRateVariability', 'oxygenSaturation', 'respiratoryRate', 'weight', 'bodyFat', 'vo2Max', 'exerciseTime');
const HL_EVERY = 3 * 36e5, HL_FIRST_DAYS = 30, HL_NEXT_DAYS = 3;
let hlBusy = false;
async function hlDay(h, d0) {
  const a = iso(d0), b = iso(addDays(d0, 1)), o = {};
  const rd = async (t, lim) => { try { return (await h.readSamples({ dataType: t, startDate: a, endDate: b, limit: lim || 2000 })).samples || []; } catch (e) { return []; } };
  const avg = xs => xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length * 10) / 10 : null;
  const num = xs => xs.map(s => s.value).filter(v => v > 0);
  // сон: ночь относим ко дню пробуждения
  try {
    const sl = (await h.readSamples({ dataType: 'sleep', startDate: iso(addDays(d0, -1)), endDate: b, limit: 600 })).samples || [];
    const mine = sl.filter(s => { const t = new Date(s.endDate).getTime(); return t >= d0.getTime() && t < addDays(d0, 1).getTime(); });
    if (mine.length) {
      o.sleepMin = sleepMinutes(mine);
      const st = {}; for (const s of mine) for (const g of (s.stages || [])) st[g.stage] = (st[g.stage] || 0) + (g.durationMinutes || 0);
      if (Object.keys(st).length) o.sleepStages = st;
      o.sleepStart = new Date(Math.min(...mine.map(s => new Date(s.startDate)))).toISOString();
      o.sleepEnd = new Date(Math.max(...mine.map(s => new Date(s.endDate)))).toISOString();
    }
  } catch (e) { /* пропускаем */ }
  const hr = num(await rd('heartRate', 5000)); if (hr.length) { o.hrMin = Math.min(...hr); o.hrMax = Math.max(...hr); o.hrAvg = Math.round(avg(hr)); }
  const rhr = num(await rd('restingHeartRate', 50)).filter(v => v > 30 && v < 120); if (rhr.length) o.rhr = rhr[rhr.length - 1];
  const hrv = num(await rd('heartRateVariability', 500)); if (hrv.length) o.hrv = avg(hrv);
  const sp = num(await rd('oxygenSaturation', 500)); if (sp.length) { o.spo2 = avg(sp); o.spo2Min = Math.min(...sp); }
  const rr = num(await rd('respiratoryRate', 500)); if (rr.length) o.resp = avg(rr);
  const w = num(await rd('weight', 20)); if (w.length) o.weight = w[w.length - 1];
  const bf = num(await rd('bodyFat', 20)); if (bf.length) o.bodyFat = bf[bf.length - 1];
  const vo = num(await rd('vo2Max', 20)); if (vo.length) o.vo2 = vo[vo.length - 1];
  const ex = num(await rd('exerciseTime', 100)); if (ex.length) o.exMin = Math.round(ex.reduce((s, x) => s + x, 0));
  const agg = async t => { try { const r = await h.queryAggregated({ dataType: t, startDate: a, endDate: b, bucket: 'day', aggregation: 'sum' }); const v = (r.samples || []).reduce((x, y) => x + (y.value || 0), 0); return v || null; } catch (e) { return null; } };
  let steps = await agg('steps'); const src = {};
  for (const x of await rd('steps', 5000)) { const n = x.sourceName || x.sourceId || '?'; src[n] = (src[n] || 0) + (x.value || 0); }
  const best = Math.max(0, ...Object.values(src)); if (steps != null || best) o.steps = Math.round(Math.max(steps || 0, best));
  const dist = await agg('distance'); if (dist) o.dist = Math.round(dist);
  const kc = await agg('calories'); if (kc) o.kcal = Math.round(kc);
  if (Object.keys(src).length) o.src = Object.keys(src);
  return o;
}
async function hlCollect(force) {
  const h = HCp(); if (!h || !D.settings || !D.settings.hc || hlBusy) return;
  if (!force && Date.now() - (D.settings.hlAt || 0) < HL_EVERY) return;
  hlBusy = true;
  try {
    const n = (force || !D.settings.hlAt) ? HL_FIRST_DAYS : HL_NEXT_DAYS, today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = 0; i < n; i++) {
      const d0 = addDays(today, -i), o = await hlDay(h, d0);
      if (Object.keys(o).length) D.hlog[dk(d0)] = Object.assign(D.hlog[dk(d0)] || {}, o, { at: Date.now() });
    }
    D.settings.hlAt = Date.now(); await saveKV('hlog'); await saveKV('settings');
  } catch (e) { /* не страшно, попробуем позже */ } finally { hlBusy = false; }
}
(function () {
  const baseRefresh = hcRefresh;
  hcRefresh = async function (...a) { await baseRefresh.apply(this, a); hlCollect(false); };
  const baseConnect = hcConnect;
  hcConnect = async function (...a) { await baseConnect.apply(this, a); hlCollect(true); };
})();
