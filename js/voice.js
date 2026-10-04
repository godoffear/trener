// Голосовой ввод подхода: «шестьдесят на восемь, запас два», «помощь тридцать на шесть», «сорок пять секунд».
// parseSpoken(текст, тип упражнения) → { kg, reps, rir, sec } (чего не сказано — нет в ответе).
// Распознавание речи — встроенное в Chrome (webkitSpeechRecognition), нужен интернет.
const NUM_WORDS = {
  'ноль': 0, 'нуль': 0, 'один': 1, 'одна': 1, 'одно': 1, 'два': 2, 'две': 2, 'три': 3, 'четыре': 4, 'пять': 5, 'шесть': 6,
  'семь': 7, 'восемь': 8, 'девять': 9, 'десять': 10, 'одиннадцать': 11, 'двенадцать': 12, 'тринадцать': 13,
  'четырнадцать': 14, 'пятнадцать': 15, 'шестнадцать': 16, 'семнадцать': 17, 'восемнадцать': 18, 'девятнадцать': 19,
  'двадцать': 20, 'тридцать': 30, 'сорок': 40, 'пятьдесят': 50, 'шестьдесят': 60, 'семьдесят': 70, 'восемьдесят': 80,
  'девяносто': 90, 'сто': 100, 'двести': 200, 'триста': 300, 'четыреста': 400,
};

// Слова-числа → цифры: «шестьдесят два с половиной» → «62.5», «сто двадцать» → «120».
function wordsToDigits(text) {
  const t = text.toLowerCase().replace(/ё/g, 'е').replace(/(\d),(\d)/g, '$1.$2').replace(/[^\p{L}\d.\s]/gu, ' ');
  const out = []; let acc = null;
  const flush = () => { if (acc != null) { out.push(String(acc)); acc = null; } };
  const words = t.split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if ((w === 'с' || w === 'и') && /^половин/.test(words[i + 1] || '')) {
      if (acc != null) acc += 0.5; else if (out.length && /^\d/.test(out[out.length - 1])) out[out.length - 1] = String(+out[out.length - 1] + 0.5);
      i++; continue;
    }
    if (w in NUM_WORDS) {
      const v = NUM_WORDS[w];
      // складываем «шестьдесят» + «два», «сто» + «двадцать» + «пять»
      if (acc != null && ((acc % 100 === 0 && v < 100) || (acc % 10 === 0 && acc % 100 !== 0 && v < 10) || (acc >= 100 && acc % 10 === 0 && v < 10))) acc += v;
      else { flush(); acc = v; }
      continue;
    }
    flush();
    out.push(w);
  }
  flush();
  return out.join(' ');
}

function parseSpoken(text, type) {
  const s = ' ' + wordsToDigits(text) + ' ';
  const res = {};
  // запас: «запас 2», «в запасе 2», «резерв 2», «рир 2»
  const rir = s.match(/(?:запас\S*|резерв\S*|рир)\s+(\d+)/);
  let rest = s;
  if (rir) { res.rir = Math.min(4, +rir[1]); rest = s.replace(rir[0], ' '); }
  if (type === 'time') {
    const n = rest.match(/(\d+(?:\.\d+)?)/); if (n) res.sec = Math.round(+n[1]);
    return res;
  }
  const nums = [...rest.matchAll(/\d+(?:\.\d+)?/g)].map(m => +m[0]);
  if (type === 'bw') { if (nums.length) res.reps = Math.round(nums[0]); return res; }
  if (nums.length >= 2) { res.kg = nums[0]; res.reps = Math.round(nums[1]); }
  else if (nums.length === 1) {
    // одно число: «восемь раз» / «8 повторов» — это повторы, иначе вес
    if (/\d+\s+(раз|повтор)/.test(rest)) res.reps = Math.round(nums[0]); else res.kg = nums[0];
  }
  return res;
}

const VoiceRec = window.SpeechRecognition || window.webkitSpeechRecognition;
function listen(onText, onEnd) {
  if (!VoiceRec) { onEnd('Голосовой ввод не поддерживается в этом браузере'); return null; }
  const r = new VoiceRec();
  r.lang = 'ru-RU'; r.interimResults = false; r.maxAlternatives = 1;
  let got = false;
  r.onresult = e => { got = true; onText(e.results[0][0].transcript); };
  r.onerror = e => onEnd(e.error === 'network' ? 'Для голоса нужен интернет' : e.error === 'not-allowed' ? 'Разреши доступ к микрофону' : e.error === 'no-speech' ? 'Не расслышал' : 'Не получилось распознать');
  r.onend = () => { if (!got) onEnd(null); };
  r.start();
  return r;
}

if (typeof module !== 'undefined') module.exports = { parseSpoken, wordsToDigits };
