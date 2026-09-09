function mass(candidate) {
  const value = Number(candidate.probability);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function applySamplingTemperature(candidates, temperature) {
  if (!candidates.length) return [];
  const parsed = Number(temperature);
  const t = Number.isFinite(parsed) ? Math.min(1.6, Math.max(0.1, parsed)) : 0.8;
  const logs = candidates.map(candidate => mass(candidate) ? Math.log(mass(candidate)) / t : -Infinity);
  const max = Math.max(...logs);
  const weights = logs.map(value => max === -Infinity ? 1 : Math.exp(value - max));
  const total = weights.reduce((sum, value) => sum + value, 0);
  return candidates.map((candidate, index) => ({ ...candidate, probability: weights[index] / total }))
    .sort((left, right) => right.probability - left.probability);
}

export function sampleCandidate(candidates, random = Math.random) {
  if (!candidates.length) return null;
  const positive = candidates.filter(candidate => mass(candidate) > 0);
  if (!positive.length) return candidates[0];
  const total = positive.reduce((sum, candidate) => sum + mass(candidate), 0);
  let threshold = random() * total;
  for (const candidate of positive) {
    threshold -= mass(candidate);
    if (threshold < 0) return candidate;
  }
  return positive.at(-1);
}
