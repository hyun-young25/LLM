<script setup>
defineProps({ projection: { type: Object, required: true } });
const number = value => value.toFixed(3);
const percent = value => (value * 100).toFixed(1);
</script>

<template>
  <section class="output-calculation" aria-label="FFN에서 후보 확률까지 연결된 계산">
    <p><strong>출력층에 들어온 FFN 숫자 4개</strong><code>{{ projection.input.map(number).join(' · ') }}</code></p>
    <p class="output-calculation-rule">이 숫자에 후보별 가중치를 곱하고 더해 점수를 만듭니다. <strong>점수 ÷ 온도 → Softmax → 선택 확률</strong></p>
    <div class="output-calculation-scroll" tabindex="0" role="region" aria-label="후보 점수와 확률 계산표">
      <table>
        <caption>같은 출력 점수에 온도 T={{ projection.temperature.toFixed(1) }} 적용 · 전체 후보 6개</caption>
        <thead><tr><th scope="col">후보</th><th scope="col">출력 점수</th><th scope="col">기준 T=1</th><th scope="col">현재 확률</th></tr></thead>
        <tbody><tr v-for="row in projection.rows" :key="row.token"><th scope="row">{{ row.token === '<eos>' ? '종료 <eos>' : row.token }}</th><td>{{ number(row.logit) }}</td><td>{{ percent(row.baseProbability) }}%</td><td><span class="output-prob-bar" aria-hidden="true"><i :style="{ width: percent(row.probability) + '%' }"></i></span><strong>{{ percent(row.probability) }}%</strong></td></tr></tbody>
      </table>
    </div>
    <details>
      <summary>출력 점수의 곱셈·덧셈 근거 보기</summary>
      <p>가중치와 편향은 이 모형의 고정 값입니다. 편향은 곱의 합에 더하는 상수입니다.</p>
      <div v-for="row in projection.rows" :key="row.token" class="output-equation">
        <strong>{{ row.token }}</strong>
        <code>{{ projection.input.map((value, index) => `(${number(value)} × ${row.weights[index]})`).join(' + ') }} + ({{ row.bias }}) = {{ number(row.logit) }}</code>
        <span>온도로 나눈 점수 {{ number(row.scaledLogit) }} → 모든 후보에 Softmax 적용 → {{ percent(row.probability) }}%</span>
      </div>
      <p>표시할 때만 반올림합니다. 확률은 이 여섯 후보 안에서 정규화되며, 실제 GPT의 전체 어휘 분포가 아닙니다.</p>
    </details>
  </section>
</template>

<style scoped>
.output-calculation { min-width: 0; font-size: 1rem; line-height: 1.7; }
.output-calculation p { margin: 0 0 14px; }
.output-calculation code { display: block; margin: 7px 0; color: #12586b; font-size: .9375rem; line-height: 1.9; overflow-wrap: anywhere; }
.output-calculation-rule { font-size: .9375rem; color: #425d69; }
.output-calculation-scroll { max-width: 100%; overflow-x: auto; }
.output-calculation table { width: 100%; min-width: 380px; border-collapse: collapse; font-size: .875rem; font-variant-numeric: tabular-nums; }
.output-calculation caption { text-align: left; padding: 8px 0; line-height: 1.7; color: #526a75; }
.output-calculation th, .output-calculation td { padding: 10px 8px; text-align: right; border-bottom: 1px solid #d2e0e6; }
.output-calculation th:first-child { text-align: left; }
.output-calculation thead { background: #eef5f7; }
.output-prob-bar { display: block; height: 7px; background: #e2ebef; border-radius: 4px; overflow: hidden; margin-bottom: 4px; min-width: 60px; }
.output-prob-bar i { display: block; height: 100%; background: #16758b; }
.output-calculation details { margin-top: 16px; }
.output-calculation summary { cursor: pointer; font-weight: 800; padding: 8px 0; }
.output-equation { padding: 12px 0; border-bottom: 1px solid #d2e0e6; }
.output-equation span, .output-calculation details p { font-size: .875rem; }
.output-calculation summary:focus-visible, .output-calculation-scroll:focus-visible { outline: 3px solid #12657a; outline-offset: 3px; }
</style>
