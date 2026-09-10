import { inject, reactive } from 'vue';
export const classroomKey = Symbol('classroom');
export const useClassroom = () => inject(classroomKey, { enabled: false, user: null, state: {}, track() {}, snapshot() {} });
export async function classroomApi(path, body) {
  const response = await fetch('/api/classroom' + path, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-Classroom-Request': '1' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || '기록 서버에 연결하지 못했습니다.'), { status: response.status });
  return data;
}
export function createClassroomClient(api = classroomApi) {
  let timer, pending = [], saving = null, dirty = false, generation = 0;
  const client = reactive({ enabled: false, user: null, state: {}, revision: 0, status: '', error: '', updatedAt: null,
    load(user, data = {}) { generation++; clearTimeout(timer); pending=[]; dirty=false; this.user=user; this.state=data.state || {}; this.revision=data.revision || 0; this.updatedAt=data.updatedAt || null; this.error=''; this.status=''; },
    snapshot(part) { if (this.user?.role !== 'student') return; const merged = { ...this.state, ...JSON.parse(JSON.stringify(part)) }; if (JSON.stringify(merged) === JSON.stringify(this.state)) return; this.state=merged; dirty=true; schedule(); },
    track(kind, payload) { if (this.user?.role !== 'student') return; pending.push({ key: crypto.randomUUID(), kind, payload: JSON.parse(JSON.stringify(payload)) }); dirty=true; schedule(); },
    async flush() {
      clearTimeout(timer);
      if (saving) { await saving; if (dirty && !this.error) return this.flush(); return !this.error; }
      if (!dirty || this.user?.role !== 'student') return !this.error;
      if (this.error && this.status === 'conflict') return false;
      const mine=generation; const batch=pending.slice(0,100); const state=JSON.parse(JSON.stringify(this.state)); const revision=this.revision;
      this.status='saving'; this.error=''; dirty=false;
      saving=(async()=>{
        try {
          const result=await api('/sync',{state,revision,events:batch});
          if (mine!==generation) return;
          this.revision=result.revision; this.updatedAt=result.updatedAt; pending=pending.slice(batch.length); dirty=dirty || pending.length>0; this.status='saved';
        } catch(error) { if(mine!==generation)return; dirty=true; this.error=error.message; this.status=error.status===409?'conflict':'error'; }
        finally { saving=null; if(mine===generation && dirty && !this.error) schedule(); }
      })();
      await saving; return !this.error;
    },
    hasPending() { return dirty || !!saving; },
    dispose() { clearTimeout(timer); generation++; },
  });
  function schedule() { if(client.status==='conflict') return; client.status='pending'; clearTimeout(timer); timer=setTimeout(()=>client.flush(),600); }
  return client;
}
