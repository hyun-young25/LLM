import test from 'node:test';
import assert from 'node:assert/strict';
import { applySamplingTemperature, sampleCandidate } from '../src/sampling.js';
import { causalWeights, feedForward } from '../src/learningMath.js';
import { demoPrediction, requestPrediction } from '../src/prediction.js';
import { normalizePrediction } from '../geminiProxy.js';

const total = rows => rows.reduce((sum, row) => sum + row.probability, 0);
test('temperature preserves a probability distribution and changes concentration', () => {
  const input = [{ token: 'A', probability: 0.8 }, { token: 'B', probability: 0.2 }];
  for (const t of [0.1, 0.5, 1, 1.6]) assert.ok(Math.abs(total(applySamplingTemperature(input, t)) - 1) < 1e-12);
  assert.ok(applySamplingTemperature(input, 0.5)[0].probability > 0.8);
  assert.ok(applySamplingTemperature(input, 1.6)[0].probability < 0.8);
});
test('tiny and invalid probabilities remain finite; zero mass is never sampled', () => {
  const tiny = applySamplingTemperature([{ token: 'A', probability: 1e-200 }, { token: 'B', probability: 2e-200 }], 0.1);
  assert.ok(tiny.every(row => Number.isFinite(row.probability)));
  assert.ok(tiny[0].probability > 0.99);
  const invalid = applySamplingTemperature([{ probability: Infinity }, { probability: NaN }], NaN);
  assert.equal(total(invalid), 1);
  assert.equal(sampleCandidate([{ token: 'zero', probability: 0 }, { token: 'yes', probability: 1 }], () => 0).token, 'yes');
  assert.equal(sampleCandidate([{ token: 'A', probability: 0.7 }, { token: 'B', probability: 0.3 }], () => 0.9).token, 'B');
});
test('causal attention prevents future leakage even with dominant future logits', () => {
  const weights = causalWeights([1, 2, 1000], [10, 11, 12], 11);
  assert.equal(weights[2], 0);
  assert.ok(Math.abs(weights[0] + weights[1] - 1) < 1e-12);
  assert.deepEqual(causalWeights([1, 2, 3], [0, 1, 2], 0), [1, 0, 0]);
});
test('FFN is deterministic with shared weights and preserved output dimensions', () => {
  const input = [0.4, -0.2, 0.1, 0.8];
  for (const dimension of [8, 12, 16, 24, 32]) {
    const result = feedForward(input, dimension);
    assert.equal(result.hidden.length, dimension);
    assert.equal(result.output.length, 4);
    assert.ok(result.hidden.every(value => value >= 0 && Number.isFinite(value)));
    assert.deepEqual(result, feedForward(input, dimension));
  }
});
test('demo needs no network and terminates with normalized EOS', async () => {
  const generatedTokens = [];
  for (let step = 0; step < 10; step++) {
    const prediction = await requestPrediction({ originalInput: 'AI가 어떻게 글을 써?', generatedTokens });
    assert.equal(prediction.source, 'demo');
    assert.equal(total(prediction.candidates), 1);
    if (prediction.nextToken === '<eos>') break;
    generatedTokens.push(prediction.nextToken);
  }
  assert.equal(demoPrediction({ generatedTokens }).nextToken, '<eos>');
  assert.ok(generatedTokens.length >= 3);
});
test('cancelled requests do not return stale demo results', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(requestPrediction({}, { signal: controller.signal }), { name: 'AbortError' });
});
test('Gemini candidates reject empty data and normalize repetitions safely', () => {
  assert.throws(() => normalizePrediction({ candidates: [] }));
  const normalized = normalizePrediction({ candidates: [{ token: '가', probability: -1 }, { token: '나', probability: 2 }] });
  assert.equal(total(normalized.candidates), 1);
  assert.equal(normalized.candidates[0].token, '나');
  const ended = normalizePrediction({ candidates: [{ token: '반복', probability: 1 }] }, { generatedTokens: ['반복'] });
  assert.deepEqual(ended.candidates, [{ token: '<eos>', probability: 1 }]);
});
