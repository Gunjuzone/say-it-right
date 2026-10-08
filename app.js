/* Say It Right - game logic.
 * No build step, no dependencies. Speech uses the browser's own voices and the
 * game stays playable if none are available.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const screens = { setup: $('setup'), play: $('play'), results: $('results') };

  const state = {
    level: 'beginner',
    mode: 'syllables',
    teams: 1,
    qty: 10,
    autoSpeak: true,
    queue: [],
    at: 0,
    score: [0, 0],
    asked: [0, 0],
    team: 0,
    missed: [],
    answered: false,
  };

  /* ---------------- speech ---------------- */
  let voice = null;
  function pickVoice() {
    if (!('speechSynthesis' in window)) return;
    const all = speechSynthesis.getVoices();
    if (!all.length) return;
    voice = all.find((v) => v.lang === 'en-GB')
      || all.find((v) => /^en-GB/i.test(v.lang))
      || all.find((v) => /^en/i.test(v.lang))
      || all[0];
  }
  if ('speechSynthesis' in window) {
    pickVoice();
    speechSynthesis.addEventListener('voiceschanged', pickVoice);
  }

  function say(text, rate) {
    if (!('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (voice) { u.voice = voice; u.lang = voice.lang; } else { u.lang = 'en-GB'; }
      u.rate = rate || 0.85;
      speechSynthesis.speak(u);
    } catch (e) { /* speech is a bonus, never block the game */ }
  }

  /* ---------------- helpers ---------------- */
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th'];

  function show(name) {
    Object.keys(screens).forEach((k) => screens[k].classList.toggle('hidden', k !== name));
  }

  /* ---------------- setup screen ---------------- */
  function buildLevelPicks() {
    const box = $('levelPicks');
    box.innerHTML = '';
    LEVELS.forEach((l) => {
      const b = document.createElement('button');
      b.className = 'pick';
      b.dataset.level = l.id;
      b.innerHTML = `<strong>${l.name}</strong><span>${WORDS[l.id].length} words</span>`;
      box.appendChild(b);
    });
  }

  function wireGroup(attr, key, cast) {
    document.querySelectorAll(`[data-${attr}]`).forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll(`[data-${attr}]`).forEach((o) => o.setAttribute('aria-pressed', 'false'));
        btn.setAttribute('aria-pressed', 'true');
        state[key] = cast ? cast(btn.dataset[attr]) : btn.dataset[attr];
      });
    });
  }

  function markGroup(attr, value) {
    document.querySelectorAll(`[data-${attr}]`).forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset[attr] === String(value)));
    });
  }

  /* ---------------- question building ---------------- */
  function syllableQ(entry) {
    const n = entry.syl.length;
    const choices = [1, 2, 3, 4, 5].filter((c) => Math.abs(c - n) <= 2);
    return {
      kind: 'syllables',
      word: entry.word,
      prompt: 'How many syllables?',
      display: `<span class="syl">${entry.word}</span>`,
      speakText: entry.word,
      options: choices.map((c) => ({ label: String(c), correct: c === n })),
      answerText: `${entry.word} has ${n} ${n === 1 ? 'syllable' : 'syllables'}: ` +
        entry.syl.join(' &middot; '),
    };
  }

  function stressQ(entry) {
    if (entry.syl.length === 1) return null;
    return {
      kind: 'stress',
      word: entry.word,
      prompt: 'Which syllable is stressed?',
      display: entry.syl.map((s) => `<span class="syl">${s}</span>`)
        .join('<span class="dot">&middot;</span>'),
      speakText: entry.word,
      options: entry.syl.map((s, i) => ({
        label: s, sub: ORDINAL[i], correct: i === entry.stress,
      })),
      answerText: `The stress is on <em>${entry.syl[entry.stress].toUpperCase()}</em>: ` +
        entry.syl.map((s, i) => (i === entry.stress ? s.toUpperCase() : s)).join(' &middot; '),
    };
  }

  function soundQ(pair) {
    const first = Math.random() < 0.5;
    const target = first ? 'a' : 'b';
    const sound = first ? pair.soundA : pair.soundB;
    const opts = shuffle([
      { label: pair.a, correct: target === 'a' },
      { label: pair.b, correct: target === 'b' },
    ]);
    return {
      kind: 'sounds',
      word: pair[target],
      prompt: `Which word has the sound ${sound[0]} as in "${sound[1]}"?`,
      display: `<span class="syl">${sound[0]}</span>`,
      speakText: pair[target],
      options: opts,
      answerText: `${pair[target]} has ${sound[0]} as in "${sound[1]}". ` +
        `The other word is ${first ? pair.b : pair.a} ` +
        `${(first ? pair.soundB : pair.soundA)[0]}.`,
      hideSpeakFirst: true,
    };
  }

  function buildQueue() {
    const words = WORDS[state.level].map((e) => ({ word: e.w, syl: e.syl, stress: e.stress }));
    const pairs = PAIRS[state.level] || [];
    const out = [];

    const makers = {
      syllables: () => shuffle(words).map(syllableQ),
      stress: () => shuffle(words).map(stressQ).filter(Boolean),
      sounds: () => shuffle(pairs).map(soundQ),
    };

    if (state.mode === 'mixed') {
      const pools = [makers.syllables(), makers.stress(), makers.sounds()];
      let i = 0;
      while (out.length < state.qty) {
        const pool = pools[i % pools.length];
        if (pool.length) out.push(pool.shift());
        else if (pools.every((p) => !p.length)) break;
        i++;
      }
      return shuffle(out).slice(0, state.qty);
    }

    const pool = makers[state.mode]();
    while (out.length < state.qty && pool.length) out.push(pool.shift());
    return out;
  }

  /* ---------------- play ---------------- */
  function startGame() {
    state.queue = buildQueue();
    if (!state.queue.length) return;
    state.at = 0;
    state.score = [0, 0];
    state.asked = [0, 0];
    state.team = 0;
    state.missed = [];
    $('turn').classList.toggle('hidden', state.teams !== 2);
    show('play');
    render();
  }

  function render() {
    const q = state.queue[state.at];
    state.answered = false;

    $('progress').textContent = `Question ${state.at + 1} of ${state.queue.length}`;
    $('turn').textContent = state.team === 0 ? 'Team A' : 'Team B';
    $('scores').textContent = state.teams === 2
      ? `A ${state.score[0]} - ${state.score[1]} B`
      : `Score ${state.score[0]} / ${state.asked[0]}`;

    $('prompt').innerHTML = q.prompt;
    $('display').innerHTML = q.display;
    $('feedback').textContent = '';
    $('feedback').className = 'feedback';
    $('next').classList.add('hidden');

    const box = $('options');
    box.innerHTML = '';
    q.options.forEach((o, i) => {
      const b = document.createElement('button');
      b.className = 'opt';
      b.innerHTML = (o.sub ? `<span class="num">${o.sub}</span>` : '') + o.label;
      b.addEventListener('click', () => answer(i));
      box.appendChild(b);
    });

    if (state.autoSpeak && q.speakText) say(q.speakText);
  }

  function answer(i) {
    if (state.answered) return;
    state.answered = true;

    const q = state.queue[state.at];
    const picked = q.options[i];
    const buttons = Array.from($('options').children);

    buttons.forEach((b, j) => {
      b.disabled = true;
      if (q.options[j].correct) b.classList.add('right');
      else if (j === i) b.classList.add('wrong');
    });

    const t = state.teams === 2 ? state.team : 0;
    state.asked[t]++;
    if (picked.correct) {
      state.score[t]++;
      $('feedback').innerHTML = 'Correct. ' + q.answerText;
      $('feedback').className = 'feedback ok';
    } else {
      $('feedback').innerHTML = 'Not quite. ' + q.answerText;
      $('feedback').className = 'feedback no';
      state.missed.push(q);
    }

    if (q.speakText) say(q.speakText, 0.72);
    $('scores').textContent = state.teams === 2
      ? `A ${state.score[0]} - ${state.score[1]} B`
      : `Score ${state.score[0]} / ${state.asked[0]}`;
    $('next').classList.remove('hidden');
    $('next').focus();
  }

  function nextQuestion() {
    if (!state.answered) return;
    state.at++;
    if (state.teams === 2) state.team = state.team === 0 ? 1 : 0;
    if (state.at >= state.queue.length) finish();
    else render();
  }

  function finish() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    const total = state.score[0] + state.score[1];
    const asked = state.asked[0] + state.asked[1];

    if (state.teams === 2) {
      const [a, b] = state.score;
      $('resultHead').textContent = a === b ? 'A draw' : (a > b ? 'Team A wins' : 'Team B wins');
      $('resultLine').textContent = `Team A ${a}, Team B ${b}`;
    } else {
      $('resultHead').textContent = 'Round finished';
      const pct = asked ? Math.round((total / asked) * 100) : 0;
      $('resultLine').textContent = `${total} out of ${asked} correct (${pct}%)`;
    }

    const review = $('review');
    review.innerHTML = '';
    state.missed.forEach((q) => {
      const d = document.createElement('div');
      d.className = 'miss';
      d.innerHTML = `<b>${q.word}</b> <small>${q.answerText}</small>`;
      review.appendChild(d);
    });

    show('results');
  }

  /* ---------------- wiring ---------------- */
  buildLevelPicks();
  wireGroup('level', 'level');
  wireGroup('mode', 'mode');
  wireGroup('teams', 'teams', Number);
  markGroup('level', state.level);
  markGroup('mode', state.mode);
  markGroup('teams', state.teams);

  $('qty').addEventListener('change', (e) => { state.qty = Number(e.target.value); });
  $('autoSpeak').addEventListener('change', (e) => { state.autoSpeak = e.target.checked; });
  $('start').addEventListener('click', startGame);
  $('next').addEventListener('click', nextQuestion);
  $('speak').addEventListener('click', () => {
    const q = state.queue[state.at];
    if (q && q.speakText) say(q.speakText);
  });
  $('quit').addEventListener('click', finish);
  $('again').addEventListener('click', startGame);
  $('change').addEventListener('click', () => show('setup'));

  document.addEventListener('keydown', (e) => {
    if (screens.play.classList.contains('hidden')) return;
    if (e.key === ' ') {
      e.preventDefault();
      const q = state.queue[state.at];
      if (q && q.speakText) say(q.speakText);
      return;
    }
    if (e.key === 'Enter') { e.preventDefault(); nextQuestion(); return; }
    const n = Number(e.key);
    if (n >= 1 && n <= 5 && !state.answered) {
      const b = $('options').children[n - 1];
      if (b) b.click();
    }
  });
}());
