// Хранилище: IndexedDB «trener». Данных мало, поэтому при запуске всё читается в память (объект D),
// а каждая правка сразу пишется обратно в базу.
//   kv       — settings, program, active (незавершённая тренировка), insights (заготовка для 2-й версии)
//   workouts — тренировки:  { id, date, day, check:{sleep,energy,sore}, light, items:[…], done }
//   walks    — пока не используется (шаги убраны, Андрей считает их в других приложениях)
//   body     — талия и фото: { id, date, waist, photo (Blob) }
const DB_NAME = 'trener', DB_VER = 1, STORES = ['kv', 'workouts', 'walks', 'body'];
let idb = null;

function dbOpen() {
  return new Promise((ok, fail) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
    };
    r.onsuccess = () => { idb = r.result; ok(idb); };
    r.onerror = () => fail(r.error);
  });
}
function req(r) { return new Promise((ok, fail) => { r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error); }); }
function tx(store, mode) { return idb.transaction(store, mode).objectStore(store); }
const dbAll = store => req(tx(store, 'readonly').getAll());
const dbPut = (store, val) => req(tx(store, 'readwrite').put(val));
const dbDel = (store, id) => req(tx(store, 'readwrite').delete(id));
const dbClear = store => req(tx(store, 'readwrite').clear());

function defaultSettings() {
  return {
    id: 'settings',
    weight: null,          // вес тела, кг — спрашивается при первом запуске
    start: null,           // дата начала цикла (для разгрузки каждые deloadEvery недель)
    deloadEvery: 7,
    weighSkip: '',         // понедельник (ГГГГ-ММ-ДД), когда взвешивание пропустили
    weighed: '',           // понедельник, когда взвесился здесь
    sound: 'bell',         // звук конца отдыха (js/sounds.js)
    soundVol: 2,           // 1 тихо, 2 средне, 3 громко
    pips: true,            // писк за 3-2-1 с до конца отдыха
    wmode: {},             // как считается вес упражнения: { id: 'total' | 'each' } (по умолчанию гантели — 'each', остальное — 'total')
  };
}

// D — всё в памяти. Новые поля добавляй в defaultSettings, старые не переименовывай.
const D = { settings: null, program: null, active: null, insights: null, workouts: [], walks: [], body: [], hlog: {} };

async function dbLoad() {
  await dbOpen();
  const kv = await dbAll('kv'), get = id => (kv.find(x => x.id === id) || {}).val;
  D.settings = Object.assign(defaultSettings(), get('settings'));
  D.program = get('program') || defaultProgram();
  // 0.5: программа v2 (около часа, отдых 90/60 с) — заменяем старую, дни недели оставляем
  // v1–v5 → v6 (0.17): новая программа по решению Андрея (суперсеты, без grav_neg/face_pull/plank); дни недели остаются
  if ((D.program.v || 1) < 6) { const week = D.program.week; D.program = defaultProgram(); D.program.week = week; }
  // v6 → v7 (0.19): программа не заменяется (правки Андрея остаются) — в пятницу добавляем скручивания в тренажёре
  if (D.program.v === 6 && D.program.days.D && !D.program.days.D.items.some(x => x.ex === 'crunch_m')) D.program.days.D.items.push(defaultProgram().days.D.items.find(x => x.ex === 'crunch_m'));
  // v7 → v8 (16.0): в программе разведение гантелей меняем на разведение на нижнем блоке (остальные правки остаются)
  if (D.program.v < 8) for (const day of Object.values(D.program.days)) for (const x of day.items) if (x.ex === 'lat_raise') { x.ex = 'cable_lat_raise'; delete x.step; }
  // v8 → v9 (21.0): в дне C (ноги) жим ногами меняем на присед в тренажёре; жим остаётся в дне D
  if (D.program.v < 9 && D.program.days.C) { const x = D.program.days.C.items.find(y => y.ex === 'leg_press'); if (x) { x.ex = 'machine_squat'; delete x.step; } }
  // v9 → v10 (24.0): новая программа на 5 дней (ноги в субботу, бег в среду). Шаги прибавки по тем же упражнениям переносим
  if (D.program.v < 10) {
    const old = D.program, steps = {};
    for (const day of Object.values(old.days)) for (const x of day.items) if (x.step != null) steps[x.ex] = x.step;
    D.program = defaultProgram();
    for (const day of Object.values(D.program.days)) for (const x of day.items) if (steps[x.ex] != null) x.step = steps[x.ex];
  }
  // v10 → v11 (26.0): в дне E румынская тяга меняется на тягу в Смите
  if (D.program.v < 11) for (const day of Object.values(D.program.days)) for (const x of day.items) if (x.ex === 'rdl') { x.ex = 'smith_rdl'; delete x.step; }
  // v11 → v12 (29.0): в «авторской» программе во вторник (день B) и четверг (день C) сгибание на блоке меняется на подъём EZ-штанги
  if (D.program.v < 12) for (const [id, nm] of [['B', 'Спина, бицепс, трапеции'], ['C', 'Плечи и руки']]) { const d = D.program.days[id]; if (d && d.name === nm) for (const x of d.items) if (x.ex === 'curl') { x.ex = 'ez_curl'; delete x.step; } }
  // v12 → v13 (33.0): в «авторской» программе в пятницу (день D) разведения в кроссовере меняются на обратную бабочку
  if (D.program.v < 13) { const d = D.program.days.D; if (d && d.name === 'Верх: грудь, спина, дельты') for (const x of d.items) if (x.ex === 'rear_cable') { x.ex = 'rear_fly'; delete x.step; } }
  // v13 → v14 (34.0): в «авторской» программе новое время отдыха (2 мин у тяжёлых, 75 с у изоляции, 60 с у пресса). Подходы, повторы и шаги не меняются
  if (D.program.v < 14) for (const nm of ['Грудь, трицепс, пресс', 'Спина, бицепс, трапеции', 'Плечи и руки', 'Верх: грудь, спина, дельты', 'Ноги']) { const d = Object.values(D.program.days).find(x => x.name === nm); if (d) for (const x of d.items) x.rest = restOf(x.ex); }
  // v14 → v15 (36.0): в «авторской» программе в пятницу (день D) после жима от груди добавляется наклонный жим в рычажном тренажёре
  if (D.program.v < 15) { const d = D.program.days.D; if (d && d.name === 'Верх: грудь, спина, дельты' && !d.items.some(x => x.ex === 'incl_press_m')) { const i = d.items.findIndex(x => x.ex === 'chest_press'); const n = { ex: 'incl_press_m', sets: 3, lo: 8, hi: 12, rest: restOf('incl_press_m') }; d.items.splice(i < 0 ? 0 : i + 1, 0, n); } }
  // v15 → v16 (38.0): в понедельник (A) и четверг (C): сначала разгибание из-за головы, потом разгибание на блоке в суперсете с прессом на блоке
  if (D.program.v < 16) for (const [id, nm] of [['A', 'Грудь, трицепс, пресс'], ['C', 'Плечи и руки']]) { const d = D.program.days[id]; if (!d || d.name !== nm) continue; const it = d.items, p = it.findIndex(x => x.ex === 'pushdown'), r = it.findIndex(x => x.ex === 'rope_ovh'), c = it.findIndex(x => x.ex === 'cable_crunch'); if (p < 0 || r !== p + 1 || c !== r + 1) continue; const P = it[p], R = it[r]; delete R.ss; it[p] = R; it[r] = P; it[c].ss = true; }
  // v16 → v17 (40.0): косые мышцы — Пн: подъём ног по диагонали вместо прямого; Чт: дровосек на блоке в конце; Пт: боковая планка в суперсете после разведения в стороны на блоке
  if (D.program.v < 17) {
    const A = D.program.days.A, C = D.program.days.C, Dd = D.program.days.D;
    if (A && A.name === 'Грудь, трицепс, пресс') for (const x of A.items) if (x.ex === 'chair_lr') x.ex = 'chair_lr_diag';
    if (C && C.name === 'Плечи и руки' && !C.items.some(x => x.ex === 'cable_woodchop')) C.items.push({ ex: 'cable_woodchop', sets: 3, lo: 10, hi: 12, rest: restOf('cable_woodchop') });
    if (Dd && Dd.name === 'Верх: грудь, спина, дельты' && !Dd.items.some(x => x.ex === 'side_plank')) { const i = Dd.items.findIndex(x => x.ex === 'cable_lat_raise'); Dd.items.splice(i < 0 ? Dd.items.length : i + 1, 0, { ex: 'side_plank', sets: 3, lo: 30, hi: 40, rest: restOf('side_plank'), ss: true }); }
  }
  // v17 → v18 (41.0): в четверг (C) дровосек на блоке заменён боковыми наклонами с гантелью
  if (D.program.v < 18) { const C = D.program.days.C; if (C && C.name === 'Плечи и руки') for (const x of C.items) if (x.ex === 'cable_woodchop') { x.ex = 'db_side_bend'; x.sets = 3; x.lo = 12; x.hi = 15; x.rest = restOf('db_side_bend'); delete x.step; } }
  // v18 → v19 (42.0): в четверге (C) подъёмы в стороны на блоке — 3 подхода вместо 4
  if (D.program.v < 19) { const C = D.program.days.C; if (C && C.name === 'Плечи и руки') for (const x of C.items) if (x.ex === 'cable_lat_raise' && x.sets === 4) x.sets = 3; }
  if (D.program.v !== PROGRAM_V) { D.program.v = PROGRAM_V; await dbPut('kv', { id: 'program', val: D.program }); }
  D.active = get('active') || null;
  D.insights = get('insights') || { weekly: [], plateaus: [] };
  D.hlog = get('hlog') || {};
  // 22.0: тренировка 30.10 — приседания, записанные как гоблет-присед, на самом деле были в рычажном тренажёре
  // 32.0: жим плеч 05.11 делался в рычажном тренажёре с блинами, вес вписан на одну сторону (раньше писался как «общий»). Октябрьские записи не трогаем
  if (!D.settings.fix32) {
    const w = (await dbAll('workouts')).find(x => x.date === '2026-11-05' && x.day === 'C'), it = w && w.items.find(i => i.ex === 'sh_press');
    if (it && it.sets.some(s => s.wm === 'total')) { for (const s of it.sets) if (s.wm === 'total') s.wm = 'each'; await dbPut('workouts', w); }
    D.settings.fix32 = 1; await dbPut('kv', { id: 'settings', val: D.settings });
  }
  if (!D.settings.fix22) {
    const w = (await dbAll('workouts')).find(x => x.id === 'mvubts3oe8yw'), g = w && w.items.find(i => i.ex === 'goblet');
    if (g) { g.ex = 'machine_squat'; await dbPut('workouts', w); }
    D.settings.fix22 = 1; await dbPut('kv', { id: 'settings', val: D.settings });
  }
  D.workouts = (await dbAll('workouts')).sort((a, b) => a.date < b.date ? -1 : 1);
  D.walks = (await dbAll('walks')).sort((a, b) => a.date < b.date ? -1 : 1);
  D.body = (await dbAll('body')).sort((a, b) => a.date < b.date ? -1 : 1);
}
const saveKV = id => dbPut('kv', { id, val: D[id] });

// ───── Бэкап ─────
const blobToData = b => new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(b); });
async function dbExport() {
  const body = [];
  for (const b of D.body) body.push(Object.assign({}, b, { photo: b.photo ? await blobToData(b.photo) : null }));
  return { app: 'trener', v: 1, at: new Date().toISOString(), exportedAt: new Date().toISOString(), apkVersion: typeof APP_VERSION === 'string' ? APP_VERSION : null,
    settings: D.settings, program: D.program, active: D.active, insights: D.insights,
    workouts: D.workouts, walks: D.walks, body, hlog: D.hlog };
}
async function dbImport(o) {
  if (!o || o.app !== 'trener') throw new Error('Это не файл бэкапа «Тренера»');
  for (const s of STORES) await dbClear(s);
  for (const k of ['settings', 'program', 'active', 'insights', 'hlog']) if (o[k]) await dbPut('kv', { id: k, val: o[k] });
  for (const w of o.workouts || []) await dbPut('workouts', w);
  for (const w of o.walks || []) await dbPut('walks', w);
  for (const b of o.body || []) {
    const photo = b.photo ? await (await fetch(b.photo)).blob() : null;
    await dbPut('body', Object.assign({}, b, { photo }));
  }
  await dbLoad();
}
