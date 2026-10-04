// Тесты разбора голоса: node dev/test_voice.js
global.window = {};
const { parseSpoken } = require('../js/voice.js');
const cases = [
  ['шестьдесят на восемь запас два', 'w', { kg: 60, reps: 8, rir: 2 }],
  ['шестьдесят два с половиной на шесть', 'w', { kg: 62.5, reps: 6 }],
  ['60 на 8 запас 1', 'w', { kg: 60, reps: 8, rir: 1 }],
  ['62,5 на 10', 'w', { kg: 62.5, reps: 10 }],
  ['сто двадцать на двенадцать в запасе три', 'w', { kg: 120, reps: 12, rir: 3 }],
  ['сто двадцать пять на десять', 'w', { kg: 125, reps: 10 }],
  ['помощь тридцать на шесть', 'assist', { kg: 30, reps: 6 }],
  ['двенадцать раз запас один', 'bw', { reps: 12, rir: 1 }],
  ['восемь раз', 'w', { reps: 8 }],
  ['сорок пять секунд', 'time', { sec: 45 }],
  ['семь с половиной на пятнадцать', 'w', { kg: 7.5, reps: 15 }],
  ['двадцать две с половиной на восемь резерв ноль', 'w', { kg: 22.5, reps: 8, rir: 0 }],
];
let bad = 0;
for (const [t, type, want] of cases) {
  const got = parseSpoken(t, type), norm = o => JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]])), ok = norm(got) === norm(want);
  if (!ok) bad++;
  console.log(ok ? 'OK  ' : 'FAIL', t, '→', JSON.stringify(got), ok ? '' : 'ждал ' + JSON.stringify(want));
}
process.exit(bad ? 1 : 0);
