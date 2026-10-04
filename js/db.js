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
  };
}

// D — всё в памяти. Новые поля добавляй в defaultSettings, старые не переименовывай.
const D = { settings: null, program: null, active: null, insights: null, workouts: [], walks: [], body: [] };

async function dbLoad() {
  await dbOpen();
  const kv = await dbAll('kv'), get = id => (kv.find(x => x.id === id) || {}).val;
  D.settings = Object.assign(defaultSettings(), get('settings'));
  D.program = get('program') || defaultProgram();
  // 0.5: программа v2 (около часа, отдых 90/60 с) — заменяем старую, дни недели оставляем
  if ((D.program.v || 1) < 2) { const week = D.program.week; D.program = defaultProgram(); D.program.week = week; }
  // 0.6: v3 — скручивания в тренажёре заменить на скручивания на скамье, остальные правки Андрея не трогаем
  if (D.program.v < 3) for (const d of Object.values(D.program.days)) for (const x of d.items) if (x.ex === 'crunch_m') { Object.assign(x, { ex: 'bench_crunch', lo: 12, hi: 15 }); delete x.step; }
  if (D.program.v !== PROGRAM_V) { D.program.v = PROGRAM_V; await dbPut('kv', { id: 'program', val: D.program }); }
  D.active = get('active') || null;
  D.insights = get('insights') || { weekly: [], plateaus: [] };
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
  return { app: 'trener', v: 1, at: new Date().toISOString(),
    settings: D.settings, program: D.program, active: D.active, insights: D.insights,
    workouts: D.workouts, walks: D.walks, body };
}
async function dbImport(o) {
  if (!o || o.app !== 'trener') throw new Error('Это не файл бэкапа «Тренера»');
  for (const s of STORES) await dbClear(s);
  for (const k of ['settings', 'program', 'active', 'insights']) if (o[k]) await dbPut('kv', { id: k, val: o[k] });
  for (const w of o.workouts || []) await dbPut('workouts', w);
  for (const w of o.walks || []) await dbPut('walks', w);
  for (const b of o.body || []) {
    const photo = b.photo ? await (await fetch(b.photo)).blob() : null;
    await dbPut('body', Object.assign({}, b, { photo }));
  }
  await dbLoad();
}
