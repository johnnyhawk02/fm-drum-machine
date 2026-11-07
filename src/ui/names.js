// fm dm — automatic preset names: two words drawn from themed lists (French kitchen terms, puddings,
// space, geology, crystals and rocks) with the odd made-up alien word mixed in.

const NAME_WORDS = {
  cuisine: ['julienne', 'brunoise', 'chiffonade', 'roux', 'flambé', 'confit', 'sauté', 'mirepoix', 'velouté', 'bouquet',
    'garni', 'coulis', 'gratin', 'consommé', 'terrine', 'remoulade', 'beurre', 'blanc', 'noisette', 'meunière',
    'au jus', 'en croûte', 'papillote', 'brûlée', 'mousseline', 'sabayon', 'fumet', 'bisque', 'quenelle', 'duxelles',
    'chantilly', 'tuile', 'ganache', 'praline', 'mise', 'braisé', 'poché', 'glacé', 'liaison', 'nappe'],
  pudding: ['trifle', 'crumble', 'roly poly', 'spotted dick', 'sponge', 'treacle tart', 'eton mess', 'syllabub',
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

function presetName(seed) {
  const r = new Rng((seed * 2654435761 + 7) >>> 0);
  const pick = (list) => list[r.next() % list.length];
  const word = () => pick(NAME_WORDS[pick(NAME_THEMES)]);
  const k = r.next() % 20;
  if (k < 9) return portmanteau(r) + ' ' + word(); // a made-up blend and a real term
  if (k < 12) return portmanteau(r) + ' ' + portmanteau(r);
  if (k < 18) return word() + ' ' + word(); // two themed words, often from different themes
  return word() + ' ' + alienName(seed).split(' ')[0];
}
