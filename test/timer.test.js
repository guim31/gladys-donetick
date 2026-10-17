// -----------------------------------------------------------------------------
// The reading timer of the container. Gladys never polls a device published
// with should_poll: false (nor one created without should_poll,
// GladysAssistant/Gladys#3198): Donetick must be read by the hub's own timer,
// with no onPoll at all — and on time for a due date between two readings.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAll, createClock, createWorld, householdId } from './helpers/world.js';

const settle = async () => {
  for (let i = 0; i < 30; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

const reads = (server) => server.requests.filter((r) => r.path === '/api/v1/chores/').length;

test('the internal timer reads Donetick without any onPoll from Gladys', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const clock = createClock();
  const w = await createWorld({
    clock,
    config: {
      url: 'http://192.0.2.20:2021',
      api_token: 'dt_0123456789abcdef0123456789abcdef',
      poll_interval: '120',
    },
    timers: true,
  });
  t.after(() => w.app.stop());
  const polled = t.mock.method(w.hub, 'poll');
  await createAll(w);
  assert.equal(w.fake.discoveredDevices[0].should_poll, false, 'Gladys is not asked to poll');

  const before = reads(w.server);
  for (let i = 0; i < 3; i += 1) {
    clock.advance(120_000);
    t.mock.timers.tick(120_000);
    await settle();
  }
  assert.equal(reads(w.server) - before, 3, 'one reading per interval');
  assert.ok(polled.mock.callCount() >= 3);
});

test('the timer wakes up at a due time shorter than the interval', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const clock = createClock(Date.UTC(2026, 9, 17, 19, 58)); // the plants are due at 20:00
  const w = await createWorld({
    clock,
    config: {
      url: 'http://192.0.2.20:2021',
      api_token: 'dt_0123456789abcdef0123456789abcdef',
      poll_interval: '600',
    },
    timers: true,
  });
  t.after(() => w.app.stop());
  const overdue = householdId(w.gladys).feature('overdue');
  assert.equal(w.fake.lastState(overdue), 2);
  clock.advance(122_000);
  t.mock.timers.tick(122_000);
  await settle();
  assert.equal(w.fake.lastState(overdue), 3, 'read two minutes later, not ten');
  assert.equal(w.fake.sceneEvents.at(-1).key, 'chore_overdue');
});

test('the timer stops with the integration', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const w = await createWorld({ timers: true });
  await w.app.stop();
  const before = w.server.requests.length;
  t.mock.timers.tick(60 * 60_000);
  await settle();
  assert.equal(w.server.requests.length, before);
});
