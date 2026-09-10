import { runConnectedModel } from './connectedModel.js';

const base = { input: '과일 가게에서 산 배를', temperature: 1, hiddenDimension: 8 };
export const relationshipActivities = [
  {
    id: 'context', title: '문맥만 변경', concept: '같은 토큰의 기본 임베딩은 같아도, 어텐션 이후의 표현은 문맥에 따라 달라질 수 있습니다.',
    before: { ...base }, after: { ...base, input: '항구에서 기다리던 배를' },
    question: '마지막 토큰 ‘배를’은 그대로 두고 앞 문맥만 바꿉니다. 어떤 변화가 나타날까요?',
    predictions: ['기본 임베딩은 같고, 문맥을 반영한 계산 결과는 달라진다', '기본 임베딩부터 모두 바뀐다', '마지막 토큰이 같으므로 모든 결과가 같다'], correctPrediction: 0,
    reasonQuestion: '입력 임베딩은 같은데 출력 확률이 달라진 이유는 무엇일까요?',
    reasons: ['온도를 높였기 때문에', '어텐션이 다른 문맥 정보를 섞고, 그 결과가 FFN과 출력층으로 이어졌기 때문에', '토큰 ID가 더 큰 번호로 바뀌었기 때문에'], correctReason: 1,
    feedback: '온도와 가중치는 고정했습니다. 같은 ‘배를’의 기본 숫자는 같지만, 참고하는 앞 문맥이 달라져 어텐션 결과와 뒤의 계산이 달라졌습니다.',
    hint: '두 설정의 온도와 마지막 토큰을 다시 비교하세요. 변화가 처음 나타난 행은 어디인가요?',
  },
  {
    id: 'temperature', title: '온도만 변경', concept: '온도는 출력 점수에서 선택 확률을 만들 때 사용합니다. 앞 단계의 숫자와 가중치를 바꾸지 않습니다.',
    before: { ...base, temperature: 0.3 }, after: { ...base, temperature: 1.5 },
    question: '문맥과 FFN 중간 숫자 수는 고정하고 온도만 0.3에서 1.5로 올립니다. 무엇이 달라질까요?',
    predictions: ['어텐션의 참고 비중부터 달라진다', '임베딩부터 출력 점수까지 모두 달라진다', '출력 점수까지는 같고, 선택 확률만 달라진다'], correctPrediction: 2,
    reasonQuestion: '원래 낮았던 후보의 선택 확률이 높아진 이유는 무엇일까요?',
    reasons: ['같은 점수를 더 큰 온도로 나눈 뒤 Softmax를 적용해 확률 차이가 줄었기 때문에', '어텐션이 더 많은 토큰을 참고했기 때문에', '모델이 새로운 문장을 학습했기 때문에'], correctReason: 0,
    feedback: '어텐션과 FFN을 다시 학습한 것이 아닙니다. 같은 출력 점수에 온도를 적용하는 단계만 달라졌습니다. 참고 비중과 다음 토큰 선택 확률은 서로 다른 분포입니다.',
    hint: '‘어텐션 결과’와 ‘출력 점수’ 행은 달라졌나요? 온도가 계산에 들어가는 위치를 찾아보세요.',
  },
  {
    id: 'ffn', title: 'FFN 중간 크기 변경', concept: 'FFN은 각 토큰의 숫자를 변환합니다. 이 모형에서는 중간 숫자 수를 바꿔도 입력과 출력은 각각 4개입니다.',
    before: { ...base }, after: { ...base, hiddenDimension: 16 },
    question: '문맥과 온도는 고정하고 FFN 중간 숫자 수만 8개에서 16개로 늘립니다. 어디부터 달라질까요?',
    predictions: ['입력 토큰의 ID부터 달라진다', 'FFN의 중간 계산부터 달라지고, 입출력 숫자 개수는 4개로 유지된다', '온도를 고정했으므로 최종 확률도 반드시 같다'], correctPrediction: 1,
    reasonQuestion: '온도가 같은데 최종 확률도 바뀐 이유는 무엇일까요?',
    reasons: ['온도가 같으면 확률이 바뀔 수 없으므로 오류다', '중간 숫자 수를 늘리면 자동으로 더 정확한 모델이 되기 때문이다', 'FFN 출력이 바뀌어 출력층의 점수도 달라졌기 때문이다'], correctReason: 2,
    feedback: '어텐션까지의 계산은 같습니다. FFN에서 더 많은 중간 숫자를 합산하면서 출력 값이 바뀌고, 그 값으로 계산한 후보 점수와 확률도 바뀌었습니다. 차원을 늘리는 것만으로 정확도가 보장되지는 않습니다.',
    hint: '두 결과의 FFN 출력과 후보 점수를 비교하세요. 온도를 적용하기 전 점수도 같았나요?',
  },
];

export function runActivity(activity) {
  return {
    before: runConnectedModel(activity.before.input, activity.before),
    after: runConnectedModel(activity.after.input, activity.after),
  };
}

export function compareStages(before, after) {
  const stages = [
    ['embedding', '임베딩 · 마지막 토큰', run => run.selected.vector],
    ['attention', '어텐션 · 합산 결과', run => run.context],
    ['hidden', 'FFN · 중간 숫자', run => run.ffn.hidden],
    ['ffn', 'FFN · 출력 숫자', run => run.ffn.output],
    ['logits', '출력층 · 후보 점수', run => run.projection.rows.map(row => row.logit)],
    ['probabilities', '다음 토큰 · 선택 확률', run => run.projection.rows.map(row => row.probability)],
  ];
  return stages.map(([id, label, read]) => {
    const a = read(before), b = read(after);
    const changed = a.length !== b.length || a.some((value, i) => Math.abs(value - b[i]) > 1e-10);
    return { id, label, before: a, after: b, changed };
  });
}
