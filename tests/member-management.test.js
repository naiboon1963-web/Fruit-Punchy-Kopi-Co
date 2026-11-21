import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import vm from 'node:vm'
import { stripTypeScriptTypes } from 'node:module'

const id = '00000000-0000-0000-0000-000000000001'
test('member status and usernames are enforced by the database', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      create schema auth; create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb not null default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema public,auth to anon,authenticated,service_role; grant execute on function auth.uid() to anon,authenticated,service_role;`)
    for (const migration of ['202611140001_members_and_staff.sql','202611140002_code_authorized_staff_invitations.sql','202611210001_member_usernames_and_status.sql']) await db.exec(await readFile(new URL('../supabase/migrations/' + migration, import.meta.url),'utf8'))
    await db.query(`insert into auth.users values ($1,'member@example.test',now(),'{"username":"Member_1","full_name":"Test Member","telephone":"+65 12345678","status":"Active","role":"admin"}')`,[id])
    const member = (await db.query('select * from public.profiles')).rows[0]
    assert.equal(member.username,'member_1'); assert.equal(member.status,'Pending'); assert.equal(member.role,'member'); assert.equal(member.full_name,'Test Member')
    await assert.rejects(db.query(`insert into auth.users values ('00000000-0000-0000-0000-000000000002','other@example.test',now(),'{"username":"MEMBER_1"}')`), /unique/)
    await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[id])
    await db.exec('set role authenticated')
    assert.equal((await db.query('select * from public.profiles')).rows.length,0,'Pending users cannot read even their own profile')
    await assert.rejects(db.query(`update public.profiles set status='Active' where id=$1`,[id]), /permission denied/)
    await db.exec('reset role')
    await db.query(`update public.profiles set status='Active' where id=$1`,[id])
    await db.exec('set role authenticated')
    assert.equal((await db.query('select * from public.profiles')).rows.length,1)
    await db.exec('reset role')
    await db.query(`update auth.users set email_confirmed_at=null where id=$1`,[id])
    await db.exec('set role authenticated')
    assert.equal((await db.query('select * from public.profiles')).rows.length,0,'Unverified active users remain blocked')
  } finally { await db.close() }
})

async function endpoint({ status='Pending', duplicate=false, validPassword=true }={}) {
  let handler; let signedOut=false
  const client = {
    from: () => ({ select() { return this }, eq() { return this }, maybeSingle: async () => ({ data: {id,email:'member@example.test'},error:null }), single: async () => ({ data: {status,username:'member_1',full_name:'Test Member'},error:null }) }),
    auth: {
      signInWithPassword: async () => validPassword ? { data:{ session:{access_token:'access',refresh_token:'refresh'},user:{id,email_confirmed_at:'2026-11-21'}},error:null } : { data:{},error:{} },
      signOut: async () => { signedOut=true },
    },
  }
  let code = await readFile(new URL('../supabase/functions/member-auth/index.ts',import.meta.url),'utf8')
  code=code.replace(/^import .*\n/,'').replace('export async function','async function')
  vm.runInNewContext(stripTypeScriptTypes(code),{createClient:()=>client,Deno:{env:{get:(key)=>key==='MEMBER_SITE_URL'?'https://cafe.example':'test'},serve:fn=>{handler=fn}},Request,Response,URL,JSON})
  return {handler,signedOut:()=>signedOut}
}
const login = () => new Request('https://test/functions/v1/member-auth',{method:'POST',body:JSON.stringify({action:'login',username:'member_1',password:'password-test-123'})})
test('Pending login returns the requested error and no tokens',async()=>{
  const server=await endpoint(); const response=await server.handler(login()); const body=await response.json()
  assert.equal(response.status,403); assert.equal(body.error,'Your account is pending approval. Please contact the café team.'); assert.equal(body.session,undefined); assert.equal(server.signedOut(),true)
})
test('Active login returns a session; rejected and incorrect-password logins do not',async()=>{
  const active=await endpoint({status:'Active'}); assert.equal((await (await active.handler(login())).json()).session.access_token,'access')
  for (const options of [{status:'Rejected'},{status:'Active',validPassword:false}]) { const server=await endpoint(options); const response=await server.handler(login()); assert.ok(response.status>=400); assert.equal((await response.json()).session,undefined) }
})
test('registration reports duplicate usernames before creating an account',async()=>{
  const server=await endpoint(); const response=await server.handler(new Request('https://test/functions/v1/member-auth',{method:'POST',body:JSON.stringify({action:'register',username:'member_1',email:'member@example.test',password:'password-test-123',full_name:'Test Member',telephone:'+65 12345678'})}))
  assert.equal(response.status,409); assert.match((await response.json()).error,/username is already registered/)
})
