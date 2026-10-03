import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {applyMigrations,SCHEMA_HEAD}=require('../core/db/migrations.cjs');
test('retiring legacy operations preserves library, projects and local Many history',()=>{
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT,updated_at INTEGER);INSERT INTO settings VALUES('schema_version','80',0);
 CREATE TABLE projects(id TEXT);INSERT INTO projects VALUES('project');CREATE TABLE resources(id TEXT);INSERT INTO resources VALUES('note');
 CREATE TABLE many_sessions(id TEXT);INSERT INTO many_sessions VALUES('local-chat');
 CREATE TABLE automation_runs(id TEXT,owner_type TEXT);INSERT INTO automation_runs VALUES('local-run','many'),('legacy-run','agent');
 CREATE TABLE many_agents(id TEXT);INSERT INTO many_agents VALUES('legacy-agent');CREATE TABLE canvas_workflows(id TEXT);INSERT INTO canvas_workflows VALUES('legacy-workflow');
 CREATE TABLE domain_sync_state(domain TEXT);INSERT INTO domain_sync_state VALUES('agents'),('library');`);
 applyMigrations(db,80);assert.equal(SCHEMA_HEAD,81);
 for(const table of ['projects','resources','many_sessions'])assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n,1);
 assert.deepEqual(db.prepare('SELECT id FROM automation_runs').all().map(r=>r.id),['local-run']);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM many_agents').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM canvas_workflows').get().n,0);
 assert.deepEqual(db.prepare('SELECT domain FROM domain_sync_state').all().map(r=>r.domain),['library']);db.close();
});

test('a failed retirement rolls back deleted records and leaves the schema version unchanged',()=>{
 const db=new DatabaseSync(':memory:');
 try {
  db.exec(`PRAGMA foreign_keys=ON;CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT,updated_at INTEGER);INSERT INTO settings VALUES('schema_version','80',0);
  CREATE TABLE automation_runs(id TEXT,owner_type TEXT);INSERT INTO automation_runs VALUES('legacy-run','agent');
  CREATE TABLE many_agents(id TEXT PRIMARY KEY);INSERT INTO many_agents VALUES('legacy-agent');
  CREATE TABLE retained_dependency(agent_id TEXT REFERENCES many_agents(id));INSERT INTO retained_dependency VALUES('legacy-agent');`);
  assert.throws(()=>applyMigrations(db,80),/FOREIGN KEY constraint failed/);
  assert.equal(db.prepare('SELECT id FROM automation_runs').get().id,'legacy-run');
  assert.equal(db.prepare('SELECT id FROM many_agents').get().id,'legacy-agent');
  assert.equal(db.prepare("SELECT value FROM settings WHERE key='schema_version'").get().value,'80');
 } finally {db.close();}
});
