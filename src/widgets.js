// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `chores_today`.
//
// The use case: the kitchen tablet shows what is left to do today, and a tap
// marks a chore done without opening Donetick. For the whole household, or
// for one member (a member device chosen in the widget settings).
//
// Budget (8 components, 6 tiles, 1 status, 4 buttons, 2 texts): two tiles
// (to do today, overdue), one status list (the chores of the day, overdue
// first, with their time and assignee) and a "done" button for each of the
// four most urgent ones. Nothing left: a sentence and the next chore.
// The figures are values, not bound to device features, so the widget works
// before any device is added to Gladys.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { householdIds } from './devices.js';
import { DonetickHub, WIDGET_KEY } from './hub.js';
import { pick } from './texts.js';

// Action keys of the buttons: permanent once published (unique, the core
// drops a button whose key is taken).
export const DONE_ACTIONS = ['done_1', 'done_2', 'done_3', 'done_4'];
const MAX_ROWS = 10;

export const TEXT = {
  configure: {
    en: 'Enter the address of your Donetick and an API token in the configuration of the integration.',
    fr: "Saisissez l'adresse de votre Donetick et un jeton d'API dans la configuration de l'intégration.",
    de: 'Gib die Adresse deines Donetick und ein API-Token in der Konfiguration der Integration ein.',
    es: 'Introduzca la dirección de su Donetick y un token de API en la configuración de la integración.',
  },
  unknown: {
    en: 'This member is no longer in the Donetick circle: choose another device in the widget settings.',
    fr: "Ce membre n'est plus dans le cercle Donetick : choisissez un autre appareil dans les réglages du widget.",
    de: 'Dieses Mitglied ist nicht mehr im Donetick-Kreis: Wähle ein anderes Gerät in den Widget-Einstellungen.',
    es: 'Este miembro ya no está en el círculo de Donetick: elija otro dispositivo en la configuración del widget.',
  },
  noAnswer: {
    en: 'Donetick does not answer: see the Configuration screen of the integration.',
    fr: "Donetick ne répond pas : voir l'écran Configuration de l'intégration.",
    de: 'Donetick antwortet nicht: Sieh dir die Konfiguration der Integration an.',
    es: 'Donetick no responde: consulte la pantalla de configuración de la integración.',
  },
  stale: {
    en: 'Donetick does not answer: last known chores.',
    fr: 'Donetick ne répond pas : dernières tâches connues.',
    de: 'Donetick antwortet nicht: zuletzt bekannte Aufgaben.',
    es: 'Donetick no responde: últimas tareas conocidas.',
  },
  nothing: {
    en: 'Nothing left to do today.',
    fr: "Plus rien à faire aujourd'hui.",
    de: 'Heute gibt es nichts mehr zu tun.',
    es: 'No queda nada por hacer hoy.',
  },
  toDo: { en: 'To do today', fr: 'À faire', de: 'Heute zu tun', es: 'Para hoy' },
  overdue: { en: 'Overdue', fr: 'En retard', de: 'Überfällig', es: 'Atrasadas' },
  next: { en: 'Next', fr: 'Prochaine', de: 'Nächste', es: 'Próxima' },
  pending: {
    en: 'Awaiting approval',
    fr: 'À valider',
    de: 'Wartet auf Freigabe',
    es: 'Por aprobar',
  },
};

const t = (text, language) => pick(text, language);
const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function message(text, language) {
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', variant: 'body', text: t(text, language) }],
  };
}

const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

function formatTime(hub, ms, language) {
  return new Intl.DateTimeFormat(LOCALES[language] ?? 'en-GB', {
    timeZone: hub.timeZone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ms));
}

function formatDate(hub, ms, language) {
  return new Intl.DateTimeFormat(LOCALES[language] ?? 'en-GB', {
    timeZone: hub.timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(ms));
}

/** The status row of a chore of the day: overdue, or its time; and who. */
function choreRow(hub, chore, { now, showAssignee, language }) {
  const late = chore.dueAt < now && !chore.pendingApproval;
  const when = chore.pendingApproval
    ? t(TEXT.pending, language)
    : late
      ? t(TEXT.overdue, language)
      : formatTime(hub, chore.dueAt, language);
  const who = showAssignee && chore.assignedTo !== null ? hub.memberName(chore.assignedTo) : null;
  return {
    label: fit(chore.name, 40),
    icon: chore.pendingApproval ? 'user-check' : late ? 'alert-circle' : 'clock',
    value: fit(who ? `${when} · ${who}` : when, 40),
    color: late ? WIDGET_COLORS.DANGER : WIDGET_COLORS.NEUTRAL,
  };
}

async function get(hub, { settings, language = 'en' }) {
  if (!hub.client) {
    return message(TEXT.configure, language);
  }
  if (hub.error && hub.readAt === 0) {
    return message(TEXT.noAnswer, language);
  }
  const device = settings?.device || null;
  const household =
    !device || (hub.circleId !== null && device === householdIds(hub.gladys, hub.circleId).device);
  const member = household ? null : hub.memberOf(device);
  if (!household && !member) {
    return message(TEXT.unknown, language);
  }
  const now = hub.now();
  const summary = hub.summary(member ? member.userId : null);
  const components = [];
  if (hub.error) {
    components.push({ type: 'text', variant: 'caption', text: t(TEXT.stale, language) });
  }
  components.push(
    { type: 'value', value: summary.toDoToday, label: t(TEXT.toDo, language), icon: 'list' },
    {
      type: 'value',
      value: summary.overdue,
      label: t(TEXT.overdue, language),
      icon: 'alert-circle',
      color: summary.overdue > 0 ? WIDGET_COLORS.DANGER : WIDGET_COLORS.SUCCESS,
    },
  );
  if (summary.today.length === 0) {
    components.push({ type: 'text', variant: 'body', text: t(TEXT.nothing, language) });
    if (summary.next) {
      components.push({
        type: 'status',
        items: [
          {
            label: fit(summary.next.name, 40),
            icon: 'calendar',
            value: fit(
              `${t(TEXT.next, language)} · ${formatDate(hub, summary.next.dueAt, language)}`,
              40,
            ),
            color: WIDGET_COLORS.NEUTRAL,
          },
        ],
      });
    }
    return { ttl_seconds: 300, components };
  }
  components.push({
    type: 'status',
    items: summary.today
      .slice(0, MAX_ROWS)
      .map((chore) => choreRow(hub, chore, { now, showAssignee: !member, language })),
  });
  if (!hub.error) {
    // A chore waiting for approval is done: no button (a second tap would
    // file a second request). The due time travels with the button: a tap on
    // a stale widget must not complete the next occurrence.
    summary.today
      .filter((chore) => !chore.pendingApproval)
      .slice(0, DONE_ACTIONS.length)
      .forEach((chore, index) => {
        components.push({
          type: 'button',
          label: fit(chore.name, 24),
          icon: 'check',
          style: 'secondary',
          action: { key: DONE_ACTIONS[index], params: { id: chore.id, due: chore.dueAt } },
        });
      });
  }
  return { ttl_seconds: 300, components };
}

async function action(hub, { actionKey, params = {} }) {
  if (!DONE_ACTIONS.includes(actionKey) || !Number.isInteger(params.id)) {
    throw new Error(`Unknown action ${actionKey}`);
  }
  const result = await hub.complete(params.id, {
    expectedDue: Number.isFinite(params.due) ? params.due : undefined,
  });
  return { message: DonetickHub.doneMessage(result) };
}

export const WIDGETS = {
  [WIDGET_KEY]: { get, action },
};
