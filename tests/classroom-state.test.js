import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse, compileScript } from '@vue/compiler-sfc';
import * as Vue from 'vue';
import * as guidedModel from '../src/guidedModel.js';
import * as sampling from '../src/sampling.js';
import * as relationships from '../src/relationshipActivities.js';
import { createClassroomClient } from '../src/classroomClient.js';
import { validateState } from '../classroom/progress.js';
// Exercise real setup state and watchers without a browser/DOM or test-only component logic.
async function setup(file, client) {
  const source=await readFile(new URL('../src/'+file,import.meta.url),'utf8');
  const script=compileScript(parse(source).descriptor,{id:'state-test'}).content;
  const modules={vue:Vue,'./guidedModel.js':guidedModel,'./sampling.js':sampling,'./relationshipActivities.js':relationships,'./classroomClient.js':{useClassroom:()=>client}};
  const imports=[];
  let code=script.replace(/import\s+(.+?)\s+from\s+['"]([^'"]+)['"];?/g,(_,binding,path)=>{
    if(path.endsWith('.vue')) {imports.push(`const ${binding} = {};`);return '';}
    imports.push(`const ${binding.replaceAll(' as ', ': ')} = modules[${JSON.stringify(path)}];`);return '';
  });
  code=code.replace('export default','return');
  const component=new Function('modules',imports.join('\n')+'\n'+code)(modules);
  const scope=Vue.effectScope();
  const state=scope.run(()=>component.setup({}, {expose(){},emit(){}}));
  return {state,stop:()=>scope.stop()};
}
test('guided and comparison lesson state restores without erasing progress or duplicating answer attempts',async()=>{
  const saved={guided:{step:5,pairId:'weather',sampleContext:'sun',sampleTemperature:1.5,sampleCounts:{모자를:20},samplePrediction:1,answers:{[guidedModel.checks[0].id]:0},reflection:'복원되는 서술'},relationships:{context:{guess:0,ran:true,reason:1,reflection:'문맥 근거'}}};
  const submissions=[];
  const client=createClassroomClient(async(path,body)=>{validateState(body.state);submissions.push(body);return {revision:body.revision+1,updatedAt:new Date().toISOString()};});
  client.load({id:'test',role:'student'},{state:saved,revision:4});
  const guide=await setup('GuidedLearning.vue',client),lab=await setup('RelationshipLab.vue',client);
  try {
    await Vue.nextTick();
    assert.equal(guide.state.step.value,5);assert.equal(guide.state.sampleTotal.value,20);assert.equal(guide.state.reflection.value,'복원되는 서술');
    assert.equal(lab.state.records.value.context.reflection,'문맥 근거');assert.equal(lab.state.total.value,1);
    assert.equal(client.hasPending(),false);
    guide.state.chooseAnswer(guidedModel.checks[0].id,1);await Vue.nextTick();await client.flush();
    assert.equal(submissions[0].events.filter(e=>e.kind==='answer').length,1);assert.equal(submissions[0].state.guided.answers[guidedModel.checks[0].id],1);
    guide.state.reflection.value='수정한 설명';await Vue.nextTick();await client.flush();
    assert.equal(submissions.at(-1).state.guided.reflection,'수정한 설명');
    guide.state.restart();await Vue.nextTick();await client.flush();
    assert.deepEqual(submissions.at(-1).state.relationships,{});assert.deepEqual(submissions.at(-1).state.guided.answers,{});
    assert.ok(submissions.at(-1).events.some(e=>e.kind==='restart'));
  }finally{guide.stop();lab.stop();client.dispose();}
});
