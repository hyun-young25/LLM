import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openPostgresStore } from '../classroom/postgres-store.js';
import { createAppServer } from '../server.mjs';
import { checks } from '../src/guidedModel.js';
import { csvCell } from '../classroom/progress.js';
import { createClassroomClient } from '../src/classroomClient.js';
const fixture = async () => {
  const dir=await mkdtemp(join(tmpdir(),'gpt-classroom-'));
  await writeFile(join(dir,'index.html'),'<h1>Classroom</h1>');
  const env={CLASSROOM_ENABLED:'true',ADMIN_PASSWORD:'test-admin-password-42',CLASSROOM_JOIN_CODE:'test-course-42',CLASSROOM_DB_PATH:join(dir,'classroom.sqlite')};
  if(process.env.CLASSROOM_TEST_DATABASE_URL) {
    const url=new URL(process.env.CLASSROOM_TEST_DATABASE_URL);
    if(url.pathname!=='/gpt_classroom_test'||!['localhost','127.0.0.1'].includes(url.hostname)) throw new Error('Only the isolated local test database can be reset.');
    env.DATABASE_URL=process.env.CLASSROOM_TEST_DATABASE_URL;
    const store=openPostgresStore(env.DATABASE_URL);
    try { await store.run(async()=>{await store.initialize();await store.exec('TRUNCATE users,rate_limits CASCADE');}); }
    finally {await store.close();}
  }
  let server, origin;
  async function start(){server=createAppServer(env,dir);await new Promise(r=>server.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${server.address().port}`;}
  async function stop(){server.closeAllConnections();await new Promise(r=>server.close(r));}
  await start();
  async function call(path,body,cookie='',headers={}) {const res=await fetch(origin+'/api/classroom'+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json','X-Classroom-Request':'1'}),...(cookie?{Cookie:cookie}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});const text=await res.text();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:res.status,data,cookie:res.headers.get('set-cookie')?.split(';')[0],headers:res.headers};}
  const admin=await call('/admin-login',{login:'instructor',password:env.ADMIN_PASSWORD});assert.equal(admin.status,200);
  await call('/admin/roster',{students:[{studentId:'20260001',name:'테스트 하나'},{studentId:'20260002',name:'테스트 둘'}]},admin.cookie);
  const credentials={name:'테스트 하나',studentId:'20260001',password:'student-password-42',joinCode:env.CLASSROOM_JOIN_CODE};
  const student=await call('/activate',credentials);assert.equal(student.status,200);
  return {call,admin,student,credentials,env,stop,start,async close(){await stop();await rm(dir,{recursive:true,force:true});}};
};
test('classroom enforces server roles, roster identity, cookie flags and cross-site protection',async()=>{
  const f=await fixture();try{
    assert.match(f.student.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
    assert.equal((await f.call('/admin/students')).status,401);
    assert.equal((await f.call('/admin/students',undefined,f.student.cookie)).status,403);
    assert.equal((await f.call('/admin/export',undefined,f.student.cookie)).status,403);
    assert.equal((await f.call('/admin/export-details',undefined,f.student.cookie)).status,403);
    assert.equal((await f.call('/progress?userId='+f.admin.data.user.id,undefined,f.student.cookie)).data.summary.id,f.student.data.user.id);
    assert.equal((await f.call('/login',{...f.credentials,password:'wrong-password'})).status,401);
    assert.equal((await f.call('/activate',{...f.credentials,name:'다른 이름',studentId:'20260002'})).status,400);
    assert.equal((await f.call('/activate',{...f.credentials,studentId:'20999999'})).status,400);
    assert.equal((await f.call('/logout',{},f.student.cookie,{'Origin':'https://unrelated.invalid'})).status,403);
    assert.equal((await f.call('/logout',{},f.student.cookie,{'X-Classroom-Request':''})).status,403);
    assert.equal((await f.call('/logout',{},f.student.cookie)).status,200);
    assert.equal((await f.call('/progress',undefined,f.student.cookie)).status,401);
  }finally{await f.close();}
});
test('server grades immutable first/latest answers, deduplicates retries, rejects conflicts and persists after restart',async()=>{
  const f=await fixture();try{
    const q=checks[0],correct=q.options.findIndex(o=>o.correct),wrong=q.options.findIndex(o=>!o.correct);
    const state={guided:{answers:{[q.id]:wrong},reflection:'내 설명'},relationships:{}};
    const event={key:randomUUID(),kind:'answer',payload:{questionId:q.id,choice:wrong,correct:true}};
    const first=await f.call('/sync',{state,revision:0,events:[event]},f.student.cookie);assert.equal(first.status,200);assert.equal(first.data.revision,1);
    assert.equal((await f.call('/sync',{state,revision:0,events:[event]},f.student.cookie)).status,200);
    assert.equal((await f.call('/sync',{state,revision:0,events:[]},f.student.cookie)).status,409);
    state.guided.answers[q.id]=correct;
    assert.equal((await f.call('/sync',{state,revision:1,events:[{key:randomUUID(),kind:'answer',payload:{questionId:q.id,choice:correct}}]},f.student.cookie)).status,200);
    const report=(await f.call('/admin/students/'+f.student.data.user.id,undefined,f.admin.cookie)).data;
    assert.equal(report.answers[0].first.correct,false);assert.equal(report.answers[0].latest.correct,true);assert.equal(report.answers[0].attempts,2);
    assert.equal(report.firstCorrect,0);assert.equal(report.correct,1);assert.equal(report.reflection,'내 설명');
    const exportAll=(await f.call('/admin/export-details',undefined,f.admin.cookie)).data;
    assert.equal(exportAll.students[0].answers[0].attempts,2);assert.equal(exportAll.students[0].reflection,'내 설명');
    assert.equal((await f.call('/sync',{state,revision:2,events:[{key:randomUUID(),kind:'answer',payload:{questionId:'fake',choice:0}}]},f.student.cookie)).status,400);
    await f.stop();await f.start();
    const login=await f.call('/login',f.credentials);assert.equal(login.status,200);
    const restored=await f.call('/progress',undefined,login.cookie);assert.equal(restored.data.revision,2);assert.equal(restored.data.state.guided.answers[q.id],correct);
    assert.equal(restored.data.summary.answers[0].attempts,2);
  }finally{await f.close();}
});
test('roster registration is atomic and CSV only exposes admin summaries with formula-safe cells',async()=>{
  const f=await fixture();try{
    const before=(await f.call('/admin/students',undefined,f.admin.cookie)).data.students;assert.equal(before.length,2);assert.equal(before[1].eventCount,0);assert.equal(before[1].lastLogin,null);
    const conflict=await f.call('/admin/roster',{students:[{studentId:'20260003',name:'추가 학생'},{studentId:'20260001',name:'바뀐 이름'}]},f.admin.cookie);assert.equal(conflict.status,409);
    assert.equal((await f.call('/admin/students',undefined,f.admin.cookie)).data.students.length,2);
    await f.call('/admin/roster',{students:[{studentId:'20260003',name:'=SUM(1)'}]},f.admin.cookie);
    const csv=await f.call('/admin/export',undefined,f.admin.cookie);assert.equal(csv.status,200);assert.match(csv.data,/'=SUM/);assert.equal(csv.headers.get('cache-control'),'no-store');
    assert.match(csvCell(' \t=HYPERLINK("bad")'),/^"'/);assert.match(csvCell('-123'),/^"'/);
    const text=JSON.stringify((await f.call('/admin/students',undefined,f.admin.cookie)).data);assert.ok(!text.includes('password_hash'));assert.ok(!text.includes('scrypt:'));
  }finally{await f.close();}
});
test('client keeps unsaved records after network failure and safely resumes with the same event keys',async()=>{
  let calls=[],fail=true;
  const api=async(path,body)=>{calls.push(body);if(fail)throw new Error('offline');return {revision:body.revision+1,updatedAt:'2026-09-10T00:00:00Z'};};
  const client=createClassroomClient(api);client.load({id:'s',role:'student'});
  client.snapshot({guided:{reflection:'보존할 설명'}});client.track('reflection',{text:'보존할 설명'});
  assert.equal(await client.flush(),false);assert.equal(client.hasPending(),true);assert.equal(client.state.guided.reflection,'보존할 설명');
  fail=false;assert.equal(await client.flush(),true);assert.equal(calls[0].events[0].key,calls[1].events[0].key);assert.equal(client.hasPending(),false);
  client.dispose();
});
