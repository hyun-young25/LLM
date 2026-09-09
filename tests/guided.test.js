import test from 'node:test';
import assert from 'node:assert/strict';
import { contexts, lessonPairs, exampleCorpus, predictFromExamples, drawSamples, textFromTokens } from '../src/guidedModel.js';

test('guided probability is derived from ten matching examples for each context', () => {
  for (const context of Object.values(contexts)) {
    const result = predictFromExamples(context.prefix);
    assert.equal(result.total, 10);
    assert.equal(result.candidates.reduce((sum, item) => sum + item.count, 0), 10);
    for (const item of result.candidates) assert.ok(Math.abs(item.probability - item.count / 10) < 1e-12);
  }
  assert.deepEqual(predictFromExamples(['unknown']), { candidates: [], matches: [], total: 0 });
});
test('changing the context changes the candidate distribution, independent of the learner guess', () => {
  for (const pair of lessonPairs) {
    const before = predictFromExamples(contexts[pair.before].prefix);
    const after = predictFromExamples(contexts[pair.after].prefix);
    assert.notEqual(before.candidates[0].token, after.candidates[0].token);
    assert.equal(before.candidates.find(item => item.token === after.candidates[0].token), undefined);
  }
  const next = predictFromExamples([...contexts.thirst.prefix, '물을']);
  assert.equal(next.total, 6);
  assert.deepEqual(next.candidates.map(item => [item.token, item.count]), [['마셨다', 4], ['찾았다', 2]]);
  assert.equal(next.candidates.find(item => item.token === '물을'), undefined);
});
test('every generation branch remains supported by the corpus and terminates', () => {
  for (const row of exampleCorpus) {
    const start = Object.values(contexts).find(context => context.prefix.every((token, i) => row.tokens[i] === token)).prefix;
    const prefix = [...start];
    for (const token of row.tokens.slice(start.length)) {
      const result = predictFromExamples(prefix);
      assert.ok(result.candidates.some(item => item.token === token && item.probability > 0));
      prefix.push(token);
    }
    assert.equal(prefix.at(-1), '<eos>');
    assert.equal(predictFromExamples(prefix).candidates.length, 0);
    assert.doesNotMatch(textFromTokens(prefix), /<eos>|\s\./);
  }
});
test('batch sampling records the true number of draws from a fixed distribution', () => {
  const candidates = predictFromExamples(contexts.thirst.prefix).candidates;
  const totals = drawSamples(candidates, 20, () => .99);
  assert.equal(Object.values(totals).reduce((sum, count) => sum + count, 0), 20);
  assert.deepEqual(totals, { 차를: 20 });
});

test('advanced demo uses the same conditional examples when opened from the guide', async () => {
  const { demoPrediction } = await import('../src/prediction.js');
  const body = { originalInput: contexts.thirst.label, generatedTokens: ['물을'] };
  const result = demoPrediction(body);
  assert.deepEqual(result.candidates, predictFromExamples([...contexts.thirst.prefix, '물을']).candidates);
  assert.match(result.note, /FFN/);
});
