# 교육용 시뮬레이션 계산

이 앱은 GPT의 내부 값을 추출하지 않습니다. 토큰 분할·ID·임베딩·가중치는 설명용이며, 최종 후보는 앞 단계의 벡터와 별도로 공급됩니다.

## 1. 토큰과 임베딩

`src/App.vue`의 `tokenize`는 정규식으로 문장을 분할하고 `tokenId`는 해시로 ID를 만듭니다. 실제 BPE 또는 GPT 토크나이저가 아닙니다.

`denseDimensionValue`는 토큰과 ID가 같으면 같은 값을 반환합니다. 임베딩 화면은 8·16·32차원을 표시하며, Attention은 첫 4개 성분을 사용합니다. 위치 인코딩은 생략합니다.

## 2. 인과적 Scaled Dot-Product Attention

$$s_{ij}=\frac{q_i\cdot k_j}{\sqrt{d_k}}+M_{ij},\qquad
M_{ij}=\begin{cases}0&j\le i\\-\infty&j>i\end{cases}$$

$$\alpha_{ij}=\operatorname{softmax}(s_i)_j,\qquad c_i=\sum_j\alpha_{ij}v_j$$

`projectVector`는 설명용 고정 계수와 편향으로 Q/K/V를 투영합니다. `src/learningMath.js`의 `causalWeights`는 현재 위치 이후를 차단합니다. Softmax는 최댓값을 빼서 오버플로를 방지합니다.

Attention 막대의 비중 합은 1입니다. 지도 색상은 각 행의 최대 비중으로 나눈 상대 강도입니다. 벡터 유사도 막대는 코사인 유사도를 0~1로 옮긴 별도 참고 값입니다.

일반 단계에서는 마지막 8개 토큰만 계산·표시합니다. 테스트에서는 해당 반복의 문맥 전체를 사용합니다.

## 3. FFN

$$h=\operatorname{ReLU}(W_1x+b_1),\qquad y=W_2h$$

`src/learningMath.js`의 `feedForward`는 모든 입력 성분을 이용한 행렬곱 → ReLU → 행렬곱을 계산합니다. 가중치는 고정된 설명용 값이며 토큰·위치·생성 회차에 따라 바꾸지 않습니다.

입출력은 4차원입니다. 일반 단계의 은닉 차원은 8·12·16·24·32 중 선택하고, 테스트 화면에서는 8차원을 사용합니다. 신경망 그림은 최대 8개 은닉 노드만 표시합니다.

## 4. 후보 공급과 Temperature

실제 Transformer는 최종 벡터를 어휘 크기의 logit으로 투영합니다. 이 앱은 해당 출력층을 구현하지 않고 다음 두 가지 예시를 사용합니다.

- 데모: 준비된 후보와 예시 확률.
- Gemini: API가 JSON으로 작성한 후보와 추정 확률. 모델의 실제 logprob가 아님.

기준 확률 $p_i$에 Temperature $T$를 적용합니다.

$$p_i(T)=\frac{p_i^{1/T}}{\sum_jp_j^{1/T}}$$

`src/sampling.js`에서는 작은 수의 언더플로를 줄이기 위해 $\log(p_i)/T$에서 최댓값을 뺀 뒤 지수화합니다. $T<1$이면 높은 확률에 더 집중하고, $T>1$이면 분포가 평평해집니다.

정규화된 누적확률 구간에서 난수로 후보를 고릅니다. 0 확률 후보는 선택하지 않습니다. 종료를 강제하는 경우 `<eos>` 하나에 확률 1을 부여합니다. 반복 방지 규칙은 수업용 추가 규칙이며 기본 Transformer 수식의 일부가 아닙니다.

## 5. 생성 반복

후보 공급 → 반복 방지 후보 정리 → Temperature 적용 → 샘플링 → 문맥 추가 → 다음 반복 순서입니다. 테스트는 최대 10회 실행하며, 종료 토큰 또는 문장 완료 조건에서 끝납니다. 중지·초기화는 진행 중 요청과 대기를 취소합니다.
