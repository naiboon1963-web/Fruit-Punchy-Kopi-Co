import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import vm from 'node:vm'
import { stripTypeScriptTypes } from 'node:module'
import { pbkdf2Sync, webcrypto } from 'node:crypto'

const id = '00000000-0000-0000-0000-000000000001'
const migration = '20261121034501_admin_member_management.sql'

test('only server admin operations can approve, promote and write the audit log', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      create schema auth; create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb not null default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema public,auth to anon,authenticated,service_role; grant execute on function auth.uid() to anon,authenticated,service_role;`)
    for (const name of ['202611140001_members_and_staff.sql','202611140002_code_authorized_staff_invitations.sql','202611210001_member_usernames_and_status.sql',migration]) await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'))
    await db.query(`insert into auth.users values ($1,'qa@example.test',null,'{"username":"qa_member"}')`,[id])
    for (const role of ['anon','authenticated']) {
      await db.exec('set role '+role)
      await assert.rejects(db.query(`select public.admin_manage_member($1,'approve')`,[id]),/permission denied/)
      await assert.rejects(db.query(`select public.consume_admin_login_attempt($1)`,['a'.repeat(43)]),/permission denied/)
      await assert.rejects(db.query('select * from admin_private.member_actions'),/permission denied/)
      await db.exec('reset role')
    }
    await db.exec('set role service_role')
    await assert.rejects(db.query(`select public.admin_manage_member($1,'promote')`,[id]),/Only active/)
    const approved=(await db.query(`select public.admin_manage_member($1,'approve') as member`,[id])).rows[0].member
    assert.equal(approved.status,'Active');assert.equal(approved.role,'member')
    const staff=(await db.query(`select public.admin_manage_member($1,'promote') as member`,[id])).rows[0].member
    assert.equal(staff.role,'staff')
    await assert.rejects(db.query(`select public.admin_manage_member($1,'admin')`,[id]),/Invalid member action/)
    assert.equal((await db.query('select * from admin_private.member_actions')).rows.length,2)
    for(let i=0;i<11;i++) assert.equal((await db.query('select public.consume_admin_login_attempt($1) as allowed',['a'.repeat(43)])).rows[0].allowed,i<10)
    await db.exec('reset role')
    await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[id])
    await db.exec('set role authenticated')
    assert.equal((await db.query('select * from public.profiles')).rows.length,0,'Approval never bypasses email verification')
    await db.exec('reset role')
    await db.query(`insert into auth.users values ('00000000-0000-0000-0000-000000000002','legacy@example.test',now(),'{}')`)
    await db.exec('set role service_role')
    await assert.rejects(db.query(`select public.admin_manage_member('00000000-0000-0000-0000-000000000002','approve')`),/username is required/)
    await assert.rejects(db.query(`select public.admin_manage_member('00000000-0000-0000-0000-000000000002','approve','qa_member')`),/unique/)
    assert.equal((await db.query(`select public.admin_manage_member('00000000-0000-0000-0000-000000000002','approve','legacy_member') as member`)).rows[0].member.username,'legacy_member')
  } finally { await db.close() }
})

const password='local-test-admin-pass'
const salt=Buffer.from('local-test-salt-123')
const passwordHash=['pbkdf2-sha256','210000',salt.toString('base64url'),pbkdf2Sync(password,salt,210000,32,'sha256').toString('base64url')].join(':')
async function setup({allowed=true}={}) {
  let handler,reads=0,changes=0,now=Date.now()
  const client={
    rpc:async(name)=>name==='consume_admin_login_attempt'?{data:allowed,error:null}:(changes++,{data:{id,role:'staff'},error:null}),
    from:()=>({select(){return this},eq(){return this},order(){return this},range:async()=>{reads++;return {data:[{id,username:'qa_member'}],count:1,error:null}}}),
  }
  const source=(await readFile(new URL('../supabase/functions/admin-members/index.ts',import.meta.url),'utf8')).replace(/^import .*\n/,'')
  class TestDate extends Date { static now(){return now} }
  vm.runInNewContext(stripTypeScriptTypes(source),{createClient:()=>client,Deno:{env:{get:key=>({ADMIN_PASSWORD_HASH:passwordHash,ADMIN_SESSION_SECRET:'local-test-signing-secret-more-than-32-characters',SUPABASE_URL:'https://project.example',SUPABASE_SERVICE_ROLE_KEY:'server-only-test-key',MEMBER_SITE_URL:'https://cafe.example'}[key])},serve:fn=>{handler=fn}},crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,btoa,atob,Request,Response,URL,Date:TestDate,JSON,Set})
  return {call:(body,origin='https://cafe.example')=>handler(new Request('https://project.example/functions/v1/admin-members',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)})),counts:()=>({reads,changes}),expire:()=>{now+=901000}}
}

test('admin password and signed session protect all reads and mutations',async()=>{
  const server=await setup()
  assert.equal((await server.call({action:'list'})).status,401)
  assert.equal((await server.call({action:'promote',member_id:id,admin_token:'forged'})).status,401)
  assert.deepEqual(server.counts(),{reads:0,changes:0})
  assert.equal((await server.call({action:'login',password:'wrong'})).status,401)
  const login=await server.call({action:'login',password});assert.equal(login.status,200)
  const {token}=await login.json()
  assert.equal((await server.call({action:'list',admin_token:token})).status,200)
  assert.equal((await server.call({action:'promote',member_id:id,admin_token:token})).status,200)
  assert.deepEqual(server.counts(),{reads:1,changes:1})
  const forged=token.split('.')[0]+'.'+Buffer.alloc(32).toString('base64url')
  assert.equal((await server.call({action:'list',admin_token:forged})).status,401)
  server.expire()
  assert.equal((await server.call({action:'list',admin_token:token})).status,401)
  assert.deepEqual(server.counts(),{reads:1,changes:1})
})

test('admin login is rate limited and rejects untrusted origins',async()=>{
  const server=await setup({allowed:false})
  assert.equal((await server.call({action:'login',password})).status,429)
  assert.equal((await server.call({action:'login',password},'https://untrusted.example')).status,403)
  assert.deepEqual(server.counts(),{reads:0,changes:0})
})
