import test from 'node:test';
import assert from 'node:assert/strict';
import { projectOutput, runConnectedModel, buildTokenItem } from '../src/connectedModel.js';
import { relationshipActivities, runActivity, compareStages } from '../src/relationshipActivities.js';
import { sampleCandidate } from '../src/sampling.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);

test('output probabilities are computed from FFN values through an inspectable output head', () => {
  const projection = projectOutput([1, 2, 3, 4], 0.5);
  close(projection.rows[0].logit, 2.3);
  close(projection.rows[1].logit, 0.9);
  close(projection.rows[0].scaledLogit, 4.6);
  close(projection.rows.reduce((sum, row) => sum + row.probability, 0), 1);
  close(projection.rows[0].probability / projection.rows[1].probability, Math.exp((2.3 - 0.9) / 0.5));
  const modified = projectOutput([2, 2, 3, 4], 0.5);
  close(modified.rows[0].logit - projection.rows[0].logit, 1.4);
  assert.notDeepEqual(modified.rows.map(row => row.probability), projection.rows.map(row => row.probability));
});

test('lesson experiments change only the advertised stages before reaching the output', () => {
  const expected = {
    context: ['attention', 'hidden', 'ffn', 'logits', 'probabilities'],
    temperature: ['probabilities'],
    ffn: ['hidden', 'ffn', 'logits', 'probabilities'],
  };
  for (const activity of relationshipActivities) {
    const { before, after } = runActivity(activity);
    assert.deepEqual(compareStages(before, after).filter(row => row.changed).map(row => row.id), expected[activity.id]);
    assert.deepEqual(before.selected.vector, after.selected.vector);
    for (const run of [before, after]) {
      assert.deepEqual(run.ffn.input, run.context);
      assert.deepEqual(run.projection.input, run.ffn.output);
      assert.equal(run.ffn.output.length, 4);
      close(run.attention.reduce((sum, row) => sum + row.weight, 0), 1);
      close(run.candidates.reduce((sum, row) => sum + row.probability, 0), 1);
    }
  }
});

test('temperature leaves all upstream numbers fixed and changes concentration once', () => {
  const low = runConnectedModel('과일 가게에서 산 배를', { temperature: 0.3 });
  const high = runConnectedModel('과일 가게에서 산 배를', { temperature: 1.5 });
  assert.deepEqual(low.items, high.items);
  assert.deepEqual(low.attention, high.attention);
  assert.deepEqual(low.ffn, high.ffn);
  assert.deepEqual(low.projection.rows.map(row => row.logit), high.projection.rows.map(row => row.logit));
  assert.ok(low.candidates[0].probability > high.candidates[0].probability);
  const [first, second] = low.projection.rows;
  close(first.probability / second.probability, Math.exp((first.logit - second.logit) / 0.3));
});

test('shared embeddings ignore position and future tokens cannot affect an earlier output', () => {
  assert.deepEqual(buildTokenItem('배를', 0, false).vector, buildTokenItem('배를', 7, false).vector);
  const before = runConnectedModel(['과일', '배를'], { queryIndex: 1, contextLimit: Infinity });
  const after = runConnectedModel(['과일', '배를', '미래', '정보'], { queryIndex: 1, contextLimit: Infinity });
  assert.deepEqual(after.attention.slice(2).map(row => row.weight), [0, 0]);
  assert.deepEqual(before.context, after.context);
  assert.deepEqual(before.ffn.output, after.ffn.output);
  assert.deepEqual(before.candidates, after.candidates);
  const windowed = runConnectedModel(['첫째', '둘째', '셋째', '넷째', '다섯째'], { queryIndex: 3, contextLimit: 3 });
  assert.equal(windowed.selected.index, 3);
  assert.equal(windowed.attention.at(-1).weight, 0);
});

test('every sampled token enters the next complete calculation without changing past traces', () => {
  let tokens = ['과일', '가게에서', '산', '배를'];
  const original = [...tokens];
  for (let step = 0; step < 3; step++) {
    const trace = runConnectedModel(tokens, { temperature: 1, hiddenDimension: 16, contextLimit: Infinity });
    const saved = JSON.stringify(trace);
    const selected = sampleCandidate(trace.candidates, () => 0);
    assert.notEqual(selected.token, '<eos>');
    tokens = [...tokens, selected.token];
    const next = runConnectedModel(tokens, { temperature: 1, hiddenDimension: 16, contextLimit: Infinity });
    assert.equal(next.selected.token, selected.token);
    assert.equal(next.tokens.length, original.length + step + 1);
    assert.deepEqual(next.candidates, projectOutput(next.ffn.output, 1).candidates);
    assert.equal(JSON.stringify(trace), saved);
  }
});
