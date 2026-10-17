// -----------------------------------------------------------------------------
// An in-memory Donetick, answering the four routes the integration calls the
// way the real server does (status codes, `{ res }` envelope, 301 without the
// trailing slash, HTML page on unknown paths, 500 on a missing chore). Its
// starting data are real answers of donetick/donetick in Docker (October
// 2026, test/fixtures/donetick/real-*.json): a circle of two members, five
// chores — two overdue, one due tonight, one tomorrow, one without date.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/donetick/${name}.json`, import.meta.url), 'utf8'));

export const TOKEN = 'dt_0123456789abcdef0123456789abcdef';
export const ALICE = 1;
export const BOB = 2;

const DAY = 24 * 60 * 60_000;
const json = (status, value) => ({
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify(value),
});

export class FakeDonetick {
  constructor({ now = () => Date.now(), token = TOKEN, user = ALICE, history = [] } = {}) {
    this.now = now;
    this.token = token;
    this.user = user;
    this.chores = structuredClone(fixture('real-chores').res);
    this.members = structuredClone(fixture('real-members').res);
    this.history = structuredClone(history);
    this.online = true;
    this.requests = [];
    this.notAssigned = new Set();
    this.nextHistoryId = 100;
  }

  chore(id) {
    return this.chores.find((chore) => chore.id === id);
  }

  /** Mark a chore done as `user`, as Donetick does (next due date, history). */
  completeAs(id, user, performedAt = this.now()) {
    const chore = this.chore(id);
    const entry = {
      id: this.nextHistoryId++,
      choreId: id,
      performedAt: new Date(performedAt).toISOString(),
      completedBy: user,
      assignedTo: chore.assignedTo,
      notes: null,
      dueDate: chore.nextDueDate,
      updatedAt: new Date(performedAt).toISOString(),
      createdAt: new Date(performedAt).toISOString(),
      status: chore.requireApproval ? 3 : 1,
      syncVersion: 1,
    };
    this.history.unshift(entry);
    if (!chore.requireApproval) {
      const step = { daily: 1, weekly: 7, interval: chore.frequency }[chore.frequencyType];
      if (step && chore.nextDueDate) {
        chore.nextDueDate = new Date(Date.parse(chore.nextDueDate) + step * DAY)
          .toISOString()
          .replace('.000Z', 'Z');
      } else {
        chore.isActive = false;
        chore.nextDueDate = null;
      }
    }
    return entry;
  }

  handle(url, { method = 'GET', headers = {} } = {}) {
    const { pathname, search } = new URL(url);
    this.requests.push({ method, path: pathname, search });
    if (!pathname.startsWith('/api/')) {
      return { status: 200, headers: { 'content-type': 'text/html' }, body: '<!doctype html>' };
    }
    if (pathname === '/api/v1/chores') {
      return { status: 301, headers: { location: '/api/v1/chores/' }, body: '' };
    }
    const known =
      pathname === '/api/v1/chores/' ||
      pathname === '/api/v1/chores/history' ||
      pathname === '/api/v1/circles/members' ||
      /^\/api\/v1\/chores\/\d+\/do$/.test(pathname);
    if (!known) {
      return { status: 200, headers: { 'content-type': 'text/html' }, body: '<!doctype html>' };
    }
    if (headers.secretkey !== this.token) {
      return json(401, {
        error: 'Authentication required. Provide either a valid JWT token or API key.',
      });
    }
    if (method === 'GET' && pathname === '/api/v1/chores/') {
      return json(200, { res: this.chores.filter((chore) => chore.isActive) });
    }
    if (method === 'GET' && pathname === '/api/v1/chores/history') {
      const since = this.now() - DAY;
      return json(200, {
        res: this.history.filter((entry) => Date.parse(entry.updatedAt) > since),
      });
    }
    if (method === 'GET' && pathname === '/api/v1/circles/members') {
      return json(200, { res: this.members });
    }
    const done = pathname.match(/^\/api\/v1\/chores\/(\d+)\/do$/);
    if (method === 'POST' && done) {
      const id = Number(done[1]);
      const chore = this.chore(id);
      if (!chore) {
        return json(500, { error: 'Failed to retrieve chore' });
      }
      if (this.notAssigned.has(id)) {
        return json(400, { error: 'User is not assigned to chore' });
      }
      this.completeAs(id, this.user);
      if (chore.requireApproval) {
        return json(200, { res: chore, message: 'Chore completion submitted for approval' });
      }
      return json(200, { res: chore });
    }
    return json(404, { error: 'Not found' });
  }
}

/** The network: one fake server per base URL; anything else does not answer. */
export function createNetwork(servers) {
  return {
    servers,
    async request(url, options = {}) {
      const base = Object.keys(servers).find((origin) => url.startsWith(`${origin}/`));
      const server = base ? servers[base] : null;
      if (!server || !server.online) {
        const error = new Error('connect ECONNREFUSED');
        error.code = 'ECONNREFUSED';
        throw error;
      }
      return server.handle(url, options);
    },
  };
}
