export function softmax(values) {
  if (!values.length) return [];
  const max = Math.max(...values);
  if (max === -Infinity) return values.map(() => 0);
  const exps = values.map(value => Math.exp(value - max));
  const total = exps.reduce((sum, value) => sum + value, 0);
  return exps.map(value => value / total);
}

export function causalWeights(scores, indices, queryIndex) {
  return softmax(scores.map((score, index) => indices[index] <= queryIndex ? score : -Infinity));
}

// Fixed educational weights shared across positions, not trained GPT parameters.
function weight(row, column, salt) {
  return Math.sin((row + 1) * 12.9898 + (column + 1) * 78.233 + salt) * 0.45;
}

export function feedForward(input, hiddenDimension) {
  const hidden = Array.from({ length: hiddenDimension }, (_, row) =>
    Math.max(0, input.reduce((sum, value, column) => sum + value * weight(row, column, 1), 0) + 0.1),
  );
  const output = input.map((_, row) => hidden.reduce((sum, value, column) => sum + value * weight(row, column, 2), 0));
  return { input, hidden, output };
}
