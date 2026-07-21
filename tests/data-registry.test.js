const fs = require('fs');
const path = require('path');
const Registry = require('../data-registry.js');
const Commands = require('../data-commands.js');

const root = path.join(__dirname, '..');
let pass = 0;
let fail = 0;
function ok(condition, message) {
  if (condition) { pass += 1; return; }
  fail += 1;
  console.error('FAIL: ' + message);
}

const requiredDomains = [
  'profile', 'nutrition', 'hydration', 'sleep', 'wearables', 'training', 'body', 'energy', 'mood',
  'labs', 'supplements', 'skin', 'finance', 'productivity', 'communications', 'photos', 'lifestyle', 'system',
];

ok(Registry.version === 1, 'registry has an explicit version');
ok(Registry.validate().length === 0, 'registry validates without missing fields or duplicate ownership');
requiredDomains.forEach((domain) => ok(!!Registry.get(domain), 'registry includes ' + domain));
ok(Commands.assertCoverage().length === 0, 'every registered command maps to a canonical event');

Registry.list().forEach((entry) => {
  entry.sourceEventTypes.forEach((type) => ok(Registry.findByEvent(type) === entry, type + ' resolves to its owner'));
  entry.commandTypes.forEach((type) => ok(Registry.findByCommand(type) === entry, type + ' resolves to its owner'));
});

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
    if (item.name === '.git' || item.name === 'tests' || item.name === 'node_modules') return [];
    const full = path.join(dir, item.name);
    if (item.isDirectory()) return walk(full);
    return /\.(?:js|html)$/.test(item.name) ? [full] : [];
  });
}

const unregistered = [];
for (const file of walk(root)) {
  const source = fs.readFileSync(file, 'utf8');
  const literals = [...source.matchAll(/localStorage\.(?:getItem|setItem|removeItem)\(\s*['"]([^'"]+)['"]/g)].map((match) => match[1]);
  const constants = {};
  for (const match of source.matchAll(/(?:const|let|var)\s+([A-Z][A-Z0-9_]*)\s*=\s*['"]([^'"]+)['"]/g)) constants[match[1]] = match[2];
  for (const [name, value] of Object.entries(constants)) {
    const usedByStorage = new RegExp('localStorage\\.(?:getItem|setItem|removeItem)\\(\\s*' + name + '\\b').test(source);
    if (usedByStorage) literals.push(value);
  }
  for (const key of new Set(literals)) {
    if (!Registry.resolveLegacyKey(key, 'localStorage')) unregistered.push(path.relative(root, file) + ': ' + key);
  }
}
ok(unregistered.length === 0, 'every statically discoverable production localStorage key is registered' + (unregistered.length ? '\n  ' + unregistered.join('\n  ') : ''));

console.log('data-registry.test.js: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
