<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { applySamplingTemperature, sampleCandidate } from "./sampling.js";
import { requestPrediction, DEMO_NOTE } from "./prediction.js";
import { softmax, causalWeights, feedForward } from "./learningMath.js";
import GuidedLearning from "./GuidedLearning.vue";

const pages = [
  {
    key: "tokenize",
    title: "Tokenizing",
    label: "토큰화",
    oneLine: "문장을 작은 조각과 숫자 ID로 바꾸는 과정을 예시로 봅니다.",
    note: "토큰화는 긴 문장을 작은 조각으로 나누는 입구입니다. 모델은 글자 자체가 아니라 토큰 ID 배열을 입력으로 받습니다.",
  },
  {
    key: "embedding",
    title: "Embedding",
    label: "임베딩",
    oneLine: "토큰 ID가 embedding table을 지나 의미를 담은 벡터가 됩니다.",
    note: "임베딩은 ID를 벡터 공간의 좌표로 바꾸는 단계입니다. 이 화면은 이해를 위해 8, 16, 32차원만 보여주지만 실제 모델에서는 512, 768, 1536차원처럼 훨씬 큰 벡터로 확장될 수 있습니다.",
  },
  {
    key: "attention",
    title: "Attention",
    label: "어텐션",
    oneLine: "각 입력 벡터를 Q, K, V로 바꾸고 어떤 토큰을 볼지 계산합니다.",
    note: "Query와 Key의 내적이 attention score를 만들고, softmax가 비중을 정합니다. 현재 위치보다 뒤에 있는 토큰은 가리고, 비중에 따라 Value를 섞어 문맥 벡터를 만듭니다.",
  },
  {
    key: "ffn",
    title: "FFN",
    label: "피드포워드",
    oneLine: "토큰별 벡터를 넓은 차원으로 확장한 뒤 다시 줄이며 특징을 정리합니다.",
    note: "FFN은 각 토큰 위치에 같은 작은 신경망을 적용합니다. 차원을 넓히며 후보 특징을 만들고, 다시 줄여 다음 단계에 필요한 신호만 남깁니다.",
  },
  {
    key: "output",
    title: "후보 확률과 선택",
    label: "최종 출력",
    oneLine: "후보 확률에 Temperature를 적용하고 하나를 골라 문맥 뒤에 붙입니다.",
    note: "Logit은 다음 토큰 후보의 원점수입니다. softmax와 temperature를 거쳐 확률 분포가 되고, 선택된 토큰은 다시 입력 문맥에 추가됩니다. 여기서는 실제 출력층 대신 별도 예시 후보로 샘플링을 체험합니다.",
  },
  {
    key: "test",
    title: "Test",
    label: "테스트",
    oneLine: "입력 문장이 답변 토큰으로 반복 생성되는 과정을 한 화면에서 추적합니다.",
    note: "테스트 화면은 토큰화, 임베딩, attention, FFN, softmax 샘플링을 반복해서 다음 토큰이 다시 문맥으로 들어가는 흐름을 보여주는 교육용 시뮬레이션입니다.",
  },
];

const observationPrompts = {
  tokenize: { question: '같은 말을 두 번 입력하면 토큰 ID도 같을까요?', answer: '같은 토큰은 같은 ID를 사용합니다. ID는 단어의 중요도나 정답 점수가 아니라 토큰을 구별하는 번호입니다. 현재 분할 규칙은 실제 GPT 토크나이저와 다릅니다.' },
  embedding: { question: '차원을 16에서 32로 늘리면, 토큰 ID와 숫자 성분의 개수는 각각 어떻게 될까요?', answer: 'ID는 그대로이고 벡터 성분 수가 늘어납니다. 실제 모델은 이 벡터 값을 학습하지만, 이 화면의 값은 설명을 위한 고정 예시입니다.' },
  attention: { question: '앞쪽 토큰을 선택해 보세요. 그 위치보다 뒤쪽 토큰의 Attention 비중은 어떻게 되나요?', answer: '미래 위치의 비중은 0이 됩니다. 선택한 위치까지의 정보만 이용하도록 가리는 인과 마스킹입니다. 보이는 토큰은 일반 단계에서 최근 8개로 제한합니다.' },
  ffn: { question: 'Hidden dimension을 바꾸면 입력과 출력의 성분 수도 바뀔까요?', answer: '가운데 은닉층의 성분 수만 바뀌고 입출력은 4차원을 유지합니다. 그림은 최대 8개 은닉 노드를 표시하며, 선택한 전체 차원으로 계산합니다.' },
  output: { question: '후보가 둘 이상일 때 Temperature를 올리면 낮았던 후보의 비중은 어떻게 바뀌나요?', answer: '같은 기준 분포에서 확률 차이가 줄어듭니다. 높은 확률이 사실의 정확성을 뜻하거나, 그 후보가 반드시 선택된다는 뜻은 아닙니다.' },
  test: { question: '생성된 조각 하나를 고르고, 다음 반복의 입력 문맥에도 포함됐는지 확인해 보세요.', answer: '새 토큰은 기존 문맥 뒤에 붙습니다. 다음 반복은 이 늘어난 문맥을 바탕으로 다음 토큰을 선택하는 과정을 보여 줍니다.' },
};

const palette = ["#156c83", "#db6f38", "#587f37", "#7b5aa6", "#b04e62", "#3e719e"];
const embeddingOptions = [8, 16, 32];
const ffnHiddenOptions = [8, 12, 16, 24, 32];
const TEST_MAX_ITERATIONS = 10;
const TEST_TURN_ANIMATION_MS = 3300;

const prompt = ref("오늘 날씨가 어때?");
const activePageIndex = ref(0);
const viewMode = ref("guided");
const embeddingDimension = ref(16);
const ffnHiddenDimension = ref(16);
const selectedAttentionIndex = ref(null);
const generatedTokens = ref([]);
const temperature = ref(0.8);
const geminiPrediction = ref(null);
const predictionStatus = ref("idle");
const predictionError = ref("");
const predictionCommitted = ref(false);
const sampledPredictionToken = ref("");
const testInput = ref("오늘 날씨가 어때?");
const testRuns = ref([]);
const selectedTestTurnIndex = ref(null);
const selectedTestAttentionIndex = ref(null);
const testAnimationKey = ref(0);
const testStatus = ref("idle");
const testError = ref("");
const SPECIAL_TOKEN = "<eos>";
const predictionMode = ref("demo");
const serverAvailable = import.meta.env.DEV || import.meta.env.VITE_ENABLE_GEMINI === "true";
let predictionController = null;
let testController = null;
const generationEnded = computed(() => generatedTokens.value.at(-1) === SPECIAL_TOKEN);
const modeNote = computed(() => predictionMode.value === "demo" ? DEMO_NOTE : "Gemini가 작성한 교육용 후보·추정 확률입니다. GPT의 내부 확률이나 앞 단계의 벡터에서 계산한 결과가 아닙니다.");

const activePage = computed(() => pages[activePageIndex.value]);
const contextText = computed(() =>
  generatedTokens.value.reduce((text, token) => appendTokenToText(text, token), prompt.value),
);
const baseTokens = computed(() => tokenize(prompt.value));
const tokenItems = computed(() => [
  ...baseTokens.value.map((token, index) => buildTokenItem(token, index, false)),
  ...generatedTokens.value.map((token, index) => buildTokenItem(token, baseTokens.value.length + index, true)),
]);
const visibleTokens = computed(() => tokenItems.value.slice(-8));
const focusItem = computed(() => tokenItems.value.at(-1) || buildTokenItem("텍스트", 0, false));
const selectedAttentionItem = computed(() => {
  const tokens = visibleTokens.value;
  if (!tokens.length) return focusItem.value;
  return tokens.find((item) => item.index === selectedAttentionIndex.value) || tokens.at(-1);
});
const qkv = computed(() => ({
  q: projectVector(selectedAttentionItem.value.vector, "q"),
  k: projectVector(selectedAttentionItem.value.vector, "k"),
  v: projectVector(selectedAttentionItem.value.vector, "v"),
}));
const embeddingRows = computed(() =>
  visibleTokens.value.map((item) => ({
    ...item,
    preview: buildEmbeddingPreview(item, embeddingDimension.value),
  })),
);
const embeddingStats = computed(() => ({
  dimensions: embeddingDimension.value,
  previewSize: embeddingDimension.value,
  tableShape: `vocab × ${embeddingDimension.value}`,
}));
const attentionRows = computed(() => {
  const query = qkv.value.q;
  const selectedVector = selectedAttentionItem.value.vector;
  const rawRows = visibleTokens.value.map((item) => {
    const key = projectVector(item.vector, "k");
    const value = projectVector(item.vector, "v");
    const score = dot(query, key) / Math.sqrt(query.length);
    const relation = item.index === selectedAttentionItem.value.index ? 1 : relationScore(selectedVector, item.vector);
    return { ...item, key, value, score, relation };
  });
  const weights = causalWeights(rawRows.map((item) => item.score), rawRows.map(item => item.index), selectedAttentionItem.value.index);
  return rawRows.map((item, index) => ({
    ...item,
    weight: weights[index],
  }));
});
const attentionMatrix = computed(() => {
  const rows = visibleTokens.value;
  return rows.map((queryItem) => {
    const query = projectVector(queryItem.vector, "q");
    const scores = rows.map((keyItem) => {
      const key = projectVector(keyItem.vector, "k");
      return dot(query, key) / Math.sqrt(query.length);
    });
    const weights = causalWeights(scores, rows.map(item => item.index), queryItem.index);
    const strongest = Math.max(...weights, 0);
    if (!strongest) return weights;
    return weights.map((weight) => weight / strongest);
  });
});
const contextVector = computed(() => {
  if (!attentionRows.value.length) return [0, 0, 0, 0];
  return attentionRows.value.reduce(
    (acc, row) => acc.map((value, index) => value + row.value[index] * row.weight),
    [0, 0, 0, 0],
  );
});
const ffnVectors = computed(() => feedForward(contextVector.value, ffnHiddenDimension.value));
const ffnLayers = computed(() => buildFfnLayers(ffnVectors.value));
const ffnConnections = computed(() => buildFfnConnections(ffnLayers.value));
const probabilities = computed(() =>
  applySamplingTemperature((geminiPrediction.value?.candidates || []).filter(candidate => !wouldRepeatGeneratedSequence(candidate.token, generatedTokens.value)), temperature.value),
);
const chosenToken = computed(
  () =>
    sampledPredictionToken.value ||
    probabilities.value.find(
      (candidate) => !wouldRepeatGeneratedSequence(candidate.token, generatedTokens.value),
    )?.token ||
    "",
);
const predictionSourceLabel = computed(() => {
  if (predictionStatus.value === "loading") return "처리 중";
  if (predictionStatus.value === "error") return "예측 실패";
  if (geminiPrediction.value?.source === "gemini") return "Gemini 예시 후보";
  if (geminiPrediction.value?.source === "demo") return "교육용 데모 후보";
  return "후보 대기";
});
const generatedPreview = computed(() => {
  if (predictionStatus.value === "ready" && !predictionCommitted.value) {
    return appendTokenToText(contextText.value, chosenToken.value);
  }
  return contextText.value;
});
const testAnswer = computed(() => testRuns.value.at(-1)?.answer || "");
const testFinalOutput = computed(() =>
  testRuns.value.map((turn) => turn.sampledToken).reduce((text, token) => appendFinalOutputToken(text, token), ""),
);
const selectedTestTurn = computed(() => {
  if (!testRuns.value.length) return null;
  return testRuns.value.find((turn) => turn.step === selectedTestTurnIndex.value) || testRuns.value[0];
});
const selectedTestAttentionIndexValue = computed(() => {
  const turn = selectedTestTurn.value;
  if (!turn?.contextTokens?.length) return null;
  if (turn.contextTokens[selectedTestAttentionIndex.value]) return selectedTestAttentionIndex.value;
  return turn.contextTokens.length - 1;
});
const selectedTestAttentionRows = computed(() => {
  const turn = selectedTestTurn.value;
  const queryIndex = selectedTestAttentionIndexValue.value;
  if (!turn || queryIndex === null) return [];
  const items = turn.contextTokens.map((token, index) => buildTokenItem(token, index, false));
  return buildAttentionRowsForItems(items, queryIndex);
});

function buildTokenItem(token, index, generated) {
  const id = tokenId(token);
  return {
    token,
    id,
    index,
    generated,
    vector: buildVector(token, id, index),
  };
}

function tokenize(text) {
  const normalized = text.trim() || "텍스트를 입력해보세요";
  const pieces = normalized.match(/[가-힣]+|[a-zA-Z0-9]+|[^\s가-힣a-zA-Z0-9]/g) || [normalized];
  return pieces.flatMap((piece) => {
    if (/^[가-힣]{5,}$/.test(piece)) return piece.match(/.{1,3}/g);
    if (/^[a-zA-Z0-9]{7,}$/.test(piece)) return piece.match(/.{1,4}/g);
    return [piece];
  });
}

function tokenId(token) {
  let hash = 17;
  for (let i = 0; i < token.length; i += 1) {
    hash = (hash * 37 + token.charCodeAt(i)) % 30000;
  }
  return 1000 + hash;
}

function seededNoise(text, index) {
  let hash = 0;
  const source = `${text}:${index}`;
  for (let i = 0; i < source.length; i += 1) {
    hash = (hash * 31 + source.charCodeAt(i)) % 9973;
  }
  return (hash % 100) / 100;
}

function buildVector(token, id, index) {
  return Array.from({ length: 4 }, (_, dimension) => denseDimensionValue(token, id, index, dimension));
}

function buildEmbeddingPreview(item, dimensions) {
  return Array.from({ length: dimensions }, (_, bucket) => {
    const dimensionIndex = bucket;
    const value = denseDimensionValue(item.token, item.id, item.index, dimensionIndex);
    return {
      bucket,
      dimensionIndex,
      value,
    };
  });
}

function denseDimensionValue(token, id, index, dimensionIndex) {
  const noise = seededNoise(`${token}:${id}:dense:${dimensionIndex}`, dimensionIndex);
  const wave = Math.sin((dimensionIndex + 1) * 0.37 + id * 0.001) * 0.35;
  return Number((noise * 2 - 1 + wave).toFixed(2));
}

function projectVector(vector, kind) {
  const offset = kind === "q" ? 0.17 : kind === "k" ? -0.11 : 0.29;
  return vector.map((value, index) => {
    const scale = 0.65 + seededNoise(`${kind}:${index}`, index) * 0.7;
    return Number((value * scale + offset * (index % 2 === 0 ? 1 : -1)).toFixed(2));
  });
}

function dot(left, right) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function norm(vector) {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}

function relationScore(left, right) {
  const denominator = norm(left) * norm(right);
  if (!denominator) return 0;
  const cosine = dot(left, right) / denominator;
  return clamp((cosine + 1) / 2, 0, 1);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

async function runTestGeneration() {
  if (testStatus.value === "loading") return;
  const source = testInput.value.trim();
  if (!source) return;

  const controller = new AbortController();
  testController = controller;
  const mode = predictionMode.value;
  const baseTokens = tokenize(source);
  const turns = [];
  let generated = [];
  testRuns.value = [];
  selectedTestTurnIndex.value = null;
  selectedTestAttentionIndex.value = null;
  testError.value = "";
  testStatus.value = "loading";

  try {
    for (let step = 0; step < TEST_MAX_ITERATIONS; step += 1) {
      controller.signal.throwIfAborted();
      const contextTokens = [...baseTokens, ...generated];
      const generatedText = generated.reduce((text, token) => appendTokenToText(text, token), "");
      if (shouldFinishGeneratedAnswer(generated)) {
        const candidates = forceEosCandidate([]);
        const turn = buildTestTurn(contextTokens, generated, candidates, SPECIAL_TOKEN, step, { source: "guard" });
        turns.push(turn);
        testRuns.value = [...turns];
        selectedTestTurnIndex.value = turn.step;
        selectedTestAttentionIndex.value = null;
        testAnimationKey.value += 1;
        break;
      }

      const prediction = await requestTestGeminiPrediction(source, generated, generatedText, step, controller.signal, mode);
      controller.signal.throwIfAborted();
      let candidates = normalizeTestCandidates({ ...prediction, candidates: prediction.candidates.filter(candidate => !isBadAnswerStartToken(candidate.token, generated) && !isRepetitiveTestToken(candidate.token, generated)) });
      let sampledToken = resolveTestSampledToken(candidates, generated, step);
      if (step >= TEST_MAX_ITERATIONS - 1) candidates = forceEosCandidate(candidates);
      const turn = buildTestTurn(contextTokens, generated, candidates, sampledToken, step, prediction);
      turns.push(turn);
      testRuns.value = [...turns];
      selectedTestTurnIndex.value = turn.step;
      selectedTestAttentionIndex.value = null;
      testAnimationKey.value += 1;

      if (sampledToken === SPECIAL_TOKEN) break;
      generated = [...generated, sampledToken];

      if (step < TEST_MAX_ITERATIONS - 1) await wait(TEST_TURN_ANIMATION_MS, controller.signal);
    }
  } catch (error) {
    if (!controller.signal.aborted) testError.value = error instanceof Error ? error.message : "테스트 생성에 실패했습니다.";
  } finally {
    if (testController === controller) { testController = null; testStatus.value = "idle"; }
  }
}

function wait(ms, signal) {
  return new Promise(resolve => {
    const finish = () => { window.clearTimeout(timer); signal?.removeEventListener("abort", finish); resolve(); };
    const timer = window.setTimeout(finish, ms);
    signal?.addEventListener("abort", finish, { once: true });
    if (signal?.aborted) finish();
  });
}

function stopTest() {
  testController?.abort();
  testController = null;
  testStatus.value = "idle";
}

function selectTestTurn(step) {
  selectedTestTurnIndex.value = step;
  selectedTestAttentionIndex.value = null;
  testAnimationKey.value += 1;
}

function selectTestAttentionToken(index) {
  selectedTestAttentionIndex.value = index;
}

async function requestTestGeminiPrediction(source, generatedTokens, generatedText, step, signal, mode) {
  return requestPrediction({
    mode: "test", userInput: source, generated: generatedText, generatedTokens,
    iteration: step, maxIterations: TEST_MAX_ITERATIONS, temperature: temperature.value,
  }, { mode, signal });
}

function normalizeTestCandidates(prediction) {
  const candidates = Array.isArray(prediction?.candidates) ? prediction.candidates : [];
  const normalized = candidates
    .map((candidate, index) => ({
      token: normalizeSpecialToken(candidate?.token || `후보${index + 1}`),
      score: Number.isFinite(Number(candidate?.score)) ? Number(candidate.score) : 1 / (index + 1),
      probability: Number.isFinite(Number(candidate?.probability)) ? Number(candidate.probability) : 0,
      reason: String(candidate?.reason || "다음 토큰 후보입니다."),
    }))
    .filter((candidate) => candidate.token)
    .slice(0, 2);
  const fallback = normalized.length
    ? normalized
    : [{ token: SPECIAL_TOKEN, score: 0, probability: 1, reason: "종료 후보" }];
  return applySamplingTemperature(normalizeCandidateProbabilities(fallback), temperature.value);
}

function normalizeSpecialToken(token) {
  const normalized = String(token || "").trim();
  if (/^<\s*eos\s*>$/i.test(normalized) || /^eos$/i.test(normalized)) return SPECIAL_TOKEN;
  return normalized;
}

function normalizeCandidateProbabilities(candidates) {
  if (!candidates.length) return [];
  const sum = candidates.reduce((total, candidate) => total + Math.max(0, candidate.probability), 0);
  if (sum > 0) {
    return candidates.map((candidate) => ({ ...candidate, probability: Math.max(0, candidate.probability) / sum }));
  }
  const weights = softmax(candidates.map((candidate) => candidate.score));
  return candidates.map((candidate, index) => ({ ...candidate, probability: weights[index] }));
}

function buildAttentionRowsForItems(items, queryIndex) {
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

function resolveTestSampledToken(candidates, generated, step) {
  if (step >= TEST_MAX_ITERATIONS - 1 || generated.length >= TEST_MAX_ITERATIONS - 1) return SPECIAL_TOKEN;
  const validCandidates = candidates.filter((candidate) => {
    const token = normalizeSpecialToken(candidate.token);
    return !isBadAnswerStartToken(token, generated) && !isRepetitiveTestToken(token, generated);
  });
  return normalizeSpecialToken(sampleCandidate(validCandidates)?.token || SPECIAL_TOKEN);
}

function isBadAnswerStartToken(token, generated) {
  if (generated.length) return false;
  return new Set(["누구", "뭐", "무엇", "어때", "왜", "언제", "어디", "어떻게"]).has(String(token || "").trim());
}

function shouldFinishGeneratedAnswer(generated) {
  const tokens = generated.map(normalizeSpecialToken).filter(Boolean);
  if (!tokens.length) return false;
  if (hasRepeatedPhrase(tokens)) return true;
  const last = tokens.at(-1);
  if (/^[.!?。！？]$/.test(last)) return true;
  return tokens.length >= 3 && /(요|다|니다|습니다|해요)$/.test(last);
}

function hasRepeatedPhrase(tokens) {
  if (tokens.length < 4) return false;
  for (let index = 0; index <= tokens.length - 4; index += 1) {
    const first = `${tokens[index]} ${tokens[index + 1]}`;
    const second = `${tokens[index + 2]} ${tokens[index + 3]}`;
    if (first === second) return true;
  }
  const tail = tokens.slice(-2).join(" ");
  return tokens.slice(0, -2).some((token, index, source) => `${token} ${source[index + 1]}` === tail);
}

function isRepetitiveTestToken(token, generated) {
  const normalized = normalizeSpecialToken(token);
  if (!normalized || normalized === SPECIAL_TOKEN) return false;
  const recent = generated.slice(-2).map(normalizeSpecialToken);
  if (recent.at(-1) === normalized) return true;
  if (isRepeatableToken(normalized)) return false;
  return generated.map(normalizeSpecialToken).includes(normalized);
}

function isRepeatableToken(token) {
  return /^[.,!?;:！？。．、，]$/.test(token) || isKoreanSuffix(token);
}

function forceEosCandidate() {
  return [{ token: SPECIAL_TOKEN, score: 0, probability: 1, reason: "문장 완료 또는 반복 한도에 도달해 종료합니다." }];
}

function buildTestTurn(contextTokens, generated, candidates, sampledToken, step, prediction) {
  const visible = contextTokens.map((token, index) => buildTokenItem(token, index, false));
  const attention = buildAttentionRowsForItems(visible, Math.max(0, visible.length - 1));
  const contextVector = attention.reduce(
    (acc, item) => acc.map((value, dimension) => value + item.value[dimension] * item.weight),
    [0, 0, 0, 0],
  );
  const ffn = buildTestFfn(contextVector);
  const answer = generated
    .concat(sampledToken === SPECIAL_TOKEN ? [] : [sampledToken])
    .reduce((text, token) => appendTokenToText(text, token), "");

  return {
    step,
    contextTokens,
    tokenEmbeddings: visible.map((item) => ({
      token: item.token,
      preview: item.vector.map((value, dimensionIndex) => ({ value, dimensionIndex })),
    })),
    attention,
    ffn,
    candidates,
    sampledToken,
    answer,
    note: prediction?.note || "",
  };
}

function buildTestFfn(vector) {
  return feedForward(vector, 8);
}

function chooseToken(candidates = probabilities.value, generated = generatedTokens.value) {
  const validCandidates = candidates.filter(
    (candidate) => !wouldRepeatGeneratedSequence(candidate.token, generated),
  );
  return sampleCandidate(validCandidates)?.token || "";
}

function wouldRepeatGeneratedSequence(token, generated) {
  const normalized = normalizeSpecialToken(token);
  const history = generated.map(normalizeSpecialToken).filter(Boolean);
  if (!normalized || normalized === SPECIAL_TOKEN || !history.length) return false;
  if (history.at(-1) === normalized) return true;

  const sequence = [...history, normalized];
  for (let size = 2; size <= 3; size += 1) {
    if (sequence.length < size * 2) continue;
    const tail = sequence.slice(-size).join("\u0000");
    for (let start = 0; start <= sequence.length - size * 2; start += 1) {
      if (sequence.slice(start, start + size).join("\u0000") === tail) return true;
    }
  }
  return false;
}

function appendTokenToText(text, token) {
  const base = String(text || "");
  const next = String(token || "");
  if (!next) return base;
  if (!base.trim()) return next.trimStart();
  if (normalizeSpecialToken(next) === SPECIAL_TOKEN) return `${base}${SPECIAL_TOKEN}`;
  if (/\s$/.test(base) || /^\s/.test(next)) return `${base}${next.trimStart()}`;
  if (/^[.,!?;:)\]}%！？。．、，]/.test(next)) return `${base}${next}`;
  if (isKoreanSuffix(next)) return `${base}${next}`;
  return `${base} ${next}`;
}

function appendFinalOutputToken(text, token) {
  const base = String(text || "");
  const next = normalizeSpecialToken(token);
  if (!next) return base;
  if (!base.trim()) return next;
  if (next === SPECIAL_TOKEN) return `${base}${SPECIAL_TOKEN}`;
  if (/^[.,!?;:)\]}%！？。．、，]/.test(next)) return `${base}${next}`;
  if (shouldMergeFinalToken(base, next)) return `${base}${next}`;
  return `${base} ${next}`;
}

function shouldMergeFinalToken(base, next) {
  const previous = base.trim().match(/[가-힣]$/)?.[0] || "";
  if (!previous) return false;
  if (!/^[가-힣]+$/.test(next)) return false;
  return next.length === 1 && isKoreanSuffix(next);
}

function isKoreanSuffix(token) {
  const normalized = token.trim();
  const suffixes = new Set([
    "은",
    "는",
    "이",
    "가",
    "을",
    "를",
    "에",
    "의",
    "도",
    "만",
    "와",
    "과",
    "로",
    "으로",
    "요",
    "죠",
    "다",
    "고",
    "며",
    "면",
    "지만",
    "입니다",
    "습니다",
  ]);
  return suffixes.has(normalized);
}

function buildFfnLayers(vectors) {
  const input = vectors.input.map((value, index) => ({
    id: `in-${index}`,
    layer: "input",
    label: `x${index + 1}`,
    value,
    x: 90,
    y: distributeY(index, vectors.input.length),
  }));
  const hidden = vectors.hidden.slice(0, 8).map((value, index) => ({
    id: `hidden-${index}`,
    layer: "hidden",
    label: `h${index + 1}`,
    value,
    x: 360,
    y: distributeY(index, Math.min(8, vectors.hidden.length)),
  }));
  const output = vectors.output.map((value, index) => ({
    id: `out-${index}`,
    layer: "output",
    label: `y${index + 1}`,
    value,
    x: 630,
    y: distributeY(index, vectors.output.length),
  }));
  return { input, hidden, output };
}

function buildFfnConnections(layers) {
  const firstHop = layers.input.flatMap((source) =>
    layers.hidden.map((target) => buildConnection(source, target, "in-hidden")),
  );
  const secondHop = layers.hidden.flatMap((source) =>
    layers.output.map((target) => buildConnection(source, target, "hidden-out")),
  );
  return [...firstHop, ...secondHop];
}

function buildConnection(source, target, salt) {
  const strength = Math.abs(source.value * 0.45 + target.value * 0.55);
  const jitter = seededNoise(`${salt}:${source.id}:${target.id}`, Math.round(strength * 100));
  return {
    key: `${source.id}-${target.id}`,
    x1: source.x,
    y1: source.y,
    x2: target.x,
    y2: target.y,
    opacity: Math.min(0.72, 0.08 + strength * 0.35 + jitter * 0.12),
    width: Math.min(4, 0.7 + strength * 1.8),
  };
}

function distributeY(index, count) {
  if (count === 1) return 160;
  return 44 + (index / (count - 1)) * 232;
}

function selectAttentionToken(index) {
  selectedAttentionIndex.value = index;
}

async function requestGeminiPrediction() {
  if (predictionStatus.value === "loading" || generationEnded.value || !prompt.value.trim()) return;
  const controller = new AbortController();
  predictionController = controller;
  predictionStatus.value = "loading";
  predictionError.value = "";
  predictionCommitted.value = false;
  sampledPredictionToken.value = "";
  try {
    const payload = await requestPrediction({
      originalInput: prompt.value, context: contextText.value,
      generatedTokens: generatedTokens.value, temperature: temperature.value,
    }, { mode: predictionMode.value, signal: controller.signal });
    if (controller.signal.aborted || predictionController !== controller) return;
    geminiPrediction.value = payload;
    sampledPredictionToken.value = chooseToken(probabilities.value, generatedTokens.value);
    predictionStatus.value = "ready";
  } catch (error) {
    if (controller.signal.aborted || predictionController !== controller) return;
    predictionError.value = error instanceof Error ? error.message : "예측 요청에 실패했습니다.";
    geminiPrediction.value = null;
    sampledPredictionToken.value = "";
    predictionStatus.value = "error";
  } finally {
    if (predictionController === controller) predictionController = null;
  }
}

function maybePredictOnOutputPage() {
  if (viewMode.value !== "advanced" || activePage.value.key !== "output") return;
  if (predictionStatus.value === "loading" || geminiPrediction.value) return;
  requestGeminiPrediction();
}

async function predictNextToken() {
  activePageIndex.value = getPageIndex("output");
  updateRouteFromPage();
  await requestGeminiPrediction();
}

async function appendPrediction() {
  activePageIndex.value = getPageIndex("output");
  updateRouteFromPage();
  if (!geminiPrediction.value && predictionStatus.value !== "error") await requestGeminiPrediction();
  if (predictionStatus.value === "loading") return;
  const token = chosenToken.value;
  if (!token) return;
  generatedTokens.value = [...generatedTokens.value, token];
  predictionCommitted.value = true;
  geminiPrediction.value = null;
  sampledPredictionToken.value = "";
  predictionStatus.value = "idle";
  setPage(0);
}

function setPage(index) {
  activePageIndex.value = Math.min(pages.length - 1, Math.max(0, index));
  updateRouteFromPage();
  maybePredictOnOutputPage();
}

function getPageIndex(key) {
  const index = pages.findIndex((page) => page.key === key);
  return index >= 0 ? index : 0;
}

function nextPage() {
  setPage(activePageIndex.value + 1);
}

function previousPage() {
  setPage(activePageIndex.value - 1);
}

function reset() {
  stopTest();
  testRuns.value = [];
  testError.value = "";
  selectedTestTurnIndex.value = null;
  selectedTestAttentionIndex.value = null;
  selectedAttentionIndex.value = null;
  clearPrediction();
  generatedTokens.value = [];
  geminiPrediction.value = null;
  predictionStatus.value = "idle";
  predictionError.value = "";
  predictionCommitted.value = false;
  sampledPredictionToken.value = "";
  setPage(0);
}

function clearPrediction() {
  predictionController?.abort();
  predictionController = null;
  geminiPrediction.value = null;
  predictionStatus.value = "idle";
  predictionError.value = "";
  predictionCommitted.value = false;
  sampledPredictionToken.value = "";
}

watch(prompt, () => {
  generatedTokens.value = [];
  clearPrediction();
  setPage(0);
});

watch(temperature, () => {
  if (geminiPrediction.value) sampledPredictionToken.value = chooseToken(probabilities.value);
});
watch(predictionMode, reset);

watch(activePageIndex, maybePredictOnOutputPage);

function showGuided() {
  clearPrediction();
  stopTest();
  viewMode.value = "guided";
  window.history.replaceState(null, "", "#learn");
}

async function openInternal(page = "tokenize", context = prompt.value) {
  viewMode.value = "advanced";
  reset();
  prompt.value = context;
  testInput.value = context;
  temperature.value = 1;
  await nextTick();
  setPage(getPageIndex(page));
}

function syncPageFromRoute() {
  if (typeof window === "undefined") return;
  const key = window.location.hash.replace(/^#/, "");
  const index = pages.findIndex((page) => page.key === key);
  if (index >= 0) { viewMode.value = "advanced"; activePageIndex.value = index; }
  else { clearPrediction(); stopTest(); viewMode.value = "guided"; }
}

function updateRouteFromPage() {
  if (typeof window === "undefined") return;
  const key = viewMode.value === "guided" ? "learn" : pages[activePageIndex.value]?.key || pages[0].key;
  if (window.location.hash !== `#${key}`) {
    window.history.replaceState(null, "", `#${key}`);
  }
}

onMounted(() => {
  syncPageFromRoute();
  window.addEventListener("hashchange", syncPageFromRoute);
});

onUnmounted(() => {
  predictionController?.abort();
  stopTest();
  window.removeEventListener("hashchange", syncPageFromRoute);
});
</script>

<template>
  <main class="app-shell">
    <header class="app-header" :class="{ 'guided-header': viewMode === 'guided' }">
      <div>
        <p class="eyebrow">GPT generation visualizer</p>
        <h1 class="app-main-title">GPT가 글을 만드는 과정</h1>
      </div>
      <div v-if="viewMode === 'advanced'" class="prompt-control" aria-label="프롬프트 입력">
        <label for="promptInput">프롬프트</label>
        <input id="promptInput" v-model="prompt" type="text" maxlength="160" autocomplete="off" />
      </div>
    </header>

    <nav class="experience-mode-nav" aria-label="학습 방식">
      <button type="button" :class="{ active: viewMode === 'guided' }" :aria-pressed="viewMode === 'guided'" @click="showGuided">따라하며 배우기</button>
      <button type="button" :class="{ active: viewMode === 'advanced' }" :aria-pressed="viewMode === 'advanced'" @click="openInternal('tokenize')">내부 원리 살펴보기</button>
    </nav>
    <GuidedLearning v-show="viewMode === 'guided'" @explore="({ page, context }) => openInternal(page, context)" />

    <section v-show="viewMode === 'advanced'" aria-label="내부 원리 심화 보기">
    <section class="simulation-notice" aria-label="시뮬레이션 안내">
      <label for="predictionMode">후보 생성 방식
        <select id="predictionMode" v-model="predictionMode">
          <option value="demo">교육용 데모 · API 키 불필요</option>
          <option v-if="serverAvailable" value="gemini">Gemini 예시 후보 · 서버 필요</option>
        </select>
      </label>
      <p>{{ modeNote }}</p>
      <p>토큰 ID와 벡터는 설명용 값이며, 위치 정보·다중 헤드·정규화·잔차 연결 등은 생략했습니다. Attention 이후에는 앞의 4개 성분만 사용합니다.</p>
    </section>

    <nav class="step-nav" aria-label="학습 단계">
      <button
        v-for="(page, index) in pages"
        :key="page.key"
        class="step-tab"
        :class="{ 'is-active': activePageIndex === index, 'is-past': activePageIndex > index }"
        :aria-current="activePageIndex === index ? 'step' : undefined"
        type="button"
        @click="setPage(index)"
      >
        <span>{{ index + 1 }}</span>
        <strong>{{ page.label }}</strong>
      </button>
    </nav>

    <section class="context-band" aria-label="현재 문맥">
      <div>
        <span class="section-kicker">현재 문맥</span>
        <p>
          {{ contextText
          }}<mark v-if="predictionStatus === 'ready' && !predictionCommitted">{{ chosenToken }}</mark
          >
        </p>
      </div>
      <button class="ghost-button" type="button" @click="reset">초기화</button>
    </section>

    <aside class="advanced-observation">
      <strong>이 단계에서 관찰할 질문</strong>
      <p>{{ observationPrompts[activePage.key].question }}</p>
      <details :key="activePage.key"><summary>관찰한 뒤 설명 확인하기</summary><p>{{ observationPrompts[activePage.key].answer }}</p></details>
    </aside>
    <p v-if="activePage.key === 'output' || activePage.key === 'test'" class="advanced-boundary">여기서부터는 후보 선택을 보여 주는 별도 예시입니다. 앞에서 본 FFN 벡터를 실제 어휘 점수로 바꾸는 출력층은 생략했으며, 준비된 데모 또는 Gemini가 작성한 후보를 사용합니다. 실제 GPT의 내부 확률을 측정한 값이 아닙니다.</p>

    <section class="page-stage" :class="`page-stage--${activePage.key}`" aria-live="polite">
      <div class="page-heading">
        <div class="page-heading-copy">
          <span class="section-kicker">Step {{ activePageIndex + 1 }}</span>
          <h2>{{ activePage.title }}</h2>
          <p>{{ activePage.oneLine }}</p>
        </div>
        <div v-if="activePage.key === 'attention'" class="formula-note" aria-label="Attention 수식">
          <span>Attention formula</span>
          <code>Q = XWq, K = XWk, V = XWv</code>
          <code>Attention = softmax(QK^T / sqrt(d_k) + mask)V</code>
        </div>
        <div v-else-if="activePage.key === 'ffn'" class="formula-note" aria-label="FFN 수식">
          <span>FFN formula</span>
          <code>x({{ ffnVectors.input.length }}d) -> h({{ ffnHiddenDimension }}d) -> y({{ ffnVectors.output.length }}d)</code>
          <code>h = ReLU(xW1 + b1), y = hW2 + b2</code>
        </div>
      </div>

      <div v-if="activePage.key === 'tokenize'" class="lesson-scene tokenize-scene">
        <div class="sentence-panel">
          <span>입력 문장</span>
          <strong>{{ prompt || "텍스트를 입력해보세요" }}</strong>
        </div>
        <div class="flow-arrow" aria-hidden="true">→</div>
        <div class="token-grid" aria-label="토큰과 ID 매핑">
          <div
            v-for="item in tokenItems"
            :key="`${item.token}-${item.index}`"
            class="token-tile"
            :class="{ 'is-generated': item.generated }"
          >
            <span>subword</span>
            <strong>{{ item.token }}</strong>
            <code>#{{ item.id }}</code>
          </div>
        </div>
      </div>

      <div v-else-if="activePage.key === 'embedding'" class="lesson-scene embedding-scene">
        <div class="lookup-panel">
          <span class="section-kicker">ID lookup</span>
          <label class="dimension-control" for="embeddingDimension">
            <span>벡터 차원</span>
            <select id="embeddingDimension" v-model.number="embeddingDimension">
              <option v-for="option in embeddingOptions" :key="option" :value="option">{{ option }}d</option>
            </select>
          </label>
          <div class="lookup-row">
            <strong>#{{ focusItem.id }}</strong>
            <span>one-hot</span>
            <b>·</b>
            <span>embedding table {{ embeddingStats.tableShape }}</span>
            <b>=</b>
            <span>{{ embeddingStats.dimensions }}d vector</span>
          </div>
          <p class="mini-note">
            화면에는 학습용으로 {{ embeddingStats.previewSize }}개 축만 표시합니다.
            실제 모델은 512, 768, 1536차원처럼 더 큰 임베딩을 사용할 수 있습니다.
          </p>
        </div>
        <div class="embedding-table">
          <div v-for="row in embeddingRows" :key="`${row.token}-${row.id}`" class="embedding-row">
            <div class="embedding-token">
              <strong>{{ row.token }}</strong>
              <span>#{{ row.id }}</span>
            </div>
            <div
              class="vector-bars"
              :style="{ '--embedding-dims': embeddingStats.dimensions }"
              aria-label="임베딩 벡터"
            >
              <div
                v-for="sample in row.preview"
                :key="sample.dimensionIndex"
                class="vector-sample"
                :style="{
                  '--bar': `${Math.max(12, Math.abs(sample.value) * 34)}px`,
                  '--tone': sample.value >= 0 ? palette[sample.bucket % palette.length] : '#5d6b78',
                }"
                :title="`dim ${sample.dimensionIndex}: ${sample.value}`"
              >
                <span class="vector-bar" aria-hidden="true"></span>
                <code class="vector-value">{{ sample.value.toFixed(2) }}</code>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="activePage.key === 'attention'" class="lesson-scene attention-scene">
        <div class="token-selector" aria-label="Attention 기준 토큰 선택">
          <button
            v-for="item in visibleTokens"
            :key="`select-${item.index}`"
            class="token-chip"
            :class="{ 'is-active': item.index === selectedAttentionItem.index }"
            type="button"
            @click="selectAttentionToken(item.index)"
          >
            {{ item.token }}
          </button>
        </div>
        <div class="qkv-strip">
          <div>
            <span>Q</span>
            <small>{{ selectedAttentionItem.token }} 기준</small>
            <strong>{{ qkv.q.map((v) => v.toFixed(1)).join(" · ") }}</strong>
          </div>
          <div>
            <span>K</span>
            <strong>{{ qkv.k.map((v) => v.toFixed(1)).join(" · ") }}</strong>
          </div>
          <div>
            <span>V</span>
            <strong>{{ qkv.v.map((v) => v.toFixed(1)).join(" · ") }}</strong>
          </div>
        </div>

        <div class="attention-layout">
          <div class="attention-list">
            <div v-for="row in attentionRows" :key="`${row.token}-${row.index}`" class="attention-row">
              <span class="math-token">{{ row.token }}</span>
              <div class="attention-metrics">
                <div>
                  <small>벡터 유사도</small>
                  <span class="bar-track">
                    <span
                      class="bar-fill relation-fill"
                      :style="{ '--value': `${Math.round(row.relation * 100)}%` }"
                    ></span>
                  </span>
                  <strong>{{ row.relation.toFixed(2) }}</strong>
                </div>
                <div>
                  <small>Attention 비중</small>
                  <span class="bar-track">
                    <span class="bar-fill" :style="{ '--value': `${Math.round(row.weight * 100)}%` }"></span>
                  </span>
                  <strong>{{ Math.round(row.weight * 100) }}%</strong>
                </div>
              </div>
            </div>
          </div>
          <div class="attention-map" :style="{ '--token-count': visibleTokens.length }" aria-label="attention map">
            <div class="map-head"></div>
            <span v-for="item in visibleTokens" :key="`col-${item.index}`">{{ item.token }}</span>
            <template v-for="(row, rowIndex) in attentionMatrix" :key="`row-${rowIndex}`">
              <strong>{{ visibleTokens[rowIndex].token }}</strong>
              <i
                v-for="(weight, colIndex) in row"
                :key="`${rowIndex}-${colIndex}`"
                :style="{ '--alpha': weight.toFixed(2) }"
                :title="colIndex > rowIndex ? '미래 토큰: 차단' : '행 내 상대적인 Attention 강도'"
              ></i>
            </template>
          </div>
        </div>
      </div>

      <div v-else-if="activePage.key === 'ffn'" class="lesson-scene ffn-scene">
        <label class="hidden-control" for="ffnHiddenDimension">
          <span>Hidden dimension</span>
          <select id="ffnHiddenDimension" v-model.number="ffnHiddenDimension">
            <option v-for="option in ffnHiddenOptions" :key="option" :value="option">{{ option }}d</option>
          </select>
        </label>
        <div class="network-legend" aria-hidden="true">
          <span>입력 {{ ffnVectors.input.length }}d</span>
          <span>확장 {{ ffnVectors.hidden.length }}d</span>
          <span>출력 {{ ffnVectors.output.length }}d</span>
        </div>
        <svg class="ffn-network" viewBox="0 0 720 320" role="img" aria-label="피드포워드 신경망 데이터 흐름">
          <line
            v-for="connection in ffnConnections"
            :key="connection.key"
            :x1="connection.x1"
            :y1="connection.y1"
            :x2="connection.x2"
            :y2="connection.y2"
            :stroke-opacity="connection.opacity"
            :stroke-width="connection.width"
          />
          <g v-for="node in [...ffnLayers.input, ...ffnLayers.hidden, ...ffnLayers.output]" :key="node.id">
            <circle
              :cx="node.x"
              :cy="node.y"
              :r="node.layer === 'hidden' ? 10 + Math.abs(node.value) * 3 : 12 + Math.abs(node.value) * 4"
              :class="`node-${node.layer}`"
            />
            <text :x="node.x" :y="node.y + 4">{{ node.label }}</text>
          </g>
        </svg>
        <p class="mini-note">
          입력과 출력은 Attention에서 넘어온 {{ ffnVectors.input.length }}d 벡터와 동일하게 유지하고,
          가운데 hidden dimension만 넓혀 특징을 만든 뒤 다시 줄입니다. 모든 토큰에 동일한 가중치를 사용합니다. 그림은 은닉 노드 중 최대 8개만 보여줍니다.
        </p>
      </div>

      <div v-else-if="activePage.key === 'output'" class="lesson-scene output-scene">
        <div class="logit-panel">
          <div class="logit-header">
            <span class="section-kicker">{{ predictionSourceLabel }}</span>
            <strong>{{ chosenToken.trim() || "계산 대기" }}</strong>
          </div>
          <div class="probability-list">
            <div v-for="item in probabilities" :key="item.token" class="probability-row">
              <span>{{ item.token }}</span>
              <span class="bar-track">
                <span class="bar-fill" :style="{ '--value': `${Math.round(item.probability * 100)}%` }"></span>
              </span>
              <strong>{{ Math.round(item.probability * 100) }}%</strong>
            </div>
            <p v-if="!probabilities.length" class="empty-state">
              예측을 실행하면 후보 토큰 확률분포가 여기에 표시됩니다.
            </p>
          </div>
        </div>

        <div class="sample-panel">
          <div class="sample-preview">
            <span>샘플링 결과</span>
            <p>{{ generatedPreview }}</p>
          </div>
          <div class="output-actions">
            <button class="primary-button" type="button" :disabled="predictionStatus === 'loading' || generationEnded || !prompt.trim()" @click="predictNextToken">
              {{ predictionStatus === "loading" ? "처리 중" : "예측" }}
            </button>
            <button class="primary-button secondary" type="button" :disabled="predictionStatus !== 'ready' || !chosenToken || generationEnded" @click="appendPrediction">
              문맥에 추가
            </button>
          </div>
          <label class="temperature-control" for="temperatureRange">
            <span>Temperature {{ temperature.toFixed(1) }}</span>
            <input id="temperatureRange" v-model.number="temperature" :disabled="testStatus === 'loading'" type="range" min="0.2" max="1.6" step="0.1" />
          </label>
          <p v-if="generationEnded" class="api-note">생성이 끝났습니다. 초기화하면 다시 시작할 수 있습니다.</p>
          <p v-if="geminiPrediction?.note" class="api-note">{{ geminiPrediction.note }}</p>
          <p v-if="predictionError" class="api-note is-error">{{ predictionError }}</p>
        </div>
      </div>

      <div v-else class="lesson-scene test-scene">
        <div class="test-window">
          <div class="test-output" aria-live="polite">
            <p v-if="!testRuns.length && testStatus !== 'loading'" class="empty-state">
              아래 입력창에 문장을 넣고 테스트를 실행하면, 답변 토큰이 special token까지 반복 생성되는 과정이 표시됩니다.
            </p>

            <template v-else>
              <div class="test-response">
                <span>생성된 답변</span>
                <p>{{ testAnswer }}</p>
              </div>

              <div
                v-if="selectedTestTurn"
                :key="`animation-${testAnimationKey}-${selectedTestTurn.step}`"
                class="test-animation"
              >
                <header class="test-animation-header">
                  <span>선택된 반복 {{ selectedTestTurn.step + 1 }}</span>
                  <strong>
                    {{ selectedTestTurn.sampledToken === SPECIAL_TOKEN ? "종료 토큰 <eos>" : selectedTestTurn.sampledToken }}
                  </strong>
                </header>

                <div class="test-pipeline is-animated">
                  <section class="test-stage animation-stage" style="--delay: 0ms">
                    <span>Prompt → Tokenizing</span>
                    <p class="test-context-line">{{ selectedTestTurn.contextTokens.join(" ") }}</p>
                    <div class="test-token-row">
                      <b
                        v-for="(token, index) in selectedTestTurn.contextTokens"
                        :key="`anim-token-${selectedTestTurn.step}-${index}`"
                        :style="{ '--item-delay': `${index * 65}ms` }"
                      >
                        {{ token }}
                      </b>
                    </div>
                  </section>

                  <section class="test-stage animation-stage" style="--delay: 520ms">
                    <span>Embedding</span>
                    <div class="test-embedding-grid">
                      <div
                        v-for="(item, index) in selectedTestTurn.tokenEmbeddings"
                        :key="`anim-embedding-${selectedTestTurn.step}-${index}-${item.token}`"
                        :style="{ '--item-delay': `${index * 75}ms` }"
                      >
                        <strong>{{ item.token }}</strong>
                        <div class="test-mini-bars">
                          <i
                            v-for="sample in item.preview"
                            :key="sample.dimensionIndex"
                            :style="{
                              '--bar': `${Math.max(10, Math.abs(sample.value) * 28)}px`,
                              '--tone': sample.value >= 0 ? palette[sample.bucket % palette.length] : '#5d6b78',
                            }"
                          ></i>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section class="test-stage animation-stage" style="--delay: 1120ms">
                    <span>Q · K → Attention</span>
                    <div class="test-attention-selector" aria-label="attention 기준 토큰 선택">
                      <button
                        v-for="(token, index) in selectedTestTurn.contextTokens"
                        :key="`attention-select-${selectedTestTurn.step}-${index}`"
                        class="test-attention-chip"
                        :class="{ 'is-active': index === selectedTestAttentionIndexValue }"
                        type="button"
                        @click="selectTestAttentionToken(index)"
                      >
                        {{ token }}
                      </button>
                    </div>
                    <div class="test-score-list">
                      <div
                        v-for="(item, index) in selectedTestAttentionRows"
                        :key="`anim-attention-${selectedTestTurn.step}-${index}-${item.token}`"
                        :style="{ '--item-delay': `${index * 70}ms` }"
                      >
                        <small>{{ item.token }}</small>
                        <span class="bar-track">
                          <span class="bar-fill relation-fill" :style="{ '--value': `${Math.round(item.weight * 100)}%` }"></span>
                        </span>
                        <strong>{{ Math.round(item.weight * 100) }}%</strong>
                      </div>
                    </div>
                  </section>

                  <section class="test-stage animation-stage" style="--delay: 1760ms">
                    <span>FFN</span>
                    <div class="test-vector-flow">
                      <code>{{ selectedTestTurn.ffn.input.join(" · ") }}</code>
                      <b>→</b>
                      <code>{{ selectedTestTurn.ffn.hidden.slice(0, 4).join(" · ") }}</code>
                      <b>→</b>
                      <code>{{ selectedTestTurn.ffn.output.join(" · ") }}</code>
                    </div>
                  </section>

                  <section class="test-stage animation-stage" style="--delay: 2320ms">
                    <span>Softmax → Sampling</span>
                    <div class="test-score-list">
                      <div
                        v-for="candidate in selectedTestTurn.candidates"
                        :key="`anim-candidate-${selectedTestTurn.step}-${candidate.token}`"
                        :class="{ 'is-sampled': candidate.token === selectedTestTurn.sampledToken }"
                      >
                        <small>{{ candidate.token }}</small>
                        <span class="bar-track">
                          <span class="bar-fill" :style="{ '--value': `${Math.round(candidate.probability * 100)}%` }"></span>
                        </span>
                        <strong>{{ Math.round(candidate.probability * 100) }}%</strong>
                      </div>
                    </div>
                  </section>
                </div>
              </div>

              <div class="test-turn-list" aria-label="생성 반복 목록">
                <article
                  v-for="turn in testRuns"
                  :key="`test-turn-${turn.step}`"
                  class="test-turn"
                  :class="{ 'is-active': turn.step === selectedTestTurn?.step }"
                >
                  <button class="test-turn-button" type="button" @click="selectTestTurn(turn.step)">
                    <span>반복 {{ turn.step + 1 }}</span>
                    <strong>{{ turn.sampledToken === SPECIAL_TOKEN ? "종료 토큰 <eos>" : turn.sampledToken }}</strong>
                  </button>
                </article>
              </div>
            </template>

            <p v-if="testError" class="api-note is-error">{{ testError }}</p>
          </div>

          <div v-if="testRuns.length" class="test-final-output" aria-label="최종 output">
            <span>최종 output</span>
            <strong>{{ testFinalOutput }}</strong>
          </div>

          <form class="test-composer" @submit.prevent="runTestGeneration">
            <input v-model="testInput" aria-label="테스트 문장" maxlength="160" type="text" autocomplete="off" placeholder="메시지를 입력하세요" :disabled="testStatus === 'loading'" />
            <button class="primary-button" type="submit" :disabled="testStatus === 'loading' || !testInput.trim()">
              {{ testStatus === "loading" ? "진행 중" : "테스트" }}
            </button>
            <button v-if="testStatus === 'loading'" class="ghost-button" type="button" @click="stopTest">중지</button>
          </form>
        </div>
      </div>
    </section>

    <footer class="lesson-note">
      <strong>{{ activePage.label }} 핵심</strong>
      <p>{{ activePage.note }}</p>
    </footer>

    <div class="pager-actions" aria-label="단계 이동">
      <button class="ghost-button" type="button" :disabled="activePageIndex === 0" @click="previousPage">이전</button>
      <button class="primary-button" type="button" :disabled="activePageIndex === pages.length - 1" @click="nextPage">
        다음
      </button>
    </div>
    </section>
  </main>
</template>
