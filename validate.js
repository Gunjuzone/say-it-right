/* Data check for words.js. Run: node validate.js
 * Catches the errors that would teach students something wrong:
 * a syllable split that does not spell the word, or a stress index out of range.
 */
const { WORDS, PAIRS, LEVELS } = require('./words.js');

let errors = 0;
const fail = (msg) => { console.error('  FAIL ' + msg); errors++; };

for (const { id, name } of LEVELS) {
  const list = WORDS[id];
  if (!list || !list.length) { fail(`${id}: no words`); continue; }
  const seen = new Set();
  for (const e of list) {
    const joined = e.syl.join('');
    if (joined.toLowerCase() !== e.w.toLowerCase()) {
      fail(`${id} "${e.w}": syllables spell "${joined}"`);
    }
    if (!Number.isInteger(e.stress) || e.stress < 0 || e.stress >= e.syl.length) {
      fail(`${id} "${e.w}": stress ${e.stress} outside 0..${e.syl.length - 1}`);
    }
    if (e.syl.some((s) => !s.length)) fail(`${id} "${e.w}": empty syllable`);
    if (seen.has(e.w.toLowerCase())) fail(`${id} "${e.w}": duplicate in level`);
    seen.add(e.w.toLowerCase());
  }
  const pairs = PAIRS[id] || [];
  if (pairs.length < 4) fail(`${id}: only ${pairs.length} sound pairs`);
  for (const p of pairs) {
    for (const k of ['a', 'b']) {
      if (!p[k] || !/^[a-z']+$/i.test(p[k])) fail(`${id} pair: bad word "${p[k]}"`);
    }
    for (const k of ['soundA', 'soundB']) {
      const s = p[k];
      if (!Array.isArray(s) || s.length !== 2) { fail(`${id} ${p.a}/${p.b}: bad ${k}`); continue; }
      if (!/^\/.+\/$/.test(s[0])) fail(`${id} ${p.a}/${p.b}: ${k} symbol "${s[0]}" not /../`);
      if (!/^[a-z ]+$/.test(s[1])) fail(`${id} ${p.a}/${p.b}: ${k} keyword "${s[1]}" has odd characters`);
    }
    if (p.soundA[0] === p.soundB[0]) fail(`${id} ${p.a}/${p.b}: both sounds identical`);
  }
  const counts = {};
  for (const e of list) counts[e.syl.length] = (counts[e.syl.length] || 0) + 1;
  console.log(`${name}: ${list.length} words, ${pairs.length} sound pairs, ` +
    `syllable spread ${JSON.stringify(counts)}`);
}

console.log(errors ? `\n${errors} problem(s) found.` : '\nAll data checks passed.');
process.exit(errors ? 1 : 0);
