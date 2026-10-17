# Donetick

Bring the household chores of your [Donetick](https://donetick.com) into
Gladys: what is left to do today, what is overdue, who does what. A tap on the
dashboard marks a chore done, a scene reminds whoever is late, and another one
reacts when the bins are taken out.

> **Feedback welcome.** This integration was tested against a real Donetick
> server (Docker image `donetick/donetick`, October 2026), not yet in
> everyday use. If something does not work as described, please say so on the
> [Gladys forum](https://community.gladysassistant.com) or in the
> [issues](https://github.com/guim31/gladys-donetick/issues).

## What you need

- Gladys Assistant 5.1.0 or later.
- A **self-hosted Donetick**, reachable from Gladys (the Docker image listens
  on port 2021).
- An **access token** of a Donetick user. In Donetick: **Settings** → **Access
  tokens** → **Generate new token**, give it a name (`Gladys`), and copy the
  token, which starts with `dt_`: Donetick shows it only once.

The integration sees the chores this user can see (the whole circle, except
the private chores of the other members), and marks chores done **as this
user**. Pick a user who is admin or manager of the circle if the scene action or the
widget must complete chores assigned to somebody else.

## Set up

1. In Gladys, **Integrations** → install **Donetick**.
2. In the **Configuration** screen, fill in:
   - **Address**: the address of Donetick, for example
     `http://192.168.1.20:2021`, or `https://chores.example.org` behind a
     reverse proxy (a path prefix such as `/donetick` is kept);
   - **Access token**: the `dt_…` token.
3. Options:
   - **One device per member** (on by default): besides the household device,
     one device per member of the circle, for the chores assigned to them;
   - **Accept self-signed certificates**: for an `https://` address with a
     self-signed certificate, on your own server only;
   - **Refresh interval**: 1 to 10 minutes (2 by default). Due times and
     midnight are always followed on time, whatever the interval;
   - **Language of the feature names**: the names given to the features when
     a device is added (French by default), and the texts sent to scenes.
4. Save, then **Test the connection**: it reads Donetick and gives the number
   of active chores and members.
5. In the **Discovery** tab, add the devices you want.

## Devices

**Donetick** (the household) and, with the option, **Donetick _member_** for
each member of the circle. Each one has four features:

| Feature              | What it says                                                                         |
| -------------------- | ------------------------------------------------------------------------------------ |
| `Chores to do today` | active chores due before midnight, overdue ones included: what is left by tonight    |
| `Overdue chores`     | active chores whose due time has passed                                              |
| `Chores done today`  | completions recorded today (skipped chores do not count)                             |
| `Next chore`         | the name of the chore with the earliest due time, overdue first; `None` when nothing |

On a member device, the counters only take the chores **assigned** to the
member, and `Chores done today` the chores **they** completed. Chores without
a due date are in none of the counters. "Today" is the day in the time zone of
Gladys.

## Dashboard

The **Today's chores** widget shows two tiles (to do today, overdue), the list
of the chores of the day, overdue first, with their time and who they are
assigned to, and a button for each of the four most urgent: a tap marks the
chore done. Choose a member device in the widget settings to see only their
chores; leave it empty for the whole household. When nothing is left, the
widget says so and gives the next chore.

The counters can also go on the dashboard as any device feature.

## Scenes

### Triggers

- **Donetick chore overdue**: a chore passed its due time without being done,
  once per due date (a chore that is still late tomorrow does not fire again;
  its next occurrence will). Filters: the assigned member (a member device),
  the chore name. Information passed on to the actions: the chore, its number,
  who it is assigned to, the due date.
- **Donetick chore done**: a chore was marked done, in Donetick or from
  Gladys. Filters: who did it (a member device), the chore name. Information:
  the chore, its number, who did it, and whether it was done on time.

What is already overdue or done when the integration first starts is known,
not news: nothing fires for it. A restart does not announce a chore twice, and
a chore that turned overdue while the integration was stopped is announced
when it starts again.

### Actions

- **Mark a Donetick chore done**: marks a chore done now, as the user of the
  access token. Give the chore **name** as written in Donetick (case and
  accents ignored) or its **number** (`#12`, the number in the address of the chore
  page in Donetick). The field accepts scene variables. Results for the next steps:
  the chore, its number, whether it waits for approval, its next due date. A
  chore that requires approval is sent for approval, as in Donetick.

### Scene ideas

- At 8 pm, if `Chores to do today` of a member is above 0, send them a message.
- An NFC tag or a button by the bins runs **Mark a Donetick chore done** with
  `Take out the bins`.
- **Donetick chore overdue** with the member filter: tell that member on
  Telegram, with the chore in the message.
- **Donetick chore done** on `Water the plants`: switch the garden tap off.

## Troubleshooting

- **"Donetick does not answer"**: check the address and the port from the
  Gladys machine (`http://<address>:2021` opens Donetick in a browser).
- **"API token refused"**: the token was deleted or mistyped. Create a new one
  in Donetick (Settings → Access tokens).
- **"No Donetick API at this address"**: the address answers, but not with the
  Donetick API: check the port, or the path prefix behind a reverse proxy.
- **"The address redirects"**: enter the `https://` address.
- **"The token user is not assigned to this chore"**: Donetick only lets the
  assignees (or an admin or manager of the circle) complete a chore. Use the token of an
  admin, or assign the chore to the token user.
- **"Not yet in its completion window"**: the chore has a completion window in
  Donetick and cannot be done this early.
- **A chore is missing**: archived and private chores of other members are not
  visible to the token user.
- Logs: `LOG_LEVEL=debug` on the container shows every reading.

## Limits

- Donetick is read every 1 to 10 minutes (and at each due time and at
  midnight): a chore done in Donetick shows up in Gladys within that delay.
- The integration only reads chores and marks them done: it does not create,
  edit, skip or assign chores.
- Tested with the self-hosted Donetick of October 2026. The donetick.com cloud
  should accept the same token on its API address, but this was not tested.
- Gladys keeps no Donetick data beyond `/data/donetick-state.json` (the
  chores already announced to scenes).
- Donetick has its own request limit (300 per minute by default): the
  integration makes two or three requests per reading.
- Not affiliated with Donetick.
