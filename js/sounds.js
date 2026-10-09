// Сигнал конца отдыха и конца таймера планки: 10 звуков на выбор, собираются программно (Web Audio), без файлов.
// Выбор и громкость — в «Ещё» → «Звук отдыха»: D.settings.sound / soundVol (1 тихо, 2 средне, 3 громко) / pips (писк за 3-2-1 с).
// В конце всей тренировки звука нет (Андрей не хочет).
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
// Одна нота: быстрая атака, плавное затухание — без щелчков
function note(ctx, t, f, dur, g, type = 'sine', f2) {
  const o = ctx.createOscillator(), a = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  a.gain.setValueAtTime(0.0001, t); a.gain.exponentialRampToValueAtTime(g, t + 0.012); a.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(a); a.connect(ctx.destination); o.start(t); o.stop(t + dur + 0.03);
}
const NOTE = { C4: 262, D4: 294, E4: 330, G4: 392, A4: 440, C5: 523, D5: 587, E5: 659, G5: 784, A5: 880, C6: 1047 };
// play(ctx, t0, g) → длительность звука в секундах; g — громкость (пик), у каждого звука свой запас
const SOUNDS = [
  { id: 'drop', name: 'Капля', play(c, t, g) { note(c, t, 1300, 0.16, g * 1.4, 'sine', 650); note(c, t + 0.28, 1300, 0.16, g * 1.4, 'sine', 650); return 0.5; } },
  { id: 'bell', name: 'Колокольчик', play(c, t, g) { [[1175, 0], [1568, 0.22]].forEach(([f, d]) => { note(c, t + d, f, 0.9, g * 0.55); note(c, t + d, f * 2.76, 0.35, g * 0.1); }); return 1.15; } },
  { id: 'gong', name: 'Мягкий гонг', play(c, t, g) { note(c, t, 196, 1.6, g * 0.6); note(c, t, 294, 1.2, g * 0.3); note(c, t, 392, 0.8, g * 0.18); return 1.6; } },
  { id: 'marimba', name: 'Маримба', play(c, t, g) { [NOTE.C5, NOTE.E5, NOTE.G5].forEach((f, i) => note(c, t + i * 0.14, f, 0.3, g * 0.85, 'triangle')); return 0.7; } },
  { id: 'pingpong', name: 'Пинг-понг', play(c, t, g) { [880, 660, 880, 660].forEach((f, i) => note(c, t + i * 0.17, f, 0.13, g, 'sine')); return 0.8; } },
  { id: 'ladder', name: 'Лесенка вверх', play(c, t, g) { [NOTE.C5, NOTE.D5, NOTE.E5, NOTE.G5].forEach((f, i) => note(c, t + i * 0.11, f, 0.22, g, 'sine')); return 0.65; } },
  { id: 'wood', name: 'Деревянный стук', play(c, t, g) { for (let i = 0; i < 3; i++) { note(c, t + i * 0.16, 900, 0.07, g * 1.1, 'triangle'); note(c, t + i * 0.16, 450, 0.09, g * 0.6, 'sine'); } return 0.5; } },
  { id: 'melody', name: 'Мелодия', play(c, t, g) { [NOTE.C5, NOTE.E5, NOTE.C5, NOTE.G5].forEach((f, i) => note(c, t + i * 0.2, f, 0.32, g, 'sine')); return 0.95; } },
  { id: 'crystal', name: 'Кристалл', play(c, t, g) { note(c, t, 1760, 0.9, g * 0.5); note(c, t + 0.07, 2349, 0.8, g * 0.35); note(c, t + 0.14, 2637, 0.7, g * 0.22); return 1; } },
  { id: 'loud', name: 'Громкий (сквозь музыку)', play(c, t, g) { for (let r = 0; r < 3; r++) [988, 1319, 1760].forEach((f, k) => note(c, t + r * 0.75 + k * 0.17, f, 0.15, g * 0.9, 'square')); return 2.2; } },
];
const VOL = [0, 0.15, 0.33, 0.6];   // тихо / средне / громко → пик сигнала
const soundId = () => (D.settings.sound && SOUNDS.some(s => s.id === D.settings.sound)) ? D.settings.sound : 'bell';
const soundVol = () => VOL[[1, 2, 3].includes(D.settings.soundVol) ? D.settings.soundVol : 2];
function playSound(id, ctxOverride, vol) {
  const c = ctxOverride || ensureAudio(); if (!c) return 0;
  const s = SOUNDS.find(x => x.id === id) || SOUNDS[1], t = c.currentTime + 0.02, v = vol != null ? vol : soundVol();
  const d = s.play(c, t, v);
  return d;
}
// Сигнал конца отдыха / таймера: выбранный звук, мягкие звуки — дважды (чтобы заметить сквозь музыку)
function playAlarmSound() {
  const c = ensureAudio(); if (!c) return;
  const id = soundId(), s = SOUNDS.find(x => x.id === id), t = c.currentTime + 0.02, v = soundVol();
  const d = s.play(c, t, v);
  if (id !== 'loud') s.play(c, t + d + 0.35, v);
}
// Писк за 3-2-1 с до конца: короткий мягкий «тик», выключается в настройках
function playPip() {
  if (D.settings.pips === false) return;
  const c = ensureAudio(); if (!c) return;
  note(c, c.currentTime + 0.01, 1000, 0.07, soundVol() * 0.7, 'sine');
}
