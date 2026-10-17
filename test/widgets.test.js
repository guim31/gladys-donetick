// -----------------------------------------------------------------------------
// The "today's chores" widget: content within the core budget (validated by
// the SDK's validateWidgetContent), the household and member views, the
// "done" buttons, and the degraded states.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { BOB, createClock, createWorld, householdId, memberId } from './helpers/world.js';

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

async function content(w, settings = {}, language = 'en') {
  const ack = await w.fake.widgetGet('chores_today', { settings, language, units: 'metric' });
  assert.equal(ack.success, true, ack.error);
  const { content: tree } = ack.data;
  assert.deepEqual(validateWidgetContent(tree), [], 'within the core vocabulary and budget');
  return tree;
}

const ofType = (data, type) => data.components.filter((component) => component.type === type);

test('the household view: tiles, the chores of the day, four buttons at most', async (t) => {
  const w = await world(t);
  const data = await content(w);
  assert.ok(data.components.length <= 8);
  assert.deepEqual(
    ofType(data, 'value').map((tile) => tile.value),
    [3, 2],
  );
  const rows = ofType(data, 'status')[0].items;
  assert.deepEqual(
    rows.map((row) => [row.label, row.value]),
    [
      ["Passer l'aspirateur", 'Overdue · Bob'],
      ['Sortir les poubelles', 'Overdue · Alice'],
      ['Arroser les plantes', '22:00'],
    ],
  );
  const buttons = ofType(data, 'button');
  assert.deepEqual(
    buttons.map((button) => [button.label, button.action.key, button.action.params.id]),
    [
      ["Passer l'aspirateur", 'done_1', 3],
      ['Sortir les poubelles', 'done_2', 1],
      ['Arroser les plantes', 'done_3', 2],
    ],
  );
  // The household device chosen explicitly is the same view.
  const explicit = await content(w, { device: householdId(w.gladys).device });
  assert.deepEqual(explicit, data);
});

test('a member view shows only their chores, in their language', async (t) => {
  const w = await world(t);
  const data = await content(w, { device: memberId(w.gladys, BOB).device }, 'fr');
  assert.deepEqual(
    ofType(data, 'status')[0].items.map((row) => [row.label, row.value]),
    [["Passer l'aspirateur", 'En retard']],
  );
  assert.equal(ofType(data, 'value')[0].label, 'À faire');
});

test('a "done" button marks the chore done and answers a toast', async (t) => {
  const w = await world(t);
  const ack = await w.fake.widgetAction('chores_today', 'done_2', { id: 1 }, { settings: {} });
  assert.equal(ack.success, true, ack.error);
  assert.equal(ack.data.message.fr, '« Sortir les poubelles » marquée comme faite.');
  assert.equal(w.server.chore(1).nextDueDate, '2026-10-23T08:00:00Z');
  const bad = await w.fake.widgetAction('chores_today', 'done_9', { id: 1 }, { settings: {} });
  assert.equal(bad.success, false);
});

test('a long chore name fits the button and the row', async (t) => {
  const w = await world(t);
  w.server.chore(2).name =
    'Arroser toutes les plantes du balcon et du jardin, sans oublier le potager';
  await w.hub.poll();
  const data = await content(w);
  const button = ofType(data, 'button').find((item) => item.action.params.id === 2);
  assert.ok(button.label.length <= 24 && button.label.endsWith('…'));
});

test('nothing left today: a sentence and the next chore', async (t) => {
  const w = await world(t);
  for (const id of [1, 2, 3]) {
    w.server.chore(id).nextDueDate = '2026-10-20T08:00:00Z';
  }
  await w.hub.poll();
  const data = await content(w, {}, 'de');
  assert.equal(ofType(data, 'text')[0].text, 'Heute gibt es nichts mehr zu tun.');
  assert.match(ofType(data, 'status')[0].items[0].value, /^Nächste · /);
  assert.equal(ofType(data, 'button').length, 0);
});

test('degraded states: not configured, unknown member, outage', async (t) => {
  const empty = await world(t, { config: {} });
  assert.match(ofType(await content(empty), 'text')[0].text, /Enter the address/);

  const clock = createClock();
  const w = await world(t, { clock });
  assert.match(
    ofType(await content(w, { device: 'ext:test-integration:member:circle-1-user-99' }), 'text')[0]
      .text,
    /no longer in the Donetick circle/,
  );
  w.server.online = false;
  await w.hub.poll();
  const stale = await content(w);
  assert.match(ofType(stale, 'text')[0].text, /last known chores/);
  assert.equal(ofType(stale, 'button').length, 0, 'no button while Donetick does not answer');

  const down = await world(t, { config: { url: 'http://192.0.2.99', api_token: 'dt_x' } });
  assert.match(ofType(await content(down), 'text')[0].text, /does not answer/);
});
