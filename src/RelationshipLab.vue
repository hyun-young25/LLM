<script setup>
import { computed, ref, watch } from 'vue';
import { relationshipActivities, runActivity, compareStages } from './relationshipActivities.js';
import OutputCalculation from './OutputCalculation.vue';

const emit = defineEmits(['complete', 'explore']);
const activeId = ref('context');
const empty = () => ({ guess: null, ran: false, reason: null, reflection: '' });
const records = ref(Object.fromEntries(relationshipActivities.map(activity => [activity.id, empty()])));
const activity = computed(() => relationshipActivities.find(item => item.id === activeId.value));
const record = computed(() => records.value[activeId.value]);
const completed = item => records.value[item.id].ran && records.value[item.id].reason === item.correctReason;
const total = computed(() => relationshipActivities.filter(completed).length);
const results = computed(() => record.value.ran ? runActivity(activity.value) : null);
const stages = computed(() => results.value ? compareStages(results.value.before, results.value.after) : []);
const format = (values, probability = false) => values.slice(0, 6).map(value => probability ? `${(value * 100).toFixed(1)}%` : value.toFixed(3)).join(' · ') + (values.length > 6 ? ' · …' : '');
const pct = value => (value * 100).toFixed(1);
function run() { if (record.value.guess !== null) record.value.ran = true; }
function reset() { records.value[activeId.value] = empty(); }
watch(total, value => emit('complete', value === relationshipActivities.length), { immediate: true });
</script>

<template>
  <section class="relationship-lab guide-activity" aria-label="개념 사이의 관계를 확인하는 비교 실험">
    <div class="relationship-status"><strong>조건 하나만 바꾸고, 어느 단계가 달라지는지 확인하기</strong><span>{{ total }} / 3 실험의 이유 확인</span></div>
    <nav class="relationship-tabs" aria-label="비교 실험 선택"><button v-for="item in relationshipActivities" :key="item.id" type="button" :class="{ selected: activeId === item.id }" :aria-pressed="activeId === item.id" @click="activeId = item.id">{{ completed(item) ? '✓ ' : '' }}{{ item.title }}</button></nav>
    <p class="relationship-concept">{{ activity.concept }}</p>
    <div class="relationship-settings">
      <section v-for="side in ['before', 'after']" :key="side"><span>{{ side === 'before' ? '바꾸기 전' : '바꾼 뒤' }}</span><p>{{ activity[side].input }}</p><small>온도 {{ activity[side].temperature.toFixed(1) }} · FFN 중간 숫자 {{ activity[side].hiddenDimension }}개</small></section>
    </div>
    <fieldset class="guide-reason"><legend>1. 결과를 보기 전에 예상하기 · {{ activity.question }}</legend><button v-for="(choice, index) in activity.predictions" :key="choice" type="button" :class="{ selected: record.guess === index }" :aria-pressed="record.guess === index" :disabled="record.ran" @click="record.guess = index">{{ choice }}</button></fieldset>
    <div class="guide-inline-actions"><button class="guide-primary" type="button" :disabled="record.guess === null || record.ran" @click="run">{{ record.ran ? '두 조건의 계산 완료' : '2. 실행하고 변화 비교' }}</button><button class="guide-secondary" type="button" @click="reset">이 실험 다시 예상</button></div>
    <p class="guide-small">예상은 결과를 바꾸지 않습니다. 처음 예상이 틀려도, 관찰한 뒤 이유를 수정하면 됩니다.</p>

    <div v-if="results" class="relationship-results">
      <p class="guide-feedback" :class="{ retry: record.guess !== activity.correctPrediction }" role="status"><strong>{{ record.guess === activity.correctPrediction ? '예상이 계산 결과와 일치합니다.' : '예상과 계산 결과가 다릅니다. 처음 달라진 행을 찾아보세요.' }}</strong>내 예상: {{ activity.predictions[record.guess] }}</p>
      <div class="relationship-table-scroll" tabindex="0" role="region" aria-label="계산 단계별 전후 비교표">
        <table class="relationship-comparison">
          <caption>같은 계산 규칙으로 비교 · ‘변화’는 반올림 전 숫자로 판정합니다.</caption>
          <thead><tr><th scope="col">계산 단계</th><th scope="col">바꾸기 전</th><th scope="col">바꾼 뒤</th><th scope="col">비교</th></tr></thead>
          <tbody><tr v-for="row in stages" :key="row.id" :class="{ changed: row.changed }"><th scope="row">{{ row.label }}</th><td><small>숫자 {{ row.before.length }}개</small><code>{{ format(row.before, row.id === 'probabilities') }}</code></td><td><small>숫자 {{ row.after.length }}개</small><code>{{ format(row.after, row.id === 'probabilities') }}</code></td><td><strong>{{ row.changed ? '변화' : '동일' }}</strong></td></tr></tbody>
        </table>
      </div>
      <details class="guide-details"><summary>숫자 전체와 입력 토큰 확인하기</summary><p>마지막 토큰: {{ results.before.selected.token }} · ID {{ results.before.selected.id }} → {{ results.after.selected.id }}</p><section v-for="row in stages" :key="row.id" class="relationship-full-values"><strong>{{ row.label }}</strong><code>전: {{ row.before.map(value => value.toFixed(6)).join(' · ') }}</code><code>후: {{ row.after.map(value => value.toFixed(6)).join(' · ') }}</code></section></details>
      <fieldset class="guide-reason"><legend>3. 숫자를 근거로 이유 설명하기 · {{ activity.reasonQuestion }}</legend><button v-for="(choice, index) in activity.reasons" :key="choice" type="button" :class="{ selected: record.reason === index }" :aria-pressed="record.reason === index" @click="record.reason = index">{{ choice }}</button></fieldset>
      <p v-if="record.reason !== null" class="guide-feedback" :class="{ retry: record.reason !== activity.correctReason }" role="status">{{ record.reason === activity.correctReason ? activity.feedback : activity.hint }}</p>
      <details class="guide-details"><summary>어텐션 비중과 다음 토큰 확률을 나란히 보기</summary>
        <p>두 분포는 대상과 역할이 다릅니다. 어텐션은 <strong>입력 위치의 정보를 섞는 비중</strong>, 출력은 <strong>다음에 선택할 후보의 확률</strong>입니다. 아래는 바꾼 뒤의 결과입니다.</p>
        <div class="relationship-settings"><section><strong>어텐션 · 참고할 입력 위치</strong><ul class="relationship-distribution"><li v-for="row in results.after.attention" :key="row.index"><span>{{ row.index + 1 }}. {{ row.token }}</span><b>{{ pct(row.weight) }}%</b></li></ul></section><section><strong>출력 · 다음 토큰 후보</strong><ul class="relationship-distribution"><li v-for="row in results.after.projection.rows" :key="row.token"><span>{{ row.token }}</span><b>{{ pct(row.probability) }}%</b></li></ul></section></div>
      </details>
      <details class="guide-details"><summary>FFN 숫자가 출력 점수와 확률이 되는 과정 보기</summary><OutputCalculation :projection="results.after.projection" /></details>
      <div class="guide-reflection"><label :for="`relationship-note-${activeId}`">내 설명에 숫자 근거 하나 넣기</label><textarea :id="`relationship-note-${activeId}`" v-model="record.reflection" rows="2" maxlength="600" placeholder="바꾼 조건은… / 그대로인 단계는… / 달라진 숫자는… / 그 이유는…"></textarea><small>자유 서술은 자동 채점하지 않습니다. 위 비교표의 숫자를 근거로 설명하고 선생님이나 짝과 비교하세요.</small></div>
      <div class="guide-inline-actions"><button class="guide-secondary" type="button" @click="emit('explore', { page: 'output', context: activity.after.input, hiddenDimension: activity.after.hiddenDimension, temperature: activity.after.temperature, mode: 'connected' })">이 조건으로 단계별 계산 더 살펴보기</button></div>
    </div>
    <p class="guide-small">이 실험은 고정된 예시 임베딩과 신경망 가중치로 끝까지 계산합니다. 앞 활동의 문장 빈도 모형과 계산 방법이 다릅니다. 자연스러운 언어 생성 성능을 평가하는 모형은 아닙니다.</p>
  </section>
</template>

<style scoped>
.relationship-status { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; font-size: 1rem; line-height: 1.6; }
.relationship-status span { color: #526a75; font-size: .875rem; }
.relationship-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin: 18px 0; }
.relationship-tabs button { min-height: 44px; padding: 10px; background: #fff; color: #244955; border: 2px solid #cadbe1; border-radius: 8px; font-size: .9375rem; line-height: 1.6; }
.relationship-tabs button.selected { border-color: #12657a; background: #e8f4f7; font-weight: 800; }
.relationship-concept { padding: 12px 16px; background: #eff6f8; border-left: 3px solid #12657a; line-height: 1.7; }
.relationship-settings { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.relationship-settings section { min-width: 0; padding: 16px; background: #f5f8fa; border: 1px solid #d0dde3; border-radius: 10px; }
.relationship-settings section:last-child { background: #fff7ed; border-color: #e5d2b9; }
.relationship-settings p { margin: 8px 0; font-size: 1.125rem; font-weight: 800; line-height: 1.6; }
.relationship-settings small { font-size: .875rem; line-height: 1.7; }
.relationship-table-scroll { max-width: 100%; overflow-x: auto; }
.relationship-comparison { min-width: 660px; width: 100%; border-collapse: collapse; font-size: .9375rem; }
.relationship-comparison caption { text-align: left; padding: 10px 0; font-size: .875rem; color: #526a75; }
.relationship-comparison th, .relationship-comparison td { text-align: left; padding: 14px 10px; border-bottom: 1px solid #d2e0e6; }
.relationship-comparison th { min-width: 120px; }
.relationship-comparison thead { background: #edf4f7; }
.relationship-comparison tr.changed { background: #fff5e6; }
.relationship-comparison small { display: block; font-size: .875rem; color: #526a75; margin-bottom: 5px; }
.relationship-comparison code { font-size: .875rem; line-height: 1.8; overflow-wrap: anywhere; }
.relationship-comparison td:last-child { white-space: nowrap; }
.relationship-full-values { padding: 12px 0; border-bottom: 1px solid #d2e0e6; }
.relationship-full-values code { display: block; overflow-wrap: anywhere; font-size: .875rem; line-height: 1.8; }
.relationship-distribution { display: grid; gap: 8px; padding: 0; list-style: none; }
.relationship-distribution li { display: flex; justify-content: space-between; gap: 12px; font-size: .9375rem; }
.relationship-lab button:focus-visible, .relationship-table-scroll:focus-visible { outline: 3px solid #12657a; outline-offset: 3px; }
@media(max-width: 680px) { .relationship-settings { grid-template-columns: 1fr; } .relationship-tabs { grid-template-columns: 1fr; } }
</style>
