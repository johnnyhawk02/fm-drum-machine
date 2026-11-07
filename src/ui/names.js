// fm/dm — automatic preset names: two words drawn from themed lists (French kitchen terms, puddings,
// space, geology, crystals and rocks) with the odd made-up alien word mixed in.

const NAME_WORDS = {
  cuisine: ['julienne', 'brunoise', 'chiffonade', 'roux', 'flambé', 'confit', 'sauté', 'mirepoix', 'velouté', 'bouquet',
    'garni', 'coulis', 'gratin', 'consommé', 'terrine', 'remoulade', 'beurre', 'blanc', 'noisette', 'meunière',
    'au jus', 'en croûte', 'papillote', 'brûlée', 'mousseline', 'sabayon', 'fumet', 'bisque', 'quenelle', 'duxelles',
    'chantilly', 'tuile', 'ganache', 'praline', 'mise', 'braisé', 'poché', 'glacé', 'liaison', 'nappe'],
  pudding: ['trifle', 'crumble', 'roly poly', 'sponge', 'treacle tart', 'eton mess', 'syllabub',
    'fool', 'jam tart', 'bread pudding', 'clafoutis', 'pavlova', 'tiramisu', 'cobbler', 'parfait', 'blancmange',
    'jelly', 'custard', 'rice pudding', 'sticky toffee', 'bakewell', 'tarte tatin', 'semolina', 'charlotte',
    'soufflé', 'baked alaska', 'posset', 'cranachan', 'figgy duff'],
  space: ['nebula', 'quasar', 'pulsar', 'magnetar', 'perihelion', 'aphelion', 'red giant', 'white dwarf', 'event horizon',
    'corona', 'parsec', 'light year', 'kuiper', 'oort cloud', 'supernova', 'blazar', 'redshift', 'zenith', 'nadir',
    'eclipse', 'ecliptic', 'solstice', 'apogee', 'perigee', 'lagrange', 'accretion', 'comet', 'meteor', 'aurora', 'umbra',
    'penumbra', 'albedo', 'regolith', 'transit', 'syzygy', 'neutron', 'cosmic ray', 'dark matter', 'exoplanet', 'ion tail'],
  geology: ['moraine', 'drumlin', 'esker', 'scree', 'fault line', 'strata', 'magma', 'lava tube', 'caldera', 'fumarole',
    'geyser', 'tectonic', 'subduction', 'anticline', 'syncline', 'escarpment', 'tor', 'karst', 'stalactite', 'stalagmite',
    'bedrock', 'sediment', 'alluvium', 'loess', 'tephra', 'pumice', 'mantle', 'core sample', 'fossil', 'erratic'],
  crystal: ['quartz', 'amethyst', 'citrine', 'fluorite', 'calcite', 'pyrite', 'beryl', 'topaz', 'tourmaline', 'garnet',
    'zircon', 'selenite', 'celestite', 'labradorite', 'moonstone', 'opal', 'jasper', 'agate', 'onyx', 'malachite',
    'azurite', 'lapis', 'obsidian', 'jade', 'peridot', 'spinel', 'corundum', 'rhodonite', 'apatite', 'aragonite'],
  rock: ['basalt', 'granite', 'gneiss', 'schist', 'slate', 'marble', 'shale', 'sandstone', 'limestone', 'chalk', 'flint',
    'chert', 'gabbro', 'diorite', 'andesite', 'rhyolite', 'dolomite', 'breccia', 'conglomerate', 'tuff', 'peridotite',
    'mudstone', 'ironstone', 'greywacke', 'serpentine', 'quartzite', 'hornfels', 'phyllite', 'travertine', 'gritstone'],
};
const NAME_THEMES = Object.keys(NAME_WORDS);

// portmanteau: the front of one word (up to and just past its first vowel sound) joined to the back of a
// word from another list (from a vowel in its second half): nebula + tiramisu -> nebamisu
const isV = (c) => 'aeiouyéèêâûô'.includes(c);
function frontOf(w) {
  let i = 0;
  while (i < w.length && !isV(w[i])) i++; // leading consonants
  while (i < w.length && isV(w[i])) i++; // first vowel sound
  if (i < w.length && !isV(w[i])) i++; // one consonant to close it
  if (i < 3 && w.length > 4) i = Math.min(w.length - 1, 3);
  return w.slice(0, i);
}
function backOf(w, r) {
  const starts = [];
  for (let i = Math.max(1, Math.floor(w.length / 3)); i < w.length - 1; i++) if (isV(w[i]) && !isV(w[i - 1])) starts.push(i);
  return starts.length ? w.slice(starts[r.next() % starts.length]) : w.slice(Math.floor(w.length / 2));
}
function portmanteau(r) {
  const single = (t) => NAME_WORDS[t].filter((w) => !w.includes(' ') && w.length >= 5);
  const t1 = NAME_THEMES[r.next() % NAME_THEMES.length];
  let t2 = NAME_THEMES[r.next() % NAME_THEMES.length];
  if (t2 === t1) t2 = NAME_THEMES[(NAME_THEMES.indexOf(t1) + 1) % NAME_THEMES.length];
  const a = single(t1), b = single(t2);
  let f = frontOf(a[r.next() % a.length]);
  let k = backOf(b[r.next() % b.length], r);
  if (isV(f[f.length - 1]) && isV(k[0])) k = k.slice(1);
  if (f[f.length - 1] === k[0]) k = k.slice(1);
  return f + k;
}

// syllables: consonants lead into the next vowel run, trailing consonants stay on the last one
function sylls(w) {
  return w.match(/[^aeiouyéèêâûô]*[aeiouyéèêâûô]+(?:[^aeiouyéèêâûô]+$)?/g) || [w];
}
// chop a word into syllables and shuffle them with syllables from another themed word
function scramble(w, r) {
  const pool = NAME_THEMES.flatMap((t) => NAME_WORDS[t]).filter((x) => !x.includes(' ') && x.length >= 5);
  for (let tries = 0; tries < 8; tries++) {
    const mine = sylls(w), theirs = sylls(pool[r.next() % pool.length]);
    const bits = [...mine, ...theirs.filter(() => r.next() % 2)];
    for (let i = bits.length - 1; i > 0; i--) {
      const j = r.next() % (i + 1);
      [bits[i], bits[j]] = [bits[j], bits[i]];
    }
    const out = bits.slice(0, 2 + (r.next() % 3)).join('');
    if (out !== w && out.length >= 4 && out.length <= 13) return out;
  }
  return w;
}
function presetNameRaw(seed) {
  const r = new Rng((seed * 2654435761 + 7) >>> 0);
  const pick = (list) => list[r.next() % list.length];
  const word = () => pick(NAME_WORDS[pick(NAME_THEMES)]);
  const alien = () => alienName(r.next()).split(' ')[r.next() % 2];
  // an alien word blended with a real one (either way round)
  const alienMix = () => {
    const real = pick(NAME_WORDS[pick(NAME_THEMES)].filter((w) => !w.includes(' ') && w.length >= 5));
    const a = alien();
    let f, b;
    if (r.next() % 2) { f = frontOf(a); b = backOf(real, r); } else { f = frontOf(real); b = backOf(a, r); }
    if (isV(f[f.length - 1]) && isV(b[0])) b = b.slice(1);
    return (f + b).length >= 4 ? f + b : a;
  };
  const k = r.next() % 20;
  let name;
  if (k < 4) name = alienMix() + ' ' + word(); // alien/real blend and a real term
  else if (k < 7) name = portmanteau(r) + ' ' + alien();
  else if (k < 10) name = alien() + ' ' + alienMix();
  else if (k < 13) name = word() + ' ' + alien();
  else if (k < 15) name = alienName(r.next()); // fully alien
  else if (k < 17) name = portmanteau(r) + ' ' + word();
  else if (k < 19) name = word() + ' ' + word();
  else name = portmanteau(r) + ' ' + portmanteau(r);
  if (r.next() % 2) return name;
  // half the time: chop at least one word into syllables and scramble it with others
  const parts = name.split(' ');
  const i = r.next() % parts.length;
  parts[i] = scramble(parts[i], r);
  if (parts.length > 1 && r.next() % 4 === 0) parts[(i + 1) % parts.length] = scramble(parts[(i + 1) % parts.length], r);
  return parts.join(' ');
}

// rude-word check: made-up and scrambled words can stumble into something nasty, so those get rerolled
const RUDE_ANY = ['fuck', 'fuk', 'shit', 'cunt', 'kunt', 'wank', 'twat', 'nigg', 'nigga', 'fag', 'slut', 'whore', 'bitch', 'cock', 'dick',
  'piss', 'rape', 'nazi', 'hitler', 'porn', 'penis', 'vagin', 'pussy', 'bollock', 'bastard', 'bugger', 'spunk', 'jizz', 'cum', 'tosser',
  'knob', 'prick', 'boob', 'nonce', 'paki', 'spic', 'chink', 'kike', 'retard', 'tranny', 'dyke', 'poof', 'gook', 'wog', 'coon', 'shag', 'turd', 'crap'];
const RUDE_WORD = ['ass', 'arse', 'anal', 'anus', 'tit', 'tits', 'fanny', 'sex', 'poo', 'pee', 'nob', 'kkk', 'damn', 'hell', 'puta', 'merde', 'con'];
function isRude(name) {
  const s = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (RUDE_ANY.some((w) => s.includes(w))) return true;
  return s.split(/[^a-z]+/).some((w) => RUDE_WORD.includes(w) || RUDE_WORD.some((r) => r.length > 3 && w.startsWith(r)));
}
function presetName(seed) {
  for (let i = 0; i < 50; i++) {
    const n = presetNameRaw(seed + i * 7919);
    if (!isRude(n)) return n;
  }
  return presetNameRaw(seed);
}
