const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const log = fs.readFileSync(path.join(root, 'ui/log.html'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'ui/canonical-runtime.js'), 'utf8');
const definitions = fs.readFileSync(path.join(root, 'projection-definitions.js'), 'utf8');

let pass = 0;
let fail = 0;
function ok(value, message) { if (value) pass += 1; else { fail += 1; console.error('FAIL: ' + message); } }

ok(/Bloodwork Outlook/.test(log), 'Labs renders the directional outlook');
ok(/Model Safety &amp; Provenance/.test(log), 'Labs renders model provenance');
ok(/Numeric predictions[\s\S]{0,180}Locked/.test(log), 'Labs visibly locks numeric predictions');
ok(/data-record-lab-outlook/.test(log), 'Labs can record an auditable outlook snapshot');
ok(/function recordLabOutlook/.test(runtime), 'runtime owns the outlook recording command');
ok(/labs\.outlook\.recorded/.test(runtime), 'runtime appends canonical outlook snapshots');
ok(/id: 'labs\.model_status'/.test(definitions), 'model registry is exposed as a projection');
ok(/id: 'labs\.outlook_evaluation'/.test(definitions), 'retrospective evaluation is exposed as a projection');
ok(!/predicted_value/.test(definitions), 'projection layer emits no future numeric marker value');

console.log('bloodwork-ui-contract.test.js: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
