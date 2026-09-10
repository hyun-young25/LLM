import { causalWeights, feedForward, softmax } from './learningMath.js';

export const CONNECTED_NOTE = 'FFN의 출력으로 6개 후보의 점수와 확률을 직접 계산하는 교육용 모형입니다. 가중치는 설명용 고정 값이며, 실제 GPT처럼 학습된 언어 능력이나 자연스러운 문장을 보장하지 않습니다.';

// A fixed, inspectable 4 -> 6 output layer; no context-specific probability lookup.
const OUTPUT_HEAD = [
  { token: '먹었다', weights: [1.4, -0.8, 0.6, 0.2], bias: -0.1 },
  { token: '탔다', weights: [-0.9, 1.2, 0.4, -0.5], bias: 0.2 },
  { token: '샀다', weights: [0.5, 0.4, -1.1, 0.9], bias: 0 },
  { token: '보았다', weights: [-0.4, 0.1, 0.8, 1.1], bias: 0.1 },
  { token: '찾았다', weights: [0.6, -0.3, 0.2, -0.8], bias: -0.1 },
  { token: '<eos>', weights: [0.1, -0.2, 0.1, -0.3], bias: -0.4 },
];

export function projectOutput(vector, temperature = 1) {
  if (vector.length !== 4 || !vector.every(Number.isFinite)) throw new Error('출력층에는 유한한 숫자 4개가 필요합니다.');
  const parsed = Number(temperature);
  const t = Number.isFinite(parsed) ? Math.max(0.1, Math.min(1.6, parsed)) : 1;
  const raw = OUTPUT_HEAD.map(head => {
    const terms = vector.map((value, index) => value * head.weights[index]);
    return { ...head, weights: [...head.weights], terms, logit: terms.reduce((sum, value) => sum + value, head.bias) };
  });
  const baseline = softmax(raw.map(row => row.logit));
  const probabilities = softmax(raw.map(row => row.logit / t));
  const rows = raw.map((row, index) => ({ ...row, score: row.logit, scaledLogit: row.logit / t, baseProbability: baseline[index], probability: probabilities[index] }));
  return { input: [...vector], temperature: t, rows, candidates: [...rows].sort((a, b) => b.probability - a.probability) };
}

export function runConnectedModel(input, { temperature = 1, hiddenDimension = 16, queryIndex, contextLimit = 8 } = {}) {
  const tokens = Array.isArray(input) ? [...input] : tokenize(String(input || ''));
  if (!tokens.length) throw new Error('문맥에 토큰이 하나 이상 필요합니다.');
  if (![8, 12, 16, 24, 32].includes(hiddenDimension)) throw new Error('지원하지 않는 중간 차원입니다.');
  const all = tokens.map((token, index) => buildTokenItem(token, index, false));
  const items = Number.isFinite(contextLimit) ? all.slice(-Math.max(1, contextLimit)) : all;
  const requested = items.findIndex(item => item.index === queryIndex);
  const selectedIndex = requested >= 0 ? requested : items.length - 1;
  const selected = items[selectedIndex];
  const attention = buildAttentionRowsForItems(items, selectedIndex);
  const context = attention.reduce((sum, row) => sum.map((value, i) => value + row.value[i] * row.weight), [0, 0, 0, 0]);
  const ffn = feedForward(context, hiddenDimension);
  const projection = projectOutput(ffn.output, temperature);
  return { tokens, items, selected, attention, context, ffn, projection, candidates: projection.candidates };
}

export function buildTokenItem(token, index, generated) {
  const id = tokenId(token);
  return {
    token,
    id,
    index,
    generated,
    vector: buildVector(token, id, index),
  };
}

export function tokenize(text) {
  const normalized = text.trim() || "텍스트를 입력해보세요";
  const pieces = normalized.match(/[가-힣]+|[a-zA-Z0-9]+|[^\s가-힣a-zA-Z0-9]/g) || [normalized];
  return pieces.flatMap((piece) => {
    if (/^[가-힣]{5,}$/.test(piece)) return piece.match(/.{1,3}/g);
    if (/^[a-zA-Z0-9]{7,}$/.test(piece)) return piece.match(/.{1,4}/g);
    return [piece];
  });
}

export function tokenId(token) {
  let hash = 17;
  for (let i = 0; i < token.length; i += 1) {
    hash = (hash * 37 + token.charCodeAt(i)) % 30000;
  }
  return 1000 + hash;
}

export function seededNoise(text, index) {
  let hash = 0;
  const source = `${text}:${index}`;
  for (let i = 0; i < source.length; i += 1) {
    hash = (hash * 31 + source.charCodeAt(i)) % 9973;
  }
  return (hash % 100) / 100;
}

export function buildVector(token, id, index) {
  return Array.from({ length: 4 }, (_, dimension) => denseDimensionValue(token, id, index, dimension));
}

export function denseDimensionValue(token, id, index, dimensionIndex) {
  const noise = seededNoise(`${token}:${id}:dense:${dimensionIndex}`, dimensionIndex);
  const wave = Math.sin((dimensionIndex + 1) * 0.37 + id * 0.001) * 0.35;
  return Number((noise * 2 - 1 + wave).toFixed(2));
}

export function projectVector(vector, kind) {
  const offset = kind === "q" ? 0.17 : kind === "k" ? -0.11 : 0.29;
  return vector.map((value, index) => {
    const scale = 0.65 + seededNoise(`${kind}:${index}`, index) * 0.7;
    return Number((value * scale + offset * (index % 2 === 0 ? 1 : -1)).toFixed(2));
  });
}

export function dot(left, right) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

export function buildAttentionRowsForItems(items, queryIndex) {
  const queryItem = items[queryIndex] || items.at(-1);
  if (!queryItem) return [];
  const query = projectVector(queryItem.vector, "q");
  const scoredItems = items.map((item) => {
    const key = projectVector(item.vector, "k");
    const value = projectVector(item.vector, "v");
    const score = dot(query, key) / Math.sqrt(query.length);
    return { ...item, key, value, score };
  });
  const weights = causalWeights(scoredItems.map((item) => item.score), scoredItems.map(item => item.index), queryItem.index);
  return scoredItems.map((item, index) => ({
    token: item.token,
    index: item.index,
    value: item.value,
    weight: weights[index],
  }));
}
