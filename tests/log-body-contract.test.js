const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../ui/log.html'), 'utf8');
const start = source.indexOf('function renderBodyPanel');
const end = source.indexOf('var trainSub', start);
const bodyPanel = source.slice(start, end);

let pass = 0;
let fail = 0;
function ok(condition, message) {
  if (condition) pass++;
  else {
    fail++;
    console.error('FAIL: ' + message);
  }
}

ok(start > -1 && end > start, 'Body renderer is present');
ok(/\['overview', 'Overview'\], \['composition', 'Composition'\], \['recovery', 'Recovery'\], \['labs', 'Labs'\], \['photos', 'Photos'\]/.test(bodyPanel), 'Body exposes the locked five subtabs');
ok(/id="ms-date" type="date"/.test(source), 'measurement form supports dated entries');
ok(/existingBf[\s\S]*Object\.assign\(\{\}, existingBf/.test(source), 'measurement edits preserve existing same-day body data');
ok(/dateKey: t, weight: w/.test(source), 'measurements write the canonical weight shape');
ok(/id="s-date" type="date"/.test(source), 'sleep form supports dated entries');
ok(/entry\.date !== date[\s\S]*duration: mins/.test(source), 'sleep edits upsert the selected date');
ok(/data-body-date/.test(bodyPanel) && /measurementPrefill/.test(bodyPanel), 'recent measurements support prefilled historical editing');
ok(/data-sleep-date/.test(bodyPanel), 'recent sleep supports historical editing');
ok(/gym:goals:v1/.test(bodyPanel), 'Body goals use the canonical goal store');
ok(/blood:logs/.test(bodyPanel) && /Markers Requiring Attention/.test(bodyPanel), 'Labs persist and render marker attention');
ok(/LifeOSPhotos\.put/.test(bodyPanel) && /body:photos:v1/.test(bodyPanel), 'progress photos use IndexedDB plus canonical metadata');
ok(/lg-span-12"><div class="lg-card-title">Health attention/.test(bodyPanel), 'Health attention spans the Body grid');
ok(/No body goals set yet/.test(bodyPanel) && /No progress photos yet/.test(bodyPanel), 'Body has honest empty states');
ok(!/78\.4|14\.2|83\.1|67\.3/.test(bodyPanel), 'Body renderer contains no reference-image sample metrics');

console.log('log-body-contract.test.js: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
