'use strict';

// Rules for visitor-added color names. Mirrors php/api/lib/Blocklist.php and uses the same word list.
const data = require('../shared/blocked-terms.json');

const ALLOW = data.allow;
const CONTAINS = data.contains;
const WHOLE = new Set(data.whole);

/** Lowercase and fold Latin-1 accents to plain letters ("Ünïcode" becomes "unicode"). */
function fold(text) {
  let out = '';
  for (const ch of text.toLowerCase()) out += data.fold[ch] ?? ch;
  return out;
}

const collapse = (s) => s.replace(/(.)\1+/g, '$1');

/** True when the name contains a blocked term. Callers must not reveal which one. */
function isBlockedName(name) {
  const folded = fold(String(name));
  let joined = folded.replace(/[^a-z]/g, '');
  for (const ok of ALLOW) joined = joined.split(ok).join('');
  const collapsed = collapse(joined);

  for (const term of CONTAINS) {
    if (joined.includes(term)) return true;
    // "fuuuck" and "shhhit": compare with repeated letters merged, but only for longer terms.
    if (term.length >= 4 && collapsed.includes(collapse(term))) return true;
  }

  for (const word of folded.split(/[^a-z]+/).filter(Boolean)) {
    const trimmed = word.replace(/(.)\1{2,}/g, '$1$1'); // "assss" becomes "ass"
    if (WHOLE.has(word) || WHOLE.has(trimmed)) return true;
  }
  return false;
}

module.exports = { isBlockedName };
