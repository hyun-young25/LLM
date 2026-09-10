<script setup>
import { computed, ref, watch } from 'vue';
import { useClassroom } from './classroomClient.js';
import { sampleCandidate } from './sampling.js';
import ConceptExplainer from './ConceptExplainer.vue';
import RelationshipLab from './RelationshipLab.vue';
import { lessonPairs, contexts, checks, predictFromExamples, drawSamples, textFromTokens } from './guidedModel.js';

const classroom = useClassroom();
const saved = JSON.parse(JSON.stringify(classroom.state.guided || {}));
const emit = defineEmits(['explore', 'activity']);
const steps = ['먼저 예상', '문맥 비교', '확률 실험', '한 조각씩 생성', '개념 연결 실험', '이해 확인'];
const step = ref(saved.step ?? 0);
const relationshipsComplete = ref(false);
const relationshipReset = ref(0);
const pairId = ref(saved.pairId ?? 'needs');
const pair = computed(() => lessonPairs.find(item => item.id === pairId.value));
const before = computed(() => contexts[pair.value.before]);
const after = computed(() => contexts[pair.value.after]);
const beforeResult = computed(() => predictFromExamples(before.value.prefix));
const afterResult = computed(() => predictFromExamples(after.value.prefix));
const allTokens = computed(() => [...new Set([...beforeResult.value.candidates, ...afterResult.value.candidates].map(item => item.token))]);
const guess = ref(saved.guess ?? '');
const revealed = ref(saved.revealed ?? false);
const riseGuess = ref(saved.riseGuess ?? '');
const compared = ref(saved.compared ?? false);
const compareReason = ref(saved.compareReason ?? null);
const sampleContext = ref(saved.sampleContext ?? 'thirst');
const sampleTemperature = ref(saved.sampleTemperature ?? 1);
const sampleCounts = ref(saved.sampleCounts ?? {});
const sampleLast = ref(saved.sampleLast ?? '');
const samplePrediction = ref(saved.samplePrediction ?? null);
const sampleDistribution = computed(() => predictFromExamples(contexts[sampleContext.value].prefix, sampleTemperature.value));
const sampleBaseline = computed(() => predictFromExamples(contexts[sampleContext.value].prefix));
const sampleTotal = computed(() => Object.values(sampleCounts.value).reduce((sum, count) => sum + count, 0));
const generationContext = ref(saved.generationContext ?? 'thirst');
const generated = ref(saved.generated ?? []);
const generationGuess = ref(saved.generationGuess ?? '');
const history = ref(saved.history ?? []);
const prefix = computed(() => [...contexts[generationContext.value].prefix, ...generated.value]);
const generationResult = computed(() => predictFromExamples(prefix.value));
const ended = computed(() => generated.value.at(-1) === '<eos>');
const lastTurn = computed(() => history.value.at(-1));
const answers = ref(saved.answers ?? {});
const reflection = ref(saved.reflection ?? '');
const showReflection = ref(false);
const correctCount = computed(() => checks.filter(question => question.options[answers.value[question.id]]?.correct).length);
const done = computed(() => [revealed.value, compared.value && compareReason.value === 0, sampleTotal.value >= 20 && samplePrediction.value === 1, ended.value, relationshipsComplete.value, checks.every(question => answers.value[question.id] !== undefined)]);
const completedCount = computed(() => done.value.filter(Boolean).length);
const compareChoices = [
  '앞의 문맥에 맞는 예시가 달라졌기 때문에',
  '후보의 글자 수가 길어졌기 때문에',
  '앞 화면에서 내가 누른 답이 정답으로 저장됐기 때문에',
];
const stageHeading = computed(() => [
  ['다음에 어떤 말이 올까요?', '숫자를 보기 전에, 문맥을 읽고 먼저 예상해 보세요.'],
  ['앞 문맥만 바꾸면 어떻게 될까요?', '바뀐 문장에서 비중이 가장 크게 늘어날 후보를 먼저 골라 보세요.'],
  ['60%라면, 열 번 중 꼭 여섯 번일까요?', '같은 후보 분포에서 여러 번 뽑아 예상 비율과 실제 횟수를 비교해 보세요.'],
  ['한 조각이 다음 예측을 바꿉니다', '다음 말을 예상하고 한 번씩 생성하세요. 새로 추가된 문맥과 후보를 비교해 보세요.'],
  ['무엇을 바꾸면, 어디부터 달라질까요?', '문맥·온도·FFN을 하나씩 바꾸며 예상 → 실행 → 이유 확인을 진행합니다.'],
  ['새로운 상황에서도 설명할 수 있나요?', '답을 고르면 이유를 바로 확인할 수 있습니다. 헷갈린 활동으로 돌아가 다시 실험해 보세요.'],
][step.value]);

function pct(value) { return (value * 100).toFixed(1).replace(/\.0$/, ''); }
function probability(result, token) { return result.candidates.find(item => item.token === token)?.probability || 0; }
function tokenLabel(token) { return token === '<eos>' ? '종료 <eos>' : token; }
function reveal() { if (guess.value) { revealed.value = true; classroom.track('reveal', { guess: guess.value, context: pairId.value }); } }
function compare() { if (riseGuess.value) { compared.value = true; sampleContext.value = pair.value.after; generationContext.value = pair.value.after; classroom.track('compare', { guess: riseGuess.value, context: pairId.value }); } }
function sample(n) {
  classroom.track('sample', { context: sampleContext.value, temperature: sampleTemperature.value, count: n });
  const drawn = drawSamples(sampleDistribution.value.candidates, n);
  for (const [token, amount] of Object.entries(drawn)) sampleCounts.value[token] = (sampleCounts.value[token] || 0) + amount;
  sampleLast.value = n === 1 ? Object.keys(drawn)[0] : '';
}
function resetSamples() { sampleCounts.value = {}; sampleLast.value = ''; }
function resetGeneration() { generated.value = []; generationGuess.value = ''; history.value = []; }
function generateOne() {
  if (ended.value || !generationGuess.value) return;
  const candidates = generationResult.value.candidates;
  const selected = sampleCandidate(candidates);
  if (!selected) return;
  history.value.push({ context: textFromTokens(prefix.value), token: selected.token, probability: selected.probability, guess: generationGuess.value, candidates: candidates.map(item => ({ ...item })) });
  classroom.track('generation', { context: textFromTokens(prefix.value), guess: generationGuess.value, token: selected.token });
  generated.value.push(selected.token);
  generationGuess.value = '';
}
function navigate(index) { step.value = Math.max(0, Math.min(steps.length - 1, index)); }
function restart() {
  classroom.track('restart', { action: '학습 활동 처음부터' });
  classroom.snapshot({ relationships: {} });
  relationshipsComplete.value = false; relationshipReset.value += 1;
  pairId.value = 'needs'; sampleContext.value = 'thirst'; generationContext.value = 'thirst';
  step.value = 0; guess.value = ''; revealed.value = false; riseGuess.value = ''; compared.value = false; compareReason.value = null;
  resetSamples(); sampleTemperature.value = 1; samplePrediction.value = null; resetGeneration(); answers.value = {}; reflection.value = ''; showReflection.value = false;
}
defineExpose({ openRelationships: () => navigate(4) });
watch(step, value => { emit('activity', value); classroom.track('activity', { stage: steps[value] }); });
function explore(page) { emit('explore', { page, context: contexts[generationContext.value].label }); }
watch(pairId, () => { guess.value = ''; revealed.value = false; riseGuess.value = ''; compared.value = false; compareReason.value = null; });
watch([sampleTemperature, sampleContext], resetSamples);
watch(generationContext, resetGeneration);
watch(sampleContext, () => { generationContext.value = sampleContext.value; });
function chooseAnswer(questionId, choice) {
  if (answers.value[questionId] === choice) return;
  answers.value[questionId] = choice;
  classroom.track('answer', { questionId, choice });
}
watch(compareReason, value => { if(value !== null) classroom.track('compare', { reason: value, context: pairId.value }); });
watch(samplePrediction, value => { if(value !== null) classroom.track('sample', { reason: value, temperature: sampleTemperature.value }); });
const savedState = computed(() => ({ step: step.value, pairId: pairId.value, guess: guess.value, revealed: revealed.value, riseGuess: riseGuess.value, compared: compared.value, compareReason: compareReason.value, sampleContext: sampleContext.value, sampleTemperature: sampleTemperature.value, sampleCounts: sampleCounts.value, sampleLast: sampleLast.value, samplePrediction: samplePrediction.value, generationContext: generationContext.value, generated: generated.value, generationGuess: generationGuess.value, history: history.value, answers: answers.value, reflection: reflection.value }));
watch(savedState, state => classroom.snapshot({ guided: state }), { deep: true });
function saveReflection() { classroom.track('reflection', { text: reflection.value }); }
</script>

<template>
  <section class="guided-learning" aria-label="따라하며 배우는 GPT 생성 원리">
    <div class="guide-status">
      <p><strong>직접 예상하고, 바꾸고, 확인하기</strong><span>{{ completedCount }} / {{ steps.length }} 활동 확인</span></p>
      <button class="guide-text-button" type="button" @click="restart">활동 처음부터</button>
    </div>
    <nav class="guide-steps" aria-label="체험 단계">
      <button v-for="(label, index) in steps" :key="label" type="button" :class="{ active: step === index, complete: done[index] }" :aria-current="step === index ? 'step' : undefined" @click="navigate(index)">
        <span>{{ done[index] ? '✓' : index + 1 }}</span>{{ label }}
      </button>
    </nav>
    <div class="guide-stage-title">
      <span class="guide-kicker">활동 {{ step + 1 }} · {{ steps[step] }}</span>
      <h2>{{ stageHeading[0] }}</h2>
      <p>{{ stageHeading[1] }}</p>
    </div>

    <div v-if="step <= 1" class="guide-example-select">
      <label for="lessonPair">비교할 상황</label>
      <select id="lessonPair" v-model="pairId"><option v-for="item in lessonPairs" :key="item.id" :value="item.id">{{ item.title }}</option></select>
    </div>

    <div v-if="step === 0" class="guide-activity">
      <div class="guide-prompt"><span>앞 문맥</span><p>{{ before.label }} <mark>___</mark></p></div>
      <fieldset class="guide-choice-set"><legend>내가 예상한 다음 말</legend>
        <button v-for="token in allTokens" :key="token" type="button" :class="{ selected: guess === token }" :aria-pressed="guess === token" :disabled="revealed" @click="guess = token">{{ token }}</button>
      </fieldset>
      <button class="guide-primary" type="button" :disabled="!guess || revealed" @click="reveal">{{ revealed ? '예시 결과 확인됨' : '예시 결과 확인' }}</button>
      <div v-if="revealed" class="guide-reveal" aria-live="polite">
        <p class="guide-feedback"><strong>내 예상: {{ guess }} · 예시에서 가장 흔한 말: {{ beforeResult.candidates[0].token }}</strong>
          <span v-if="guess === beforeResult.candidates[0].token">내 예상과 가장 높은 확률의 후보가 같네요. 다른 후보도 선택될 가능성이 남아 있습니다.</span>
          <span v-else-if="probability(beforeResult, guess) > 0">가능한 예상입니다. 이 예시에서는 “{{ beforeResult.candidates[0].token }}”이 더 자주 이어졌지만, 내 예상도 후보에 포함됩니다.</span>
          <span v-else>다른 문맥에서는 가능한 말이지만, 이 작은 예시 집합의 현재 문맥에서는 등장하지 않았습니다. 실제 언어에서 불가능하다는 뜻은 아닙니다.</span>
        </p>
        <div class="guide-distribution" aria-label="예시에서 계산한 후보 확률">
          <div v-for="candidate in beforeResult.candidates" :key="candidate.token" class="guide-prob-row">
            <strong>{{ candidate.token }}</strong><span class="guide-bar"><i :style="{ width: pct(candidate.probability) + '%' }"></i></span><b>{{ pct(candidate.probability) }}%</b><small>{{ candidate.count }} / {{ beforeResult.total }}개</small>
          </div>
        </div>
        <div class="guide-equation"><strong>{{ beforeResult.candidates[0].count }}개 ÷ {{ beforeResult.total }}개 = {{ pct(beforeResult.candidates[0].probability) }}%</strong><span>현재 문맥 다음에 이 말이 이어진 예시 수 ÷ 현재 문맥에 맞는 전체 예시 수</span></div>
        <details class="guide-details"><summary>어떤 예시에서 계산했는지 보기</summary>
          <p>교사가 설명을 위해 만든 작은 문장 집합입니다. 같은 문장이 나온 횟수를 합쳐 표시했습니다.</p>
          <ul><li v-for="(row, index) in beforeResult.matches" :key="index"><span>{{ textFromTokens(row.tokens) }}</span><b>{{ row.count }}개</b></li></ul>
        </details>
      </div>
    </div>

    <div v-else-if="step === 1" class="guide-activity">
      <div class="guide-context-pair"><div class="guide-prompt"><span>바꾸기 전</span><p>{{ before.label }}</p></div><div class="guide-prompt changed"><span>바꾼 뒤</span><p>{{ after.label }}</p></div></div>
      <p class="guide-observe">바꾼 단서: <strong>{{ pair.cueBefore }}</strong> → <strong>{{ pair.cueAfter }}</strong></p>
      <fieldset class="guide-choice-set"><legend>비중이 가장 크게 늘어날 것으로 예상한 말</legend>
        <button v-for="token in allTokens" :key="token" type="button" :class="{ selected: riseGuess === token }" :aria-pressed="riseGuess === token" :disabled="compared" @click="riseGuess = token">{{ token }}</button>
      </fieldset>
      <button class="guide-primary" type="button" :disabled="!riseGuess || compared" @click="compare">{{ compared ? '비교 결과 확인됨' : '두 문맥의 확률 비교' }}</button>
      <div v-if="compared" class="guide-reveal" aria-live="polite">
        <p class="guide-feedback"><strong>내 예상 “{{ riseGuess }}”: {{ pct(probability(beforeResult, riseGuess)) }}% → {{ pct(probability(afterResult, riseGuess)) }}%</strong><span>{{ pair.explanation }} 가장 크게 늘어난 후보는 “{{ afterResult.candidates[0].token }}”입니다.</span></p>
        <div class="guide-table-scroll"><table class="guide-comparison"><caption>후보는 같은 순서로 두고, 앞 문맥에 따른 비중을 비교합니다.</caption><thead><tr><th scope="col">후보</th><th scope="col">바꾸기 전</th><th scope="col">바꾼 뒤</th></tr></thead><tbody>
          <tr v-for="token in allTokens" :key="token"><th scope="row">{{ token }}</th><td><span class="guide-table-bar"><i :style="{ width: pct(probability(beforeResult, token)) + '%' }"></i></span><b>{{ pct(probability(beforeResult, token)) }}%</b></td><td><span class="guide-table-bar after"><i :style="{ width: pct(probability(afterResult, token)) + '%' }"></i></span><b>{{ pct(probability(afterResult, token)) }}%</b></td></tr>
        </tbody></table></div>
        <fieldset class="guide-reason"><legend>왜 이런 변화가 생겼을까요?</legend><button v-for="(choice, index) in compareChoices" :key="choice" type="button" :class="{ selected: compareReason === index }" :aria-pressed="compareReason === index" @click="compareReason = index">{{ choice }}</button></fieldset>
        <p v-if="compareReason !== null" class="guide-feedback" :class="{ retry: compareReason !== 0 }" role="status">{{ compareReason === 0 ? '맞습니다. 앞 문맥이 바뀌면 이어질 말의 가능성도 달라집니다. 내 선택이 확률을 바꾼 것은 아닙니다.' : '바뀐 것은 앞의 상황입니다. 두 문맥에 맞는 예시가 달라졌다는 점을 다시 살펴보세요.' }}</p>
      </div>
    </div>

    <div v-else-if="step === 2" class="guide-activity">
      <ConceptExplainer kind="temperature" />
      <div class="guide-controls"><label for="sampleContext">문맥<select id="sampleContext" v-model="sampleContext"><option v-for="(context, key) in contexts" :key="key" :value="key">{{ context.label }}</option></select></label><label for="guideTemperature">온도(Temperature) <strong>{{ sampleTemperature.toFixed(1) }}</strong><input id="guideTemperature" v-model.number="sampleTemperature" type="range" min="0.2" max="1.6" step="0.1" /></label></div>
      <fieldset class="guide-reason"><legend>배운 내용으로 예상: 온도를 높이면 어떻게 될까요?</legend><button type="button" :class="{ selected: samplePrediction === 0 }" :aria-pressed="samplePrediction === 0" @click="samplePrediction = 0">높은 확률의 후보에 더 집중된다</button><button type="button" :class="{ selected: samplePrediction === 1 }" :aria-pressed="samplePrediction === 1" @click="samplePrediction = 1">후보 사이의 확률 차이가 줄어든다</button></fieldset>
      <p v-if="samplePrediction !== null" class="guide-feedback" :class="{ retry: samplePrediction !== 1 }" role="status">{{ samplePrediction === 1 ? '맞습니다. 같은 기준 분포에서 Temperature를 높이면 낮았던 후보의 비중도 커집니다. 아래 비율을 직접 비교해 보세요.' : '슬라이더를 1.5로 올리고 낮은 확률 후보의 막대를 보세요. 높은 후보에 더 집중되는 것은 Temperature를 낮췄을 때입니다.' }}</p>
      <div class="guide-inline-actions"><button type="button" class="guide-secondary" @click="sampleTemperature = 0.3">낮게 0.3</button><button type="button" class="guide-secondary" @click="sampleTemperature = 1">기준 1.0</button><button type="button" class="guide-secondary" @click="sampleTemperature = 1.5">높게 1.5</button></div>
      <div class="guide-table-scroll"><table class="guide-comparison"><caption>같은 문맥의 기준 확률과 현재 Temperature를 적용한 확률</caption><thead><tr><th scope="col">후보</th><th scope="col">기준 T=1</th><th scope="col">현재 T={{ sampleTemperature.toFixed(1) }}</th><th scope="col">실제 뽑힌 횟수</th></tr></thead><tbody><tr v-for="candidate in sampleDistribution.candidates" :key="candidate.token" :class="{ 'last-draw': sampleLast === candidate.token }"><th scope="row">{{ candidate.token }}</th><td>{{ pct(probability(sampleBaseline, candidate.token)) }}%</td><td><span class="guide-table-bar"><i :style="{ width: pct(candidate.probability) + '%' }"></i></span><b>{{ pct(candidate.probability) }}%</b></td><td><strong>{{ sampleCounts[candidate.token] || 0 }}회</strong><small v-if="sampleTotal"> · {{ pct((sampleCounts[candidate.token] || 0) / sampleTotal) }}%</small></td></tr></tbody></table></div>
      <div class="guide-inline-actions"><button class="guide-primary" type="button" @click="sample(1)">한 번 뽑기</button><button class="guide-primary" type="button" @click="sample(20)">20번 뽑아 비교</button><button class="guide-secondary" type="button" @click="resetSamples">실험 기록 지우기</button></div>
      <p class="guide-experiment-status" role="status">총 {{ sampleTotal }}회 실험<span v-if="sampleLast"> · 방금 뽑힌 말: <strong>{{ sampleLast }}</strong></span></p>
      <p class="guide-observe">{{ sampleTotal ? '예상 비율과 실제 결과가 정확히 같지 않아도 오류가 아닙니다. 같은 확률에서 뽑아도 짧은 실험의 결과는 달라질 수 있습니다.' : '먼저 20번 뽑아 보세요. 확률이 60%인 후보가 정확히 12번 나오는지 확인해 보세요.' }}</p>
      <p class="guide-small">문맥이나 Temperature를 바꾸면 이전 횟수는 지워집니다. 서로 다른 분포의 실험을 섞지 않기 위해서입니다.</p>
    </div>

    <div v-else-if="step === 3" class="guide-activity">
      <label class="guide-context-select" for="generationContext">시작 문맥<select id="generationContext" v-model="generationContext"><option v-for="(context, key) in contexts" :key="key" :value="key">{{ context.label }}</option></select></label>
      <div class="guide-prompt"><span>이번 예측에 들어가는 전체 문맥</span><p>{{ contexts[generationContext].label }} <template v-for="(token, index) in generated" :key="index"><mark v-if="token !== '<eos>'" class="generated-piece">{{ token }}</mark></template><b v-if="ended" class="guide-eos">생성 종료</b></p></div>
      <template v-if="!ended">
        <fieldset class="guide-choice-set"><legend>이번에는 어떤 조각이 이어질까요? 먼저 골라 보세요.</legend><button v-for="candidate in generationResult.candidates" :key="candidate.token" type="button" :class="{ selected: generationGuess === candidate.token }" :aria-pressed="generationGuess === candidate.token" @click="generationGuess = candidate.token">{{ tokenLabel(candidate.token) }}<small>{{ pct(candidate.probability) }}%</small></button></fieldset>
        <div class="guide-inline-actions"><button class="guide-primary" type="button" :disabled="!generationGuess" @click="generateOne">한 조각 생성하고 문맥에 추가</button><button class="guide-secondary" type="button" @click="resetGeneration">이 문장 다시 시작</button></div>
        <p class="guide-small">내 선택은 예상입니다. 실제 생성은 표시된 확률에서 별도로 뽑습니다. 이 활동의 Temperature는 1.0입니다.</p>
      </template>
      <div v-if="lastTurn" class="guide-feedback" aria-live="polite"><strong>내 예상: {{ tokenLabel(lastTurn.guess) }} · 실제 선택: {{ tokenLabel(lastTurn.token) }}</strong><span v-if="!ended">선택된 “{{ lastTurn.token }}”이 문맥에 추가되었습니다. 위 후보는 늘어난 문맥으로 다시 계산한 결과입니다.</span><span v-else>종료 신호 &lt;eos&gt;가 선택되어 생성이 끝났습니다. 이 신호는 답변 문장의 일부로 표시하지 않습니다.</span></div>
      <details v-if="generationResult.matches.length" class="guide-details"><summary>지금 문맥에 맞는 예시 {{ generationResult.total }}개 확인하기</summary><ul><li v-for="(row, index) in generationResult.matches" :key="index"><span>{{ textFromTokens(row.tokens) }}</span><b>{{ row.count }}개</b></li></ul></details>
      <ol v-if="history.length" class="guide-generation-history" aria-label="한 조각씩 생성한 기록"><li v-for="(turn, index) in history" :key="index"><span class="guide-turn-number">{{ index + 1 }}</span><div><p>{{ turn.context }}</p><strong>선택 → {{ tokenLabel(turn.token) }}</strong><small>선택 당시 {{ pct(turn.probability) }}% · 후보: {{ turn.candidates.map(item => tokenLabel(item.token)).join(' / ') }}</small></div></li></ol>
      <div v-if="ended" class="guide-finish"><strong>{{ textFromTokens(prefix) }}</strong><p>문장 전체를 한 번에 고른 것이 아니라, 새 조각을 붙일 때마다 다음 후보를 다시 계산했습니다.</p><button class="guide-secondary" type="button" @click="resetGeneration">같은 문맥으로 다시 생성</button></div>
    </div>

    <div v-else-if="step === 5" class="guide-activity">
      <div class="guide-check-score"><strong>선택 문항 {{ correctCount }} / {{ checks.length }} 확인</strong><span>맞힌 개수뿐 아니라, 선택한 이유도 말로 설명해 보세요.</span></div>
      <fieldset v-for="(question, questionIndex) in checks" :key="question.id" class="guide-check"><legend>{{ questionIndex + 1 }}. {{ question.title }}</legend><p>{{ question.prompt }}</p><div class="guide-check-options"><button v-for="(option, optionIndex) in question.options" :key="option.text" type="button" :class="{ selected: answers[question.id] === optionIndex, correct: answers[question.id] === optionIndex && option.correct, incorrect: answers[question.id] === optionIndex && !option.correct }" :aria-pressed="answers[question.id] === optionIndex" @click="chooseAnswer(question.id, optionIndex)">{{ option.text }}</button></div><div v-if="answers[question.id] !== undefined" class="guide-feedback" :class="{ retry: !question.options[answers[question.id]].correct }" role="status"><p>{{ question.options[answers[question.id]].feedback }}</p><button v-if="!question.options[answers[question.id]].correct" class="guide-text-button" type="button" @click="navigate(question.revisit)">관련 활동 다시 해보기</button></div></fieldset>
      <div class="guide-reflection"><label for="guideReflection">내 말로 설명하기</label><p>문맥을 바꿀 때와 온도만 바꿀 때, 달라지는 계산 단계가 어떻게 다른지 설명해 보세요. 임베딩·어텐션·FFN·출력 점수 중 두 개 이상을 사용하고 실험에서 본 숫자도 근거로 넣으세요.</p><textarea id="guideReflection" v-model="reflection" @change="saveReflection" rows="4" maxlength="800" placeholder="문맥이 바뀌면… / 같은 문맥이어도…"></textarea><button type="button" class="guide-secondary" @click="showReflection = !showReflection">{{ showReflection ? '예시 설명 접기' : '예시 설명과 비교하기' }}</button><p v-if="showReflection" class="guide-feedback">마지막 토큰이 같으면 기본 임베딩은 같아도, 앞 문맥이 달라지면 어텐션이 섞는 정보와 FFN 출력, 후보 점수가 달라질 수 있습니다. 온도만 바꾸면 이 숫자들은 그대로이고 점수로부터 구하는 선택 확률이 달라집니다. 선택한 토큰은 다음 문맥에 추가됩니다.</p><small>자유 서술은 자동 채점하지 않습니다. 학생으로 로그인한 경우 작성 내용이 학습 기록에 저장되며 담당 교수가 확인할 수 있습니다.</small></div>
      <section class="guide-bridge"><h3>이제 컴퓨터 안에서 일어나는 일을 살펴볼까요?</h3><p>실제 GPT는 단순히 예시 문장 수를 세지 않습니다. 학습된 신경망이 문맥을 처리해 다음 토큰의 점수를 계산합니다.</p><div class="guide-bridge-grid"><button type="button" @click="explore('tokenize')"><strong>1. 토큰화</strong><span>문장을 작은 조각과 ID로 바꾸기</span></button><button type="button" @click="explore('embedding')"><strong>2. 임베딩</strong><span>토큰 ID에 해당하는 기본 숫자 목록 가져오기</span></button><button type="button" @click="explore('attention')"><strong>3. 어텐션(Attention)</strong><span>자기 위치와 앞쪽 토큰의 정보를 비중에 따라 섞기</span></button><button type="button" @click="explore('ffn')"><strong>4. 피드포워드(FFN)</strong><span>각 토큰에 모인 정보를 새 숫자 목록으로 변환하기</span></button><button type="button" @click="explore('output')"><strong>5. 출력·선택</strong><span>점수를 확률로 바꾸고 다음 토큰 고르기</span></button><button type="button" @click="explore('test')"><strong>6. 반복 생성</strong><span>새 토큰을 문맥에 붙이고 다시 예측하기</span></button></div><p class="guide-small">심화 화면의 벡터와 계산도 설명용 예시입니다. 심화의 기본 ‘계산 연결 모형’은 FFN 출력에서 후보 점수와 확률까지 계산합니다. 실제 GPT의 가중치를 사용한 것은 아닙니다. ‘문장 예시’와 Gemini 후보 방식도 별도로 선택할 수 있습니다.</p></section>
    </div>

    <RelationshipLab v-show="step === 4" :key="relationshipReset" @complete="relationshipsComplete = $event" @explore="emit('explore', $event)" />

    <aside v-if="step < 4" class="guide-model-note"><strong>이 활동의 모형</strong><p>준비된 짧은 문장의 빈도로 확률을 계산하는 학습용 모형입니다. 실제 GPT의 내부 값이 아니며, GPT가 예시 문장을 검색해 개수를 센다는 뜻도 아닙니다. 읽기 쉽게 단어 단위로 조각을 묶었고, 실제 토큰은 단어보다 더 작을 수 있습니다.</p></aside>
    <div class="guide-footer"><button class="guide-secondary" type="button" :disabled="step === 0" @click="navigate(step - 1)">이전 활동</button><p>{{ done[step] ? '이 활동을 확인했어요.' : '예상하고 실행한 뒤, 결과를 확인해 보세요.' }}</p><button v-if="step < steps.length - 1" class="guide-primary" type="button" @click="navigate(step + 1)">{{ steps[step + 1] }} →</button><button v-else class="guide-primary" type="button" @click="explore('tokenize')">내부 원리 살펴보기 →</button></div>
  </section>
</template>

<style src="./guided.css"></style>
