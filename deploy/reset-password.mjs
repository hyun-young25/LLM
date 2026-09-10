import { openPostgresStore, adaptSqlite } from '../classroom/postgres-store.js';
import { resolve } from 'node:path';
import { openStore, hashPassword } from '../classroom/store.js';
const { RESET_LOGIN, RESET_PASSWORD, CLASSROOM_DB_PATH } = process.env;
if (!RESET_LOGIN || !RESET_PASSWORD || RESET_PASSWORD.length < 10 || RESET_PASSWORD.length > 128) throw new Error('RESET_LOGIN과 RESET_PASSWORD(10~128자)를 서버의 비밀 환경변수에 설정하세요.');
const db=process.env.DATABASE_URL ? openPostgresStore(process.env.DATABASE_URL) : adaptSqlite(openStore(CLASSROOM_DB_PATH || resolve('data/classroom.sqlite')));
try { await db.run(async()=>{
  const user=await db.prepare('SELECT id FROM users WHERE student_id=?').get(RESET_LOGIN);
  if(!user)throw new Error('계정을 찾을 수 없습니다.');
  const hash=await hashPassword(RESET_PASSWORD);
  await db.exec('BEGIN IMMEDIATE');
  try { await db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash,user.id); await db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id); await db.exec('COMMIT'); }
  catch(e){await db.exec('ROLLBACK');throw e;}
  console.log('비밀번호 변경과 기존 세션 폐기를 완료했습니다. RESET_LOGIN과 RESET_PASSWORD 환경변수를 제거하세요.');
}); } finally {await db.close();}
