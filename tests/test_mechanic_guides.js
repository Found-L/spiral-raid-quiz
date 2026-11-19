// Guard the teaching maps and a version migration that preserves prior answers.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'sequences.js'), 'utf8');
const scenes = vm.runInNewContext(code + '\nRAID_SEQUENCES');

for (const [name, scene] of Object.entries(scenes)) {
  const actors = new Set(scene.actors.map(a => a.id));
  assert.equal(actors.size, scene.actors.length, name + ' duplicate actor');
  assert.ok(scene.steps.length > 1, name + ' needs multiple frames');
  for (const step of scene.steps) {
    for (const id of [...Object.keys(step.positions || {}), ...(step.hidden || [])]) {
      assert.ok(actors.has(id), name + ' references unknown actor ' + id);
    }
    for (const cue of step.cues || []) {
      assert.ok(scene.cues.includes('data-cue="' + cue + '"'), name + ' references unknown cue ' + cue);
    }
  }
}

const heal = scenes['twins-heal'];
const lift = heal.steps.find(step => step.cues?.includes('lift'));
assert.ok(lift, 'both tanks need a visible lifted/healing frame');
assert.ok(lift.positions.ft && lift.positions.it, 'both sides participate in the frame');
assert.ok(heal.cues.includes('抓起主 T') && heal.cues.includes('scene-heal-beam'));
assert.ok(heal.steps.some(step => step.hidden?.includes('flower1') && !step.hidden?.includes('pearl1')));
const swap = scenes['twins-swap'];
assert.ok(swap.background.includes('scene-river'));
assert.ok(swap.cues.includes('火首领 →  /  ← 冰首领'));

const facing = scenes['spirit-facing'];
assert.ok(facing.cues.includes('面向首领 · 进隔离') && facing.cues.includes('背对首领 · 留外场'));
assert.ok(facing.steps.some(step => step.cues?.includes('face')));
const rotation = scenes['spirit-rotation'];
const switching = rotation.steps.find(step => step.cues?.includes('switch'));
assert.ok(switching && !switching.positions, 'state changes should not invent a physical route');
assert.ok(rotation.cues.includes('出隔离') && rotation.cues.includes('进隔离'));
const spiders = scenes['witch-spiders'];
assert.ok(spiders.steps[0].hidden.includes('boss'), 'boss must be absent from the ground while airborne');
assert.ok(!spiders.steps[2].hidden?.includes('boss') && !spiders.steps[2].hidden?.includes('bomb'),
  'later frame must show the concurrent boss and bomb');

const current = JSON.parse(fs.readFileSync(path.join(root, 'questions.json'), 'utf8'));
const previous = JSON.parse(fs.readFileSync(path.join(root, 'domestic-backend/banks/peak-spiral-2026-11-18-v8.json'), 'utf8'));
const byId = new Map(current.questions.map(q => [q.id, q]));
assert.deepEqual(current.draft_migrations[previous.version], ['q103']);
assert.equal(current.questions.length, previous.questions.length + 1);
for (const oldQuestion of previous.questions) assert.deepEqual(byId.get(oldQuestion.id), oldQuestion);
assert.match(byId.get('q103').question, /抓起本侧主 T/);
console.log('PASS paired actions, field references, and preservation of v8 questions');
