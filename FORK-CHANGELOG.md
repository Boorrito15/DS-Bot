# Fork changelog

Changes made to this fork of DS Bot, newest first. Upstream's own releases are in [CHANGELOG.md](CHANGELOG.md) and are not repeated here. This file lists only what we changed ourselves, on top of the upstream code.

Each entry says what changed and where it applies: **Desktop** (the browser page and the desktop app share one interface), **Desktop app** (the Electron window specifically), or **Phone** (the iOS and Android app, which needs a rebuild to pick a change up).

Every commit on our branch appears here. Upstream commits that arrived through a merge do not.

## 2026-11-27

**Desktop**

- Fix: the working row's count and the plan card under a finished turn now come from the same list and the same sum. Before, a row could read 0/7 beside a card reading 6/7. The card is a card rather than loose lines, folds past three steps, and stays in the transcript when the reader scrolls back. ([7df57204])

- New: the watcher, a strip above the composer that says what has gone wrong with the team's work, so a Bot does not sit still unwatched. Three things only: a Bot stuck on one step past a limit, a Bot or an approval waiting on you past a limit, and a long job reaching its end. Each line opens the Bot it names and can be dismissed; nothing is said twice. The switches and limits sit in the team's preferences, defaulting to 5, 2 and 10 minutes. ([408a9fb6])

**Desktop**

- New: a test copy of the server, `scripts/test-server.sh start | stop | status`, so a branch can be tried before it goes live. It runs this checkout on port 61830 with its own home in `.test-server`, and cannot see the live team. ([a1d6a157])

**Desktop**

- Change: the reading pill over a long reply loses its back-to-start arrow. The section name beside it already jumps to where the reader is. ([6bccd07e])

**Phone (build)**

- Fix: each iOS build now carries a build number that only goes up, taken from the commit count. Before, every build of a release read the same and SideStore never offered the update. ([88516b3a])

**Desktop**

- Fix: a press on the details panel's top row no longer starts a window drag. The buttons in that row only answered on their lower half before. ([c55316b5])
- Fix: the title between the back and close buttons in a Bot's settings no longer swallows a press meant for either button. ([28f96501])
- Fix: a press at the top of the chat header now reaches the chat underneath instead of being dropped. ([ecd23bc8])
- Fix: the settings close button answers from 6px outside its circle, not only inside it. ([6232a6f0])

## 2026-11-25

**Desktop**

- Fix: the working row says what the Bot is doing once, not five times. At most two steps, one clock, no strip over the composer. ([fab63af9])
- Fix: the stop button beside the composer now stops the Bot's turn. It used to set a flag on the wrong session and do nothing. ([5a7855cc])
- Fix: every React hook sits above its component's early return, which is what made the Bot interface vanish from the chat when a turn started. A test scans for the pattern now. ([75ce6722])
- Fix: the sidebar's four top buttons accept a press from 5px outside the circle. ([fb62aac5])
- Add: a Server page in Settings with a restart button. It refuses when nothing would start the server again. ([487ee137])
- Add: the page offers a reload when it is running older code than the server. ([a053bd22])
- Add: a page crash is kept as an error instead of the interface silently vanishing. ([7b764c93])
- Add: a turn's plan is kept on that turn's tail, so a finished turn can be read back. ([855a2926])
- Add: the running step is timed, and the sidebar names the step a Bot is on. ([9d730efe])
- Add: the working row shows how far the Bot's own plan has got, as a count like 3/6. ([02716e017])
- Add: a running turn lists its steps under the working row. ([0b2dbb25])
- Change: a step says what it does in words ("Run the unit tests") instead of naming its tool. ([e6f4e707], [2015adb9])
- Change: the working row stays for the whole turn and holds "Done" for a moment at the end. ([936b46c0])
- Change: the chat row reads the server's work state, so it agrees with the sidebar. ([1e8277e1])
- Change: a running strip over the composer named the Bot, step, count and time. Removed the same day; it repeated the row. ([634cc89a])

**Desktop app**

- Add: a Servers window that keeps a list of computers to open, instead of only the command-line flag. ([6b0039ce])
- Fix: opening a server that asks for a sign-in keeps the sign-in part of the address. ([82ce4be1])
- Fix: the Servers window keeps its last row inside the frame. ([262a6137])

## 2026-11-21

**Phone**

- Fix: a mention in the draft is marked, and deleting it removes it whole instead of one letter at a time. ([20455eaf])

## 2026-11-20

**Phone**

- Add: folders in the drawer, with chats dragged onto a folder header and sheets drawn across the whole screen, plus folders in the demo team. ([5fa11684], [e8a30073], [ce54f96b], [dc70e097], [5bf57ed1])
- Add: a sidebar that takes the whole page, and the app opens on the team list so a swipe right goes back to it. ([bcbb92df], [5b200a2d])
- Add: holding a chat opens the system's own menu: mark as unread, pin, move to a folder, share, hide, copy ID, delete, rename, duplicate. ([19267610], [3f3dc0c5], [739eb5ae], [bb8c847e])
- Add: move a folder up or down, and the Create button sits at the bottom of the new Bot form. ([3185038a], [de4bd3e2])
- Add: system menus for attachments (photo, take photo, scan, file) and for a Bot's long press. ([5d107801], [3f3dc0c5])
- Add: a glass search bar at the bottom of the list, with the settings button to its left. ([6540ae2c])
- Add: "Needs you" sits in the top corner as an inbox instead of the words "DS Bot". ([228ad154])
- Add: a slash menu in the composer, asking the computer which rows a chat offers, and "@" to call a Bot by name. ([792cf67c], [fdaf2080], [79f698b4])
- Add: scheduled tasks from the plus sheet and from Settings. ([0c733153], [5881f372])
- Add: usage counted the way the desktop counts it. ([6b0bc18e])
- Add: connector logos, and Gmail and Google Drive as connectors. ([7010beea], [bb7972c6])
- Add: the Feedback, Local agents, Bot models, Computer use, Browser and IM settings pages, and choosing the model a new Bot starts on. ([fadbb59b], [d5ccba58], [0264d0aa], [49859018], [37a8c8c1])
- Fix: a tap opens the chat, and a collapsed folder opens again. ([f4073a2f])
- Fix: rows are ordered by the newest message in them, and a chat's newest line is reported as read. ([6d83f84d], [a281709c])
- Fix: a chat opens without the deprecated navigation call. ([e67b4b63])

**Desktop**
- Add: usage rings read the account that signed in, not the command-line tool on the machine. ([78d9074c])

**Desktop app**

- Add: connect to a computer that already runs the team. ([4764a6bd])

## 2026-11-19

**Phone**

## 2026-11-17

**Phone (build)**

- The iOS build runs on GitHub Actions and signs an unsigned device build. It builds the Expo modules from source, because the precompiled ones caused an ABI mismatch that crashed the app on launch. ([0f19c2df], [3c5e5e65], [17f04c93], [7623f189], [21fbb7ea])

[c55316b5]: https://github.com/Boorrito15/DS-Bot/commit/c55316b5
[28f96501]: https://github.com/Boorrito15/DS-Bot/commit/28f96501
[ecd23bc8]: https://github.com/Boorrito15/DS-Bot/commit/ecd23bc8
[6232a6f0]: https://github.com/Boorrito15/DS-Bot/commit/6232a6f0
[fab63af9]: https://github.com/Boorrito15/DS-Bot/commit/fab63af9
[5a7855cc]: https://github.com/Boorrito15/DS-Bot/commit/5a7855cc
[75ce6722]: https://github.com/Boorrito15/DS-Bot/commit/75ce6722
[fb62aac5]: https://github.com/Boorrito15/DS-Bot/commit/fb62aac5
[487ee137]: https://github.com/Boorrito15/DS-Bot/commit/487ee137
[a053bd22]: https://github.com/Boorrito15/DS-Bot/commit/a053bd22
[7b764c93]: https://github.com/Boorrito15/DS-Bot/commit/7b764c93
[855a2926]: https://github.com/Boorrito15/DS-Bot/commit/855a2926
[9d730efe]: https://github.com/Boorrito15/DS-Bot/commit/9d730efe
[02716e017]: https://github.com/Boorrito15/DS-Bot/commit/02716e017
[0b2dbb25]: https://github.com/Boorrito15/DS-Bot/commit/0b2dbb25
[e6f4e707]: https://github.com/Boorrito15/DS-Bot/commit/e6f4e707
[2015adb9]: https://github.com/Boorrito15/DS-Bot/commit/2015adb9
[936b46c0]: https://github.com/Boorrito15/DS-Bot/commit/936b46c0
[1e8277e1]: https://github.com/Boorrito15/DS-Bot/commit/1e8277e1
[634cc89a]: https://github.com/Boorrito15/DS-Bot/commit/634cc89a
[6b0039ce]: https://github.com/Boorrito15/DS-Bot/commit/6b0039ce
[82ce4be1]: https://github.com/Boorrito15/DS-Bot/commit/82ce4be1
[262a6137]: https://github.com/Boorrito15/DS-Bot/commit/262a6137
[20455eaf]: https://github.com/Boorrito15/DS-Bot/commit/20455eaf
[739eb5ae]: https://github.com/Boorrito15/DS-Bot/commit/739eb5ae
[bb8c847e]: https://github.com/Boorrito15/DS-Bot/commit/bb8c847e
[5fa11684]: https://github.com/Boorrito15/DS-Bot/commit/5fa11684
[e8a30073]: https://github.com/Boorrito15/DS-Bot/commit/e8a30073
[ce54f96b]: https://github.com/Boorrito15/DS-Bot/commit/ce54f96b
[bcbb92df]: https://github.com/Boorrito15/DS-Bot/commit/bcbb92df
[5b200a2d]: https://github.com/Boorrito15/DS-Bot/commit/5b200a2d
[19267610]: https://github.com/Boorrito15/DS-Bot/commit/19267610
[3f3dc0c5]: https://github.com/Boorrito15/DS-Bot/commit/3f3dc0c5
[3185038a]: https://github.com/Boorrito15/DS-Bot/commit/3185038a
[de4bd3e2]: https://github.com/Boorrito15/DS-Bot/commit/de4bd3e2
[5d107801]: https://github.com/Boorrito15/DS-Bot/commit/5d107801
[6540ae2c]: https://github.com/Boorrito15/DS-Bot/commit/6540ae2c
[228ad154]: https://github.com/Boorrito15/DS-Bot/commit/228ad154
[792cf67c]: https://github.com/Boorrito15/DS-Bot/commit/792cf67c
[fdaf2080]: https://github.com/Boorrito15/DS-Bot/commit/fdaf2080
[79f698b4]: https://github.com/Boorrito15/DS-Bot/commit/79f698b4
[0c733153]: https://github.com/Boorrito15/DS-Bot/commit/0c733153
[5881f372]: https://github.com/Boorrito15/DS-Bot/commit/5881f372
[6b0bc18e]: https://github.com/Boorrito15/DS-Bot/commit/6b0bc18e
[7010beea]: https://github.com/Boorrito15/DS-Bot/commit/7010beea
[bb7972c6]: https://github.com/Boorrito15/DS-Bot/commit/bb7972c6
[fadbb59b]: https://github.com/Boorrito15/DS-Bot/commit/fadbb59b
[d5ccba58]: https://github.com/Boorrito15/DS-Bot/commit/d5ccba58
[0264d0aa]: https://github.com/Boorrito15/DS-Bot/commit/0264d0aa
[49859018]: https://github.com/Boorrito15/DS-Bot/commit/49859018
[37a8c8c1]: https://github.com/Boorrito15/DS-Bot/commit/37a8c8c1
[f4073a2f]: https://github.com/Boorrito15/DS-Bot/commit/f4073a2f
[6d83f84d]: https://github.com/Boorrito15/DS-Bot/commit/6d83f84d
[a281709c]: https://github.com/Boorrito15/DS-Bot/commit/a281709c
[e67b4b63]: https://github.com/Boorrito15/DS-Bot/commit/e67b4b63
[78d9074c]: https://github.com/Boorrito15/DS-Bot/commit/78d9074c
[4764a6bd]: https://github.com/Boorrito15/DS-Bot/commit/4764a6bd
[0f19c2df]: https://github.com/Boorrito15/DS-Bot/commit/0f19c2df
[3c5e5e65]: https://github.com/Boorrito15/DS-Bot/commit/3c5e5e65
[17f04c93]: https://github.com/Boorrito15/DS-Bot/commit/17f04c93
[7623f189]: https://github.com/Boorrito15/DS-Bot/commit/7623f189
[21fbb7ea]: https://github.com/Boorrito15/DS-Bot/commit/21fbb7ea
[dc70e097]: https://github.com/Boorrito15/DS-Bot/commit/dc70e097
[5bf57ed1]: https://github.com/Boorrito15/DS-Bot/commit/5bf57ed1
[88516b3a]: https://github.com/Boorrito15/DS-Bot/commit/88516b3a
[6bccd07e]: https://github.com/Boorrito15/DS-Bot/commit/6bccd07e
