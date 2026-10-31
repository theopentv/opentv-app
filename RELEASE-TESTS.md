# Release tests

What has actually been run on a real device for the release being prepared, and
what has not. Kept because "did we test that?" is otherwise answered from memory
a week later, and memory says yes.

**Reset this file at the start of each release.** A tick is worthless if it might
be from the previous version.

Conventions: `[x]` run and passed, `[ ]` not run, `[~]` run and failed — with the
failure written next to it, not in a commit message.

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
- [ ] Android

**Henrike's other fixes**
- [ ] Android: no blank band under the header
- [ ] Closing card centred on a show, German text included
- [ ] Snake popcorn sits inside its cell
- [ ] Spam hint on the code screen

**Carried over from 2.1.0**
- [ ] Real iPhone with Plus: Cancel on a coloured banner brings the old colours back
- [ ] Time the spinner after picking a cover
- [ ] Public profile: lists and comments open with a header, no remount
