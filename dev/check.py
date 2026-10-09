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
        print('Фото в технике под спойлером:', 'OK' if await pg.query_selector('.sheet details.photos:not([open])') else 'НЕТ')
        await pg.click('.sheet details.photos>summary'); await pg.wait_for_timeout(300)
        print('Схема мышц в «Технике» видна сразу:', 'OK' if await pg.evaluate("!!document.querySelector('.sheet > .mmap .mm-p') && document.querySelector('.sheet > .mmap').offsetHeight>100") else 'НЕТ')
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
        await sync(b)
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
    ok('Взвесился — 82,4 кг' in await pg.inner_text('#app'), 'на карточке понедельника: «Взвесился — 82,4 кг»')
    await pg.click('[data-a="wk"][data-v="7"]')
    ok('сначала взвесься' in await pg.inner_text('#app'), 'следующий понедельник: напоминание видно заранее')
    ok(await pg.query_selector('.quote'), 'фраза дня на «Сегодня»')
    await pg.click('[data-a="tab"][data-k="more"]')
    async with pg.expect_download(timeout=5000) as d: await pg.click('[data-a="export"]')
    fn = (await d.value).suggested_filename
    ok(fn.startswith('Тренер_2026-10-05_09-') and fn.endswith('.json'), f'копия скачивается: {fn}')
    if errs: print('Ошибки JS:', errs)
    await ctx.close()

async def sync(b):
    """Копия в GitHub: токен из Рациона (racion-gh), после тренировки — PUT trener/latest.json и trener/history/…; данные Рациона не трогаются."""
    ctx = await b.new_context(viewport={'width': 360, 'height': 780}); pg = await ctx.new_page(); errs = []; puts = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    async def gh(route):
        r = route.request
        if r.method == 'PUT': puts.append(r.url.split('/contents/')[1]); await route.fulfill(status=201, body='{}')
        else: await route.fulfill(status=404, body='{}')
    await ctx.route('https://api.github.com/**', gh)
    await pg.add_init_script("(()=>{const RD=Date,fix=new RD('2026-10-06T10:00').getTime(),t0=RD.now();class FD extends RD{constructor(...a){if(a.length)super(...a);else super(fix+RD.now()-t0)}static now(){return fix+RD.now()-t0}};window.Date=FD})();")
    await pg.goto(BASE + '/'); await pg.wait_for_timeout(300)
    await pg.evaluate("localStorage.setItem('racion-gh', JSON.stringify({repo:'godoffear/racion-data', token:'github_pat_'+'x'.repeat(40), last:1}))")
    await pg.fill('#s-weight', '82,5'); await pg.click('[data-a="welcome"]'); await pg.wait_for_timeout(300)
    ok = lambda c, t: print(f'  {t}:', 'OK' if c else 'НЕТ')
    await pg.click('[data-a="start"]'); await pg.click('[data-a="wo-begin"]')
    await pg.fill('#e-kg', '30'); await pg.fill('#e-reps', '8'); await pg.click('[data-a="wo-log"]')
    await pg.click('[data-a="wo-finish"]'); await pg.wait_for_timeout(1500)
    ok(puts == ['trener/latest.json', 'trener/history/trener_2026-10-06.json'], f'после тренировки ушло в GitHub: {puts}')
    cfg = await pg.evaluate("JSON.parse(localStorage.getItem('racion-gh'))")
    ok(cfg.get('last') == 1 and 'err' not in cfg, 'настройки Рациона не тронуты')
    await pg.click('.sheet-x'); await pg.click('[data-a="tab"][data-k="more"]')
    ok('Отправлено' in await pg.inner_text('#app'), '«Ещё»: «Копия в GitHub — отправлено …»')
    # звук отдыха: 10 звуков, выбор и громкость запоминаются, писк выключается
    ok(await pg.evaluate("document.querySelectorAll('ul.snd>li').length===10"), '«Звук отдыха»: 10 звуков в списке')
    await pg.click('[data-a="snd-pick"][data-id="marimba"]'); await pg.click('[data-a="snd-vol"][data-v="3"]'); await pg.click('[data-a="snd-pips"]')
    st = await pg.evaluate("JSON.stringify([D.settings.sound,D.settings.soundVol,D.settings.pips])")
    ok(st == '["marimba",3,false]', f'выбор звука, громкость и писк сохранились: {st}')
    err = await pg.evaluate("(()=>{try{for(const s of SOUNDS)playSound(s.id);playAlarmSound();playPip();return ''}catch(e){return String(e)}})()")
    ok(err == '', f'все звуки проигрываются без ошибок {err}')
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
    ok(await pg.evaluate("(()=>{const b=document.querySelector('[data-a=start]'),l=document.querySelector('.card .exl');return b&&l&&(b.compareDocumentPosition(l)&Node.DOCUMENT_POSITION_FOLLOWING)})()"), '«Начать тренировку» над списком')
    # старт
    await pg.click('[data-a="start"]')
    for k in ['sleep', 'energy', 'sore']: await pg.click(f'[data-a="ck"][data-k="{k}"][data-v="1"]')
    ok(await pg.query_selector('[data-a="wo-begin"][data-light="1"]'), 'плохое самочувствие — предлагает облегчённо')
    await pg.click('[data-a="wo-begin"][data-light="1"]'); await pg.wait_for_timeout(200)
    ok('1 / 6' in await pg.inner_text('.wo-title') and 'облегчённо' in await pg.inner_text('.wo-title'), 'экран тренировки, облегчённый режим')
    ok(await pg.query_selector('details.photos:not([open])'), 'фото на экране тренировки свёрнуты')
    c1 = await pg.inner_text('#wo-clock'); await pg.wait_for_timeout(2100); c2 = await pg.inner_text('#wo-clock')
    ok(c1 != c2 and ':' in c2, f'часы тренировки идут ({c1} → {c2})')
    # простой 10 минут → пауза, часы стоят, «Продолжить» — время простоя не считается
    await pg.evaluate("D.active.start -= 12*60000; D.active.lastAct = Date.now() - 11*60000"); await pg.wait_for_timeout(1300)
    ok(await pg.query_selector('[data-a="wo-resume"]'), 'нет действий 10 мин — окно «Тренировка на паузе»')
    c3 = await pg.inner_text('#wo-clock'); await pg.wait_for_timeout(1300); c4 = await pg.inner_text('#wo-clock')
    ok(c3 == c4, f'на паузе часы стоят ({c3})')
    await pg.click('[data-a="wo-resume"]'); await pg.wait_for_timeout(1200)
    ok(not await pg.query_selector('.sheet') and await pg.evaluate("D.active.paused > 10*60000 && !D.active.pauseAt"), '«Продолжить» — простой не идёт в время тренировки')
    await pg.screenshot(path='/tmp/trener-wo-1.png', full_page=True)
    # гравитрон: 3 подхода (4−1)
    await pg.fill('#e-kg', '35'); await pg.fill('#e-reps', '8'); await pg.click('[data-a="wo-log"]')
    ok(await pg.query_selector('#rest'), 'таймер отдыха после подхода')
    await pg.click('[data-a="wo-rest-add"]'); await pg.click('[data-a="wo-rest-skip"]'); ok(not await pg.query_selector('#rest'), '«+30 с» и «Хватит»')
    await pg.click('[data-a="wo-log"]'); await pg.click('[data-a="wo-dec"][data-f="kg"]'); await pg.click('[data-a="wo-log"]')
    ok((await pg.inner_text('.sets')).count('×') == 3 and '30' in await pg.inner_text('.sets'), 'три подхода, «−» снижает помощь на шаг')
    ok(await pg.query_selector('#auto-t'), 'после последнего подхода — «Следующее упражнение через 7 с»')
    await pg.click('[data-a="wo-stay"]'); await pg.wait_for_timeout(1500)
    ok(not await pg.query_selector('#auto-t') and '1 / 6' in await pg.inner_text('.wo-title'), '«Остаться» отменяет переход')
    await pg.click('[data-a="wo-log"]'); await pg.wait_for_timeout(8000)
    ok(False, 'сверх плана не переходит') if '2 / 6' in await pg.inner_text('.wo-title') else ok(True, 'подход сверх плана — без автоперехода')
    await pg.click('[data-a="wo-set"][data-i="3"]'); await pg.click('[data-a="wo-set-del"]'); await pg.click('[data-a="wo-set"][data-i="2"]'); await pg.click('[data-a="wo-set-del"]')
    await pg.click('[data-a="wo-log"]'); await pg.wait_for_timeout(7600)
    ok('2 / 6' in await pg.inner_text('.wo-title') and await pg.query_selector('#rest'), 'через 7 с сам перешёл к следующему, отдых идёт')
    # тяга: разминка, замена, дискомфорт, заметка
    await pg.click('[data-a="wo-warm"]'); ok(await pg.query_selector('.warm.on') and 'разминка' in await pg.inner_text('.warm.on'), 'разминка отмечена и свернулась')
    ok(await pg.query_selector('.wmode .chip.on'), 'переключатель «Общий вес / На каждую сторону» на экране упражнения')
    await pg.click('.wmode [data-v="each"]'); await pg.wait_for_timeout(150)
    ok('сторона' in await pg.inner_text('.entry'), 'режим «На каждую сторону»: подпись поля «Кг (сторона)»')
    await pg.click('.wmode [data-v="total"]'); await pg.wait_for_timeout(150)
    await pg.fill('#e-kg', '40'); await pg.fill('#e-reps', '10'); await pg.click('[data-a="wo-log"]')
    await pg.click('[data-a="wo-disc"]'); await pg.click('[data-a="dz"][data-v="Плечо"]'); await pg.click('[data-a="dl"][data-v="2"]'); await pg.click('[data-a="wo-disc-save"]')
    ok('Прибавки по этому' in await pg.inner_text('.sheet'), 'дискомфорт — без прибавки, предлагает замену')
    await pg.click('[data-a="sheetclose"]')
    await pg.fill('#n-text', 'сиденье на 4'); await pg.wait_for_timeout(500)
    await pg.click('[data-a="wo-go"][data-i="2"]')
    await pg.click('[data-a="wo-swap"]'); await pg.click('[data-a="wo-swap-view"]'); await pg.wait_for_timeout(300)
    ok(await pg.query_selector('.sheet details.photos:not([open])') and await pg.query_selector('.sheet [data-a="wo-swap-to"]'), 'замена: просмотр, фото под спойлером, «Выбрать»')
    await pg.click('.sheet details.photos>summary'); await pg.wait_for_timeout(300)
    await pg.screenshot(path='/tmp/trener-swapview.png')
    await pg.click('.sheet [data-a="wo-swap"]'); ok(await pg.query_selector('.sheet [data-a="wo-swap-view"]'), '«← К списку»')
    await pg.click('[data-a="wo-swap-view"]'); await pg.click('.sheet [data-a="wo-swap-to"]'); await pg.wait_for_timeout(200)
    ok('замена' in await pg.inner_text('.wo'), 'замена на сегодня')
    await pg.fill('#e-kg', '35'); await pg.fill('#e-reps', '12'); await pg.click('[data-a="wo-log"]')
    await pg.screenshot(path='/tmp/trener-wo-2.png', full_page=True)
    # перезапуск посреди тренировки
    await pg.reload(); await pg.wait_for_timeout(500)
    ok(await pg.query_selector('[data-a="resume"]'), 'после перезапуска — «Продолжить тренировку»')
    await pg.click('[data-a="resume"]'); ok('3 / 6' in await pg.inner_text('.wo-title'), 'продолжает с того же упражнения')
    # таймер для виса (упражнение на время): до конца — пишется цель, «Стоп» — сколько прошло
    await pg.evaluate("D.active.items[5].ex='plank'; D.active.cur=5; entry=null; render()"); await pg.wait_for_timeout(200)
    await pg.fill('#e-sec', '3'); await pg.click('[data-a="wo-hold"]'); await pg.wait_for_timeout(4500)
    ok('3 с' in await pg.inner_text('.sets'), 'таймер планки: дошёл до конца — записал 3 с')
    if await pg.query_selector('[data-a="wo-rest-skip"]'): await pg.click('[data-a="wo-rest-skip"]')
    await pg.fill('#e-sec', '30'); await pg.click('[data-a="wo-hold"]'); await pg.wait_for_timeout(2200); await pg.click('[data-a="wo-hold-stop"]'); await pg.wait_for_timeout(200)
    ok('2 с' in await pg.inner_text('.sets'), '«Стоп» — записал, сколько прошло (2 с)')
    await pg.click('[data-a="wo-go"][data-i="2"]')
    for w_, h_ in [(780, 360), (360, 780)]:
        await pg.set_viewport_size({'width': w_, 'height': h_}); await pg.wait_for_timeout(100)
        wide = await pg.evaluate(WIDE); ok(not wide, f'{w_}×{h_} экран тренировки не вылезает {wide or ""}')
        await pg.screenshot(path=f'/tmp/trener-wo-{w_}.png', full_page=True)
    ok(not await pg.query_selector('[data-a="wo-mic"], .chips.rir'), 'нет голоса и «Запаса»')
    await pg.click('.wo-name'); await pg.wait_for_timeout(200); await pg.click('.sheet-x'); await pg.wait_for_timeout(200)
    ok(not await pg.query_selector('.sheet'), 'крестик закрывает «Технику»')
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
    # переезд старой программы → v4 (≈ час), дни недели сохраняются
    await pg.evaluate("(async()=>{const p=defaultProgram();p.v=3;p.week[3]='A';p.days.A.items.push({ex:'crunch_m',sets:3,lo:10,hi:15,rest:60});await dbPut('kv',{id:'program',val:p})})()")
    await pg.reload(); await pg.wait_for_timeout(500)
    ok(await pg.evaluate("D.program.v===6 && !JSON.stringify(D.program).includes('crunch_m') && D.program.week[3]==='A' && Object.values(D.program.days).every(d=>dayMinutes(d)<=62)"), 'старая программа → новая (≈ час), дни недели сохранены')
    # прогрессия: после тренировки с 20×10 во всех подходах «пора прибавить» → 22,5, поле веса уже заполнено
    prog = await pg.evaluate("""(()=>{D.workouts=[{id:'p1',date:'2026-10-05',day:'A',done:true,items:[{ex:'bench',plan:{sets:4,lo:6,hi:10},sets:[20,20,20,20].map(k=>({kg:k,reps:10}))}]}];
      const it=D.program.days.A.items[0]; const r=progOf('bench',it,false); D.workouts=[]; return r.kind==='up'&&r.kg===22.5})()""")
    ok(prog, 'прогрессия: 20×10 во всех подходах → «пора прибавить» 22,5 кг')
    # программа v6: состав дней, суперсеты, без grav_neg / face_pull / plank
    ok(await pg.evaluate("""(()=>{const P=defaultProgram(), ex=d=>P.days[d].items.map(x=>x.ex).join();
      return ex('A')==='bench,calf,incl_db,sh_press,fly,lat_raise,pushdown' && P.days.A.items[1].ss===true
        && ex('B')==='gravitron,row,lat_pd,rear_fly,curl,rev_crunch' && ex('C')==='leg_press,leg_curl,leg_ext,hyper,calf,rev_crunch'
        && ex('D')==='leg_press,chest_press,gravitron,row,lat_raise,curl,rope_ovh' && P.days.D.items[6].ss===true
        && P.days.B.items[4].sets===4 && P.week[1]==='A' && P.week[2]==='B' && P.week[4]==='C' && P.week[5]==='D'})()"""), 'программа v6: дни A–D по решению Андрея, суперсеты calf и rope_ovh')
    # дополнительные подходы гравитрона в конце тренировки: вне плана, без «осталось», не влияют на прогрессию
    await pg.evaluate("window.confirm=()=>true; startWorkout('B'); D.active.cur=D.active.items.length-1; entry=null; render()"); await pg.wait_for_timeout(200)
    ok(await pg.query_selector('[data-a="wo-extra"]'), 'на последнем экране есть «+ Гравитрон — дополнительные подходы»')
    await pg.click('[data-a="wo-extra"]'); await pg.wait_for_timeout(200)
    ok('Дополнительный подход 1' in await pg.inner_text('.entry'), 'доп. подход: подпись «Дополнительный подход 1»')
    await pg.fill('#e-kg', '30'); await pg.fill('#e-reps', '6'); await pg.click('[data-a="wo-log"]'); await pg.wait_for_timeout(200)
    await pg.evaluate("D.active.items[0].sets=[{kg:35,reps:10,t:Date.now()}]; saveActive()")
    await pg.click('[data-a="wo-finish"]'); await pg.wait_for_timeout(400)
    ex_ok = await pg.evaluate("""(()=>{const w=D.workouts[D.workouts.length-1]; const x=w.items.find(i=>i.extra);
      return !!x && x.ex==='gravitron' && x.sets.length===1 && exHistory('gravitron').every(h=>!h.it.extra) && exHistory('gravitron').length===1})()""")
    ok(ex_ok, 'доп. подходы сохранены как extra и не попадают в историю прогрессии')
    await pg.click('[data-a="sheetclose"]'); await pg.evaluate("D.workouts=[]; D.active=null; saveActive()")
    # суперсет: кнопка перехода к паре и таймер отдыха основного не сбрасывается
    await pg.evaluate("startWorkout('A'); render()"); await pg.wait_for_timeout(200)
    ok('Суперсет' in await pg.inner_text('.wo'), 'суперсет: на жиме есть кнопка к «Подъёму на носки»')
    await pg.fill('#e-kg', '20'); await pg.fill('#e-reps', '8'); await pg.click('[data-a="wo-log"]')
    r0 = await pg.evaluate("D.active.restUntil")
    await pg.click('[data-a="wo-go"][data-i="1"]'); await pg.fill('#e-kg', '40'); await pg.fill('#e-reps', '12'); await pg.click('[data-a="wo-log"]')
    ok(await pg.evaluate(f"D.active.restUntil==={r0}"), 'подход суперсета не сбрасывает отдых основного упражнения')
    await pg.evaluate("D.active=null; saveActive()")
    # повторная замена подряд → предложение закрепить в программе
    await pg.evaluate("""D.workouts=[{id:'pw',date:'2026-10-01',day:'B',done:true,items:[{ex:'db_row',orig:'row',plan:{sets:3,lo:8,hi:12},sets:[{kg:20,reps:10}]}]}]; startWorkout('B'); D.active.cur=1; entry=null; render()""")
    await pg.click('[data-a="wo-swap"]'); await pg.click('[data-a="wo-swap-view"]'); await pg.click('.sheet [data-a="wo-swap-to"]'); await pg.wait_for_timeout(300)
    ok(await pg.query_selector('.sheet [data-a="wo-pin"]'), 'второй раз подряд заменили — предлагает закрепить')
    await pg.click('[data-a="wo-pin"]'); await pg.wait_for_timeout(200)
    ok(await pg.evaluate("D.program.days.B.items[1].ex!=='row' && !D.active.items[1].orig && D.program.days.D.items[3].ex==='row'"), 'закрепил замену только в этом дне')
    await pg.evaluate("D.workouts=[]; D.active=null; D.program=defaultProgram(); saveActive(); saveKV('program')")
    wm = await pg.evaluate("""(()=>{const r={}; D.settings.wmode={};
      D.workouts=[{id:'m1',date:'2026-10-01',day:'D',done:true,items:[{ex:'chest_press',plan:{sets:3,lo:8,hi:12},sets:[60,60,60].map(k=>({kg:k,reps:12,wm:'total'}))}]}];
      const it=D.program.days.D.items.find(x=>x.ex==='chest_press');
      r.total=progOf('chest_press',it).kind;
      D.settings.wmode={chest_press:'each'}; r.each=progOf('chest_press',it).kind;
      r.tEach=tonnage({items:[{ex:'chest_press',sets:[{kg:30,reps:10,wm:'each'}]}]}); r.tTot=tonnage({items:[{ex:'chest_press',sets:[{kg:30,reps:10,wm:'total'}]}]});
      r.txt=setText(EX.chest_press,{kg:30,reps:10,wm:'each'}); r.db=setText(EX.incl_db,{kg:10,reps:12}); r.dbTot=setText(EX.incl_db,{kg:20,reps:12,wm:'total'});
      D.workouts=[]; D.settings.wmode={}; return r})()""")
    ok(wm['total']=='up' and wm['each']=='start', f"режимы веса не смешиваются в подсказках: {wm['total']} → {wm['each']}")
    ok(wm['tEach']==600 and wm['tTot']==300, f"тоннаж: на каждую сторону ×2 ({wm['tEach']} против {wm['tTot']})")
    ok(wm['txt'].startswith('по 30') and wm['db']=='10 × 12' and wm['dbTot'].startswith('обе 20'), f"подписи: «{wm['txt']}», гантель «{wm['db']}», обе «{wm['dbTot']}»")
    if errs: print('Ошибки JS:', errs)
    await ctx.close()

asyncio.run(main())
