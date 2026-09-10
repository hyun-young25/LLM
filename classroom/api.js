import { openPostgresStore, adaptSqlite } from './postgres-store.js';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { openStore, hashPassword, verifyPassword, digest, secret } from './store.js';
import { gradeAnswer, summarize, validateState, csvCell, LESSON_VERSION } from './progress.js';
const fail = (status, message) => Object.assign(new Error(message), { status });
const now = () => new Date().toISOString();
const safeUser = u => ({ id: u.id, studentId: u.student_id, name: u.name, role: u.role });
const validPassword = p => typeof p === 'string' && p.length >= 10 && p.length <= 128;
const kinds = new Set(['activity', 'reveal', 'compare', 'sample', 'generation', 'relationship', 'reflection', 'answer', 'restart', 'advanced']);
export function createClassroom(env) {
  const enabled = env.CLASSROOM_ENABLED === 'true';
  if (!enabled) return { enabled: false, close() {}, async handle(req, res) { reply(res, 503, { error: '학습 기록 서버가 아직 연결되지 않았습니다.' }); } };
  if (!validPassword(env.ADMIN_PASSWORD) || !env.CLASSROOM_JOIN_CODE || env.CLASSROOM_JOIN_CODE.length < 8) throw new Error('ADMIN_PASSWORD(10자 이상)와 CLASSROOM_JOIN_CODE(8자 이상)를 서버에 설정하세요.');
  if (env.NODE_ENV === 'production' && !env.DATABASE_URL && !env.CLASSROOM_DB_PATH) throw new Error('운영 기록 데이터베이스 연결을 설정하세요.');
  const db = env.DATABASE_URL ? openPostgresStore(env.DATABASE_URL) : adaptSqlite(openStore(env.CLASSROOM_DB_PATH || resolve('data/classroom.sqlite')));
  const secure = env.NODE_ENV === 'production';
  const cookieName = secure ? '__Host-gpt_session' : 'gpt_session';
  const adminLogin = env.ADMIN_LOGIN || 'instructor';
  const ready = db.run(async () => {
    await db.initialize?.();
    if (!(await db.prepare("SELECT id FROM users WHERE role = 'admin'").get())) {
      const hash = await hashPassword(env.ADMIN_PASSWORD);
      (await db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,?)').run(randomUUID(), adminLogin, '관리자', 'admin', hash, now(), null));
    }
  });
  ready.catch(() => {});
  async function limit(key, maximum = 25, duration = 15 * 60 * 1000) {
    const time = Date.now();
    (await db.prepare('DELETE FROM rate_limits WHERE expires_at < ?').run(time));
    (await db.prepare('INSERT INTO rate_limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=rate_limits.count+1').run(digest(key), time + duration));
    if ((await db.prepare('SELECT count FROM rate_limits WHERE key=?').get(digest(key))).count > maximum) throw fail(429, '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
  }
  async function session(req) {
    const token = req.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
    if (!token || token.length > 100) return null;
    return (await db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').get(digest(token), Date.now())) || null;
  }
  async function authenticate(req, role) {
    const user = (await session(req));
    if (!user) throw fail(401, '다시 로그인해 주세요.');
    if (role && user.role !== role) throw fail(403, '이 기록을 볼 권한이 없습니다.');
    return user;
  }
  async function setSession(res, user) {
    const token = secret();
    (await db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now()));
    (await db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(digest(token), user.id, Date.now() + 12 * 60 * 60 * 1000));
    (await db.prepare('UPDATE users SET last_login=? WHERE id=?').run(now(), user.id));
    res.setHeader('Set-Cookie', `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200${secure ? '; Secure' : ''}`);
  }
  async function progress(userId) {
    const row = (await db.prepare('SELECT * FROM progress WHERE user_id=?').get(userId));
    return { state: row ? JSON.parse(row.state) : {}, revision: row?.revision || 0, updatedAt: row?.updated_at || null };
  }
  async function events(userId) {
    return (await db.prepare('SELECT id,kind,payload,received_at FROM events WHERE user_id=? ORDER BY id').all(userId)).map(e => ({ id: e.id, kind: e.kind, payload: JSON.parse(e.payload), at: e.received_at }));
  }
  async function report(u, details = false) {
    const p = (await progress(u.id)); const rows = (await events(u.id));
    const attempts = rows.filter(e => e.kind === 'answer').map(e => ({ ...e.payload, at: e.at }));
    const summary = summarize(p.state, attempts);
    const basic = { ...safeUser(u), activated: !!u.password_hash, lastLogin: u.last_login, updatedAt: p.updatedAt, eventCount: rows.length, completed: summary.completed, answered: summary.answered, correct: summary.correct, firstCorrect: summary.firstCorrect, total: summary.total };
    return details ? { ...basic, ...summary, events: rows, version: LESSON_VERSION } : basic;
  }
  async function handle(req, res) {
    try {
      await ready;
      const url = new URL(req.url, 'http://localhost');
      const route = url.pathname.replace(/^\/api\/classroom/, '');
      if (!['GET', 'POST'].includes(req.method)) throw fail(405, '지원하지 않는 요청입니다.');
      if (req.method === 'POST') {
        // JSON plus a custom header prevents cross-origin form submissions, even on login.
        if (req.headers['x-classroom-request'] !== '1') throw fail(403, '올바른 사이트에서 다시 시도해 주세요.');
        if (!req.headers['content-type']?.startsWith('application/json')) throw fail(415, 'JSON 형식이 필요합니다.');
        if (req.headers['sec-fetch-site'] === 'cross-site') throw fail(403, '다른 사이트의 요청은 허용하지 않습니다.');
        if (req.headers.origin) {
          const expected = env.PUBLIC_ORIGIN || (env.RENDER_EXTERNAL_URL ? new URL(env.RENDER_EXTERNAL_URL).origin : `${secure ? 'https' : 'http'}://${req.headers.host}`);
          if (req.headers.origin !== expected) throw fail(403, '요청 주소가 올바르지 않습니다.');
        }
      }
      if (route === '/health' && req.method === 'GET') { (await db.prepare('SELECT 1').get()); return reply(res, 200, { enabled: true, version: LESSON_VERSION }); }
      if (route === '/session' && req.method === 'GET') { const u = (await session(req)); return reply(res, 200, { user: u ? safeUser(u) : null, version: LESSON_VERSION }); }
      if (['/login', '/activate', '/admin-login'].includes(route) && req.method === 'POST') {
        const body = await readBody(req, 4096);
        (await limit('auth-global', 600)); (await limit('auth:' + String(body.studentId || body.login || '').slice(0,40)));
        const login = route === '/admin-login' ? body.login : body.studentId;
        const u = typeof login === 'string' ? (await db.prepare('SELECT * FROM users WHERE student_id=?').get(login.trim())) : null;
        if (typeof body.password !== 'string' || body.password.length > 128) throw fail(400, '로그인 정보를 확인해 주세요.');
        const identityMatches = u && (route === '/admin-login' ? u.role === 'admin' : u.role === 'student' && u.name === body.name?.trim());
        if (route === '/activate') {
          if (!identityMatches || u.password_hash || body.joinCode !== env.CLASSROOM_JOIN_CODE || !validPassword(body.password)) {
            await verifyPassword(body.password, null);
            throw fail(400, '명단의 이름·학번, 수업 참여 코드와 비밀번호(10자 이상)를 확인하세요. 이미 등록했다면 로그인하세요.');
          }
          const hashed = await hashPassword(body.password);
          const update = (await db.prepare('UPDATE users SET password_hash=? WHERE id=? AND password_hash IS NULL').run(hashed, u.id));
          if (!update.changes) throw fail(409, '이미 등록된 계정입니다. 로그인해 주세요.');
        } else {
          const matches = await verifyPassword(body.password, u?.password_hash);
          if (!identityMatches || !matches) throw fail(401, '이름·학번 또는 비밀번호가 일치하지 않습니다.');
        }
        (await setSession(res, u)); return reply(res, 200, { user: safeUser(u) });
      }
      if (route === '/logout' && req.method === 'POST') {
        const token = req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);
        if (token) (await db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token)));
        res.setHeader('Set-Cookie', `${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`);
        return reply(res, 200, { ok: true });
      }
      const u = (await authenticate(req));
      if (route === '/progress' && req.method === 'GET') {
        if (u.role !== 'student') throw fail(403, '학생 계정에서만 저장합니다.');
        return reply(res, 200, { ...(await progress(u.id)), summary: (await report(u, true)) });
      }
      if (route === '/sync' && req.method === 'POST') {
        if (u.role !== 'student') throw fail(403, '학생 계정에서만 저장합니다.');
        (await limit('sync:' + u.id, 180, 60 * 1000));
        const body = await readBody(req, 160000);
        let state;
        try { state = validateState(body.state); } catch (e) { throw fail(400, e.message); }
        if (!Number.isInteger(body.revision) || !Array.isArray(body.events) || body.events.length > 100) throw fail(400, '저장 요청 형식이 올바르지 않습니다.');
        const cleanEvents = body.events.map(e => {
          if (!e || !/^[\w-]{10,80}$/.test(e.key) || !kinds.has(e.kind) || !e.payload || typeof e.payload !== 'object' || Array.isArray(e.payload) || JSON.stringify(e.payload).length > 6000) throw fail(400, '활동 기록 형식이 올바르지 않습니다.');
          let payload = e.payload;
          if (e.kind === 'answer') { try { payload = gradeAnswer(e.payload.questionId, e.payload.choice); } catch (error) { throw fail(400, error.message); } }
          return { ...e, payload };
        });
        (await db.exec('BEGIN IMMEDIATE'));
        try {
          const current = (await progress(u.id));
          let allSaved = cleanEvents.length > 0;
          for(const e of cleanEvents) { if(!(await db.prepare('SELECT id FROM events WHERE user_id=? AND event_key=?').get(u.id,e.key))) allSaved=false; }
          if (body.revision !== current.revision) {
            if (allSaved && JSON.stringify(current.state) === JSON.stringify(state)) { (await db.exec('ROLLBACK')); return reply(res, 200, current); }
            throw fail(409, '다른 창에서 기록이 바뀌었습니다. 새로고침해 최신 기록을 불러오세요.');
          }
          for (const e of cleanEvents) (await db.prepare('INSERT OR IGNORE INTO events (user_id,event_key,kind,payload,received_at) VALUES (?,?,?,?,?)').run(u.id,e.key,e.kind,JSON.stringify(e.payload),now()));
          (await db.prepare('INSERT INTO progress VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET state=excluded.state,revision=excluded.revision,updated_at=excluded.updated_at').run(u.id,JSON.stringify(state),current.revision+1,now()));
          (await db.exec('COMMIT'));
          return reply(res, 200, (await progress(u.id)));
        } catch (error) { if (db.isTransaction) (await db.exec('ROLLBACK')); throw error; }
      }
      (await authenticate(req, 'admin'));
      if (route === '/admin/students' && req.method === 'GET') {
        const students = (await db.prepare("SELECT * FROM users WHERE role='student' ORDER BY student_id").all());
        const reports=[]; for(const student of students) reports.push((await report(student)));
        return reply(res, 200, { students: reports, joinCode: env.CLASSROOM_JOIN_CODE, storageNotice: env.CLASSROOM_STORAGE_NOTICE || '', expiresAt: env.CLASSROOM_EXPIRES_AT || null });
      }
      const detail = route.match(/^\/admin\/students\/([\w-]+)$/);
      if (detail && req.method === 'GET') {
        const student = (await db.prepare("SELECT * FROM users WHERE id=? AND role='student'").get(detail[1]));
        if (!student) throw fail(404, '학생을 찾을 수 없습니다.');
        return reply(res, 200, (await report(student, true)));
      }
      if (route === '/admin/roster' && req.method === 'POST') {
        const { students } = await readBody(req, 100000);
        if (!Array.isArray(students) || students.length < 1 || students.length > 1000) throw fail(400, '한 번에 1~1000명을 등록하세요.');
        const entries = students.map(s=>({studentId: String(s.studentId || '').trim(), name: String(s.name || '').trim()}));
        if (entries.some(s=>!/^[-A-Za-z0-9]{3,30}$/.test(s.studentId) || s.name.length < 1 || s.name.length > 60 || /[\r\n\t]/.test(s.name))) throw fail(400, '학번은 영문·숫자·하이픈 3~30자, 이름은 1~60자로 입력하세요.');
        if (new Set(entries.map(s=>s.studentId)).size !== entries.length) throw fail(400, '입력한 명단에 중복 학번이 있습니다.');
        let added = 0; (await db.exec('BEGIN IMMEDIATE'));
        try {
          for (const entry of entries) {
            const existing = (await db.prepare('SELECT name,role FROM users WHERE student_id=?').get(entry.studentId));
            if (existing && (existing.name !== entry.name || existing.role !== 'student')) throw fail(409, `학번 ${entry.studentId}이 다른 이름으로 등록되어 있습니다. 명단을 확인하세요.`);
            if (!existing) { (await db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,?)').run(randomUUID(),entry.studentId,entry.name,'student',null,now(),null)); added++; }
          }
          (await db.exec('COMMIT'));
        } catch(e) { (await db.exec('ROLLBACK')); throw e; }
        return reply(res, 200, { added });
      }
      if (route === '/admin/export-details' && req.method === 'GET') {
        const students = await db.prepare("SELECT * FROM users WHERE role='student' ORDER BY student_id").all();
        const records=[];
        for(const student of students) records.push(await report(student,true));
        res.writeHead(200, { 'Content-Type':'application/json; charset=utf-8', 'Content-Disposition':'attachment; filename="gpt-learning-full-records.json"', 'Cache-Control':'no-store' });
        return res.end(JSON.stringify({version:LESSON_VERSION,exportedAt:now(),students:records},null,2));
      }
      if (route === '/admin/export' && req.method === 'GET') {
        const students = (await db.prepare("SELECT * FROM users WHERE role='student' ORDER BY student_id").all());
        const rows = [['학번','이름','참여 상태','활동 완료(6개)','응답 문항(8개)','첫 응답 정답 수','최근 응답 정답 수','최근 로그인','최근 저장']];
        for (const student of students) { const r = (await report(student)); rows.push([r.studentId,r.name,r.eventCount ? '학습 중' : r.lastLogin ? '로그인만 함' : '미참여',r.completed,r.answered,r.firstCorrect,r.correct,r.lastLogin,r.updatedAt]); }
        res.writeHead(200, { 'Content-Type':'text/csv; charset=utf-8', 'Content-Disposition':'attachment; filename="gpt-learning-records.csv"', 'Cache-Control':'no-store' });
        return res.end('\uFEFF' + rows.map(row=>row.map(csvCell).join(',')).join('\r\n'));
      }
      throw fail(404, '요청한 기능을 찾을 수 없습니다.');
    } catch (error) {
      if (!error.status) console.error('Classroom request failed:', error.code || error.name);
      reply(res, error.status || 500, { error: error.status ? error.message : '기록을 저장하거나 불러오지 못했습니다. 잠시 후 다시 시도하세요.' });
    }
  }
  return { enabled, handle: (req,res) => db.run(() => handle(req,res)).catch(error => { console.error('Classroom unavailable:',error.code || error.name); if(!res.headersSent)reply(res,503,{error:'기록 서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요.'}); }), close: () => db.close(), ready };
}
function reply(res, status, body) { res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' }); res.end(JSON.stringify(body)); }
async function readBody(req, max) {
  const chunks=[]; let size=0;
  for await (const chunk of req) { size+=chunk.length; if(size>max) throw fail(413,'입력 내용이 너무 큽니다.'); chunks.push(chunk); }
  try { const body=JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error(); return body; } catch { throw fail(400,'입력 형식이 올바르지 않습니다.'); }
}
