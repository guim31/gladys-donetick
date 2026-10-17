// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
//
// One Donetick instance (its address and an API token of one of its users),
// read on a timer of the container.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Refresh intervals offered in the configuration, in seconds.
export const POLL_INTERVALS = ['60', '120', '300', '600'];

export const DEFAULT_CONFIG = {
  url: '',
  api_token: '',
  member_devices: true,
  allow_self_signed: false,
  poll_interval: '120',
  language: 'fr',
};

/**
 * Parse the address typed by the user into a base URL: a bare host or IP
 * (`192.0.2.10:2021`), or the URL copied from the browser
 * (`https://chores.example.org/my/chores`). HTTP by default. A path prefix
 * is kept (Donetick behind a reverse proxy under `/donetick`), the known
 * screens of the web app are dropped.
 * @param {unknown} raw
 * @returns {string|null} `http(s)://host[:port][/prefix]`, null when unusable
 */
export function parseServerUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (!text) {
    return null;
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    return null;
  }
  // Credentials in the address would end up in the logs.
  if (url.username || url.password) {
    return null;
  }
  // A copied API or app path: keep what comes before it.
  const path = url.pathname
    .replace(/\/(api|eapi)\/.*$/, '')
    .replace(/\/(my|chores|settings|login|things|labels|projects)(\/.*)?$/, '')
    .replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

/** Host part shown to the user (no scheme). */
export const hostOf = (url) => url.replace(/^https?:\/\//, '');

const bool = (value) => value === true || value === 'true';

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const typed = typeof source.url === 'string' ? source.url.trim() : '';
  const poll = String(source.poll_interval ?? '');
  return {
    url: parseServerUrl(typed),
    urlTyped: typed !== '',
    // Tokens are kept as typed, minus the blanks a copy and paste adds around them.
    token: typeof source.api_token === 'string' ? source.api_token.trim() : '',
    memberDevices:
      source.member_devices === undefined || source.member_devices === null
        ? DEFAULT_CONFIG.member_devices
        : bool(source.member_devices),
    allowSelfSigned: bool(source.allow_self_signed),
    pollIntervalMs:
      Number(POLL_INTERVALS.includes(poll) ? poll : DEFAULT_CONFIG.poll_interval) * 1000,
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
