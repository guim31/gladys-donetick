// -----------------------------------------------------------------------------
// The Donetick hub: reads the instance on a timer of the container, publishes
// the counters of the household and of each member when they change, fires
// the scene events (a chore turns overdue, a chore is done), and marks chores
// done for the widget and the scene action.
//
// Gladys never polls these devices (should_poll: false): the interval goes up
// to 10 minutes, beyond the fixed list of the core scheduler, and the scene
// events must fire even when no device was added. The timer also wakes up at
// the next due time and at local midnight, so "overdue" and "today" move on
// time whatever the interval.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { hostOf } from './config.js';
import { buildHousehold, buildMember, featureStates, householdIds, memberIds } from './devices.js';
import { DonetickClient, DonetickError, ERROR_KINDS } from './donetick/client.js';
import {
  findChore,
  localDay,
  parseChores,
  parseHistory,
  parseMembers,
  resolveTimeZone,
  summarize,
} from './donetick/model.js';
import {
  ACTION_TEXT,
  CONNECTION_TEXT,
  DONE_TEXT,
  ERROR_TEXT,
  REPORT_TEXT,
  allLanguages,
  pick,
} from './texts.js';

const logger = createLogger({ name: 'donetick-hub' });

export const WIDGET_KEY = 'chores_today';

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  OVERDUE: 'chore_overdue',
  COMPLETED: 'chore_completed',
});

export const HUB_TIMINGS = {
  // The members change rarely: read again every hour (and on "Search").
  membersMs: 60 * 60_000,
  // A failed read is tried again this soon, whatever the interval.
  retryMs: 30_000,
  // Read this long after a due time or midnight, so the server agrees.
  wakeSlackMs: 2_000,
  // Never read more often than this, even for chores due a second apart.
  minDelayMs: 10_000,
  // Re-send unchanged values this often: Gladys shows "no recent value" after 48 h.
  heartbeatMs: 12 * 60 * 60_000,
};

const MAX_REMEMBERED = 500;

export class DonetickHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} options.store persistence (src/store.js)
   * @param {Function} [options.request] HTTP seam (src/donetick/http.js)
   * @param {boolean} [options.timers] periodic timer (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   * @param {string} [options.timeZone] defaults to TZ, set by the Gladys supervisor
   */
  constructor({ gladys, store, request, timers = true, timings, now, timeZone }) {
    this.gladys = gladys;
    this.store = store;
    this.request = request;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    this.timeZone = resolveTimeZone(timeZone ?? process.env.TZ);
    this.config = null;
    this.client = null;
    this.reset();
    this.saved = { scope: null, announcedOverdue: [], seenCompleted: [] };
    this.connection = null;
    this.devicesSignature = null;
    this.widgetSignature = null;
    this.transports = new Map();
    this.timer = null;
    this.polling = null;
    this.stopped = false;
    /** Problems already logged, by key: repeats go to debug. */
    this.warned = new Set();
  }

  reset() {
    this.chores = [];
    this.members = [];
    this.history = [];
    this.circleId = null;
    this.membersAt = 0;
    this.error = null;
    this.downSince = null;
    this.readAt = 0;
    this.connectedLogged = false;
    /** Names of the chores seen, for a completed chore that left the list. */
    this.names = new Map();
  }

  // --- Logs ------------------------------------------------------------------
  // Info keeps the lifecycle only (connected, lost, back, user commands). A
  // problem that repeats is logged once, then at debug until it clears.

  problem(key, message, err, level = 'warn') {
    const args = err === undefined ? [message] : [message, err];
    if (this.warned.has(key)) {
      logger.debug(...args);
      return;
    }
    this.warned.add(key);
    logger[level](...args);
  }

  resolved(key, message) {
    if (this.warned.delete(key) && message) {
      logger.info(message);
    }
  }

  get language() {
    return this.config?.language ?? 'en';
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    const saved = await this.store.load();
    this.saved = {
      scope: typeof saved.scope === 'string' ? saved.scope : null,
      announcedOverdue: Array.isArray(saved.announcedOverdue) ? saved.announcedOverdue : [],
      seenCompleted: Array.isArray(saved.seenCompleted) ? saved.seenCompleted : [],
    };
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.gladys.forgetPublishedStates?.();
    this.connection = null;
    this.devicesSignature = null;
    this.transports.clear();
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    const previous = this.config;
    this.config = config;
    const same =
      previous &&
      previous.url === config.url &&
      previous.token === config.token &&
      previous.allowSelfSigned === config.allowSelfSigned;
    if (!same) {
      this.reset();
      this.client =
        config.url && config.token
          ? new DonetickClient({
              url: config.url,
              token: config.token,
              insecure: config.allowSelfSigned,
              request: this.request,
            })
          : null;
    }
    // A new language or the member option: the devices are published again.
    this.devicesSignature = null;
    this.gladys.forgetPublishedStates?.();
    await this.poll({ members: true });
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.polling?.catch(() => {});
    await this.store.flush();
  }

  schedule(delay) {
    clearTimeout(this.timer);
    if (!this.timersEnabled || this.stopped || !this.client) {
      return;
    }
    this.timer = setTimeout(() => {
      this.poll().catch((err) => this.problem('poll', 'Reading failed', err, 'error'));
    }, delay);
  }

  /** The interval, shortened to the next due time or local midnight. */
  nextDelay() {
    if (this.error) {
      return Math.min(this.config.pollIntervalMs, this.timings.retryMs);
    }
    const now = this.now();
    const moments = [localDay(now, this.timeZone).end];
    const upcoming = this.chores.find((chore) => chore.dueAt !== null && chore.dueAt > now);
    if (upcoming) {
      moments.push(upcoming.dueAt);
    }
    const wake = Math.min(...moments) - now + this.timings.wakeSlackMs;
    return Math.max(this.timings.minDelayMs, Math.min(this.config.pollIntervalMs, wake));
  }

  // --- Reading ---------------------------------------------------------------

  /** One reading at a time: a call during a reading waits for it, then reads. */
  poll(options = {}) {
    const run = async () => {
      try {
        await this.read(options);
      } finally {
        this.schedule(this.nextDelay());
      }
    };
    this.polling = (this.polling ?? Promise.resolve()).catch(() => {}).then(run);
    return this.polling;
  }

  async read({ members = false } = {}) {
    if (!this.client) {
      await this.publishConnectionStatus();
      return;
    }
    const now = this.now();
    try {
      const wantMembers =
        members || this.circleId === null || now - this.membersAt >= this.timings.membersMs;
      const [chores, history, memberList] = await Promise.all([
        this.client.chores(),
        this.client.history(),
        wantMembers ? this.client.members() : null,
      ]);
      this.chores = parseChores(chores);
      this.history = parseHistory(history);
      if (memberList) {
        this.members = parseMembers(memberList);
        this.circleId = this.members.find((member) => member.circleId !== null)?.circleId ?? null;
        this.membersAt = now;
      }
      for (const chore of this.chores) {
        this.names.set(chore.id, chore.name);
      }
      if (this.names.size > MAX_REMEMBERED) {
        this.names = new Map([...this.names].slice(-MAX_REMEMBERED));
      }
      this.readAt = now;
      this.recovered(now);
    } catch (err) {
      this.failed(err, now);
    }
    if (this.circleId !== null) {
      await this.publishDevices();
      if (!this.error) {
        await this.publishStates();
        await this.fireEvents(now);
      }
    }
    await this.publishTransports();
    await this.publishConnectionStatus();
    this.refreshWidget();
  }

  recovered(now) {
    const host = hostOf(this.config.url);
    if (this.downSince !== null) {
      const minutes = Math.round((now - this.downSince) / 60_000);
      this.resolved('read', `Donetick at ${host} answers again after ${minutes} min`);
    }
    if (!this.connectedLogged) {
      this.connectedLogged = true;
      logger.info(
        `Connected to Donetick at ${host}: ${this.chores.length} active chore(s), ${this.members.length} member(s)`,
      );
    }
    this.error = null;
    this.downSince = null;
  }

  failed(err, now) {
    const kind = err instanceof DonetickError ? err.kind : ERROR_KINDS.HTTP;
    this.error = { kind, message: err.message };
    this.downSince ??= now;
    this.problem(
      'read',
      `Donetick at ${hostOf(this.config.url)}: ${err.message}`,
      undefined,
      'error',
    );
  }

  view(memberDevice) {
    const member = memberDevice ? this.memberOf(memberDevice) : null;
    return { member, unknown: Boolean(memberDevice) && !member };
  }

  /** The member of a member device external id, null when none. */
  memberOf(externalId) {
    if (this.circleId === null) {
      return null;
    }
    return (
      this.members.find(
        (member) => memberIds(this.gladys, this.circleId, member.userId).device === externalId,
      ) ?? null
    );
  }

  summary(userId = null) {
    const now = this.now();
    return summarize(this.chores, this.history, {
      now,
      day: localDay(now, this.timeZone),
      userId,
    });
  }

  memberName(userId) {
    return this.members.find((member) => member.userId === userId)?.name ?? null;
  }

  // --- Publishing to Gladys --------------------------------------------------

  devices() {
    const list = [buildHousehold(this.gladys, this.circleId, this.language)];
    if (this.config.memberDevices) {
      for (const member of this.members) {
        list.push(buildMember(this.gladys, this.circleId, member, this.language));
      }
    }
    return list;
  }

  async publishDevices() {
    const devices = this.devices();
    const signature = JSON.stringify(devices);
    if (signature === this.devicesSignature) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.devicesSignature = signature;
      this.resolved('devices');
    } catch (err) {
      this.problem('devices', `Discovered devices refused: ${err.message}`);
    }
  }

  /** "Search" in the Discovery tab. */
  async rediscover() {
    this.devicesSignature = null;
    await this.poll({ members: true });
  }

  /** The user added a device: the states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    this.gladys.forgetPublishedStates?.(device?.external_id);
    if (!this.error && this.circleId !== null) {
      await this.publishStates();
    }
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  states() {
    const states = featureStates(
      householdIds(this.gladys, this.circleId),
      this.summary(),
      this.language,
    );
    if (this.config.memberDevices) {
      for (const member of this.members) {
        states.push(
          ...featureStates(
            memberIds(this.gladys, this.circleId, member.userId),
            this.summary(member.userId),
            this.language,
          ),
        );
      }
    }
    return states;
  }

  async publishStates() {
    try {
      // Only the changes, and every value again after `heartbeatMs`.
      await this.gladys.publishChangedStates(this.states(), {
        heartbeat: this.timings.heartbeatMs,
      });
      this.resolved('states');
    } catch (err) {
      this.problem('states', `States refused: ${err.message}`);
    }
  }

  async publishTransports() {
    if (this.circleId === null || (this.error === null && this.readAt === 0)) {
      return;
    }
    const transport = this.error ? DEVICE_TRANSPORTS.UNREACHABLE : DEVICE_TRANSPORTS.LOCAL;
    const entries = this.devices()
      .map((device) => ({ external_id: device.external_id, transport }))
      .filter((entry) => this.transports.get(entry.external_id) !== entry.transport);
    if (entries.length === 0) {
      return;
    }
    try {
      await this.gladys.publishTransports(entries);
      for (const entry of entries) {
        this.transports.set(entry.external_id, entry.transport);
      }
      this.resolved('transports');
    } catch (err) {
      this.problem('transports', `Transports refused: ${err.message}`);
    }
  }

  connectionStatus() {
    if (!this.config.url) {
      return {
        connected: false,
        message: this.config.urlTyped ? CONNECTION_TEXT.invalidUrl : CONNECTION_TEXT.noUrl,
      };
    }
    if (!this.config.token) {
      return { connected: false, message: CONNECTION_TEXT.noToken };
    }
    if (this.error) {
      return { connected: false, message: ERROR_TEXT[this.error.kind] };
    }
    return { connected: true };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.resolved('connection-status');
    } catch (err) {
      this.problem('connection-status', `Connection status refused: ${err.message}`);
    }
  }

  refreshWidget() {
    const signature = JSON.stringify([
      this.error?.kind ?? null,
      this.chores,
      this.history.map((entry) => entry.id),
      this.members,
      localDay(this.now(), this.timeZone).start,
    ]);
    if (signature !== this.widgetSignature) {
      this.widgetSignature = signature;
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  // --- Scene events ----------------------------------------------------------

  async fireEvents(now) {
    const scope = `${this.config.url}|${this.circleId}`;
    const overdue = this.chores
      .filter((chore) => chore.dueAt !== null && chore.dueAt < now)
      .map((chore) => ({ chore, key: `${chore.id}@${chore.dueAt}` }));
    const completed = this.history;

    if (this.saved.scope !== scope) {
      // First reading of this instance: what is already overdue or done is
      // known, not news. Nothing fires.
      this.saved = {
        scope,
        announcedOverdue: overdue.map(({ key }) => key),
        seenCompleted: completed.map((entry) => entry.id),
      };
      this.store.save(this.saved);
      return;
    }

    const announced = new Set(this.saved.announcedOverdue);
    const seen = new Set(this.saved.seenCompleted);
    const fresh = overdue.filter(({ key }) => !announced.has(key));
    const done = completed.filter((entry) => !seen.has(entry.id));

    const nextAnnounced = overdue.map(({ key }) => key);
    // History entries leave the one-day window: keep those still in it.
    const nextSeen = completed.map((entry) => entry.id);
    if (
      JSON.stringify(nextAnnounced) !== JSON.stringify(this.saved.announcedOverdue) ||
      JSON.stringify(nextSeen) !== JSON.stringify(this.saved.seenCompleted)
    ) {
      this.saved = { scope, announcedOverdue: nextAnnounced, seenCompleted: nextSeen };
      this.store.save(this.saved);
    }

    for (const { chore } of fresh) {
      await this.fire(TRIGGERS.OVERDUE, {
        chore: chore.name,
        chore_id: chore.id,
        assignee: chore.assignedTo === null ? '' : (this.memberName(chore.assignedTo) ?? ''),
        member:
          chore.assignedTo === null
            ? null
            : memberIds(this.gladys, this.circleId, chore.assignedTo).device,
        due_date: new Date(chore.dueAt).toISOString(),
      });
    }
    for (const entry of done) {
      await this.fire(TRIGGERS.COMPLETED, {
        chore: this.names.get(entry.choreId) ?? `#${entry.choreId}`,
        chore_id: entry.choreId,
        completed_by: entry.completedBy === null ? '' : (this.memberName(entry.completedBy) ?? ''),
        member:
          entry.completedBy === null
            ? null
            : memberIds(this.gladys, this.circleId, entry.completedBy).device,
        on_time:
          entry.dueAt === null || entry.performedAt === null
            ? true
            : entry.performedAt <= entry.dueAt,
      });
    }
  }

  async fire(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
      this.resolved('scene-event');
    } catch (err) {
      this.problem('scene-event', `Scene event ${key} refused: ${err.message}`);
    }
  }

  // --- Commands --------------------------------------------------------------

  /**
   * Mark a chore done, by number or name, as the user of the API token.
   * @returns {Promise<{ chore: object, pendingApproval: boolean, nextDue: number|null }>}
   */
  async complete(query) {
    const language = this.language;
    if (!this.client) {
      throw new Error(pick(ACTION_TEXT.notConfigured, language));
    }
    const translate = (err) => {
      if (!(err instanceof DonetickError)) {
        return err;
      }
      if (err.status === 400 && /not assigned/i.test(err.message)) {
        return new Error(pick(ACTION_TEXT.notAssigned, language), { cause: err });
      }
      if (err.status === 400 && /completion window/i.test(err.message)) {
        return new Error(pick(ACTION_TEXT.tooEarly, language), { cause: err });
      }
      const colon = language === 'fr' ? ' : ' : ': ';
      return new Error(`Donetick${colon}${pick(ERROR_TEXT[err.kind], language)} (${err.message})`, {
        cause: err,
      });
    };
    let chore;
    let result;
    try {
      // A fresh list: the chore may have been created a minute ago.
      const found = findChore(parseChores(await this.client.chores()), query);
      if (!found.chore) {
        const reason = { empty: 'empty', ambiguous: 'ambiguous' }[found.reason] ?? 'notFound';
        throw new Error(pick(ACTION_TEXT[reason], language));
      }
      chore = found.chore;
      result = await this.client.complete(chore.id);
    } catch (err) {
      throw translate(err);
    }
    logger.info(
      `Chore #${chore.id} ${result.pendingApproval ? 'sent for approval' : 'marked done'} from Gladys`,
    );
    // The counters, the widget and the "chore done" event follow at once.
    await this.poll().catch(() => {});
    const after = this.chores.find((item) => item.id === chore.id);
    return { chore, pendingApproval: result.pendingApproval, nextDue: after?.dueAt ?? null };
  }

  /** The toast of a completion, in the four languages. */
  static doneMessage({ chore, pendingApproval }) {
    return allLanguages((language) =>
      (pendingApproval ? DONE_TEXT[language].pending : DONE_TEXT[language].done)(chore.name).slice(
        0,
        200,
      ),
    );
  }

  /** The "Test the connection" action: read now, report. */
  async testConnection() {
    await this.poll({ members: true });
    const status = this.connectionStatus();
    if (!status.connected) {
      const message = allLanguages((language) =>
        REPORT_TEXT[language].failed(pick(status.message, language)),
      );
      throw new Error(message[this.language]);
    }
    return allLanguages((language) =>
      REPORT_TEXT[language].ok(this.chores.length, this.members.length),
    );
  }
}
