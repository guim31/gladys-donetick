// -----------------------------------------------------------------------------
// Gladys devices: one for the household (the Donetick circle), and, when the
// option is on, one per circle member, for the chores assigned to them.
//
// Identity: the circle id and the user id Donetick gives (stable, never a
// name): `household` / `circle-<id>` and `member` / `circle-<id>-user-<id>`.
// A token of another user of the same circle keeps the same devices.
//
// Features (category/type couples of the core table, test/gladys-rules.test.js),
// definitions in src/donetick/model.js:
//   - to do today, overdue, done today: counter-sensor/integer;
//   - next chore: text/text, its name ("None" when nothing is planned: a text
//     state is never empty).
//
// The devices are published with should_poll: false: the integration reads
// Donetick on its own timer (src/hub.js), every 1 to 10 minutes.
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';

export const HOUSEHOLD_TYPE = 'household';
export const MEMBER_TYPE = 'member';

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  TO_DO_TODAY: 'to_do_today',
  OVERDUE: 'overdue',
  DONE_TODAY: 'done_today',
  NEXT_CHORE: 'next_chore',
});

// Feature names, in the language chosen in the configuration (Gladys does not
// tell a device integration the user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    [FEATURE_KEYS.TO_DO_TODAY]: 'Chores to do today',
    [FEATURE_KEYS.OVERDUE]: 'Overdue chores',
    [FEATURE_KEYS.DONE_TODAY]: 'Chores done today',
    [FEATURE_KEYS.NEXT_CHORE]: 'Next chore',
  },
  fr: {
    [FEATURE_KEYS.TO_DO_TODAY]: "Tâches à faire aujourd'hui",
    [FEATURE_KEYS.OVERDUE]: 'Tâches en retard',
    [FEATURE_KEYS.DONE_TODAY]: "Tâches faites aujourd'hui",
    [FEATURE_KEYS.NEXT_CHORE]: 'Prochaine tâche',
  },
  de: {
    [FEATURE_KEYS.TO_DO_TODAY]: 'Aufgaben für heute',
    [FEATURE_KEYS.OVERDUE]: 'Überfällige Aufgaben',
    [FEATURE_KEYS.DONE_TODAY]: 'Heute erledigte Aufgaben',
    [FEATURE_KEYS.NEXT_CHORE]: 'Nächste Aufgabe',
  },
  es: {
    [FEATURE_KEYS.TO_DO_TODAY]: 'Tareas para hoy',
    [FEATURE_KEYS.OVERDUE]: 'Tareas atrasadas',
    [FEATURE_KEYS.DONE_TODAY]: 'Tareas hechas hoy',
    [FEATURE_KEYS.NEXT_CHORE]: 'Próxima tarea',
  },
};

// Published on "next chore" when no chore has a due date.
export const NO_CHORE = { en: 'None', fr: 'Aucune', de: 'Keine', es: 'Ninguna' };

// Display bounds (the core never applies them on write).
const COUNTER_MAX = 1000;
const TEXT_MAX_LENGTH = 100;

const counter = (key, value) => ({
  key,
  definition: {
    category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
    type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
    read_only: true,
    has_feedback: false,
    keep_history: true,
    min: 0,
    max: COUNTER_MAX,
  },
  value,
});

// Order = display order in Gladys.
const FEATURES = [
  counter(FEATURE_KEYS.TO_DO_TODAY, (summary) => summary.toDoToday),
  counter(FEATURE_KEYS.OVERDUE, (summary) => summary.overdue),
  counter(FEATURE_KEYS.DONE_TODAY, (summary) => summary.doneToday),
  {
    key: FEATURE_KEYS.NEXT_CHORE,
    definition: {
      category: DEVICE_FEATURE_CATEGORIES.TEXT,
      type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
      read_only: true,
      has_feedback: false,
      keep_history: false,
      // NOT NULL in the core, even for a text (422 on "Add to Gladys" otherwise).
      min: 0,
      max: 0,
    },
    value: (summary, language) =>
      (summary.next ? summary.next.name : (NO_CHORE[language] ?? NO_CHORE.en)).slice(
        0,
        TEXT_MAX_LENGTH,
      ),
  },
];

export const householdIds = (gladys, circleId) =>
  gladys.externalIds(HOUSEHOLD_TYPE, `circle-${circleId}`);

export const memberIds = (gladys, circleId, userId) =>
  gladys.externalIds(MEMBER_TYPE, `circle-${circleId}-user-${userId}`);

function build(ids, name, language) {
  const names = NAMES[language] ?? NAMES.en;
  return {
    name,
    external_id: ids.device,
    should_poll: false,
    features: FEATURES.map(({ key, definition }) => ({
      ...definition,
      name: names[key],
      external_id: ids.feature(key),
    })),
  };
}

export const householdName = () => 'Donetick';
export const memberName = (member) => `Donetick ${member.name}`.slice(0, 60);

export const buildHousehold = (gladys, circleId, language = 'en') =>
  build(householdIds(gladys, circleId), householdName(), language);

export const buildMember = (gladys, circleId, member, language = 'en') =>
  build(memberIds(gladys, circleId, member.userId), memberName(member), language);

/**
 * The states of every feature of a device for a summary (src/donetick/model.js),
 * in the `publishStates` format: `state` for a number, `text` for a text.
 * @returns {Array<{ device_feature_external_id: string, state?: number, text?: string }>}
 */
export function featureStates(ids, summary, language) {
  return FEATURES.map(({ key, value }) =>
    key === FEATURE_KEYS.NEXT_CHORE
      ? { device_feature_external_id: ids.feature(key), text: value(summary, language) }
      : { device_feature_external_id: ids.feature(key), state: value(summary) },
  );
}
