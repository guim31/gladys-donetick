// -----------------------------------------------------------------------------
// Pure pieces: the configuration, the API client's error kinds (on the
// answers of the real server), the local day across a DST change, and the
// lookup of a chore by name or number.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_CONFIG, normalizeConfig, parseServerUrl } from '../src/config.js';
import { DonetickClient, ERROR_KINDS } from '../src/donetick/client.js';
import {
  findChore,
  localDay,
  parseChores,
  parseHistory,
  parseMembers,
} from '../src/donetick/model.js';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/donetick/${name}.json`, import.meta.url), 'utf8'));

test('the address: bare host, copied URL, reverse-proxy prefix, refused forms', () => {
  assert.equal(parseServerUrl('192.0.2.20:2021'), 'http://192.0.2.20:2021');
  assert.equal(
    parseServerUrl(' https://chores.example.org/my/chores '),
    'https://chores.example.org',
  );
  assert.equal(parseServerUrl('https://example.org/donetick/'), 'https://example.org/donetick');
  assert.equal(parseServerUrl('http://192.0.2.20:2021/api/v1/chores/'), 'http://192.0.2.20:2021');
  assert.equal(parseServerUrl('ftp://192.0.2.20'), null);
  assert.equal(parseServerUrl('http://user:pass@192.0.2.20'), null);
  assert.equal(parseServerUrl(''), null);
});

test('the configuration is normalized, defaults included', () => {
  assert.deepEqual(normalizeConfig(DEFAULT_CONFIG), {
    url: null,
    urlTyped: false,
    token: '',
    memberDevices: true,
    allowSelfSigned: false,
    pollIntervalMs: 120_000,
    language: 'fr',
  });
  const config = normalizeConfig({
    url: '192.0.2.20:2021',
    api_token: ' dt_abc \n',
    member_devices: 'false',
    poll_interval: 300,
    language: 'xx',
  });
  assert.equal(config.token, 'dt_abc');
  assert.equal(config.memberDevices, false);
  assert.equal(config.pollIntervalMs, 300_000);
  assert.equal(config.language, 'fr');
  assert.equal(normalizeConfig({ poll_interval: '7' }).pollIntervalMs, 120_000);
});

const client = (answer) =>
  new DonetickClient({
    url: 'http://192.0.2.20:2021',
    token: 'dt_x',
    request: async () => {
      if (answer instanceof Error) {
        throw answer;
      }
      return { headers: {}, ...answer };
    },
  });

const kindOf = async (answer) => {
  try {
    await client(answer).chores();
    return 'ok';
  } catch (err) {
    return err.kind;
  }
};

test('the error kinds of the client', async () => {
  const real401 = JSON.stringify({
    error: 'Authentication required. Provide either a valid JWT token or API key.',
  });
  assert.equal(await kindOf({ status: 401, body: real401 }), ERROR_KINDS.AUTH);
  assert.equal(await kindOf({ status: 429, body: '' }), ERROR_KINDS.RATE_LIMIT);
  assert.equal(await kindOf({ status: 301, body: '' }), ERROR_KINDS.REDIRECT);
  assert.equal(await kindOf({ status: 200, body: '<!doctype html>' }), ERROR_KINDS.NOT_DONETICK);
  assert.equal(await kindOf({ status: 200, body: '{"ok":true}' }), ERROR_KINDS.NOT_DONETICK);
  assert.equal(await kindOf({ status: 502, body: 'Bad gateway' }), ERROR_KINDS.HTTP);
  assert.equal(await kindOf({ status: 500, body: '{"error":"x"}' }), ERROR_KINDS.HTTP);
  const refused = Object.assign(new Error('connect'), { code: 'ECONNREFUSED' });
  assert.equal(await kindOf(refused), ERROR_KINDS.UNREACHABLE);
  const selfSigned = Object.assign(new Error('cert'), { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' });
  assert.equal(await kindOf(selfSigned), ERROR_KINDS.TLS);
  assert.equal(await kindOf({ status: 200, body: JSON.stringify(fixture('real-chores')) }), 'ok');
});

test('the client sends the token in the secretkey header, on the routes of the server', async () => {
  const calls = [];
  const c = new DonetickClient({
    url: 'http://192.0.2.20:2021',
    token: 'dt_x',
    request: async (url, options) => {
      calls.push({
        url,
        method: options.method,
        key: options.headers.secretkey,
        json: options.json,
      });
      return { status: 200, headers: {}, body: JSON.stringify(fixture('real-complete')) };
    },
  });
  const done = await c.complete(1);
  assert.equal(done.chore.id, 1);
  assert.equal(done.pendingApproval, false);
  await c.chores();
  await c.history();
  await c.members();
  assert.deepEqual(
    calls.map((call) => [call.method, call.url.replace('http://192.0.2.20:2021', ''), call.key]),
    [
      ['POST', '/api/v1/chores/1/do', 'dt_x'],
      ['GET', '/api/v1/chores/', 'dt_x'],
      ['GET', '/api/v1/chores/history?limit=1&members=true', 'dt_x'],
      ['GET', '/api/v1/circles/members', 'dt_x'],
    ],
  );
  assert.deepEqual(calls[0].json, {}, 'the server refuses an empty body');
});

test('the real answers parse', () => {
  const chores = parseChores(fixture('real-chores').res);
  assert.deepEqual(
    chores.map((chore) => [
      chore.id,
      chore.dueAt === null ? null : new Date(chore.dueAt).toISOString(),
    ]),
    [
      [3, '2026-10-14T07:00:00.000Z'],
      [1, '2026-10-16T08:00:00.000Z'],
      [2, '2026-10-17T20:00:00.000Z'],
      [4, '2026-10-18T09:00:00.000Z'],
      [5, null],
    ],
  );
  assert.deepEqual(
    parseMembers(fixture('real-members').res).map((member) => [member.userId, member.name]),
    [
      [1, 'Alice'],
      [2, 'Bob'],
    ],
  );
  assert.deepEqual(
    parseHistory(fixture('real-history').res).map((entry) => [entry.id, entry.choreId]),
    [
      [1, 3],
      [2, 1],
    ],
  );
  // Skipped, pending approval, rejected… are not completions.
  assert.deepEqual(parseHistory([{ id: 9, choreId: 1, status: 2 }]), []);
});

test('the local day follows the time zone, including the DST change', () => {
  const paris = localDay(Date.UTC(2026, 9, 17, 10, 0), 'Europe/Paris');
  assert.equal(new Date(paris.start).toISOString(), '2026-10-16T22:00:00.000Z');
  assert.equal(new Date(paris.end).toISOString(), '2026-10-17T22:00:00.000Z');
  // 25 October 2026: Paris goes back from UTC+2 to UTC+1, a 25-hour day.
  const change = localDay(Date.UTC(2026, 9, 25, 12, 0), 'Europe/Paris');
  assert.equal(new Date(change.start).toISOString(), '2026-10-24T22:00:00.000Z');
  assert.equal(new Date(change.end).toISOString(), '2026-10-25T23:00:00.000Z');
  const auckland = localDay(Date.UTC(2026, 9, 17, 12, 0), 'Pacific/Auckland');
  assert.equal(new Date(auckland.start).toISOString(), '2026-10-17T11:00:00.000Z');
});

test('a chore is found by number or by name', () => {
  const chores = parseChores(fixture('real-chores').res);
  assert.equal(findChore(chores, 'détartrer LA bouilloire').chore.id, 5);
  assert.equal(findChore(chores, 'Detartrer la bouilloire').chore.id, 5);
  assert.equal(findChore(chores, '#3').chore.id, 3);
  assert.equal(findChore(chores, 3).chore.id, 3);
  assert.equal(findChore(chores, 'Sortir').reason, 'not_found');
  assert.equal(findChore(chores, '').reason, 'empty');
  assert.equal(
    findChore([...chores, { ...chores[0], id: 99 }], chores[0].name).reason,
    'ambiguous',
  );
});
