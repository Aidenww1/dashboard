// Security-boundary tests for the operator's action parser (command.js
// parseActions, exposed as window.__opParseActions). This is the "preview before
// execute" gate: parseActions only EXTRACTS proposed actions from an AI reply;
// nothing runs until the user confirms (LifeOS.runAction is called elsewhere,
// post-confirm). These pin that a reply with no/!malformed action JSON yields
// actions:null (so nothing is ever auto-executed), and valid JSON surfaces the
// actions for confirmation.

// --- fake DOM sufficient to load the command.js IIFE (it injects a style + FAB) ---
function fakeEl() {
  const el = {
    style: {}, dataset: {}, value: '',
    classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
    children: [],
    setAttribute() {}, getAttribute() { return null; }, addEventListener() {}, removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; }, removeChild() {}, remove() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    focus() {}, blur() {}, insertBefore() {},
  };
  Object.defineProperty(el, 'textContent', { set(v) { this._t = v; }, get() { return this._t || ''; } });
  Object.defineProperty(el, 'innerHTML', { set(v) { this._h = v; }, get() { return this._h || ''; } });
  return el;
}
global.document = {
  createElement: fakeEl,
  head: fakeEl(),
  body: fakeEl(),
  addEventListener() {},
  getElementById() { return null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
};
const store = {};
global.localStorage = {
  getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem(k, v) { store[k] = String(v); }, removeItem(k) { delete store[k]; },
};
global.sessionStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
let ran = 0;
global.LifeOS = { search() { return []; }, runAction() { ran++; return { ok: true, message: 'ran' }; }, context() { return {}; } };
global.window = global;
global.window.addEventListener = function () {};

require('../command.js');
const parse = global.window.__opParseActions;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; return; } fail++; console.error('FAIL: ' + msg); }

ok(typeof parse === 'function', '__opParseActions exposed');

// 1. Plain prose, no JSON -> never produces actions.
let r = parse('You should drink more water today.');
ok(r.actions === null, 'plain text -> actions null (nothing to execute)');
ok(r.text === 'You should drink more water today.', 'plain text passed through');

// 2. Malformed JSON action block -> no throw, no actions.
r = parse('Sure! ```json { "actions": [ {bad json ``` done');
ok(r.actions === null, 'malformed JSON -> actions null (no auto-run)');

// 3. JSON without an actions key -> null.
r = parse('```json {"foo": 1} ```');
ok(r.actions === null, 'JSON without "actions" -> null');

// 4. Empty actions array -> null (nothing to confirm).
r = parse('```json {"actions": []} ```');
ok(r.actions === null, 'empty actions array -> null');

// 5. Valid fenced action JSON -> actions surfaced, block stripped from text.
r = parse('Logged it.\n```json\n{"actions":[{"type":"log","kind":"water","value":250}]}\n```');
ok(Array.isArray(r.actions) && r.actions.length === 1, 'valid fenced JSON -> 1 action surfaced');
ok(r.actions[0].type === 'log' && r.actions[0].value === 250, 'action fields preserved');
ok(!/```/.test(r.text) && /Logged it\./.test(r.text), 'action JSON stripped from displayed text');

// 6. Unfenced action JSON -> safe fallback to null. actions is always an array of
// objects ([{...}]); the bare regex stops at the first "}", so it can't parse real
// action payloads — only the FENCED path (test #5, the path the model is prompted
// to use) works. Failing to parse is the SAFE outcome (becomes plain text, nothing
// runs). Documented, not a security gap; not worth complicating the regex (ponytail).
r = parse('{"actions":[{"type":"add","kind":"task","title":"call mom"}]}');
ok(r.actions === null, 'unfenced action JSON -> null (safe; fenced path is the real one)');

// 7. Parsing NEVER executes — runAction must not have been called by parse().
ok(ran === 0, 'parseActions never calls runAction (execution is confirm-gated)');

console.log('operator.test.js: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
