const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../ui/log.html'), 'utf8');
const start = source.indexOf('var skinSub');
const end = source.indexOf('var C = {', start);
const skin = source.slice(start, end);

let pass = 0;
let fail = 0;
function ok(condition, message) {
  if (condition) pass++;
  else {
    fail++;
    console.error('FAIL: ' + message);
  }
}

ok(start > -1 && end > start, 'Skin renderer is present');
ok(/var SUBS = \[\['overview', 'Overview'\], \['routine', 'Routine'\], \['products', 'Products'\], \['lab', 'Lab'\], \['photos', 'Photos'\]\]/.test(skin), 'Skin exposes the locked five subtabs');
ok(/skin:logs/.test(skin) && /skin:products/.test(skin) && /skin:routine:v1/.test(skin), 'Skin uses canonical log, product, and routine stores');
ok(/phaseGValue\('skin\.current'\)/.test(skin) && /phaseGValue\('skin\.progress'\)/.test(skin), 'Skin reads canonical current and progress projections');
ok(/phaseGValue\('skin\.products'\)/.test(skin) && /phaseGValue\('skin\.routine'\)/.test(skin), 'Skin products and routine read shared canonical projections');
ok(/phaseGValue\('skin\.support'\)/.test(skin) && /phaseGValue\('skin\.insights'\)/.test(skin), 'Skin Lab and guidance read canonical support projections');
ok(/skin:breakouts/.test(skin) && /skin:ingredients/.test(skin) && /skin:goals/.test(skin) && /skin:device_sessions/.test(skin), 'Skin Lab uses canonical supporting stores');
ok(/function skinSheet/.test(source) && /Object\.assign\(\{\}, pre/.test(source), 'check-in edits preserve existing fields');
ok(/id: pre\.id != null \? pre\.id : Date\.now\(\)/.test(source), 'check-in edits preserve their identity');
ok(/function skinProductSheet/.test(source) && /Product name is required/.test(source), 'integrated product CRUD validates required names');
ok(/api\.saveSkinCheckin/.test(source) && /api\.saveSkinProduct/.test(source) && /api\.setSkinRoutineStep/.test(skin), 'Skin writes check-ins, products, and routine completion through canonical commands');
ok(/api\.saveSkinTreatment/.test(skin) && /api\.saveSkinIngredient/.test(skin) && /api\.saveSkinGoal/.test(skin), 'Skin supporting records write through canonical commands');
ok(/title: 'Delete this product\?'/.test(skin) && /Product deleted/.test(skin), 'product deletion is confirm-gated and undoable');
ok(/title: 'Remove ingredient\?'/.test(skin) && /title: 'Delete this goal\?'/.test(skin), 'Lab destructive actions require confirmation');
ok(/function labView/.test(skin) && /Correlation claims stay hidden until real data exists/.test(skin), 'Lab avoids fabricated correlations');
ok(/does not diagnose a condition or assign cause/.test(skin), 'Skin guidance explicitly avoids diagnosis and causal claims');
ok(/No live UV source is configured/.test(skin), 'Lab exposes an honest disconnected environment state');
ok(/data-entries/.test(skin) && /wireEntries\(p, 'skin'\)/.test(skin), 'check-ins and photos remain editable and deletable');
ok(/accept="image\/\*"/.test(source) && /FileReader/.test(source), 'photo capture is integrated into the check-in editor');
ok(/var views = \{ overview: overviewView, routine: routineView, products: productsView, lab: labView, photos: photosView \}/.test(skin), 'all Skin tabs map to real views');
ok(!/Your skincare library lives in the Skin app/.test(skin), 'Products no longer punts core CRUD to the legacy page');
ok(!/Attach a photo to a skin check-in in the Skin app/.test(skin), 'Photos no longer punts core capture to the legacy page');

const scripts = [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .filter((code) => code.trim());
try {
  scripts.forEach((code) => new Function(code));
  ok(true, 'inline Log scripts parse');
} catch (error) {
  console.error(error.stack || error.message);
  ok(false, 'inline Log scripts parse');
}

console.log('log-skin-contract.test.js: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
