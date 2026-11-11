# Release tests

What has actually been run on a real device for the release being prepared, and
what has not. Kept because "did we test that?" is otherwise answered from memory
a week later, and memory says yes.

**Reset this file at the start of each release.** A tick is worthless if it might
be from the previous version.

Conventions: `[x]` run and passed, `[ ]` not run, `[~]` run and failed — with the
failure written next to it, not in a commit message.

---


## 2.4.0

Server 2.4.0 deployed 11 Nov (Worker 78ac4f21, migration 0073). Not built for the stores yet.

Back swipe and Lists
- [x] Swipe back on Lists / Favourite shows / Shows: no white corners or edges (Mahmood, 11 Nov)
- [ ] Lists: "Imported from your TV Time export" sits under your own lists, not under Shared
- [ ] Lists: Shared section centred, one START A SHARED LIST button, "Got a code? Join one" and "Watch a show together ›" links open the right screens (also in Arabic)

Watching together (needs two accounts)
- [ ] A free account starts its first together: no paywall
- [ ] The same account starts a second together: paywall
- [ ] A list someone joined, then deleted: the next one still asks for Plus; a list nobody joined, deleted: the next one is free
- [ ] "Mark it for both of us": on for one member only, nothing is marked; on for both, the phone behind marks up to the other's episode on open, dated by theirs
- [ ] Un-mark an episode after a catch-up: it is not re-marked on the next open (until the partner moves again)

Features
- [x] Profile ⋯ → "Share shows and films": starts empty with numbered slots, search, editable title, theme glow, username off by default (Mahmood, 11 Nov)
- [x] Show page Continue tracking: tick the next episode, the rail slides to the following one; un-mark does not move it (Mahmood, 11 Nov)

Found while testing (11 Nov)
- [x] Search: a show in the library is listed once, not again as a + row (Mahmood + simulator, 11 Nov)
- [x] Double tap on a show/film/Wrapped opens ONE page, in every tab (Mahmood, 11 Nov; guard was being overwritten by expo-router)
- [ ] Change the language: Language and Settings keep their title and back button (passed on the simulator)
- [ ] App in Arabic: Shadow and Bone's description is Arabic (TMDB stands in; passed on the simulator)

AnonP-Alt fixes
- [x] Explore: a slow short scroll starting on a card does not open it; a tap does; rails still don't freeze (Mahmood, 11 Nov)
- [ ] Shows → Watch List empty: the empty card is visible
- [ ] Setup profile on a small phone: keyboard does not cover the name field or the button
- [x] Search → open a show from Recent that was a TMDB-only result: it loads (Mahmood, 11 Nov)
- [x] Search "Better": Better Call Saul above "Better" (Mahmood, 11 Nov); [ ] search in Arabic still shows TheTVDB results first
- [x] A show not in the library: the last episode / About text is not under the Add Show bar (Mahmood, 11 Nov)
- [ ] iOS 16–18: no white band under the header on Settings / About / actor page
- [ ] Fresh install: About never flashes before Welcome
- [ ] Settings → profile layout on a 375 pt phone: Cards drawing stays in its box
- [ ] Actor page: film and series years line up


## 2.3.2

iOS 117, Android 150. Fixes on top of 2.3.1.

- [ ] A library imported from Letterboxd / Trakt / extension CSVs (no TV Time export): no "Finish upgrading your library" banner on Shows
- [ ] A TV Time export import: no banner (the export is kept)
- [ ] A TV Time library whose export is gone (delete tvtime-original.zip on a dev build): the banner still shows and opens Import
- [ ] Puzzle archive: tap TODAY's row — it fades in like the past days
- [ ] Shows and Movies filters: every genre is listed, no "Show more"
- [ ] Shows: grid button → grid with WATCH NEXT + both buttons visible; again → list anchored at WATCH NEXT


## 2.3.1

iOS 115, Android 148. Fixes on top of 2.3.0.

- [ ] Profile, arrange mode: no minus on the empty block at the bottom; the bell and ⋯ stay after Done
- [ ] A layout saved without `extra` (L8X): bell and ⋯ back after updating
- [ ] iPhone, VoiceOver on: open a show from Shows, focus the back button — it says "Back" ("Retour" in French)
- [ ] iPhone Duo, VoiceOver: the pane's back says Back
- [ ] iPhone: someone's profile from Following — the back button is an arrow only, no word
- [ ] Puzzle archive: tap a played day — it fades in, no slide from the right, no odd background


## 2.3.0

iOS 112, Android 144. Simulator lines are marked; the rest wants a real iPhone and a real Android.

**Claude & ChatGPT (MCP)**
- [x] Claude (web + iPhone app): connect with a 6-digit code, ask, mark an episode; it reached the phone (4 Nov)
- [x] ChatGPT web: Add custom MCP server, connect, ask (4 Nov)
- [ ] Settings → Library → Claude & ChatGPT: the code disappears once used; Remove stops the connection at once
- [ ] Non-Plus account: tools answer the neutral "not included" line, no upgrade text

**Un-mark an episode**
- [x] iPhone (dev): asks first; Undo counts 5→1 on the button, sits low (4 Nov)
- [~] Undo sits ABOVE the tab bar on a tab screen: Android 143 release (emulator), it COVERS the tab bar for its 5 s (4 Nov)
- [x] Fixed (7af8f04): Android 144 release (emulator), Undo sits above the tab bar, tabs stay visible (4 Nov)
- [x] iPhone: Undo above the floating tab bar on Shows (Mahmood, 4 Nov)
- [ ] Undo brings back the rating, feelings and favourite character
- [x] Android 143 release (emulator): asks first, Undo 5→4 counts, Undo puts the episode back (4 Nov)

**Search**
- [x] iPhone (dev): watchlist film → bookmark; tap → removed in one tap (4 Nov)
- [x] iPhone (dev): tapping the field fades the page in, no slide from the right (4 Nov)
- [ ] Watched film → green tick; tap → asks before removing
- [x] Two series with one title: adding one ticks only that one — Android 143 release (emulator, "Casino") (4 Nov)
- [x] Android 143 release (emulator): film → bookmark, series → tick, both removed in one tap (4 Nov)

**Screens**
- [x] Android 143 release (emulator): Edit Profile has no empty band, close returns to the profile (4 Nov)
- [ ] iPhone: Edit Profile and avatar decoration: native sheet, Done/Save closes one screen only
- [ ] Seasonal banner page opens as a sheet and closes back to the profile
- [x] Profile tab: no white "index" bar — Android 143 release (emulator) (4 Nov)
- [ ] Profile tab: no white "index" bar — iPhone

**Other**
- [ ] Rating prompt only after a won puzzle on a 7-day streak
- [ ] iOS backup with pictures: pictures upload beside the ZIP, app stays smooth
- [x] What's New 2.3.0 in English: iPhone 16 simulator (dev) and Android 143 release (4 Nov)
- [ ] What's New in Arabic

---

## 2.2.0

iOS 107, Android 131. Simulator lines are marked; the rest wants a real iPhone and a real Android.

**Wrapped: Save all**
- [~] Android emulator, before the per-card fix: shared 6 images, some cards wrong or missing (fixed since, not re-run)
- [ ] iPhone (real): first tap asks to add to Photos; every card of the month lands, none twice, none blank
- [ ] Android release build: same, and nothing breaks after R8
- [ ] A month with one card shows no SAVE ALL

**Daily puzzle**
- [ ] Archive pages back through past months, squares match the profile block
- [ ] Finishing today's puzzle shows on the dashboard's Daily puzzle section (signed-in only)

**Film runtimes**
- [ ] Hidden Figures / The Station Agent read their real length in Wrapped after a launch (Mahmood's phone)

**iPhone Duo two panes (Device Hub, Mahmood only: tools cannot see the inner screen)**
- [x] Right half empty and the theme's background until something is tapped (Duo simulator)
- [x] Half open splits at the fold; flat gives the left 40% (Duo simulator)
- [x] Show, episode, puzzle open on the right; back and a pull down step back within it; no black screen (Duo simulator)
- [x] The profile cover stays in its half (Duo simulator)
- [ ] Settings → App → Full width when open: one page again, and back to two
- [ ] Closed: unchanged phone layout

**Everyone else**
- [ ] Fresh install, iPhone and Android: welcome, import, What's New not shown to a new install
- [ ] Update from 2.1.1: What's New shows the 2.2.0 rows (iPhone shows the Duo row, Android does not)

---

## 2.1.1

Simulator lines are marked. The rest wants a real iPhone and a real Android.

**Import (Henrike's real TV Time and Simkl files, iPhone simulator)**
- [x] TV Time, then Simkl merged: no film lost; 24 same-name films got their own row
- [x] Simkl, then TV Time merged: same films; bare films 19 → 8
- [x] Merging the same file twice adds nothing (15,786 rows both times)
- [x] Repeat viewings survive a merge
- [x] Opening a library from before the update folds its films once (11 folded)
- [~] क्‍वीन, २ स्टेट्स, కల్కి 2898-AD stay doubled: TMDB has no such title. Fix match only

**Emotion calendar**
- [x] Upright grid, tap a day, Earlier (Duo simulator)
- [x] Arabic, right to left (iPhone simulator)
- [x] Android release build 129, emulator: upright, no crash on launch (empty library)

**Henrike's other fixes**
- [x] Android: no blank band under the header on Emotion calendar (release 129, emulator)
- [ ] Closing card centred on a show, German text included
- [ ] Snake popcorn sits inside its cell
- [ ] Spam hint on the code screen

**Full pass, 31 Oct**
- [x] iPhone simulator, Metro: fresh TV Time import 361 / 21,621 / 528, four tabs, mark an episode, episode page, search
- [x] Android release 129, emulator: same import, same numbers, no crash
- [ ] Public profile lists and comments (no community account in this pass)
- [ ] Widgets on a home screen

**Carried over from 2.1.0**
- [x] Real iPhone: Cancel on a banner works, on the 2.1.0 store build (Mahmood, 31 Oct)
- [ ] Time the spinner after picking a cover
- [ ] Public profile: lists and comments open with a header, no remount
