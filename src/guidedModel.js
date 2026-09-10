import { applySamplingTemperature, sampleCandidate } from './sampling.js';

// A transparent frequency model for guided lessons, not a trained Transformer.
// Count is the number of occurrences in the small, deliberately constructed example set.
export const lessonPairs = [
  { id: 'needs', title: '갈증과 배고픔', before: 'thirst', after: 'hunger', cueBefore: '목이 말라서', cueAfter: '배가 고파서', explanation: '갈증에 관한 예시 대신 배고픔에 관한 예시를 살펴보면, 이어지는 말의 빈도도 달라집니다.' },
  { id: 'weather', title: '비와 햇빛', before: 'rain', after: 'sun', cueBefore: '비가 와서', cueAfter: '햇빛이 강해서', explanation: '비를 피하는 문맥과 햇빛을 피하는 문맥에서는 자주 이어지는 행동이 다릅니다.' },
  { id: 'emotion', title: '기쁨과 걱정', before: 'gift', after: 'injury', cueBefore: '선물을 줘서', cueAfter: '다쳐서', explanation: '같은 친구에 관한 문장이어도 앞서 일어난 사건이 달라지면 이어지는 감정 표현이 달라집니다.' },
];

export const contexts = {
  thirst: { label: '나는 목이 말라서', prefix: ['나는', '목이', '말라서'], continuations: [
    { tokens: ['물을', '마셨다', '.'], count: 4 }, { tokens: ['물을', '찾았다', '.'], count: 2 },
    { tokens: ['주스를', '마셨다', '.'], count: 2 }, { tokens: ['주스를', '샀다', '.'], count: 1 },
    { tokens: ['차를', '마셨다', '.'], count: 1 },
  ] },
  hunger: { label: '나는 배가 고파서', prefix: ['나는', '배가', '고파서'], continuations: [
    { tokens: ['밥을', '먹었다', '.'], count: 4 }, { tokens: ['밥을', '준비했다', '.'], count: 2 },
    { tokens: ['빵을', '먹었다', '.'], count: 2 }, { tokens: ['빵을', '샀다', '.'], count: 1 },
    { tokens: ['과자를', '먹었다', '.'], count: 1 },
  ] },
  rain: { label: '비가 와서', prefix: ['비가', '와서'], continuations: [
    { tokens: ['우산을', '폈다', '.'], count: 4 }, { tokens: ['우산을', '챙겼다', '.'], count: 2 },
    { tokens: ['우비를', '입었다', '.'], count: 3 }, { tokens: ['실내에', '머물렀다', '.'], count: 1 },
  ] },
  sun: { label: '햇빛이 강해서', prefix: ['햇빛이', '강해서'], continuations: [
    { tokens: ['모자를', '썼다', '.'], count: 3 }, { tokens: ['모자를', '챙겼다', '.'], count: 2 },
    { tokens: ['선크림을', '발랐다', '.'], count: 3 }, { tokens: ['그늘에', '머물렀다', '.'], count: 2 },
  ] },
  gift: { label: '친구가 선물을 줘서', prefix: ['친구가', '선물을', '줘서'], continuations: [
    { tokens: ['기뻤다', '.'], count: 7 }, { tokens: ['고마웠다', '.'], count: 3 },
  ] },
  injury: { label: '친구가 다쳐서', prefix: ['친구가', '다쳐서'], continuations: [
    { tokens: ['걱정됐다', '.'], count: 7 }, { tokens: ['속상했다', '.'], count: 3 },
  ] },
};

export const exampleCorpus = Object.values(contexts).flatMap(context =>
  context.continuations.map(row => ({ tokens: [...context.prefix, ...row.tokens, '<eos>'], count: row.count })),
);

export function textFromTokens(tokens) {
  return tokens.filter(token => token !== '<eos>').join(' ').replace(/\s+([.,!?])/g, '$1');
}

export function predictFromExamples(prefix, temperature = 1) {
  if (prefix.at(-1) === '<eos>') return { candidates: [], matches: [], total: 0 };
  const matches = exampleCorpus.filter(row => prefix.length < row.tokens.length && prefix.every((token, i) => row.tokens[i] === token));
  const counts = new Map();
  for (const row of matches) {
    const token = row.tokens[prefix.length];
    counts.set(token, (counts.get(token) || 0) + row.count);
  }
  const total = matches.reduce((sum, row) => sum + row.count, 0);
  const base = [...counts].map(([token, count]) => ({ token, count, probability: count / total }));
  return { candidates: applySamplingTemperature(base, temperature), matches, total };
}

export function drawSamples(candidates, count, random = Math.random) {
  const result = {};
  for (let i = 0; i < count; i++) {
    const token = sampleCandidate(candidates, random)?.token;
    if (token) result[token] = (result[token] || 0) + 1;
  }
  return result;
}

export const checks = [
  {
    id: 'context', title: '처음 보는 문맥에도 적용해 보기',
    prompt: '“음악을 들으려고 ___”에서 “글씨를 쓰려고 ___”로 바꿨습니다. 후보가 달라질 수 있는 이유는 무엇일까요?',
    options: [
      { text: '후보의 글자 수가 달라졌기 때문에', correct: false, feedback: '글자 수만으로 이어질 말을 결정하지 않습니다. 앞 문장에서 하려는 행동이 어떻게 달라졌는지 보세요.' },
      { text: '앞의 문맥에 맞는 다음 말의 가능성이 달라지기 때문에', correct: true, feedback: '맞습니다. 음악에는 “이어폰을”, 글씨에는 “펜을”처럼 앞 문맥에 따라 가능성의 분포가 달라질 수 있습니다.' },
      { text: 'AI가 이전에 선택한 단어를 항상 피하기 때문에', correct: false, feedback: '이전 선택을 피하는 것이 핵심은 아닙니다. 같은 단어도 문맥에 맞으면 다시 나올 수 있습니다.' },
    ], revisit: 1,
  },
  {
    id: 'probability', title: '확률과 실제 횟수 구분하기',
    prompt: '어떤 후보의 선택 확률이 80%입니다. 같은 분포에서 10번 독립적으로 뽑으면 어떤 일이 일어날까요?',
    options: [
      { text: '반드시 정확히 8번 나온다', correct: false, feedback: '80%는 매 10번마다 8번을 보장하는 규칙이 아닙니다. 짧은 실험에서는 횟수가 달라질 수 있습니다.' },
      { text: '가장 높은 확률이므로 10번 모두 나온다', correct: false, feedback: '높은 확률과 반드시 선택된다는 말은 다릅니다. 다른 후보에도 확률이 남아 있습니다.' },
      { text: '8번 안팎일 수 있지만, 더 적거나 더 많이 나올 수도 있다', correct: true, feedback: '맞습니다. 기대 횟수는 8번이지만 실제 횟수는 달라질 수 있습니다. 높은 생성 확률이 사실의 정확성을 보장하지도 않습니다.' },
    ], revisit: 2,
  },
  {
    id: 'loop', title: '새 토큰의 역할 설명하기',
    prompt: '“나는 목이 말라서” 뒤에 “물을”이 선택됐습니다. 다음 조각을 고를 때 무엇을 입력으로 사용할까요?',
    options: [
      { text: '처음 문장에 “물을”까지 붙인 문맥', correct: true, feedback: '맞습니다. 선택된 토큰이 문맥에 추가되고, 늘어난 문맥을 바탕으로 다음 토큰을 고릅니다.' },
      { text: '처음 문장만 계속 사용한다', correct: false, feedback: '새로 선택한 “물을”도 다음 예측에 영향을 줍니다. 처음 문장만 사용하면 앞서 생성한 내용을 이어 가기 어렵습니다.' },
      { text: '방금 선택한 “물을”만 사용한다', correct: false, feedback: '마지막 토큰만 남기는 것이 아닙니다. 앞의 문맥과 새로 생성한 토큰을 함께 사용합니다.' },
    ], revisit: 3,
  },
  {
    id: 'model', title: '학습용 예시와 실제 GPT 구분하기',
    prompt: '예시 10개 중 “물을”이 6개라서 60%로 표시됐습니다. 이 활동과 실제 GPT를 알맞게 설명한 것은 무엇일까요?',
    options: [
      { text: '실제 GPT에서도 이 문장 다음에는 언제나 60%로 “물을”이 나온다', correct: false, feedback: '이 화면의 60%는 우리가 준비한 작은 예시 집합에서 나온 값입니다. 실제 GPT의 내부 확률을 가져온 값이 아닙니다.' },
      { text: '이 활동은 예시의 빈도로 확률을 만들고, 실제 GPT는 학습된 신경망으로 점수를 계산한다', correct: true, feedback: '맞습니다. 확률에 따라 다음 조각을 선택하는 원리를 체험하되, 확률을 얻는 방법은 실제 GPT보다 단순하게 만든 활동입니다.' },
      { text: '60%는 그 단어가 사실일 확률 또는 정답 점수다', correct: false, feedback: '여기서 확률은 다음에 그 조각이 선택될 가능성입니다. 사실 여부나 정답 점수와는 다릅니다.' },
    ], revisit: 0,
  },
  {
    id: 'embedding_context', title: '같은 토큰과 다른 문맥',
    prompt: '“겨울 하늘에서 내리는 눈”과 “거울에 비친 내 눈”의 마지막 ‘눈’이 같은 토큰 ID라고 가정합니다. 같은 모델에서 무엇이 같고 무엇이 달라질 수 있을까요?',
    options: [
      { text: '의미가 다르므로 토큰 ID가 같아도 기본 임베딩부터 반드시 다르다', correct: false, feedback: '입력 임베딩 표는 토큰 ID로 조회합니다. 문맥을 섞는 단계가 어디인지 다시 생각해 보세요.' },
      { text: '기본 임베딩은 같고, 어텐션 이후의 표현은 달라질 수 있다', correct: true, feedback: '맞습니다. 같은 ID로 같은 기본 숫자를 가져와도, 앞 문맥의 정보를 섞으면 표현이 달라질 수 있습니다.' },
      { text: '마지막 토큰이 같으므로 최종 확률도 반드시 같다', correct: false, feedback: '마지막 토큰만으로 전체 문맥을 결정하지 않습니다. 앞쪽 토큰들의 정보도 계산에 들어갑니다.' },
    ], revisit: 4,
  },
  {
    id: 'temperature_boundary', title: '온도가 바꾸는 계산 범위',
    prompt: '같은 문맥과 가중치를 유지한 채 온도만 0.5에서 1.2로 바꿨습니다. 이 모형에서 달라지는 것은 무엇인가요?',
    options: [
      { text: '출력 점수로부터 구하는 선택 확률', correct: true, feedback: '맞습니다. 임베딩·어텐션·FFN·원래 출력 점수는 같습니다. 점수를 온도로 나눈 뒤 구하는 분포가 달라집니다.' },
      { text: '어텐션이 참고하는 토큰의 개수와 임베딩 값', correct: false, feedback: '이 모형에서 온도는 출력 점수가 계산된 뒤 적용합니다. 어텐션 앞 단계에는 들어가지 않습니다.' },
      { text: '학습된 지식과 신경망 가중치', correct: false, feedback: '생성 중 온도를 조절하는 것은 학습이 아닙니다. 가중치는 그대로 유지합니다.' },
    ], revisit: 4,
  },
  {
    id: 'two_distributions', title: '두 종류의 80% 구분하기',
    prompt: '입력 위치 ‘비’의 어텐션 비중이 80%이고, 다음 후보 ‘우산’의 선택 확률도 80%입니다. 두 수치를 어떻게 읽어야 하나요?',
    options: [
      { text: '둘 다 해당 단어가 사실일 확률이다', correct: false, feedback: '두 수치 모두 사실 여부의 점수가 아닙니다. 각각 어떤 대상을 계산하는지 구분하세요.' },
      { text: '‘비’와 ‘우산’이 각각 다음에 나올 확률이다', correct: false, feedback: '‘비’는 이미 입력에 있는 토큰 위치입니다. 어텐션은 그 위치의 정보를 참고하는 비중을 나타냅니다.' },
      { text: '앞 수치는 입력 정보를 섞는 비중, 뒤 수치는 다음 후보를 선택할 확률이다', correct: true, feedback: '맞습니다. 합이 100%인 분포여도, 어텐션은 입력 위치들 사이의 비중이고 출력은 후보들 사이의 선택 확률입니다.' },
    ], revisit: 4,
  },
  {
    id: 'ffn_connection', title: 'FFN 변화가 출력에 미치는 영향',
    prompt: '같은 입력에서 FFN의 출력 숫자가 달라졌습니다. 출력층 가중치와 온도가 같을 때 최종 확률은 어떻게 될까요?',
    options: [
      { text: '온도가 같으므로 반드시 같은 확률이다', correct: false, feedback: '온도가 같아도 원래 후보 점수가 달라지면 확률이 달라질 수 있습니다.' },
      { text: '출력층의 후보 점수가 바뀌어 확률도 달라질 수 있다', correct: true, feedback: '맞습니다. FFN의 숫자는 출력층 계산의 입력입니다. 단계가 이어져 있으므로 뒤의 점수와 확률에도 영향을 줄 수 있습니다.' },
      { text: '앞 단계의 토큰 ID가 자동으로 새 번호로 바뀐다', correct: false, feedback: 'FFN은 이미 들어온 숫자를 변환합니다. 앞 단계에서 결정한 토큰 ID를 거슬러 바꾸지 않습니다.' },
    ], revisit: 4,
  },

];
