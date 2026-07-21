const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../ui/log.html'), 'utf8');
const foodStart = source.indexOf('function renderFoodPanel');
const foodEnd = source.indexOf('function latestByDate', foodStart);
const foodPanel = source.slice(foodStart, foodEnd);

let pass = 0;
let fail = 0;
function ok(condition, message) {
  if (condition) pass++;
  else {
    fail++;
    console.error('FAIL: ' + message);
  }
}

ok(foodStart > -1 && foodEnd > foodStart, 'Food renderer is present');
ok(/targetsConfigured = ct != null && pt != null/.test(foodPanel), 'calorie and protein targets require persisted values');
ok(/Targets not configured/.test(foodPanel), 'fresh profiles receive an honest target setup state');
ok(!/tgt\.calories\s*\|\|\s*\d+/.test(foodPanel), 'Food renderer has no fictional calorie fallback');
ok(!/tgt\.protein\s*\|\|\s*\d+/.test(foodPanel), 'Food renderer has no fictional protein fallback');
ok(/Calorie and protein targets are required/.test(source), 'target form validates required goals');
ok(/var appDay = new Date\(ntKey\(\) \+ 'T12:00:00'\)/.test(source), 'Food Log uses the nutrition-day rollover');
ok(/title: 'Delete this meal\?'[\s\S]*C\.food\.del\(id\)/.test(source), 'Food Log deletion is confirmation gated');
ok(/action: 'Undo'/.test(source), 'Food deletion exposes Undo');
ok(/title: 'Delete this entry\?'/.test(source), 'shared entry deletion is confirmation gated');
ok(/data-photo/.test(foodPanel) && /data-barcode/.test(foodPanel), 'photo and barcode entry flows are available');
ok(/data-search/.test(foodPanel) && /data-templates/.test(foodPanel), 'search and templates flows are available');
ok(/data-meal-actions/.test(source) && /Duplicate meal/.test(source) && /Save as template/.test(source), 'meal lists expose the complete compact action set');
ok(/canonicalFood\(\)\.deleteMeal/.test(source) && /canonicalFood\(\)\.restoreMeal/.test(source), 'delete and undo use canonical tombstones and restoration');
ok(/refreshFoodProjection/.test(foodPanel), 'Food summaries can refresh from the shared nutrition projection');

console.log('log-food-contract.test.js: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
