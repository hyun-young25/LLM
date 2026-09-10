import { resolve } from 'node:path';
import { openStore, hashPassword } from '../classroom/store.js';
const { RESET_LOGIN, RESET_PASSWORD, CLASSROOM_DB_PATH } = process.env;
if (!RESET_LOGIN || !RESET_PASSWORD || RESET_PASSWORD.length < 10 || RESET_PASSWORD.length > 128) throw new Error('RESET_LOGIN과 RESET_PASSWORD(10~128자)를 서버의 비밀 환경변수에 설정하세요.');
const db=openStore(CLASSROOM_DB_PATH || resolve('data/classroom.sqlite'));
try {
  const user=db.prepare('SELECT id FROM users WHERE student_id=?').get(RESET_LOGIN);
  if(!user)throw new Error('계정을 찾을 수 없습니다.');
  const hash=await hashPassword(RESET_PASSWORD);
  db.exec('BEGIN IMMEDIATE');
  try { db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash,user.id); db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id); db.exec('COMMIT'); }
  catch(e){db.exec('ROLLBACK');throw e;}
  console.log('비밀번호 변경과 기존 세션 폐기를 완료했습니다. RESET_LOGIN과 RESET_PASSWORD 환경변수를 제거하세요.');
} finally {db.close();}
