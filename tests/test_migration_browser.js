// Exercise the real client startup with an old draft and an offline submission.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const bank = JSON.parse(fs.readFileSync(path.join(root, 'questions.json'), 'utf8'));
const old = JSON.parse(fs.readFileSync(path.join(root, 'domestic-backend/banks/peak-spiral-2026-11-18-v3.json'), 'utf8'));
const key = 'spiral-temple-quiz-v1';
const storage = new Map([
  [key + ':identity', JSON.stringify({deviceId:'a'.repeat(32), secret:'b'.repeat(64)})],
  [key + ':profile', JSON.stringify({nickname:'测试', playerNumber:7})],
  [key + ':draft', JSON.stringify({version:old.version, index:10, answers:{q001:['a'], q011:['b'], q038:['a']}})],
  [key + ':pending', JSON.stringify([{attemptId:'c'.repeat(32), version:old.version,
    answers:Object.fromEntries(old.questions.map(q => [q.id, q.answer])), localSubmittedAt:1234}])],
]);
const elements = new Map();
const listeners = {};
function element() {
  return {
    dataset:{}, style:{}, hidden:false, children:[], classList:{add(){}, remove(){}, toggle(){}},
    addEventListener(){}, setAttribute(){}, focus(){}, scrollIntoView(){},
    append(...children){this.children.push(...children);}, replaceChildren(...children){this.children = children;},
    querySelector(){return null;}, get firstElementChild(){return this.children[0] || null;},
  };
}
function getElement(id) {
  if (!elements.has(id)) elements.set(id, element());
  return elements.get(id);
}
getElement('question-bank').textContent = JSON.stringify(bank);
const submissions = [];
const context = {
  console, crypto:webcrypto, Intl, URLSearchParams, AbortController, setTimeout, clearTimeout,
  location:{hostname:'example.com', search:'', hash:'', pathname:'/'},
  localStorage:{getItem:k=>storage.get(k) || null, setItem:(k,v)=>storage.set(k,v), removeItem:k=>storage.delete(k)},
  document:{getElementById:getElement, createElement:element, querySelector:element,
    addEventListener:(name, fn)=>{listeners[name]=fn;}},
  window:{history:{replaceState(){}}, scrollTo(){}, addEventListener(){}},
  navigator:{}, QUESTION_DIAGRAMS:{}, drawRaidDiagram(){return '';},
  requestAnimationFrame(fn){fn();},
  fetch:async (url, options) => {
    let payload = {entries:[]};
    if (url.endsWith('/api/profile')) payload = {nickname:'测试', playerNumber:7};
    if (url.endsWith('/api/submit')) {
      const body = JSON.parse(options.body);
      submissions.push(body);
      payload = {correctCount:old.questions.length, totalCount:old.questions.length, score:100};
    }
    return {ok:true, status:200, json:async()=>payload};
  },
};
vm.runInNewContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), context);

(async () => {
  await new Promise(resolve => setTimeout(resolve, 20));
  const migrated = JSON.parse(storage.get(key + ':draft'));
  assert.equal(migrated.version, bank.version);
  assert.deepEqual(migrated.answers, {q001:['a']});
  assert.equal(migrated.migrationCleared, 2);
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0].version, old.version);
  assert.equal(storage.has(key + ':pending'), false);
  listeners.click({target:{closest:()=>({dataset:{action:'start'}})}});
  assert.equal(getElement('draft-update-notice').hidden, false);
  assert.match(getElement('draft-update-notice').textContent, /2 道/);
  console.log('PASS old draft migration, update notice and queued old-version submission');
})().catch(error => { console.error(error); process.exitCode=1; });
