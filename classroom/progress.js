import { checks, contexts, lessonPairs } from '../src/guidedModel.js';
import { relationshipActivities } from '../src/relationshipActivities.js';
export const LESSON_VERSION = 'gpt-connections-v1';
export const stageNames = ['먼저 예상', '문맥 비교', '확률 실험', '한 조각씩 생성', '개념 연결 실험', '이해 확인'];
export function gradeAnswer(questionId, choice) {
  const question = checks.find(q => q.id === questionId);
  if (!question || !Number.isInteger(choice) || !question.options[choice]) throw new Error('문항 또는 응답이 올바르지 않습니다.');
  return { questionId, choice, correct: question.options[choice].correct === true };
}
export function summarize(state = {}, attempts = []) {
  const g = state.guided || {};
  const answers = checks.map(q => {
    const rows = attempts.filter(a => a.questionId === q.id);
    const first = rows[0]; const latest = rows.at(-1);
    return { id: q.id, title: q.title, prompt: q.prompt, options: q.options.map(o => o.text), first: first || null, latest: latest || null, attempts: rows.length };
  });
  const answered = answers.filter(a => a.latest).length;
  const correct = answers.filter(a => a.latest?.correct).length;
  const firstCorrect = answers.filter(a => a.first?.correct).length;
  const relationships = relationshipActivities.map(a => {
    const r = state.relationships?.[a.id] || {};
    return { id: a.id, title: a.title, ran: r.ran === true, guess: a.predictions[r.guess] || '', reason: a.reasons[r.reason] || '', predictionCorrect: r.guess === a.correctPrediction, reasonCorrect: r.reason === a.correctReason, reflection: typeof r.reflection === 'string' ? r.reflection : '' };
  });
  const totalSamples = Object.values(g.sampleCounts || {}).reduce((sum, value) => sum + (Number.isFinite(value) && value > 0 ? value : 0), 0);
  const done = [g.revealed === true, g.compared === true && g.compareReason === 0, totalSamples >= 20 && g.samplePrediction === 1, Array.isArray(g.generated) && g.generated.at(-1) === '<eos>', relationships.every(r => r.ran && r.reasonCorrect), answered === checks.length];
  return { answered, correct, firstCorrect, total: checks.length, answers, relationships, activities: stageNames.map((name, i) => ({ name, done: done[i] })), completed: done.filter(Boolean).length, reflection: typeof g.reflection === 'string' ? g.reflection : '' };
}
// Excel must treat user-controlled cells as text, including formulas after whitespace.
export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s\uFEFF]*[=+@-]/u.test(text) || /^[\t\r\n]/u.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function validateState(value) {
  const bad = () => { throw new Error('학습 상태 형식이 올바르지 않습니다.'); };
  const object = x => x && typeof x === 'object' && !Array.isArray(x);
  const text = (x, n = 800) => typeof x === 'string' && x.length <= n;
  const integer = (x, min, max) => Number.isInteger(x) && x >= min && x <= max;
  if (!object(value)) bad();
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized) > 90000) throw new Error('기록이 너무 큽니다.');
  if (Object.keys(value).some(k => !['guided','relationships'].includes(k))) bad();
  const g = value.guided || {};
  if (!object(g)) bad();
  const validators = {
    step: x => integer(x,0,5), pairId: x => lessonPairs.some(p=>p.id===x),
    guess: x=>text(x,80), revealed:x=>typeof x==='boolean', riseGuess:x=>text(x,80), compared:x=>typeof x==='boolean', compareReason:x=>x===null||integer(x,0,2),
    sampleContext:x=>Object.hasOwn(contexts,x), sampleTemperature:x=>Number.isFinite(x)&&x>=0.1&&x<=1.6,
    sampleCounts:x=>object(x)&&Object.keys(x).length<=30&&Object.entries(x).every(([k,v])=>text(k,80)&&integer(v,0,10000000)),
    sampleLast:x=>text(x,80), samplePrediction:x=>x===null||integer(x,0,2),
    generationContext:x=>Object.hasOwn(contexts,x), generated:x=>Array.isArray(x)&&x.length<=20&&x.every(t=>text(t,80)), generationGuess:x=>text(x,80),
    history:x=>Array.isArray(x)&&x.length<=20&&x.every(r=>object(r)&&text(r.context,1000)&&text(r.token,80)&&text(r.guess,80)&&Number.isFinite(r.probability)&&r.probability>=0&&r.probability<=1&&Array.isArray(r.candidates)&&r.candidates.length<=30&&r.candidates.every(c=>object(c)&&text(c.token,80)&&Number.isFinite(c.probability)&&c.probability>=0&&c.probability<=1)),
    answers:x=>object(x)&&Object.entries(x).every(([id,choice])=>{gradeAnswer(id,choice);return true;}), reflection:x=>text(x,800),
  };
  if (Object.entries(g).some(([k,v])=>!Object.hasOwn(validators,k)||!validators[k](v))) bad();
  const relationships=value.relationships || {};
  if(!object(relationships))bad();
  for (const [id,r] of Object.entries(relationships)) {
    const a=relationshipActivities.find(a=>a.id===id);
    if(!a||!object(r)||Object.keys(r).some(k=>!['guess','ran','reason','reflection'].includes(k)))bad();
    if(!(r.guess===null||integer(r.guess,0,a.predictions.length-1))||typeof r.ran!=='boolean'||!(r.reason===null||integer(r.reason,0,a.reasons.length-1))||!text(r.reflection,600))bad();
  }
  return JSON.parse(serialized);
}
