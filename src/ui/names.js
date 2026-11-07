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

function presetName(seed) {
  const r = new Rng((seed * 2654435761 + 7) >>> 0);
  const pick = (list) => list[r.next() % list.length];
  const word = () => pick(NAME_WORDS[pick(NAME_THEMES)]);
  const k = r.next() % 10;
  if (k < 6) return word() + ' ' + word(); // two themed words, often from different themes
  if (k < 9) return word() + ' ' + alienName(seed).split(' ')[0];
  return alienName(seed);
}
