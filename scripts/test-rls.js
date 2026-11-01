// Security tests against the real database, as real `authenticated` and `anon` roles.
// Everything runs inside a transaction that is always rolled back, so no data is left behind.
//
//   npm run test:rls      (needs POSTGRES_URL_NON_POOLING in .env.local; never printed)
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const env = {};
for (const line of fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
}
const conn = new URL(env.POSTGRES_URL_NON_POOLING);
conn.searchParams.delete('sslmode');
const c = new Client({ connectionString: conn.toString(), ssl: { rejectUnauthorized: false } });

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const CHILD_A = '10000000-0000-4000-8000-00000000000a';
const CHILD_B = '10000000-0000-4000-8000-00000000000b';
let GAME_1, GAME_2, GAME_OFF;
let pass = 0;
let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`);
};

const as = async (user) => {
  await c.query('reset role');
  if (user === 'anon') {
    await c.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
    await c.query('set local role anon');
  } else {
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: user, role: 'authenticated', is_anonymous: true })]);
    await c.query('set local role authenticated');
  }
};
// Runs a statement that may fail, without losing the surrounding transaction.
const attempt = async (sql, params = []) => {
  await c.query('savepoint s');
  try {
    const r = await c.query(sql, params);
    await c.query('release savepoint s');
    return { rows: r.rows, count: r.rowCount };
  } catch (e) {
    await c.query('rollback to savepoint s');
    return { error: e.code, message: e.message };
  }
};
const rows = async (sql, params) => (await attempt(sql, params)).rows ?? [];
const sync = (id, display, nick, ts = '2026-01-01T00:00:00Z') =>
  attempt('select * from public.sync_child_profile($1,$2,$3,null,null,$4,$5,$6,$7)', [id, display, nick, '4-5', 'lion', ts, ts]);

(async () => {
  await c.connect();
  await c.query('begin');
  try {
    await c.query(`insert into auth.users (id, aud, role, is_anonymous) values ($1,'authenticated','authenticated',true), ($2,'authenticated','authenticated',true)`, [A, B]);
    GAME_1 = (await c.query(`select id from public.games where slug='puzzlewala'`)).rows[0].id;
    GAME_2 = (await c.query(`insert into public.games (name, slug) values ('Other','rls-test-other') returning id`)).rows[0].id;
    GAME_OFF = (await c.query(`insert into public.games (name, slug, status) values ('Off','rls-test-off','retired') returning id`)).rows[0].id;

    // --- Every user table has RLS on
    const noRls = await rows(`select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity`);
    ok('RLS enabled on every public table', noRls.length === 0, noRls.map((r) => r.relname).join());

    // --- Signed-out callers get nothing
    await as('anon');
    for (const t of ['games', 'app_installations', 'child_profiles', 'game_progress', 'game_settings', 'game_sessions', 'game_rewards', 'game_child_profiles']) {
      ok(`anon cannot read ${t}`, (await attempt(`select 1 from public.${t} limit 1`)).error === '42501');
    }
    ok('anon cannot call sync functions', (await attempt(`select public.ensure_installation($1)`, [A])).error === '42501');

    // --- Set up user A and B
    await as(A);
    const instA = (await attempt('select public.ensure_installation($1,$2) as id', [A, '1.0.0'])).rows[0].id;
    ok('A registers an installation', !!instA);
    const again = (await attempt('select public.ensure_installation($1,$2) as id', [A, '1.0.1'])).rows[0].id;
    ok('ensure_installation is idempotent', again === instA);
    ok('A creates a child', !(await sync(CHILD_A, 'PW-AAAAAA', 'Ahad')).error);
    ok('A joins game', !(await attempt('select public.join_game($1,$2)', [CHILD_A, GAME_1])).error);
    ok('A saves progress', !(await attempt(`select public.merge_game_progress($1,$2,'alphabet','alphabet-A',true,3,1,'2026-01-01T00:00:00Z')`, [CHILD_A, GAME_1])).error);
    ok('A saves settings', !(await attempt(`select public.sync_game_settings($1,$2,'{"sound_enabled":true}','2026-01-01T00:00:00Z')`, [CHILD_A, GAME_1])).error);
    ok('A saves session', !(await attempt(`select public.sync_game_session($1,$2,'{"current_level":"alphabet-B"}',false,'2026-01-01T00:00:00Z')`, [CHILD_A, GAME_1])).error);
    ok('A saves reward', !(await attempt(`insert into public.game_rewards (child_id,game_id,reward_type) values ($1,$2,'coins')`, [CHILD_A, GAME_1])).error);

    await as(B);
    const instB = (await attempt('select public.ensure_installation($1) as id', [B])).rows[0].id;
    ok('B creates a child', !(await sync(CHILD_B, 'PW-BBBBBB', 'Other')).error);

    // --- B cannot see A
    for (const t of ['child_profiles', 'game_progress', 'game_settings', 'game_sessions', 'game_rewards', 'game_child_profiles']) {
      const col = t === 'child_profiles' ? 'id' : 'child_id';
      ok(`B sees none of A's ${t}`, (await rows(`select 1 from public.${t} where ${col}=$1`, [CHILD_A])).length === 0);
    }
    ok(`B sees only their own installation`, (await rows('select id from public.app_installations')).length === 1);
    ok('knowing a Child ID does not reveal the profile', (await rows(`select 1 from public.child_profiles where display_id='PW-AAAAAA'`)).length === 0);

    // --- B cannot write to A's child, directly or via functions
    ok('B cannot add progress to A\'s child', (await attempt(`select public.merge_game_progress($1,$2,'alphabet','alphabet-Z',true,3,1,now())`, [CHILD_A, GAME_1])).error === '42501');
    ok('B cannot overwrite A\'s progress', (await attempt(`select public.merge_game_progress($1,$2,'alphabet','alphabet-A',true,0,0,now())`, [CHILD_A, GAME_1])).error === '42501');
    ok('B cannot add settings to A\'s child', (await attempt(`select public.sync_game_settings($1,$2,'{}',now())`, [CHILD_A, GAME_1])).error === '42501');
    ok('B cannot add a session to A\'s child', (await attempt(`select public.sync_game_session($1,$2,'{}',false,now())`, [CHILD_A, GAME_1])).error === '42501');
    ok('B cannot add rewards to A\'s child', (await attempt(`insert into public.game_rewards (child_id,game_id,reward_type) values ($1,$2,'coins')`, [CHILD_A, GAME_1])).error === '42501');
    ok('B cannot join A\'s child to a game', (await attempt('select public.join_game($1,$2)', [CHILD_A, GAME_2])).error === '42501');
    ok('B cannot hijack A\'s child via upsert', (await sync(CHILD_A, 'PW-AAAAAA', 'Stolen', '2030-01-01T00:00:00Z')).error === '42501');
    ok('B\'s update of A\'s child changes nothing', (await attempt(`update public.child_profiles set nickname='x' where id=$1`, [CHILD_A])).count === 0);
    ok('B\'s delete of A\'s child changes nothing', (await attempt('delete from public.child_profiles where id=$1', [CHILD_A])).count === 0);
    await attempt('select public.reset_game_data($1,$2)', [CHILD_A, GAME_1]);
    ok('B cannot move their child into A\'s installation', (await attempt('update public.child_profiles set installation_id=$1 where id=$2', [instA, CHILD_B])).error === '42501');
    ok('B cannot create a child in A\'s installation', (await attempt(`insert into public.child_profiles (installation_id, display_id, nickname) values ($1,'PW-CCCCCC','x')`, [instA])).error === '42501');
    ok('B cannot take over A\'s installation row', (await attempt('update public.app_installations set owner_user_id=$1 where id=$2', [B, instA])).count === 0);
    ok('B cannot claim A\'s installation_uuid', (await attempt('update public.app_installations set installation_uuid=$1 where id=$2', [A, instB])).error === '23505');
    ok('B cannot give their installation to A', (await attempt('update public.app_installations set owner_user_id=$1 where id=$2', [A, instB])).error === '42501');

    await as(A);
    ok('after B\'s attacks A\'s data is intact', (await rows(`select 1 from public.game_progress where child_id=$1`, [CHILD_A])).length === 1);
    ok('after B\'s attacks A\'s reward is intact', (await rows(`select 1 from public.game_rewards where child_id=$1`, [CHILD_A])).length === 1);
    ok('A\'s nickname unchanged', (await rows(`select nickname from public.child_profiles where id=$1`, [CHILD_A]))[0].nickname === 'Ahad');

    // --- Game registry is read-only
    ok('client can read the registry', (await rows('select 1 from public.games')).length >= 1);
    ok('client cannot add a game', (await attempt(`insert into public.games (name,slug) values ('x','hack')`)).error === '42501');
    ok('client cannot edit a game', (await attempt(`update public.games set name='x'`)).error === '42501');
    ok('client cannot delete a game', (await attempt('delete from public.games')).error === '42501');

    // --- Multi-game isolation
    ok('retired games reject new progress', (await attempt(`select public.merge_game_progress($1,$2,'a','b',true,1,1,now())`, [CHILD_A, GAME_OFF])).error === '42501');
    ok('same level id in a second game', !(await attempt(`select public.merge_game_progress($1,$2,'alphabet','alphabet-A',false,1,1,'2026-01-01T00:00:00Z')`, [CHILD_A, GAME_2])).error);
    const g1 = await rows('select stars from public.game_progress where child_id=$1 and game_id=$2', [CHILD_A, GAME_1]);
    const g2 = await rows('select stars from public.game_progress where child_id=$1 and game_id=$2', [CHILD_A, GAME_2]);
    ok('progress stays separate per game', g1[0].stars === 3 && g2[0].stars === 1);
    await attempt(`select public.sync_game_settings($1,$2,'{"sound_enabled":false}','2026-01-01T00:00:00Z')`, [CHILD_A, GAME_2]);
    const s1 = await rows('select settings from public.game_settings where child_id=$1 and game_id=$2', [CHILD_A, GAME_1]);
    ok('settings stay separate per game', s1[0].settings.sound_enabled === true);
    await attempt('select public.reset_game_data($1,$2)', [CHILD_A, GAME_2]);
    ok('resetting one game keeps the other', (await rows('select 1 from public.game_progress where child_id=$1 and game_id=$2', [CHILD_A, GAME_1])).length === 1);

    // --- Merge strategy
    await attempt(`select public.merge_game_progress($1,$2,'alphabet','alphabet-A',false,1,0,'2020-01-01T00:00:00Z')`, [CHILD_A, GAME_1]);
    const merged = (await rows('select completed,stars,attempts from public.game_progress where child_id=$1 and game_id=$2', [CHILD_A, GAME_1]))[0];
    ok('older progress cannot lower stars or completion', merged.completed === true && merged.stars === 3 && merged.attempts === 1);
    await attempt(`select public.merge_game_progress($1,$2,'alphabet','alphabet-A',true,3,1,'2026-01-01T00:00:00Z')`, [CHILD_A, GAME_1]);
    ok('replaying the same write leaves one row', (await rows(`select 1 from public.game_progress where child_id=$1 and game_id=$2 and level_id='alphabet-A'`, [CHILD_A, GAME_1])).length === 1);
    await attempt(`select public.sync_game_settings($1,$2,'{"sound_enabled":false}','2020-01-01T00:00:00Z')`, [CHILD_A, GAME_1]);
    ok('older settings are ignored', (await rows('select settings from public.game_settings where child_id=$1 and game_id=$2', [CHILD_A, GAME_1]))[0].settings.sound_enabled === true);
    await sync(CHILD_A, 'PW-AAAAAA', 'OldName', '2020-01-01T00:00:00Z');
    ok('older profile edits are ignored', (await rows('select nickname from public.child_profiles where id=$1', [CHILD_A]))[0].nickname === 'Ahad');
    await sync(CHILD_A, 'PW-ZZZZZZ', 'NewName', '2026-06-01T00:00:00Z');
    const renamed = (await rows('select nickname, display_id from public.child_profiles where id=$1', [CHILD_A]))[0];
    ok('newer profile edits apply', renamed.nickname === 'NewName');
    ok('Child ID cannot be changed once issued', renamed.display_id === 'PW-AAAAAA');
    await sync(CHILD_A, 'PW-AAAAAA', 'Future', '2099-01-01T00:00:00Z');
    const future = (await rows('select extract(year from updated_at)::int as y from public.child_profiles where id=$1', [CHILD_A]))[0];
    ok('a wrong future clock is capped', future.y < 2099);

    // --- Child ID collisions and validation
    await as(B);
    const collide = await sync('10000000-0000-4000-8000-0000000000bb', 'PW-AAAAAA', 'Second');
    ok('a colliding Child ID gets a new one', !collide.error && collide.rows[0].display_id !== 'PW-AAAAAA' && /^PW-[23456789A-HJ-NP-Z]{6}$/.test(collide.rows[0].display_id), collide.rows?.[0]?.display_id);
    ok('invalid age group rejected', (await attempt(`select * from public.sync_child_profile($1,'PW-DDDDDD','x',null,null,'9-9',null,now(),now())`, ['10000000-0000-4000-8000-0000000000bc'])).error === '23514');
    ok('empty nickname rejected', (await attempt(`select * from public.sync_child_profile($1,'PW-DDDDDD','  ',null,null,'3-4',null,now(),now())`, ['10000000-0000-4000-8000-0000000000bd'])).error === '23514');
    ok('gender and DOB are optional', !(await sync('10000000-0000-4000-8000-0000000000be', 'PW-EEEEEE', 'Nick')).error);
    ok('oversized session rejected', (await attempt(`select public.sync_game_session($1,$2,jsonb_build_object('x',(select string_agg(md5(i::text),'') from generate_series(1,5000) i)),false,now())`, [CHILD_B, GAME_1])).error === '23514');

    // --- Helpers aren't reachable, and deletion behaves
    ok('private helpers are not callable by anon', (await (async () => { await as('anon'); return attempt(`select private.owns_child($1)`, [CHILD_A]); })()).error === '42501');
    await as(A);
    ok('display-id generator is not callable by clients', (await attempt(`select private.generate_display_id('PW')`)).error === '42501');
    ok('parent can delete their child', (await attempt('delete from public.child_profiles where id=$1', [CHILD_A])).count === 1);
    ok('deleting a child removes their game data', (await rows('select 1 from public.game_progress where child_id=$1', [CHILD_A])).length === 0);
    await c.query('reset role');
    ok('auth user deletion cascades', (await attempt('delete from auth.users where id=$1', [B])).count === 1 && (await rows('select 1 from public.child_profiles where id=$1', [CHILD_B])).length === 0);
    await c.query(`insert into public.game_progress (child_id, game_id, category, level_id) select id, $1, 'a', 'b' from public.child_profiles limit 0`, [GAME_1]);
    await as(A);
    await sync(CHILD_A, 'PW-AAAAAA', 'Back');
    await attempt(`select public.merge_game_progress($1,$2,'a','b',true,1,1,now())`, [CHILD_A, GAME_2]);
    await c.query('reset role');
    ok('deleting a game with data is refused', (await attempt('delete from public.games where id=$1', [GAME_2])).error === '23503');
    ok('that child\'s data survives the attempt', (await rows('select 1 from public.game_progress where child_id=$1', [CHILD_A])).length === 1);
  } finally {
    await c.query('rollback');
    await c.end();
  }
  console.log(`\n${pass} passed, ${fail} failed (transaction rolled back, no data kept)`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('TEST RUN FAILED:', e.code || '', e.message.replace(/postgres(ql)?:\/\/\S+/g, '[url]'));
  process.exit(1);
});
