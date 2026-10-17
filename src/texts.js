// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, errors, the "Test the connection" report, scene action
// errors. Four languages, the four of the Gladys interface; German says "du",
// Spanish "usted". test/i18n.test.js checks every table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './donetick/client.js';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noUrl: {
    en: 'Enter the address of your Donetick in the configuration.',
    fr: "Saisissez l'adresse de votre Donetick dans la configuration.",
    de: 'Gib die Adresse deines Donetick in der Konfiguration ein.',
    es: 'Introduzca la dirección de su Donetick en la configuración.',
  },
  invalidUrl: {
    en: 'Address not understood, e.g. http://192.168.1.20:2021',
    fr: 'Adresse incomprise, ex. http://192.168.1.20:2021',
    de: 'Adresse nicht verstanden, z. B. http://192.168.1.20:2021',
    es: 'Dirección no válida, p. ej. http://192.168.1.20:2021',
  },
  noToken: {
    en: 'Enter a Donetick API token in the configuration (Settings, Access tokens).',
    fr: "Saisissez un jeton d'API Donetick dans la configuration (Settings, Access tokens).",
    de: 'Gib in der Konfiguration ein Donetick-API-Token ein (Settings, Access tokens).',
    es: 'Introduzca un token de API de Donetick en la configuración (Settings, Access tokens).',
  },
};

// One short explanation per error kind (src/donetick/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'Donetick does not answer',
    fr: 'Donetick ne répond pas',
    de: 'Donetick antwortet nicht',
    es: 'Donetick no responde',
  },
  [ERROR_KINDS.TLS]: {
    en: 'certificate refused: tick "Accept self-signed certificates"',
    fr: 'certificat refusé : cochez « Accepter les certificats auto-signés »',
    de: 'Zertifikat abgelehnt: Aktiviere „Selbstsignierte Zertifikate akzeptieren“',
    es: 'certificado rechazado: marque «Aceptar certificados autofirmados»',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'API token refused: create a new one in Donetick',
    fr: "jeton d'API refusé : créez-en un nouveau dans Donetick",
    de: 'API-Token abgelehnt: Erstelle ein neues in Donetick',
    es: 'token de API rechazado: cree uno nuevo en Donetick',
  },
  [ERROR_KINDS.NOT_DONETICK]: {
    en: 'no Donetick API at this address',
    fr: 'aucune API Donetick à cette adresse',
    de: 'keine Donetick-API unter dieser Adresse',
    es: 'no hay ninguna API de Donetick en esta dirección',
  },
  [ERROR_KINDS.REDIRECT]: {
    en: 'the address redirects: enter the https:// address',
    fr: "l'adresse redirige : saisissez l'adresse en https://",
    de: 'die Adresse leitet um: Gib die https://-Adresse ein',
    es: 'la dirección redirige: introduzca la dirección https://',
  },
  [ERROR_KINDS.RATE_LIMIT]: {
    en: 'too many requests, retrying later',
    fr: 'trop de requêtes, nouvel essai plus tard',
    de: 'zu viele Anfragen, neuer Versuch später',
    es: 'demasiadas solicitudes, se reintentará más tarde',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'unexpected answer, see the logs',
    fr: 'réponse inattendue, voir les logs',
    de: 'unerwartete Antwort, sieh in den Protokollen nach',
    es: 'respuesta inesperada, consulte los registros',
  },
};

// The "Test the connection" report.
export const REPORT_TEXT = {
  en: {
    ok: (chores, members) => `Donetick OK: ${chores} active chore(s), ${members} member(s).`,
    failed: (reason) => `Donetick: ${reason}.`,
  },
  fr: {
    ok: (chores, members) => `Donetick OK : ${chores} tâche(s) active(s), ${members} membre(s).`,
    failed: (reason) => `Donetick : ${reason}.`,
  },
  de: {
    ok: (chores, members) => `Donetick OK: ${chores} aktive Aufgabe(n), ${members} Mitglied(er).`,
    failed: (reason) => `Donetick: ${reason}.`,
  },
  es: {
    ok: (chores, members) => `Donetick OK: ${chores} tarea(s) activa(s), ${members} miembro(s).`,
    failed: (reason) => `Donetick: ${reason}.`,
  },
};

// Errors of the scene action and the widget buttons (shown in Gladys).
export const ACTION_TEXT = {
  notConfigured: {
    en: 'Donetick is not configured.',
    fr: "Donetick n'est pas configuré.",
    de: 'Donetick ist nicht konfiguriert.',
    es: 'Donetick no está configurado.',
  },
  empty: {
    en: 'Give the name or the number of the chore.',
    fr: 'Indiquez le nom ou le numéro de la tâche.',
    de: 'Gib den Namen oder die Nummer der Aufgabe an.',
    es: 'Indique el nombre o el número de la tarea.',
  },
  notFound: {
    en: 'No active chore has this name or number in Donetick.',
    fr: 'Aucune tâche active ne porte ce nom ou ce numéro dans Donetick.',
    de: 'Keine aktive Aufgabe in Donetick hat diesen Namen oder diese Nummer.',
    es: 'Ninguna tarea activa tiene este nombre o número en Donetick.',
  },
  ambiguous: {
    en: 'Several chores have this name: give its number (#12) instead.',
    fr: 'Plusieurs tâches portent ce nom : indiquez plutôt son numéro (#12).',
    de: 'Mehrere Aufgaben haben diesen Namen: Gib stattdessen ihre Nummer an (#12).',
    es: 'Varias tareas tienen este nombre: indique su número (#12).',
  },
  notAssigned: {
    en: 'Donetick refused: the token user is not assigned to this chore.',
    fr: "Donetick a refusé : l'utilisateur du jeton n'est pas assigné à cette tâche.",
    de: 'Donetick hat abgelehnt: Der Benutzer des Tokens ist dieser Aufgabe nicht zugewiesen.',
    es: 'Donetick lo ha rechazado: el usuario del token no está asignado a esta tarea.',
  },
  alreadyDone: {
    en: 'This chore was already done meanwhile: the list is refreshed.',
    fr: 'Cette tâche a déjà été faite entre-temps : la liste est mise à jour.',
    de: 'Diese Aufgabe wurde inzwischen schon erledigt: Die Liste wird aktualisiert.',
    es: 'Esta tarea ya se ha hecho entretanto: la lista se actualiza.',
  },
  tooEarly: {
    en: 'Donetick refused: the chore is not yet in its completion window.',
    fr: "Donetick a refusé : la tâche n'est pas encore dans sa période de réalisation.",
    de: 'Donetick hat abgelehnt: Die Aufgabe ist noch nicht in ihrem Erledigungszeitraum.',
    es: 'Donetick lo ha rechazado: la tarea aún no está en su periodo de realización.',
  },
};

// Toasts and scene results after a chore is marked done (≤ 200 characters).
export const DONE_TEXT = {
  en: {
    done: (name) => `"${name}" marked done.`,
    pending: (name) => `"${name}" sent for approval.`,
  },
  fr: {
    done: (name) => `« ${name} » marquée comme faite.`,
    pending: (name) => `« ${name} » envoyée pour validation.`,
  },
  de: {
    done: (name) => `„${name}“ als erledigt markiert.`,
    pending: (name) => `„${name}“ zur Freigabe gesendet.`,
  },
  es: {
    done: (name) => `«${name}» marcada como hecha.`,
    pending: (name) => `«${name}» enviada para su aprobación.`,
  },
};

export const LANGUAGE_FALLBACK = 'en';

export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];

/** A multi-language object from a function of the language. */
export const allLanguages = (render) =>
  Object.fromEntries(Object.keys(INIT_FAILED).map((language) => [language, render(language)]));
