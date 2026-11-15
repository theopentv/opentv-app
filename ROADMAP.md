# OpenTV — Roadmap

What is being built, what is not, and why. Updated 15 Nov 2026.

Shipped work lives in [CHANGELOG.md](CHANGELOG.md). This file is only about
what is ahead.

**Now:** 2.4.2, live on both stores: several shows in one Watching together,
private comments for private profiles, lists shared as ranked pictures, and
Letterboxd imports that find far more of your films and series.

---

## The one rule everything here is measured against

> Your library lives on your phone. The server is a convenience, never a
> dependency.

There is no watch-history table on the server, by design. If it vanished
tomorrow every user would keep their complete history and lose only other
people's comments and ratings. Anyone who does not want the community layer
never contacts it at all.

Every item below either respects that or does not get built. It is also why
some obvious features are in [Not planned](#not-planned) rather than here.

---

## 2.4.3 — next

### Black Friday: a free month of Plus
Every Plus feature, free for everyone from 1 December to 1 January. No card,
and nothing renews: it simply ends. Say yes in your Profile or on the Plus
page. If you already pay for Plus, a month goes on top of your plan.

### News and offers, your choice
A switch in Notifications decides whether OpenTV may tell you about offers like
this one. On an iPhone it is off until you turn it on.

### A show whose database page was replaced
TheTVDB sometimes deletes a show's page and makes a new one. The app kept
pointing at the old page, so the show stopped updating. It now finds the new
page by itself, with all your watches kept.

---

## After that

### Your top ratings, in Stats
The best of what you watched by your own stars: episodes, shows and films, for
all time, this year or last year. Shows count from three rated episodes, so one
great pilot does not outrank a whole season.

### Discover your way
Filters on Discover: genre, years, country of production and original
language. "Korean drama from the 2020s" in two taps.

### Genres to hide
In Settings, the genres Discover should never suggest. Chosen once, for good,
instead of swiping the same kind of card away every week. Your library and
search are untouched.

### OpenTV on the web, for Plus
Your library in the browser: the same app, signed in with Google, Apple or
email, one more device in your sync. Changes on the website reach your phone
and the other way round. The phone stays the master copy; the website never
overwrites it.

Public profile pages already exist for everyone, free:
`theopentv.com/@yourname` shows your shelves, favourites and lists (a private
profile shows only its name).

---

## OpenTV Plus

Optional. It pays for the shared server and adds extras for people who want
them: unlimited Watching together, Live rooms, Smart reminders, Deep Stats,
themes, unlimited lists, sync and backup through OpenTV's own server, and the
option to connect your own AI assistant to your library (see below).

Two commitments:

**Nothing that is free today becomes paid.** A limit added later takes
something away from people who already had it.

**Privacy is never paid.** Private accounts and per-section visibility are free
and will stay free.

The tracker itself is free: importing, history, stats, Wrapped, widgets,
notifications, comments, ratings and backup to your own iCloud or Google Drive.
No ads.

---

## Not planned

Listed so nobody has to ask twice.

- **Watch history on the server.** The entire point. See the rule at the top.
- **Automatic tracking / scrobbling.** Would mean a server watching what you
  watch.
- **Ads.** Not now, not at any size.
- **A native anime database (AniDB / Anilist).** TheTVDB is the metadata source
  and covers anime as Western seasons. A second source with a different episode
  numbering scheme is a large amount of work for a subset of one library, and
  it would fork every screen that counts episodes.
- **Selling or sharing your data.** There is nothing to sell: the library never
  arrives here, and nobody else is given it.

## Your own AI assistant (Plus)

Plus can connect an AI assistant to your library so you can ask it things like
"something like X and Y together" or keep your list by chatting. It is your
choice, never ours:

- **Off unless you set it up.** You get a code in the app, enter it in your
  assistant and confirm there. Without those steps nothing happens.
- **Any assistant.** Claude and ChatGPT are the best known, but it is an open
  standard (MCP), so an assistant running entirely on your own computer works
  too, and then no AI company receives anything.
- **Only your own backup, without private notes.** Nothing extra is stored.
- **Disconnect any time** in the app; access ends at once.

It is the same as downloading your export file and giving it to an assistant
yourself, without doing that again after every episode.

---

## How this gets decided

Most of what shipped came from people reporting things, and the ordering above
reflects that more than any plan did.

- **Discord:** [theopentv.com/discord](https://theopentv.com/discord)
- **Reddit:** [r/opentv_app](https://reddit.com/r/opentv_app)
- **Issues:** right here

Dates are deliberately absent. This is one person, and a date would be a guess
dressed as a promise.
