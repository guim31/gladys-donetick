// -----------------------------------------------------------------------------
// Donetick API client: the four calls the integration needs, on the routes of
// the web app (`/api/v1/...`), authenticated by an API token in the
// `secretkey` header. Checked against the Donetick source (internal/chore,
// internal/circle, internal/auth) and a real server in Docker, October 2026.
//
// Why not the "external API" (`/eapi/v1/chore`): its completion route
// requires a Plus subscription on donetick.com, while `/api/v1` accepts the
// same token (MultiAuthMiddleware) for every account, self-hosted or not.
//
//   GET  /api/v1/chores/                          { res: Chore[] } active chores
//   GET  /api/v1/chores/history?limit=1&members=true { res: History[] } last day
//   GET  /api/v1/circles/members                  { res: Member[] }
//   POST /api/v1/chores/:id/do  (JSON body `{}`)  { res: Chore }
//
// The trailing slash of `/chores/` matters: without it Gin answers a 301.
// -----------------------------------------------------------------------------

import { httpRequest } from './http.js';

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer: down, wrong address, firewall
  TLS: 'tls', // the certificate does not verify (self-signed without the option)
  AUTH: 'auth', // missing, wrong or revoked API token
  NOT_DONETICK: 'not_donetick', // something answers, but not the Donetick API
  REDIRECT: 'redirect', // HTTP redirected to HTTPS, or a login portal
  RATE_LIMIT: 'rate_limit', // 429: the server's request limit
  HTTP: 'http', // any other unexpected answer
});

export class DonetickError extends Error {
  constructor(kind, message, status) {
    super(message);
    this.name = 'DonetickError';
    this.kind = kind;
    this.status = status;
  }
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

function networkError(err) {
  if (TLS_CODES.has(err.code)) {
    return new DonetickError(ERROR_KINDS.TLS, `Certificate refused (${err.code})`);
  }
  return new DonetickError(ERROR_KINDS.UNREACHABLE, err.code ? `${err.code}` : err.message);
}

/** The `error` text of a Donetick JSON answer, if any (never echoes a token). */
function errorText(body) {
  try {
    const parsed = JSON.parse(body);
    return typeof parsed?.error === 'string' ? parsed.error.slice(0, 200) : '';
  } catch {
    return '';
  }
}

export class DonetickClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL, without trailing slash
   * @param {string} options.token API token (Settings → Access tokens)
   * @param {boolean} [options.insecure] accept a self-signed certificate
   * @param {Function} [options.request] HTTP seam (src/donetick/http.js)
   */
  constructor({ url, token, insecure = false, request = httpRequest }) {
    this.url = url;
    this.token = token;
    this.insecure = insecure;
    this.request = request;
  }

  async call(path, { method = 'GET', json } = {}) {
    let response;
    try {
      response = await this.request(`${this.url}${path}`, {
        method,
        json,
        insecure: this.insecure,
        headers: { secretkey: this.token },
      });
    } catch (err) {
      throw networkError(err);
    }
    const { status, body } = response;
    if (status === 401 || status === 403) {
      throw new DonetickError(ERROR_KINDS.AUTH, `HTTP ${status} ${errorText(body)}`.trim(), status);
    }
    if (status === 429) {
      throw new DonetickError(ERROR_KINDS.RATE_LIMIT, 'HTTP 429', status);
    }
    if (status >= 300 && status < 400) {
      throw new DonetickError(ERROR_KINDS.REDIRECT, `HTTP ${status}`, status);
    }
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      // The web app answers its HTML page on any unknown path.
      throw new DonetickError(
        status === 200 || status === 404 ? ERROR_KINDS.NOT_DONETICK : ERROR_KINDS.HTTP,
        `HTTP ${status}, not JSON`,
        status,
      );
    }
    if (status < 200 || status >= 300) {
      throw new DonetickError(ERROR_KINDS.HTTP, `HTTP ${status} ${errorText(body)}`.trim(), status);
    }
    if (!parsed || typeof parsed !== 'object' || !('res' in parsed)) {
      throw new DonetickError(ERROR_KINDS.NOT_DONETICK, `HTTP ${status}, no "res"`, status);
    }
    return parsed;
  }

  async chores() {
    const { res } = await this.call('/api/v1/chores/');
    return Array.isArray(res) ? res : [];
  }

  /** History entries of the whole circle, updated during the last day. */
  async history() {
    const { res } = await this.call('/api/v1/chores/history?limit=1&members=true');
    return Array.isArray(res) ? res : [];
  }

  async members() {
    const { res } = await this.call('/api/v1/circles/members');
    return Array.isArray(res) ? res : [];
  }

  /**
   * Mark a chore done, as the token's user, now.
   * @returns {Promise<{ chore: object|null, pendingApproval: boolean }>}
   */
  async complete(id) {
    const answer = await this.call(`/api/v1/chores/${encodeURIComponent(id)}/do`, {
      method: 'POST',
      json: {},
    });
    return {
      chore: answer.res && typeof answer.res === 'object' ? answer.res : null,
      // A chore that requires approval waits for an admin instead.
      pendingApproval: typeof answer.message === 'string' && /approval/i.test(answer.message),
    };
  }
}
