# OpenTV — Roadmap

What is being built, what is not, and why. Updated 13 Nov 2026.

Shipped work lives in [CHANGELOG.md](CHANGELOG.md). This file is only about
what is ahead.

**Now:** 2.4.0, live on both stores: Watching together (the first one free,
"Mark it for both of us"), sharing your shows and films as one picture, search
that puts the most popular match first.

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

## 2.4.1 — next

### Several shows in one Watching together
A couple watching ten shows sent ten invites. Now one Watching together holds
as many shows as you add, under one invite and one "Mark it for both of us".
As many shows are free as there are people in it; more need the owner's Plus,
and joining stays free. If the owner leaves, it passes to the next person
instead of disappearing for everyone.

### Private means your comments too
A private profile hid the profile but not what you wrote: your comments still
stood under every episode with your name. Now only the followers you accepted
see them.

### Suggestions from your library
A row on Explore picked from the shows you have watched, worked out on your
phone from data it already has. Nothing is sent anywhere, and Settings turns it
off.

### Ranked pictures
Numbers on the posters of a shared picture, and any list shared as a picture in
its own order: a top ten you can post.

### Imports and fixes
- Letterboxd now lists series too, and they were arriving as films no database
  knew. They go to your shows now, and a film whose title drops its subtitle
  ("Glass Onion") is found by its year.
- Explore's Discover tab shows the recommendations directly, without the extra
  screen in between.
- iOS 16 to 18: no more empty band under the top bar.
- The Filters button stays readable over any poster.
- The rating request asks at most once every 120 days.

---

## After that

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
themes, unlimited lists, sync and backup through OpenTV's own server, and asking
Claude or ChatGPT about what you watched.

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
- **Selling or sharing any data.** There is nothing to sell: the library never
  arrives here.

---

## How this gets decided

Most of what shipped came from people reporting things, and the ordering above
reflects that more than any plan did.

- **Discord:** [theopentv.com/discord](https://theopentv.com/discord)
- **Reddit:** [r/opentv_app](https://reddit.com/r/opentv_app)
- **Issues:** right here

Dates are deliberately absent. This is one person, and a date would be a guess
dressed as a promise.
