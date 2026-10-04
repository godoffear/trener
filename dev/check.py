#!/usr/bin/env python3
"""Проверка Тренера: скриншоты 360×780 и 780×360, ошибки JS, элементы, вылезающие за экран.
Запускает локальный сервер из корня репозитория (IndexedDB и service worker не работают с file://).
Запуск из корня репозитория:  python3 dev/check.py [ГГГГ-ММ-ДДTЧЧ:ММ]
Скриншоты ложатся в /tmp/trener-*.png
"""
import asyncio, functools, http.server, pathlib, sys, threading
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
when = sys.argv[1] if len(sys.argv) > 1 else None
INIT = ("(()=>{const RD=Date,fix=new RD('%s').getTime();class FD extends RD{constructor(...a){if(a.length)super(...a);else super(fix)}"
        "static now(){return fix}};window.Date=FD})();" % when) if when else ''

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{srv.server_port}'
WIDE = "[...document.querySelectorAll('#app *, .sheet *')].filter(e=>!e.closest('.wo-dots')&&e.getBoundingClientRect().right>innerWidth+1).slice(0,3).map(e=>e.tagName+'.'+e.className)"

async def shot(pg, name, label):
    wide = await pg.evaluate(WIDE)
    await pg.screenshot(path=f'/tmp/trener-{name}.png', full_page=True)
    print(f'{label}: ' + ('OK' if not wide else 'вылезает: ' + ', '.join(wide)))

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # PWA: манифест без ошибок, service worker в кэше, приложение открывается без сети
        ctx = await b.new_context(); pg = await ctx.new_page()
        await pg.goto(BASE + '/')
        await pg.evaluate("navigator.serviceWorker.ready")
        await pg.wait_for_timeout(1500)
        cdp = await ctx.new_cdp_session(pg)
        man = await cdp.send('Page.getAppManifest')
        errs = [e['message'] for e in man.get('errors', [])]
        print('Манифест:', 'OK' if man.get('url') and not errs else f'ошибки {errs}')
        n = await pg.evaluate("caches.keys().then(ks=>caches.open(ks.find(k=>k.startsWith('trener-')))).then(c=>c.keys()).then(r=>r.length)")
        print('В кэше файлов:', n)
        await ctx.set_offline(True); await pg.reload(); await pg.wait_for_timeout(500)
        ok = await pg.evaluate("!!document.querySelector('#tabs button') && [...document.images].every(i=>!i.src||i.complete)")
        print('Без интернета открывается:', 'OK' if ok else 'НЕТ')
        await pg.fill('#s-weight', '82,5'); await pg.click('[data-a="welcome"]')
        await pg.click('[data-a="tab"][data-k="prog"]'); await pg.click('.exl [data-a="tech"]'); await pg.wait_for_timeout(400)
        ph = await pg.evaluate("[...document.querySelectorAll('.sheet .pics img')].length===2 && [...document.querySelectorAll('.sheet .pics img')].every(i=>i.naturalWidth>0)")
        print('Фото в технике без интернета:', 'OK' if ph else 'НЕТ')
        await ctx.close()

        for w, h, tag in [(360, 780, 'p'), (780, 360, 'l')]:
            ctx = await b.new_context(viewport={'width': w, 'height': h})
            pg = await ctx.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            if INIT: await pg.add_init_script(INIT)
            await pg.goto(BASE + '/'); await pg.wait_for_timeout(400)
            await shot(pg, f'{tag}-welcome', f'{w}×{h} первый запуск')
            await pg.fill('#s-weight', '82,5'); await pg.click('[data-a="welcome"]'); await pg.wait_for_timeout(200)
            for t in ['today', 'prog', 'stats', 'more']:
                await pg.click(f'[data-a="tab"][data-k="{t}"]'); await pg.wait_for_timeout(150)
                await shot(pg, f'{tag}-{t}', f'{w}×{h} {t}')
            await pg.click('[data-a="tab"][data-k="prog"]'); await pg.click('[data-a="progedit"]')
            await shot(pg, f'{tag}-prog-edit', f'{w}×{h} программа: правка')
            await pg.click('[data-a="edit"][data-d="A"][data-i="0"]'); await pg.wait_for_timeout(150)
            await shot(pg, f'{tag}-edit', f'{w}×{h} правка упражнения')
            await pg.evaluate('history.back()'); await pg.wait_for_timeout(300)
            print('  «Назад» закрывает лист:', 'OK' if not await pg.query_selector('.sheet') else 'НЕТ')
            await pg.click('[data-a="tab"][data-k="today"]')
            await pg.click('[data-a="tab"][data-k="prog"]'); await pg.wait_for_timeout(150)
            await pg.click('.exl [data-a="tech"]'); await pg.wait_for_timeout(300)
            await pg.click('details.fold>summary')
            await shot(pg, f'{tag}-tech', f'{w}×{h} техника')
            await pg.evaluate('history.back()'); await pg.wait_for_timeout(200)
            if errs: print('Ошибки JS:', errs)
            await ctx.close()
        await weigh(b)
        await flow(b)
        await b.close()
    srv.shutdown()

async def weigh(b):
    """Понедельник: окно «сначала взвесься», вес уходит в Рацион (racion-v3.w)."""
    ctx = await b.new_context(viewport={'width': 360, 'height': 780}, accept_downloads=True); pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.add_init_script("(()=>{const RD=Date,fix=new RD('2026-10-05T09:40').getTime(),t0=RD.now();class FD extends RD{constructor(...a){if(a.length)super(...a);else super(fix+RD.now()-t0)}static now(){return fix+RD.now()-t0}};window.Date=FD})();")
    await pg.goto(BASE + '/'); await pg.wait_for_timeout(300)
    await pg.evaluate("localStorage.setItem('racion-v3', JSON.stringify({v:3, w:[{d:'2026-09-28', w:83.1}], done:{}}))")
    await pg.fill('#s-weight', '82,5'); await pg.click('[data-a="welcome"]'); await pg.wait_for_timeout(500)
    await pg.reload(); await pg.wait_for_selector('#tabs button')
    ok = lambda c, t: print(f'  {t}:', 'OK' if c else 'НЕТ')
    try: await pg.wait_for_selector('[data-a="weigh"]', timeout=3000)
    except Exception: pass
    ok(await pg.query_selector('[data-a="weigh"]'), 'понедельник: окно взвешивания при открытии')
    await pg.screenshot(path='/tmp/trener-weigh.png')
    await pg.fill('#wg', '82,4'); await pg.click('[data-a="weigh"]'); await pg.wait_for_timeout(200)
    r = await pg.evaluate("JSON.parse(localStorage.getItem('racion-v3'))")
    ok(r['w'] == [{'d': '2026-09-28', 'w': 83.1}, {'d': '2026-10-05', 'w': 82.4}] and r['done'] == {}, 'вес записан в Рацион, остальное не тронуто')
    await pg.reload(); await pg.wait_for_timeout(400)
    ok(not await pg.query_selector('[data-a="weigh"]'), 'второй раз в этот день не спрашивает')
    ok(await pg.query_selector('.quote'), 'фраза дня на «Сегодня»')
    await pg.click('[data-a="tab"][data-k="more"]')
    async with pg.expect_download(timeout=5000) as d: await pg.click('[data-a="export"]')
    fn = (await d.value).suggested_filename
    ok(fn.startswith('Тренер_2026-10-05_09-') and fn.endswith('.json'), f'копия скачивается: {fn}')
    if errs: print('Ошибки JS:', errs)
    await ctx.close()

async def flow(b):
    """Тренировка целиком: дни недели, старт, подходы, отдых, замена, дискомфорт, итог, продолжение после перезапуска."""
    ctx = await b.new_context(viewport={'width': 360, 'height': 780}); pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    await pg.add_init_script("(()=>{const RD=Date,fix=new RD('2026-10-06T10:00').getTime(),t0=RD.now();class FD extends RD{constructor(...a){if(a.length)super(...a);else super(fix+RD.now()-t0)}static now(){return fix+RD.now()-t0}};window.Date=FD})();")
    await pg.goto(BASE + '/'); await pg.wait_for_timeout(300)
    await pg.fill('#s-weight', '82,5'); await pg.click('[data-a="welcome"]')
    ok = lambda c, t: print(f'  {t}:', 'OK' if c else 'НЕТ')
    # дни: вчера (пн) — пропущено, стрелка назад, «Сегодня»
    await pg.click('[data-a="day"][data-k="2026-10-05"]'); ok('пропущено' in await pg.inner_text('#app') and await pg.query_selector('[data-a="start"]'), 'прошедший день: «пропущено» и «Сделать сегодня»')
    await pg.click('[data-a="wk"][data-v="-7"]'); ok('28 сентября' in await pg.inner_text('h1'), 'стрелка — прошлая неделя')
    await pg.click('.top [data-a="day"]'); ok('6 октября' in await pg.inner_text('h1'), 'кнопка «Сегодня»')
    await pg.click('[data-a="day"][data-k="2026-10-08"]'); ok('Ноги' in await pg.inner_text('#app') and not await pg.query_selector('[data-a="start"]'), 'будущий день: план без кнопки')
    await pg.click('.top [data-a="day"]')
    ok('Путь к подтягиванию' in await pg.inner_text('#app'), 'карточка подтягивания во вторник')
    # старт
    await pg.click('[data-a="start"]')
    for k in ['sleep', 'energy', 'sore']: await pg.click(f'[data-a="ck"][data-k="{k}"][data-v="1"]')
    ok(await pg.query_selector('[data-a="wo-begin"][data-light="1"]'), 'плохое самочувствие — предлагает облегчённо')
    await pg.click('[data-a="wo-begin"][data-light="1"]'); await pg.wait_for_timeout(200)
    ok('1 / 10' in await pg.inner_text('.wo-title') and 'облегчённо' in await pg.inner_text('.wo-title'), 'экран тренировки, облегчённый режим')
    ok(await pg.query_selector('details.photos:not([open])'), 'фото на экране тренировки свёрнуты')
    await pg.screenshot(path='/tmp/trener-wo-1.png', full_page=True)
    # гравитрон: 3 подхода (4−1)
    await pg.fill('#e-kg', '35'); await pg.fill('#e-reps', '8'); await pg.click('[data-a="wo-rir"][data-v="2"]'); await pg.click('[data-a="wo-log"]')
    ok(await pg.query_selector('#rest'), 'таймер отдыха после подхода')
    await pg.click('[data-a="wo-rest-add"]'); await pg.click('[data-a="wo-rest-skip"]'); ok(not await pg.query_selector('#rest'), '«+30 с» и «Хватит»')
    await pg.click('[data-a="wo-log"]'); await pg.click('[data-a="wo-dec"][data-f="kg"]'); await pg.click('[data-a="wo-log"]')
    ok((await pg.inner_text('.sets')).count('×') == 3 and '30' in await pg.inner_text('.sets'), 'три подхода, «−» снижает помощь на шаг')
    await pg.click('[data-a="wo-next"]')
    # тяга: разминка, замена, дискомфорт, заметка
    await pg.click('[data-a="wo-warm"]'); ok(await pg.query_selector('.warm.on'), 'разминочный подход отмечен')
    await pg.fill('#e-kg', '40'); await pg.fill('#e-reps', '10'); await pg.click('[data-a="wo-log"]')
    await pg.click('[data-a="wo-disc"]'); await pg.click('[data-a="dz"][data-v="Плечо"]'); await pg.click('[data-a="dl"][data-v="2"]'); await pg.click('[data-a="wo-disc-save"]')
    ok('Прибавки по этому' in await pg.inner_text('.sheet'), 'дискомфорт — без прибавки, предлагает замену')
    await pg.click('[data-a="sheetclose"]')
    await pg.click('[data-a="wo-note"]'); await pg.fill('#n-text', 'сиденье на 4'); await pg.click('[data-a="wo-note-save"]')
    await pg.click('[data-a="wo-go"][data-i="2"]')
    await pg.click('[data-a="wo-swap"]'); await pg.click('[data-a="wo-swap-to"]'); await pg.wait_for_timeout(200)
    ok('замена' in await pg.inner_text('.wo'), 'замена на сегодня')
    await pg.fill('#e-kg', '35'); await pg.fill('#e-reps', '12'); await pg.click('[data-a="wo-log"]')
    await pg.screenshot(path='/tmp/trener-wo-2.png', full_page=True)
    # перезапуск посреди тренировки
    await pg.reload(); await pg.wait_for_timeout(500)
    ok(await pg.query_selector('[data-a="resume"]'), 'после перезапуска — «Продолжить тренировку»')
    await pg.click('[data-a="resume"]'); ok('3 / 10' in await pg.inner_text('.wo-title'), 'продолжает с того же упражнения')
    for w_, h_ in [(780, 360), (360, 780)]:
        await pg.set_viewport_size({'width': w_, 'height': h_}); await pg.wait_for_timeout(100)
        wide = await pg.evaluate(WIDE); ok(not wide, f'{w_}×{h_} экран тренировки не вылезает {wide or ""}')
        await pg.screenshot(path=f'/tmp/trener-wo-{w_}.png', full_page=True)
    # голос: разбор без микрофона
    v = await pg.evaluate("JSON.stringify(parseSpoken('шестьдесят два с половиной на восемь запас два','w'))")
    ok(v == '{"rir":2,"kg":62.5,"reps":8}', 'голос: «шестьдесят два с половиной на восемь, запас два»')
    # итог
    await pg.click('[data-a="wo-finish"]'); await pg.wait_for_timeout(300)
    ok(await pg.query_selector('.sum'), 'итог тренировки')
    await pg.screenshot(path='/tmp/trener-wo-sum.png', full_page=True)
    await pg.click('[data-a="sheetclose"]')
    ok('сделано' in await pg.inner_text('#app') and 'сиденье на 4' in await pg.inner_text('#app'), 'день показывает сделанное и заметку')
    await pg.screenshot(path='/tmp/trener-wo-done.png', full_page=True)
    await pg.click('[data-a="wdel"]'); await pg.wait_for_timeout(200)
    ok('сделано' not in await pg.inner_text('#app'), 'удалить тренировку')
    await pg.click('[data-a="start"]'); await pg.click('[data-a="wo-begin"]')
    await pg.fill('#e-kg', '30'); await pg.fill('#e-reps', '8'); await pg.click('[data-a="wo-log"]')
    await pg.click('[data-a="wo-cancel"]'); await pg.wait_for_timeout(200)
    n = await pg.evaluate("D.workouts.length + (D.active ? 1 : 0)")
    ok(n == 0 and await pg.query_selector('[data-a="start"]'), 'отменить без записи — в истории пусто')
    # переезд программы v2 → v3: скручивания в тренажёре → на скамье
    await pg.evaluate("(async()=>{const p=defaultProgram();p.v=2;p.days.A.items[8].ex='crunch_m';p.days.A.items[8].step=5;await dbPut('kv',{id:'program',val:p})})()")
    await pg.reload(); await pg.wait_for_timeout(500)
    ok(await pg.evaluate("D.program.v===3 && !JSON.stringify(D.program).includes('crunch_m') && D.program.days.A.items[8].ex==='bench_crunch'"), 'старая программа: скручивания заменены')
    if errs: print('Ошибки JS:', errs)
    await ctx.close()

asyncio.run(main())
