<script setup>
import { applySamplingTemperature } from './sampling.js';

defineProps({ kind: { type: String, required: true } });

const example = [
  { token: '물', probability: 0.6 },
  { token: '주스', probability: 0.3 },
  { token: '차', probability: 0.1 },
];
const temperatures = [
  { value: 0.3, title: '낮게', description: '확률이 높은 후보에 더 집중해요.' },
  { value: 1, title: '기준', description: '원래의 확률을 그대로 사용해요.' },
  { value: 1.5, title: '높게', description: '후보 사이의 확률 차이가 줄어요.' },
].map(item => ({ ...item, candidates: applySamplingTemperature(example, item.value) }));
function pct(value) { return (value * 100).toFixed(1).replace(/\.0$/, ''); }
</script>

<template>
  <section v-if="kind === 'temperature'" class="concept-explainer" aria-label="온도 개념 설명">
    <span class="concept-kicker">조작하기 전에 · 용어 알아보기</span>
    <h3>온도(Temperature)는 후보를 뽑는 확률을 조절하는 값이에요.</h3>
    <p>여러 후보 중 <strong>유력한 말에 더 집중할지, 덜 유력한 말에도 기회를 더 줄지</strong> 조절합니다. 실제 뜨겁고 차가운 온도가 아니며, 단위도 ℃가 아닙니다.</p>
    <p class="concept-example-label">같은 후보로 비교하기 · “나는 목이 말라서 ___”<br /><span>기준 확률이 물 60%, 주스 30%, 차 10%인 설명용 예시입니다.</span></p>
    <div class="concept-columns">
      <article v-for="setting in temperatures" :key="setting.value" class="concept-card">
        <h4>{{ setting.title }} <span>T = {{ setting.value.toFixed(1) }}</span></h4>
        <p>{{ setting.description }}</p>
        <ul class="concept-probabilities">
          <li v-for="candidate in setting.candidates" :key="candidate.token">
            <span>{{ candidate.token }}</span>
            <span class="concept-bar" aria-hidden="true"><i :style="{ width: pct(candidate.probability) + '%' }"></i></span>
            <strong>{{ pct(candidate.probability) }}%</strong>
          </li>
        </ul>
      </article>
    </div>
    <p class="concept-takeaway"><strong>높인다고 더 똑똑해지거나 정답률이 높아지는 것은 아니에요.</strong> 같은 문맥에서도 다양한 후보가 뽑힐 가능성을 조절할 뿐, 새 지식을 배우는 과정은 아닙니다. 낮춰도 틀린 답이 나올 수 있습니다.</p>
    <details class="concept-details">
      <summary>온도가 높으면 모든 후보가 똑같이 뽑히나요?</summary>
      <p>아니요. 위의 T=1.5에서도 물이 가장 유력합니다. 확률 차이가 줄어드는 것이지, 곧바로 모두 같은 확률이 되는 것은 아닙니다. 이 예시에서 처음 확률이 0인 후보는 그대로 0이며, 모두 같은 확률이라면 온도를 바꿔도 같습니다.</p>
    </details>
  </section>

  <section v-else-if="kind === 'ffn'" class="concept-explainer" aria-label="피드포워드 개념 설명">
    <span class="concept-kicker">관찰하기 전에 · 용어 알아보기</span>
    <h3>피드포워드(FFN)는 각 토큰의 숫자 표현을 변환하는 신경망이에요.</h3>
    <p><strong>토큰</strong>은 문장의 작은 조각, <strong>벡터</strong>는 그 조각을 나타내는 숫자 목록입니다. FFN은 앞 문맥을 반영한 숫자들을 곱하고 더해, 다음 단계에서 사용할 새로운 숫자 목록으로 바꿉니다.</p>
    <dl class="concept-roles">
      <div><dt>Attention · 정보 모으기</dt><dd>한 토큰이 참고할 앞쪽 토큰들의 정보를 비중에 따라 섞습니다.</dd></div>
      <div><dt>FFN · 모인 정보 변환하기</dt><dd>각 토큰의 숫자 목록을 따로 변환합니다. 이때 모든 위치에 같은 계산 규칙을 적용합니다.</dd></div>
    </dl>
    <ol class="concept-columns concept-ffn-steps">
      <li class="concept-card"><h4>1. 숫자 목록 받기</h4><p>Attention에서 문맥을 반영한 숫자가 들어옵니다. 아래 모형의 입력은 4개입니다.</p></li>
      <li class="concept-card"><h4>2. 넓혀서 계산하기</h4><p>숫자에 정해진 비중을 곱하고 더해 더 많은 중간 숫자를 만듭니다. 이 모형은 음수를 0으로 바꾸는 ReLU도 적용합니다.</p></li>
      <li class="concept-card"><h4>3. 다시 4개로 바꾸기</h4><p>중간 숫자들을 다시 곱하고 더해 출력 숫자 4개를 만듭니다. 숫자의 개수는 같아도 값은 달라집니다.</p></li>
    </ol>
    <p class="concept-takeaway"><strong>FFN이 바로 다음 단어를 뽑는 것은 아니에요.</strong> 실제 GPT는 이런 문맥 처리와 변환을 여러 층에서 반복하고, 뒤의 출력층이 어휘별 점수를 만듭니다. 온도는 후보를 고를 확률을 조절할 때 사용합니다.</p>
    <details class="concept-details">
      <summary>이름과 계산 규칙을 조금 더 알아보기</summary>
      <p>FFN은 Feed-Forward Network의 줄임말입니다. 입력에서 중간층을 거쳐 출력 방향으로 계산한다는 뜻입니다. 계산에 쓰는 비중을 ‘가중치’라고 부릅니다. 실제 모델은 학습으로 가중치를 정하지만, 이 화면에서는 설명용 고정 값을 씁니다.</p>
      <p>ReLU는 예를 들어 −0.4를 0으로, 0.7은 0.7로 바꾸는 함수입니다. 이런 비선형 변환이 있어 단순한 곱셈·덧셈만 반복할 때보다 복잡한 관계를 표현할 수 있습니다. 실제 모델에 따라 다른 함수나 구조를 쓰기도 합니다.</p>
      <p>각 숫자를 ‘기쁨 점수’, ‘정답 점수’처럼 하나의 이름으로 읽지는 않습니다. 여러 숫자가 함께 정보를 표현합니다. 이 화면의 최종 후보는 FFN 출력과 별도로 준비된 교육용 예시입니다.</p>
    </details>
  </section>
</template>

<style scoped>
.concept-explainer { margin: 18px 0; padding: clamp(18px, 3vw, 28px); border: 1px solid #c8dfe3; border-radius: 16px; background: #f4fafb; color: #233d47; font-size: 1rem; line-height: 1.7; overflow-wrap: anywhere; }
.concept-explainer h3 { margin: 8px 0 12px; font-size: clamp(1.15rem, 2.4vw, 1.4rem); line-height: 1.5; }
.concept-explainer p { margin: 10px 0; }
.concept-kicker { color: #12657a; font-weight: 800; font-size: .875rem; }
.concept-example-label { padding-top: 10px; font-weight: 800; }
.concept-example-label span { font-weight: 400; }
.concept-columns { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 16px 0; }
.concept-card { min-width: 0; padding: 16px; border: 1px solid #d4e3e7; border-radius: 12px; background: white; }
.concept-card h4 { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 4px 12px; margin: 0; font-size: 1rem; }
.concept-card h4 span { color: #12657a; }
.concept-card p { font-size: .9375rem; }
.concept-probabilities { display: grid; gap: 8px; margin: 14px 0 0; padding: 0; list-style: none; font-size: .875rem; }
.concept-probabilities li { display: grid; grid-template-columns: 2em minmax(0, 1fr) 4em; gap: 8px; align-items: center; }
.concept-probabilities strong { text-align: right; font-variant-numeric: tabular-nums; }
.concept-bar { display: block; height: 9px; overflow: hidden; border-radius: 9px; background: #e9f0f2; }
.concept-bar i { display: block; height: 100%; background: #187c90; border-radius: inherit; }
.concept-takeaway { padding: 12px 16px; border-left: 3px solid #187c90; background: #e7f2f4; }
.concept-takeaway strong { display: block; }
.concept-details { margin-top: 14px; font-size: .9375rem; }
.concept-details summary { cursor: pointer; font-weight: 800; padding: 8px 0; }
.concept-details summary:focus-visible { outline: 3px solid #12657a; outline-offset: 3px; }
.concept-roles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 18px 0; }
.concept-roles div { padding: 14px 16px; border-radius: 10px; background: #e7f2f4; }
.concept-roles dt { font-weight: 800; color: #12586b; }
.concept-roles dd { margin: 6px 0 0; }
.concept-ffn-steps { padding: 0; list-style: none; }
@media (max-width: 760px) { .concept-columns, .concept-roles { grid-template-columns: minmax(0, 1fr); } }
</style>
