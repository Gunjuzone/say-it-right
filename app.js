/* mr shakir's Say It Right - game logic.
 * No dependencies, no build step. Speech uses the browser's own voices and the
 * game stays fully playable when none are available.
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
    if (!('speechSynthesis' in window) || !text) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (voice) { u.voice = voice; u.lang = voice.lang; } else { u.lang = 'en-GB'; }
      u.rate = rate || 0.85;
      speechSynthesis.speak(u);
    } catch (e) { /* speech is a bonus, never block the game */ }
  }

  /* ---------------- helpers ---------------- */
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth'];

  /* the oOo notation used on the whiteboard */
  const patternOf = (n, stress) => {
    let out = '';
    for (let i = 0; i < n; i++) out += (i === stress ? 'O' : 'o');
    return out;
  };

  function show(name) {
    Object.keys(screens).forEach((k) => screens[k].classList.toggle('hidden', k !== name));
  }

  /* word as syllable columns, each with a beat bubble above it */
  function columns(syl, stress, reveal) {
    return syl.map((s, i) => {
      const strong = reveal && i === stress;
      const quiet = reveal && i !== stress;
      const cls = 'col' + (strong ? ' strong reveal' : '') + (quiet ? ' quiet' : '');
      return `<span class="${cls}"><span class="bubble"></span><span class="syl">${s}</span></span>`;
    }).join('');
  }

  const whole = (word) => `<span class="col"><span class="syl">${word}</span></span>`;

  /* ---------------- question builders ---------------- */
  function syllableQ(e) {
    const n = e.syl.length;
    const choices = [1, 2, 3, 4, 5].filter((c) => Math.abs(c - n) <= 2);
    return {
      kind: 'syllables',
      word: e.w,
      ask: 'How many beats in this word?',
      // the split stays hidden until the answer, or the question gives itself away
      question: whole(e.w),
      reveal: columns(e.syl, e.stress, true),
      pattern: patternOf(n, e.stress),
      speak: e.w,
      options: choices.map((c) => ({ label: String(c), correct: c === n })),
      told: `<strong>${e.syl.join(' &middot; ')}</strong>, so ${n} ` +
            `${n === 1 ? 'beat' : 'beats'}.`,
      how: `${e.syl.join(' &middot; ')}, ${n} ${n === 1 ? 'beat' : 'beats'}`,
    };
  }

  function stressQ(e) {
    if (e.syl.length === 1) return null;
    return {
      kind: 'stress',
      word: e.w,
      ask: 'Which beat is the strong one?',
      question: columns(e.syl, -1, false),
      reveal: columns(e.syl, e.stress, true),
      pattern: patternOf(e.syl.length, e.stress),
      speak: e.w,
      options: e.syl.map((s, i) => ({
        label: s, tap: ORDINAL[i], correct: i === e.stress,
      })),
      told: `The strong beat is <strong>${e.syl[e.stress].toUpperCase()}</strong>: ` +
            e.syl.map((s, i) => (i === e.stress ? s.toUpperCase() : s)).join(' &middot; ') + '.',
      how: e.syl.map((s, i) => (i === e.stress ? s.toUpperCase() : s)).join(' &middot; '),
    };
  }

  function soundQ(p) {
    const first = Math.random() < 0.5;
    const key = first ? 'a' : 'b';
    const sound = first ? p.soundA : p.soundB;
    const other = first ? p.soundB : p.soundA;
    return {
      kind: 'sounds',
      word: p[key],
      ask: `Which word has this sound, as in &ldquo;${sound[1]}&rdquo;?`,
      question: `<span class="symbol">${sound[0]}</span>`,
      reveal: `<span class="symbol">${sound[0]}</span>`,
      pattern: '',
      speak: p[key],
      options: shuffle([
        { label: p.a, correct: key === 'a' },
        { label: p.b, correct: key === 'b' },
      ]),
      told: `<strong>${p[key]}</strong> has ${sound[0]} as in &ldquo;${sound[1]}&rdquo;. ` +
            `${first ? p.b : p.a} has ${other[0]} as in &ldquo;${other[1]}&rdquo;.`,
      how: `${sound[0]} as in ${sound[1]}, not ${other[0]}`,
    };
  }

  function buildQueue() {
    const words = WORDS[state.level];
    const pairs = PAIRS[state.level] || [];
    const make = {
      syllables: () => shuffle(words).map(syllableQ),
      stress: () => shuffle(words).map(stressQ).filter(Boolean),
      sounds: () => shuffle(pairs).map(soundQ),
    };

    if (state.mode === 'mixed') {
      const pools = [make.syllables(), make.stress(), make.sounds()];
      const out = [];
      let i = 0;
      while (out.length < state.qty) {
        const pool = pools[i % pools.length];
        if (pool.length) out.push(pool.shift());
        else if (pools.every((p) => !p.length)) break;
        i++;
      }
      return shuffle(out).slice(0, state.qty);
    }

    return make[state.mode]().slice(0, state.qty);
  }

  /* ---------------- play ---------------- */
  function scoreLine() {
    if (state.teams === 2) return `Team A ${state.score[0]}, Team B ${state.score[1]}`;
    if (!state.asked[0]) return '';
    return `${state.score[0]} right of ${state.asked[0]}`;
  }

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

    $('progress').textContent = `Word ${state.at + 1} of ${state.queue.length}`;
    $('turn').textContent = state.team === 0 ? 'Team A' : 'Team B';
    $('scores').textContent = scoreLine();

    $('prompt').innerHTML = q.ask;
    $('display').innerHTML = q.question;
    $('pattern').textContent = '';
    $('feedback').innerHTML = '';
    $('feedback').className = 'verdict';
    $('next').classList.add('hidden');

    const pad = $('options');
    pad.innerHTML = '';
    q.options.forEach((o, i) => {
      const b = document.createElement('button');
      b.className = 'key';
      b.innerHTML = (o.tap ? `<span class="tap">${o.tap}</span>` : '') + o.label;
      b.addEventListener('click', () => answer(i));
      pad.appendChild(b);
    });

    if (state.autoSpeak) say(q.speak);
  }

  function answer(i) {
    if (state.answered) return;
    state.answered = true;

    const q = state.queue[state.at];
    const keys = Array.prototype.slice.call($('options').children);

    keys.forEach((b, j) => {
      b.disabled = true;
      if (q.options[j].correct) b.classList.add('right');
      else if (j === i) b.classList.add('wrong');
    });

    $('display').innerHTML = q.reveal;
    $('pattern').textContent = q.pattern;

    const t = state.teams === 2 ? state.team : 0;
    state.asked[t]++;
    const right = q.options[i].correct;
    if (right) state.score[t]++;
    else state.missed.push(q);

    $('feedback').innerHTML = (right ? 'Yes. ' : 'Not this time. ') + q.told;
    $('feedback').className = 'verdict ' + (right ? 'ok' : 'no');
    $('scores').textContent = scoreLine();

    say(q.speak, 0.7);
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

    if (state.teams === 2) {
      const a = state.score[0]; const b = state.score[1];
      $('resultHead').textContent = a === b ? 'A draw' : (a > b ? 'Team A wins' : 'Team B wins');
      $('resultLine').textContent = `Team A ${a}, Team B ${b}`;
    } else {
      const got = state.score[0]; const asked = state.asked[0];
      $('resultHead').textContent = got === asked && asked > 0 ? 'All correct' : 'Round over';
      $('resultLine').textContent = `${got} right of ${asked}`;
    }

    const review = $('review');
    review.innerHTML = '';
    state.missed.forEach((q) => {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<span class="w">${q.word}</span>` +
        (q.pattern ? `<span class="pat">${q.pattern}</span>` : '') +
        `<span class="how">${q.how}</span>`;
      review.appendChild(row);
    });
    $('reviewHead').classList.toggle('hidden', state.missed.length === 0);

    show('results');
  }

  /* ---------------- setup wiring ---------------- */
  function buildLevelPicks() {
    const box = $('levelPicks');
    box.innerHTML = '';
    LEVELS.forEach((l) => {
      const b = document.createElement('button');
      b.className = 'pick';
      b.type = 'button';
      b.dataset.level = l.id;
      const n = WORDS[l.id].length;
      b.innerHTML = `<strong>${l.name}</strong><span class="pick-sub">${n} words</span>`;
      box.appendChild(b);
    });
  }

  function wireGroup(attr, key, cast) {
    document.querySelectorAll('[data-' + attr + ']').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-' + attr + ']')
          .forEach((o) => o.setAttribute('aria-pressed', 'false'));
        btn.setAttribute('aria-pressed', 'true');
        state[key] = cast ? cast(btn.dataset[attr]) : btn.dataset[attr];
      });
    });
  }

  function markGroup(attr, value) {
    document.querySelectorAll('[data-' + attr + ']').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset[attr] === String(value)));
    });
  }

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
    if (q) say(q.speak);
  });
  $('quit').addEventListener('click', finish);
  $('again').addEventListener('click', startGame);
  $('change').addEventListener('click', () => show('setup'));

  document.addEventListener('keydown', (e) => {
    if (screens.play.classList.contains('hidden')) return;
    if (e.key === ' ') {
      e.preventDefault();
      const q = state.queue[state.at];
      if (q) say(q.speak);
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
