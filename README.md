# Donetick for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com)
that brings the household chores of a self-hosted
[Donetick](https://donetick.com) into Gladys, over the local network: what is
left to do today, what is overdue, who does what, and a tap to mark a chore
done.

> **Feedback welcome.** The integration was checked against a real Donetick
> server (Docker image `donetick/donetick`, October 2026), but not yet in
> everyday use with a real Gladys. Please report what works and what does not
> in the [issues](https://github.com/guim31/gladys-donetick/issues).

## Features

- **A household device** and, optionally, **one device per member** of the
  Donetick circle, each with four features: _chores to do today_ (overdue ones
  included), _overdue chores_, _chores done today_ and the _next chore_
  (text). On a member device, only the chores assigned to that member.
- **Dashboard widget** "Today's chores": two tiles, the list of the chores of
  the day (overdue first, time, assignee) and a button to mark each of the
  four most urgent done; for the household or one member.
- **Scene triggers**: _Donetick chore overdue_ (once per due date, across
  restarts; filters on the assigned member and the chore name) and _Donetick
  chore done_ (in Donetick or from Gladys; who did it, on time or not).
- **Scene action**: _Mark a Donetick chore done_, by name (case and accents
  ignored) or number; scene variables accepted.
- The counters move on time: the integration also reads Donetick at each due
  time and at local midnight (the time zone of Gladys), whatever the refresh
  interval.
- A **Test the connection** button, a connection status that names the
  problem (token refused, no Donetick at this address, certificate…), and a
  transport badge per device.
- Every text in English, French, German and Spanish.

## Requirements

- Gladys Assistant **5.1.0** or later (widgets, scene triggers and actions).
- A **self-hosted Donetick**, reachable from Gladys, and an **access token**
  of one of its users (Donetick → Settings → Access tokens). Chores are marked
  done as this user: an admin or manager of the circle can complete any chore.

## Installation

1. In Gladys, open **Integrations** → **Install from GitHub** and enter the
   address of this repository: `https://github.com/guim31/gladys-donetick`
   (or install **Donetick** from the catalog once it is listed).
2. In **Configuration**, enter the address of Donetick
   (`http://192.168.1.20:2021`, `https://chores.example.org`…) and the access
   token. Save, then click **Test the connection**.
3. Open the **Discover** tab and add the devices.

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen.

## How it works

The integration uses the routes of the Donetick web app, with the access
token in the `secretkey` header (checked in the Donetick source and on a real
server):

| Request                                               | Use                                  |
| ----------------------------------------------------- | ------------------------------------ |
| `GET /api/v1/chores/`                                 | active chores, due dates, assignees  |
| `GET /api/v1/chores/history?limit=1&members=true`     | completions of the last day (circle) |
| `GET /api/v1/circles/members`                         | members and circle id (every hour)   |
| `POST /api/v1/chores/{id}/do` with the JSON body `{}` | mark a chore done, as the token user |

The "external API" (`/eapi/v1/chore`) was left aside: on donetick.com, its
completion route is reserved to Plus subscribers, while `/api/v1` accepts the
same token for every account. Donetick is read on a timer of the container
(1 to 10 minutes, 2 by default, plus each due time and midnight); the devices
are published with `should_poll: false`. States are published only when they
change, and every 12 hours otherwise. The chores already announced to scenes
are kept in `/data/donetick-state.json`.

## Checked on a real Donetick, and what was not

Checked against `donetick/donetick` (image of 17/10/2026, SQLite) in a Docker
network, with an account and a second member created through the API, a
token, and chores due in the past, today, tomorrow and without date: the
real answers are in `test/fixtures/donetick/` and drive the tests; the
integration ran in its own container under the Gladys sandbox limits
(read-only root, no capabilities, 256 MB), read the server and marked chores
done, checked on the Donetick side.

Not checked: a real Gladys instance (the tests use the SDK's fake Gladys),
the donetick.com cloud, Donetick behind a reverse proxy with a path prefix.

## Limitations

- Reads chores and marks them done; does not create, edit, skip or assign.
- A change made in Donetick shows up within the refresh interval.
- Archived chores and the private chores of other members are invisible to
  the token user.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests use the fake Gladys of the SDK (`@gladysassistant/integration-sdk/testing`)
and an in-memory Donetick (`test/helpers/fakeDonetick.js`) built from real
answers. See [`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- [Donetick](https://github.com/donetick/donetick) by its authors (AGPL-3.0):
  the routes and their behavior were read in its source; no code was copied,
  the integration only talks to its API.
- The architecture and the conformity tests follow
  [gladys-pihole](https://github.com/guim31/gladys-pihole) and
  [gladys-wled](https://github.com/guim31/gladys-wled).

## Disclaimer

This project is not affiliated with, endorsed or sponsored by Donetick. The
cover is an original illustration, without the Donetick logo.

## License

Apache-2.0
