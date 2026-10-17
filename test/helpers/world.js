// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake Donetick on a fake
// network, a temporary /data, a manual clock and the Paris time zone, with
// the integration wired on top through registerHandlers. No timer runs unless
// `timers: true` (with node:test mock timers): the tests read Donetick with
// `world.hub.poll()`.
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { Store } from '../../src/store.js';
import { ALICE, BOB, FakeDonetick, TOKEN, createNetwork } from './fakeDonetick.js';

// The integration logs its lifecycle; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

export const URL_1 = 'http://192.0.2.20:2021';
export const TIME_ZONE = 'Europe/Paris';
// The fixtures were captured on 17/10/2026 at 10:54 UTC (12:54 in Paris).
export const START = Date.UTC(2026, 9, 17, 10, 55, 0);

export function createClock(start = START) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

export const BASE_CONFIG = { url: URL_1, api_token: TOKEN, language: 'en' };

/**
 * @param {object} [options]
 * @param {FakeDonetick} [options.server]
 * @param {object} [options.config] raw integration config
 * @param {Array} [options.devices] devices already created in Gladys
 */
export async function createWorld({
  clock = createClock(),
  server,
  config = BASE_CONFIG,
  devices = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-donetick-')),
  timings = {},
  timers = false,
} = {}) {
  const donetick = server ?? new FakeDonetick({ now: clock.now });
  const network = createNetwork({ [URL_1]: donetick });
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    request: network.request,
    timers,
    timings,
    now: clock.now,
    timeZone: TIME_ZONE,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, server: donetick, app, hub: app.hub, clock, dataDir };
}

export const householdId = (gladys) => gladys.externalIds('household', 'circle-1');
export const memberId = (gladys, userId) => gladys.externalIds('member', `circle-1-user-${userId}`);

/** Add every discovered device in Gladys, as the user would. */
export async function createAll(world) {
  for (const device of world.fake.discoveredDevices) {
    await world.fake.deviceCreated(device);
  }
}

export { ALICE, BOB, FakeDonetick, TOKEN };
