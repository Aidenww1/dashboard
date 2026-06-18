// Deterministic regression set for the math/logic boundary (Phase 7).
// Runs every *.test.js in this folder in a child process so a shim or
// global from one file can't leak into another. Exits non-zero if any fail.
//
// ponytail: TDEE (computeAdaptiveTDEE, nutrition.html) is still untested --
// unlike the CSV parser it reads getLogs()+localStorage inside the function
// rather than taking pure args, so source-extraction would need shims. Low
// value (it only drives an estimate display); add a test if it grows teeth.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js'));
let failed = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit' });
  } catch (e) {
    failed++;
  }
}
console.log('\n' + (failed ? failed + ' suite(s) FAILED' : 'all suites passed'));
process.exit(failed ? 1 : 0);
