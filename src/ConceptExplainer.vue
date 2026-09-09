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
  <section v-if="kind === 'embedding'" class="concept-explainer" aria-label="임베딩 개념 설명">
    <span class="concept-kicker">관찰하기 전에 · 용어 알아보기</span>
    <h3>임베딩(Embedding)은 토큰을 계산할 수 있는 숫자 목록으로 표현하는 방법이에요.</h3>
    <p><strong>토큰</strong>은 문장의 작은 조각입니다. 토큰 ID는 조각을 구별하는 번호이고, <strong>임베딩 벡터</strong>는 그 토큰에 대응하는 숫자 목록입니다. 모델은 이 숫자들로 문맥을 처리하는 계산을 합니다.</p>
    <p class="concept-example-label">“배”라는 토큰으로 살펴보기 · 아래 번호와 숫자는 설명을 위해 만든 예시입니다.</p>
    <ol class="concept-columns concept-ffn-steps">
      <li class="concept-card"><h4>1. 토큰의 ID 확인</h4><code class="concept-vector">배 → ID 17</code><p>17은 이름표입니다. 18보다 덜 중요하다는 뜻이 아닙니다.</p></li>
      <li class="concept-card"><h4>2. 표에서 숫자 목록 찾기</h4><p>‘임베딩 표’에서 ID 17에 해당하는 행을 가져옵니다. 실제 모델에서는 학습하면서 이 표의 값이 조정됩니다.</p></li>
      <li class="concept-card"><h4>3. 벡터로 계산 시작</h4><code class="concept-vector">[0.2, −0.7, 0.4, 0.9]</code><p>숫자가 4개이므로 4차원 벡터입니다. 각 숫자가 곧바로 과일 점수나 배 점수라는 뜻은 아닙니다.</p></li>
    </ol>
    <p class="concept-takeaway"><strong>같은 토큰 ID라면 출발하는 임베딩도 같아요.</strong> 하지만 “과일 가게에서 산 배”와 “바다 위를 떠가는 배”처럼 앞 문맥이 다르면, 뒤의 어텐션 등 문맥 처리 과정을 거친 표현은 달라질 수 있습니다.</p>
    <details class="concept-details">
      <summary>숫자에 어떻게 말의 정보가 담기나요?</summary>
      <p>실제 모델은 많은 문장의 다음 토큰을 예측하는 학습을 하면서 임베딩 값도 조정합니다. 그 결과 여러 숫자가 함께 말의 사용 방식이나 관계를 표현할 수 있습니다. 단어 뜻을 사람이 숫자 한 칸씩 지정해 넣는 방식은 아닙니다.</p>
      <p>이 앱의 임베딩은 학습된 값이 아니라 고정된 설명용 값입니다. 따라서 ‘사과’와 ‘바나나’가 비슷한 숫자인지로 의미 학습이 잘됐는지를 판단하지 마세요. 아래에서는 같은 토큰의 값이 같은지, 차원을 바꾸면 숫자 개수가 어떻게 되는지 관찰합니다.</p>
    </details>
  </section>

  <section v-else-if="kind === 'attention'" class="concept-explainer" aria-label="어텐션 개념 설명">
    <span class="concept-kicker">관찰하기 전에 · 용어 알아보기</span>
    <h3>어텐션(Attention)은 현재 토큰이 문맥의 정보를 얼마나 참고할지 계산하는 방법이에요.</h3>
    <p>현재 토큰과 다른 토큰 사이의 점수를 계산하고, 그 점수로 <strong>참고 비중</strong>을 정합니다. 각 토큰의 정보에 비중을 곱해 더하면 문맥을 반영한 새 숫자 목록이 만들어집니다.</p>
    <div class="concept-roles">
      <div><strong>과일 가게에서 산 <mark>배</mark></strong><p>앞의 ‘과일 가게’는 먹는 배를 해석하는 단서가 됩니다.</p></div>
      <div><strong>바다 위를 떠가는 <mark>배</mark></strong><p>앞의 ‘바다’, ‘떠가는’은 타는 배를 해석하는 단서가 됩니다.</p></div>
    </div>
    <p>위 문장은 문맥의 역할을 보여 주는 예시입니다. 실제 모델이 반드시 저 단어에 가장 큰 비중을 준다는 뜻은 아닙니다.</p>
    <div class="concept-columns">
      <article class="concept-card"><h4>Q · Query</h4><p><strong>무엇을 참고할까?</strong><br />현재 토큰에서 만든, 비교의 기준이 되는 숫자 목록입니다.</p></article>
      <article class="concept-card"><h4>K · Key</h4><p><strong>어떤 단서가 있을까?</strong><br />각 토큰에서 만든 비교용 숫자 목록입니다. Q와 K로 점수를 계산합니다.</p></article>
      <article class="concept-card"><h4>V · Value</h4><p><strong>어떤 정보를 가져올까?</strong><br />각 토큰에서 만든 전달용 숫자 목록입니다. 계산한 비중만큼 섞습니다.</p></article>
    </div>
    <p><strong>Q·K 비교 → 점수를 비중으로 변환 → V에 비중을 곱해 합산</strong><br />점수를 합이 1인 비중으로 바꾸는 함수가 Softmax입니다. 예를 들어 비중 0.75와 0.25라면 두 정보를 75%와 25%씩 섞습니다. 한 단어만 골라 가져오는 과정이 아닙니다.</p>
    <p class="concept-takeaway"><strong>GPT의 이 단계에서는 자기 위치와 앞쪽 토큰만 참고해요.</strong> 뒤쪽 토큰의 비중을 0으로 만들어 아직 볼 수 없는 정보를 가립니다. 이를 ‘인과 마스킹’이라고 합니다. 참고 비중은 다음에 그 단어가 나올 확률이나 사실이 맞을 확률이 아닙니다.</p>
    <details class="concept-details">
      <summary>임베딩·어텐션·피드포워드는 어떻게 연결되나요?</summary>
      <p>입력 임베딩은 각 토큰의 기본 숫자 표현을 준비합니다. 어텐션은 토큰 사이의 정보를 섞어 문맥을 반영합니다. 피드포워드는 그렇게 모인 정보를 각 토큰 위치에서 다시 변환합니다.</p>
      <p>Q·K·V는 설명하기 쉽게 질문처럼 풀어 썼지만, 실제로 문장을 읽고 질문하는 주체가 있는 것은 아닙니다. 모두 숫자 계산입니다. 실제 모델은 여러 어텐션 헤드와 층을 사용하지만, 아래 모형은 한 번의 계산과 최근 8개 토큰만 보여 줍니다.</p>
      <p>아래 임베딩과 가중치는 의미를 학습한 값이 아닙니다. 비중이 상식적인 문장 해석과 다를 수 있습니다. 비중의 계산, 미래 위치 차단, 정보를 합치는 흐름을 관찰하세요.</p>
    </details>
  </section>

  <section v-else-if="kind === 'temperature'" class="concept-explainer" aria-label="온도 개념 설명">
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
.concept-vector { display: block; margin: 12px 0; color: #12586b; font-size: 1rem; line-height: 1.7; overflow-wrap: anywhere; }
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
