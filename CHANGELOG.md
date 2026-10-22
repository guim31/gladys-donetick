# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.1] - 2026-10-22

### Security

- Rebuilt on Node.js 24.22.1, the October 2026 security release (remote code
  execution in the Brotli decoder, CVE-2026-111497; TLS hostname and DNS
  fixes).

## [1.0.0] - 2026-10-17

### Added

- Donetick household chores in Gladys: a household device and, optionally, one
  device per member of the circle, with the chores to do today (overdue ones
  included), the overdue chores, the chores done today and the next chore.
- Dashboard widget "Today's chores": the chores of the day, overdue first,
  with a button to mark each of the four most urgent done; for the household
  or one member.
- Scene triggers "Donetick chore overdue" (once per due date) and "Donetick
  chore done" (in Donetick or from Gladys), with member and chore filters.
- Scene action "Mark a Donetick chore done", by name or number.
- Counters that move at each due time and at local midnight, whatever the
  refresh interval (1 to 10 minutes).
- A "Test the connection" button and a connection status naming the problem.
- Every text in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-donetick/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/guim31/gladys-donetick/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/guim31/gladys-donetick/releases/tag/v1.0.0
