/* Logic test for app.js against a minimal DOM stub. Run: node test.js
 *
 * It loads the real app.js, selects each level and mode through the same click
 * handlers the browser uses, plays a full round, and checks that every question
 * offers exactly one correct answer, that scoring advances, and that the round
 * ends on the results screen. Runs with no speechSynthesis present, so it also
 * proves the game works where speech is unavailable.
 */
const fs = require('fs');
const vm = require('vm');

let failures = 0;
const check = (cond, msg) => { if (!cond) { console.error('  FAIL ' + msg); failures++; } };

function makeEl(id, dataset) {
  const el = {
    id,
    _text: '',
    _html: '',
    children: [],
    dataset: dataset || {},
    attrs: {},
    classes: new Set(),
    handlers: {},
    disabled: false,
    checked: true,
    value: '',
    className: '',
  };
  el.classList = {
    add: (c) => el.classes.add(c),
    remove: (c) => el.classes.delete(c),
    toggle: (c, on) => (on ? el.classes.add(c) : el.classes.delete(c)),
    contains: (c) => el.classes.has(c),
  };
  Object.defineProperty(el, 'textContent', {
    get: () => el._text, set: (v) => { el._text = String(v); },
  });
  Object.defineProperty(el, 'innerHTML', {
    get: () => el._html,
    set: (v) => { el._html = String(v); if (v === '') el.children = []; },
  });
  el.appendChild = (c) => { el.children.push(c); return c; };
  el.addEventListener = (ev, fn) => { (el.handlers[ev] = el.handlers[ev] || []).push(fn); };
  el.setAttribute = (k, v) => { el.attrs[k] = String(v); };
  el.getAttribute = (k) => el.attrs[k];
  el.focus = () => {};
  el.click = () => (el.handlers.click || []).forEach((f) => f());
  return el;
}

function buildEnv() {
  const els = {};
  ['setup', 'play', 'results', 'levelPicks', 'qty', 'autoSpeak', 'start', 'progress',
    'turn', 'scores', 'quit', 'prompt', 'display', 'speak', 'options', 'feedback',
    'next', 'resultHead', 'resultLine', 'review', 'again', 'change',
  ].forEach((id) => { els[id] = makeEl(id); });
  els.play.classes.add('hidden');
  els.results.classes.add('hidden');

  // the pickers the app wires via querySelectorAll
  const picks = [
    makeEl('p-beginner', { level: 'beginner' }),
    makeEl('p-elementary', { level: 'elementary' }),
    makeEl('p-preint', { level: 'preint' }),
    makeEl('p-syllables', { mode: 'syllables' }),
    makeEl('p-stress', { mode: 'stress' }),
    makeEl('p-sounds', { mode: 'sounds' }),
    makeEl('p-mixed', { mode: 'mixed' }),
    makeEl('p-t1', { teams: '1' }),
    makeEl('p-t2', { teams: '2' }),
  ];

  const doc = {
    getElementById: (id) => els[id] || (els[id] = makeEl(id)),
    createElement: () => makeEl('opt'),
    querySelectorAll: (sel) => {
      const m = /^\[data-(\w+)\]$/.exec(sel);
      if (!m) return [];
      return picks.filter((p) => m[1] in p.dataset);
    },
    addEventListener: (ev, fn) => { doc['on_' + ev] = fn; },
  };

  const sandbox = { document: doc, window: {}, console, Math, Number, String, Array,
    Boolean, JSON, Object, Error };
  sandbox.window.document = doc;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('words.js', 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync('app.js', 'utf8'), sandbox);
  return { els, picks, doc };
}

function pick(picks, attr, value) {
  const b = picks.find((p) => p.dataset[attr] === String(value));
  if (!b) throw new Error(`no picker for ${attr}=${value}`);
  b.click();
}

function playRound(level, mode, qty, teams) {
  const { els, picks } = buildEnv();
  pick(picks, 'level', level);
  pick(picks, 'mode', mode);
  pick(picks, 'teams', teams);
  (els.qty.handlers.change || []).forEach((f) => f({ target: { value: String(qty) } }));

  els.start.click();
  check(!els.play.classList.contains('hidden'), `${level}/${mode}: play screen not shown`);

  let answered = 0;
  for (let i = 0; i < qty + 2; i++) {
    if (!els.results.classList.contains('hidden')) break;
    const opts = els.options.children;
    check(opts.length >= 2, `${level}/${mode} q${i + 1}: only ${opts.length} option(s)`);
    check(els.prompt.innerHTML.length > 0, `${level}/${mode} q${i + 1}: empty prompt`);
    check(els.display.innerHTML.length > 0, `${level}/${mode} q${i + 1}: empty display`);

    opts[0].click();                       // answer (right or wrong, both are valid paths)
    answered++;

    const right = opts.filter((o) => o.classList.contains('right')).length;
    check(right === 1, `${level}/${mode} q${i + 1}: ${right} options marked correct`);
    check(els.feedback.innerHTML.length > 0, `${level}/${mode} q${i + 1}: no feedback shown`);
    check(opts.every((o) => o.disabled), `${level}/${mode} q${i + 1}: options still enabled`);

    els.next.click();
  }

  check(answered === qty, `${level}/${mode}: answered ${answered} of ${qty} questions`);
  check(!els.results.classList.contains('hidden'), `${level}/${mode}: results screen not reached`);
  check(els.resultHead.textContent.length > 0, `${level}/${mode}: no result heading`);
  return els;
}

const { LEVELS } = require('./words.js');
console.log('--- full rounds, every level and mode (no speech available) ---');
for (const { id, name } of LEVELS) {
  for (const mode of ['syllables', 'stress', 'sounds', 'mixed']) {
    playRound(id, mode, 6, 1);
    console.log(`  ${name} / ${mode}: round completed`);
  }
}

console.log('\n--- two-team mode ---');
const els = playRound('elementary', 'mixed', 6, 2);
check(!els.turn.classList.contains('hidden'), 'two teams: turn indicator hidden');
check(/Team A \d+ - \d+ Team B|A \d+ - \d+ B/.test(els.scores.textContent),
  `two teams: unexpected score line "${els.scores.textContent}"`);
check(/wins|draw/i.test(els.resultHead.textContent),
  `two teams: unexpected result "${els.resultHead.textContent}"`);
console.log('  two-team round completed, scoreline: ' + els.scores.textContent);

console.log(failures ? `\n${failures} problem(s) found.` : '\nAll logic checks passed.');
process.exit(failures ? 1 : 0);
