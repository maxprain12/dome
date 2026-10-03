import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createRequire,Module} from 'node:module';
const require=createRequire(import.meta.url);
// These SQLite tests never authenticate or start Electron. CI intentionally
// installs without lifecycle scripts, so keep OAuth's native shell dependency out.
const authPath=require.resolve('../auth/dome-oauth.cjs');
const previousAuth=require.cache[authPath];
const authStub=new Module(authPath);
authStub.exports={fetchWithDomeAuth:()=>{throw new Error('Unexpected network access in vault sync test');}};
require.cache[authPath]=authStub;
let sync;
try {sync=require('../storage/domain-sync.cjs');}
finally {if(previousAuth)require.cache[authPath]=previousAuth;else delete require.cache[authPath];}
test('conflict replay replaces the local draft only after it was preserved on the server',()=>{
 const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT,updated_at INTEGER);PRAGMA foreign_keys=ON;CREATE TABLE resources(id TEXT PRIMARY KEY,title TEXT,content TEXT,updated_at INTEGER,file_path TEXT);CREATE TABLE resource_tags(resource_id TEXT REFERENCES resources(id) ON DELETE CASCADE,tag_id TEXT,created_at INTEGER,updated_at INTEGER);INSERT INTO resources VALUES('note','Offline','unsent draft',300,'/local/cached-file');INSERT INTO resource_tags VALUES('note','tag',0,0);INSERT INTO settings VALUES('manys:base:note','100',0),('manys:conflict:note','1',0);`);
 const cloud={id:'note',title:'Cloud',content:'new cloud text',updated_at:200,device_id:'many:00000000-0000-4000-8000-000000000001'};
 sync.applyPullPayload(db,'library',{rows:{resources:[cloud]}},'desktop');
 assert.equal(db.prepare('SELECT content FROM resources').get().content,'new cloud text');assert.equal(db.prepare('SELECT COUNT(*) n FROM resource_tags').get().n,1);assert.equal(db.prepare('SELECT file_path FROM resources').get().file_path,'/local/cached-file');assert.equal(db.prepare("SELECT value FROM settings WHERE key='manys:base:note'").get().value,'200');
 assert.equal(db.prepare("SELECT value FROM settings WHERE key='manys:conflict:note'").get(),undefined);
 // Pulled rows are not sent again as Desktop mutations.
 assert.equal(sync.buildPushRows(db,'library',0).resources,undefined);
 db.prepare("UPDATE resources SET content='next local edit',updated_at=201").run();
 assert.equal(sync.buildPushRows(db,'library',0).resources[0].expected_revision,200);db.close();
});
test('a server-normalized own-device acknowledgement preserves an edit made during the push',()=>{
 const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT,updated_at INTEGER);CREATE TABLE resources(id TEXT PRIMARY KEY,content TEXT,updated_at INTEGER);INSERT INTO resources VALUES('note','sent',100);INSERT INTO settings VALUES('manys:base:note','100',0);`);
 sync.applyPullPayload(db,'library',{rows:{resources:[{id:'note',content:'sent',updated_at:110,device_id:'desktop'}]}},'desktop');assert.equal(db.prepare('SELECT updated_at FROM resources').get().updated_at,110);
 db.prepare("UPDATE resources SET content='edited during push',updated_at=120").run();
 sync.applyPullPayload(db,'library',{rows:{resources:[{id:'note',content:'sent',updated_at:110,device_id:'desktop'}]}},'desktop');assert.equal(db.prepare('SELECT content FROM resources').get().content,'edited during push');db.close();
});
