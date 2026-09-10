import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
// One pool connection per request; transaction state never leaks to other requests.
export function openPostgresStore(connectionString) {
  const pool=new pg.Pool({ connectionString, max:5, idleTimeoutMillis:30000, connectionTimeoutMillis:10000 });
  pool.on('error', error=>console.error('Classroom database connection failed:',error.code || error.name));
  const scope=new AsyncLocalStorage();
  const current=()=>{const context=scope.getStore();if(!context)throw new Error('Database request context required');return context;};
  const sql=text=>{
    let index=0;
    return text.replaceAll('INSERT OR IGNORE INTO events','INSERT INTO events').replace(/\?/g,()=>'$'+(++index)) + (text.startsWith('INSERT OR IGNORE INTO events') ? ' ON CONFLICT(user_id,event_key) DO NOTHING' : '');
  };
  return {
    async run(fn) {
      if(scope.getStore())return fn();
      const connection=await pool.connect();
      const context={connection,transaction:false};
      try{return await scope.run(context,fn);}
      finally{if(context.transaction)await connection.query('ROLLBACK').catch(()=>{});connection.release();}
    },
    get isTransaction(){return current().transaction;},
    prepare(text) {
      const query=(args)=>current().connection.query(sql(text),args);
      return {async get(...args){return (await query(args)).rows[0];},async all(...args){return (await query(args)).rows;},async run(...args){const result=await query(args);return {changes:result.rowCount};}};
    },
    async exec(text) {
      const ctx=current();
      if(text==='BEGIN IMMEDIATE'||text==='BEGIN') {
        await ctx.connection.query('BEGIN');ctx.transaction=true;
        // Serialize classroom write transactions across processes, not just in memory.
        await ctx.connection.query("SELECT pg_advisory_xact_lock(hashtext('gpt-classroom-write'))");
      } else {
        await ctx.connection.query(text);
        if(text==='COMMIT'||text==='ROLLBACK')ctx.transaction=false;
      }
    },
    async initialize() {
      await this.exec('BEGIN');
      try {
        await current().connection.query(`CREATE TABLE IF NOT EXISTS classroom_schema (version INTEGER PRIMARY KEY);
          CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, student_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('student','admin')), password_hash TEXT, created_at TEXT NOT NULL, last_login TEXT);
          CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at BIGINT NOT NULL);
          CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
          CREATE TABLE IF NOT EXISTS progress (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, state TEXT NOT NULL DEFAULT '{}', revision INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS events (id BIGSERIAL PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, event_key TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, received_at TEXT NOT NULL, UNIQUE(user_id,event_key));
          CREATE INDEX IF NOT EXISTS idx_events_user_id ON events(user_id,id);
          CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at BIGINT NOT NULL);
          INSERT INTO classroom_schema VALUES (1) ON CONFLICT DO NOTHING;`);
        const row=await this.prepare('SELECT MAX(version) AS version FROM classroom_schema').get();
        if(row.version!==1)throw new Error('Unsupported classroom schema version');
        await this.exec('COMMIT');
      }catch(error){if(this.isTransaction)await this.exec('ROLLBACK');throw error;}
    },
    close:()=>pool.end(),
  };
}
// Keep the existing local SQLite option; serialize complete requests now that
// shared handlers await database operations and could otherwise interleave.
export function adaptSqlite(db) {
  let tail=Promise.resolve();
  return {
    run(fn){const pending=tail.then(fn);tail=pending.catch(()=>{});return pending;},
    prepare:text=>db.prepare(text), exec:text=>db.exec(text), get isTransaction(){return db.isTransaction;},
    close:()=>db.close(),
  };
}
