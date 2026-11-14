import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const member = '00000000-0000-0000-0000-000000000001'
const unverified = '00000000-0000-0000-0000-000000000002'
const staff = '00000000-0000-0000-0000-000000000003'
const owner = '00000000-0000-0000-0000-000000000004'
const expired = '00000000-0000-0000-0000-000000000005'

test('database enforces email verification and prevents client role escalation', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create table auth.users (
        id uuid primary key, email text, email_confirmed_at timestamptz,
        raw_user_meta_data jsonb not null default '{}'::jsonb
      );
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema public, auth to anon, authenticated, service_role;
      grant execute on function auth.uid() to anon, authenticated, service_role;
    `)
    await db.exec(await readFile(new URL('../supabase/migrations/202611140001_members_and_staff.sql', import.meta.url), 'utf8'))
    await db.query(`insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
      ($1, 'member@example.test', now(), '{"display_name":"Member","role":"admin"}'),
      ($2, 'pending@example.test', null, '{"role":"staff"}'),
      ($3, 'staff@example.test', null, '{}'),
      ($4, 'owner@example.test', now(), '{}'),
      ($5, 'expired@example.test', null, '{}')`, [member, unverified, staff, owner, expired])
    assert.equal((await db.query('select role from public.profiles where id=$1', [member])).rows[0].role, 'member', 'forged signup metadata is ignored')
    await db.query(`update public.profiles set role='admin' where id=$1`, [owner])
    await db.query(`insert into public.staff_invitations (email,display_name,invited_by) values ('staff@example.test','Team Member',$1)`, [owner])
    assert.equal((await db.query('select role from public.profiles where id=$1', [staff])).rows[0].role, 'member', 'invitation alone does not grant access')
    await db.query(`insert into public.staff_invitations (email,display_name,invited_by,expires_at) values ('expired@example.test','Expired',$1,now()-interval '1 day')`, [owner])
    await db.query('update auth.users set email_confirmed_at=now() where id in ($1,$2)', [staff, expired])
    assert.equal((await db.query('select role from public.profiles where id=$1', [staff])).rows[0].role, 'staff', 'verified invitation grants staff role')
    assert.equal((await db.query('select role from public.profiles where id=$1', [expired])).rows[0].role, 'member', 'expired invitation cannot elevate a user')
    assert.ok((await db.query(`select accepted_at from public.staff_invitations where email='staff@example.test'`)).rows[0].accepted_at)

    await db.exec('set role anon')
    await assert.rejects(db.query('select * from public.profiles'), /permission denied/i)
    await db.exec('reset role')

    await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [unverified])
    await db.exec('set role authenticated')
    assert.equal((await db.query('select * from public.profiles')).rows.length, 0, 'unverified account cannot read even its own profile')
    assert.equal((await db.query(`update public.profiles set display_name='Blocked' where id=$1 returning id`, [unverified])).rows.length, 0)
    await db.exec('reset role')

    await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [member])
    await db.exec('set role authenticated')
    const own = (await db.query('select * from public.profiles')).rows
    assert.equal(own.length, 1, 'member cannot enumerate other profiles')
    assert.equal(own[0].id, member)
    await assert.rejects(db.query(`update public.profiles set role='admin' where id=$1`, [member]), /permission denied/i)
    await assert.rejects(db.query(`insert into public.profiles(id,email,role) values ($1,'bad@example.test','admin')`, [member]), /permission denied/i)
    await assert.rejects(db.query('select * from public.staff_invitations'), /permission denied/i)
    await assert.rejects(db.query(`insert into public.staff_invitations(email,display_name,invited_by) values ('attacker@example.test','Attacker',$1)`, [member]), /permission denied/i)
    await assert.rejects(db.query(`update public.profiles set email='owner@example.test' where id=$1`, [member]), /permission denied/i)
    assert.equal((await db.query(`update public.profiles set display_name='New name' where id=$1 returning display_name`, [member])).rows[0].display_name, 'New name')
    assert.equal((await db.query(`update public.profiles set display_name='Not allowed' where id=$1 returning id`, [staff])).rows.length, 0)
    await db.exec('reset role')

    // Revoking confirmation also revokes profile access for an already-staff role.
    await db.query('update auth.users set email_confirmed_at=null where id=$1', [staff])
    await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [staff])
    await db.exec('set role authenticated')
    assert.equal((await db.query('select * from public.profiles')).rows.length, 0)
  } finally { await db.close() }
})
