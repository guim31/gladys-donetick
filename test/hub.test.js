// -----------------------------------------------------------------------------
// The hub against the fake Donetick: counters, scene events, completion from a
// scene, outages. The clock starts on 17/10/2026 at 12:55 in Paris: two chores
// overdue (vacuum, Bob; bins, Alice), one due at 22:00 (plants, nobody), one
// tomorrow (sheets, Alice), one without date.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALICE,
  BOB,
  START,
  createAll,
  createClock,
  createWorld,
  householdId,
  memberId,
} from './helpers/world.js';

const HOUR = 60 * 60_000;

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

const counters = (w, ids) => ({
  toDo: w.fake.lastState(ids.feature('to_do_today')),
  overdue: w.fake.lastState(ids.feature('overdue')),
  done: w.fake.lastState(ids.feature('done_today')),
  next: w.fake.lastState(ids.feature('next_chore')),
});

test('the counters of the household and of each member', async (t) => {
  const w = await world(t);
  assert.deepEqual(counters(w, householdId(w.gladys)), {
    toDo: 3,
    overdue: 2,
    done: 0,
    next: "Passer l'aspirateur",
  });
  assert.deepEqual(counters(w, memberId(w.gladys, ALICE)), {
    toDo: 1,
    overdue: 1,
    done: 0,
    next: 'Sortir les poubelles',
  });
  assert.deepEqual(counters(w, memberId(w.gladys, BOB)), {
    toDo: 1,
    overdue: 1,
    done: 0,
    next: "Passer l'aspirateur",
  });
  const names = w.fake.discoveredDevices.map((device) => device.name);
  assert.deepEqual(names, ['Donetick', 'Donetick Alice', 'Donetick Bob']);
  assert.equal(w.fake.connectionStatus.connected, true);
});

test('the day turns at local midnight, not UTC midnight', async (t) => {
  const clock = createClock();
  const w = await world(t, { clock });
  // 23:30 in Paris (21:30 UTC): the plants are overdue, the sheets still tomorrow.
  clock.time = Date.UTC(2026, 9, 17, 21, 30);
  await w.hub.poll();
  assert.equal(counters(w, householdId(w.gladys)).toDo, 3);
  // 00:30 in Paris, still the 17th in UTC: the sheets (11:00 local) are due today.
  clock.time = Date.UTC(2026, 9, 17, 22, 30);
  await w.hub.poll();
  assert.equal(counters(w, householdId(w.gladys)).toDo, 4);
  assert.equal(counters(w, householdId(w.gladys)).overdue, 3);
});

test('nothing fires at the first reading; a chore turning overdue fires once', async (t) => {
  const clock = createClock();
  const w = await world(t, { clock });
  assert.deepEqual(w.fake.sceneEvents, [], 'what is already overdue is not news');

  clock.time = Date.UTC(2026, 9, 17, 20, 1); // the plants were due at 20:00 UTC
  await w.hub.poll();
  await w.hub.poll();
  const events = w.fake.sceneEvents.filter((event) => event.key === 'chore_overdue');
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].data, {
    chore: 'Arroser les plantes',
    chore_id: 2,
    assignee: '',
    member: null,
    due_date: '2026-10-17T20:00:00.000Z',
  });
});

test('the announced chores survive a restart', async (t) => {
  const clock = createClock();
  const first = await createWorld({ clock });
  clock.time = Date.UTC(2026, 9, 17, 20, 1);
  await first.hub.poll();
  await first.app.stop();
  assert.equal(first.fake.sceneEvents.length, 1);

  const second = await world(t, { clock, dataDir: first.dataDir, server: first.server });
  assert.deepEqual(second.fake.sceneEvents, [], 'not announced again');
  // Overdue while the integration was stopped: announced at the next start.
  clock.time = Date.UTC(2026, 9, 18, 9, 5);
  const third = await world(t, { clock, dataDir: first.dataDir, server: first.server });
  assert.deepEqual(
    third.fake.sceneEvents.map((event) => event.data.chore),
    ['Changer les draps'],
  );
  assert.equal(third.fake.sceneEvents[0].data.assignee, 'Alice');
  assert.equal(third.fake.sceneEvents[0].data.member, memberId(third.gladys, ALICE).device);
});

test('a chore done in Donetick fires "chore done" and moves the counters', async (t) => {
  const clock = createClock();
  const w = await world(t, { clock });
  clock.advance(60_000);
  w.server.completeAs(3, BOB);
  await w.hub.poll();
  const events = w.fake.sceneEvents.filter((event) => event.key === 'chore_completed');
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].data, {
    chore: "Passer l'aspirateur",
    chore_id: 3,
    completed_by: 'Bob',
    member: memberId(w.gladys, BOB).device,
    on_time: false,
    from_gladys: false,
  });
  // An interval chore moves from its due date (14/10 + 3 days): still overdue.
  assert.deepEqual(counters(w, householdId(w.gladys)), {
    toDo: 3,
    overdue: 2,
    done: 1,
    next: 'Sortir les poubelles',
  });
  assert.equal(counters(w, memberId(w.gladys, BOB)).done, 1);
  assert.equal(counters(w, memberId(w.gladys, ALICE)).done, 0);
  await w.hub.poll();
  assert.equal(
    w.fake.sceneEvents.filter((event) => event.key === 'chore_completed').length,
    1,
    'once',
  );
});

test('a one-off chore done in Donetick keeps its name in the event', async (t) => {
  const clock = createClock();
  const w = await world(t, { clock });
  w.server.completeAs(4, ALICE);
  await w.hub.poll();
  assert.equal(w.server.chore(4).isActive, false);
  assert.equal(w.fake.sceneEvents[0].data.chore, 'Changer les draps');
  assert.equal(w.fake.sceneEvents[0].data.on_time, true);
});

test('the scene action marks a chore done by name, case and accents ignored', async (t) => {
  const w = await world(t);
  const ack = await w.fake.sceneAction('complete_chore', { chore: '  passer L’ASPIRATEUR ' });
  // A typographic apostrophe is not the one of Donetick: not found.
  assert.equal(ack.success, false);
  assert.match(ack.error, /No active chore/);

  const ok = await w.fake.sceneAction('complete_chore', { chore: "PASSER l'aspirateur" });
  assert.equal(ok.success, true, ok.error);
  assert.deepEqual(ok.data.outputs, {
    chore: "Passer l'aspirateur",
    chore_id: 3,
    pending_approval: false,
    next_due_date: '2026-10-17T07:00:00.000Z',
  });
  assert.deepEqual(
    w.server.requests.filter((request) => request.method === 'POST'),
    [{ method: 'POST', path: '/api/v1/chores/3/do', search: '' }],
  );
  // The counters and the "done" event follow at once.
  assert.equal(counters(w, householdId(w.gladys)).done, 1);
  assert.equal(w.fake.sceneEvents.at(-1).key, 'chore_completed');
  assert.equal(w.fake.sceneEvents.at(-1).data.completed_by, 'Alice');
  assert.equal(w.fake.sceneEvents.at(-1).data.from_gladys, true, 'a scene can skip its own');
});

test('the scene action by number, and its errors', async (t) => {
  const w = await world(t);
  assert.equal(
    (await w.fake.sceneAction('complete_chore', { chore: '#4' })).data.outputs.chore_id,
    4,
  );
  assert.equal((await w.fake.sceneAction('complete_chore', { chore: 5 })).data.outputs.chore_id, 5);
  const missing = await w.fake.sceneAction('complete_chore', { chore: '#999' });
  assert.match(missing.error, /No active chore/);
  const empty = await w.fake.sceneAction('complete_chore', { chore: ' ' });
  assert.match(empty.error, /name or the number/);

  w.server.chores.push({ ...w.server.chore(1), id: 9 });
  const twice = await w.fake.sceneAction('complete_chore', { chore: 'Sortir les poubelles' });
  assert.match(twice.error, /Several chores/);

  w.server.notAssigned.add(1);
  const refused = await w.fake.sceneAction('complete_chore', { chore: '#1' });
  assert.match(refused.error, /not assigned/);
});

test('a chore that requires approval is reported as such', async (t) => {
  const w = await world(t);
  w.server.chore(2).requireApproval = true;
  const ack = await w.fake.sceneAction('complete_chore', { chore: 'Arroser les plantes' });
  assert.equal(ack.data.outputs.pending_approval, true);
  assert.equal(w.fake.sceneEvents.length, 0, 'not done yet');
});

test('the scene errors follow the language of the configuration', async (t) => {
  const w = await world(t, {
    config: { url: '192.0.2.20:2021', api_token: 'dt_x', language: 'fr' },
  });
  const ack = await w.fake.sceneAction('complete_chore', { chore: 'x' });
  assert.match(ack.error, /refusé/);
});

test('an outage: unreachable devices and status, then back', async (t) => {
  const clock = createClock();
  const w = await world(t, { clock });
  w.server.online = false;
  clock.advance(5 * 60_000);
  await w.hub.poll();
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.en, /does not answer/);
  assert.ok(w.fake.transports.slice(-3).every((entry) => entry.transport === 'unreachable'));

  w.server.online = true;
  await w.hub.poll();
  assert.equal(w.fake.connectionStatus.connected, true);
  assert.ok(w.fake.transports.slice(-3).every((entry) => entry.transport === 'local'));
});

test('a refused token and a wrong address say so', async (t) => {
  const refused = await world(t, {
    config: { url: 'http://192.0.2.20:2021', api_token: 'dt_wrong' },
  });
  assert.match(refused.fake.connectionStatus.message.en, /token refused/);
  assert.deepEqual(refused.fake.discoveredDevices, []);

  const missing = await world(t, { config: { url: 'ftp://nope', api_token: 'dt_x' } });
  assert.match(missing.fake.connectionStatus.message.en, /Address not understood/);
  const empty = await world(t, { config: {} });
  assert.match(empty.fake.connectionStatus.message.fr, /Saisissez l'adresse/);
  const noToken = await world(t, { config: { url: 'http://192.0.2.20:2021' } });
  assert.match(noToken.fake.connectionStatus.message.de, /API-Token/);
});

test('"Test the connection" reports what it finds', async (t) => {
  const w = await world(t);
  const ack = await w.fake.action('test_connection', {});
  assert.equal(ack.data.message.fr, 'Donetick OK : 5 tâche(s) active(s), 2 membre(s).');
  w.server.online = false;
  const failed = await w.fake.action('test_connection', {});
  assert.equal(failed.success, false);
  assert.match(failed.error, /does not answer/);
});

test('adding a device sends its states again and refreshes the widget', async (t) => {
  const w = await world(t);
  await createAll(w);
  const before = w.fake.widgetRefreshes.length;
  const statesBefore = w.fake.states.length;
  await w.fake.deviceCreated(w.fake.discoveredDevices[1]);
  assert.ok(w.fake.states.length > statesBefore, 'states published again');
  assert.ok(w.fake.widgetRefreshes.length > before);
});

test('a normal reading publishes nothing when nothing changed', async (t) => {
  // The SDK dates the published values with Date.now().
  t.mock.timers.enable({ apis: ['Date'], now: START });
  const clock = createClock();
  const w = await world(t, { clock });
  const before = w.fake.states.length;
  clock.advance(60_000);
  t.mock.timers.tick(60_000);
  await w.hub.poll();
  assert.equal(w.fake.states.length, before);
  // ...but every value again after 12 hours, so Gladys never shows "no recent value".
  clock.advance(12 * HOUR);
  t.mock.timers.tick(12 * HOUR);
  await w.hub.poll();
  assert.ok(w.fake.states.length - before >= 12, `${w.fake.states.length - before} states`);
});

test('turning the member devices off leaves the household only', async (t) => {
  const w = await world(t);
  await w.fake.configUpdated({ ...w.fake.config, member_devices: false });
  assert.deepEqual(
    w.fake.discoveredDevices.map((device) => device.external_id),
    [householdId(w.gladys).device],
  );
});

test('an old completion edited in Donetick does not fire again', async (t) => {
  const clock = createClock();
  const w = await world(t, { clock });
  const old = w.server.completeAs(3, BOB, START - 3 * 24 * HOUR);
  old.updatedAt = new Date(START - 3 * 24 * HOUR).toISOString();
  w.server.nextHistoryId = 200;
  await w.hub.poll(); // out of the window: unseen
  const seen = w.server.completeAs(1, ALICE);
  await w.hub.poll();
  const completed = () => w.fake.sceneEvents.filter((event) => event.key === 'chore_completed');
  assert.equal(completed().length, 1);
  // A note added to last week's entry: back in the window, same old id.
  old.updatedAt = new Date(clock.now()).toISOString();
  old.id = 50;
  await w.hub.poll();
  assert.deepEqual(
    completed().map((event) => event.data.chore_id),
    [seen.choreId],
  );
});

test('a completion waiting for approval fires once approved', async (t) => {
  const w = await world(t);
  w.server.chore(2).requireApproval = true;
  w.server.chore(2).status = 3;
  const entry = w.server.completeAs(2, BOB);
  await w.hub.poll();
  assert.equal(w.fake.sceneEvents.length, 0);
  entry.status = 1; // approved by an admin: same entry
  await w.hub.poll();
  assert.equal(w.fake.sceneEvents.length, 1);
  assert.equal(w.fake.sceneEvents[0].data.chore, 'Arroser les plantes');
});

test('a reading of the old instance during a reconfiguration is dropped', async (t) => {
  const w = await world(t);
  const reading = w.hub.poll();
  await w.fake.configUpdated({ ...w.fake.config, url: 'http://192.0.2.99:2021' });
  await reading;
  assert.equal(w.hub.circleId, null, 'nothing of the old instance kept');
  assert.equal(w.fake.connectionStatus.connected, false);
});
