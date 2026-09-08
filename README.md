# WorldSkills Ceremonies (Ceremonator)

An Electron desktop app for driving the medal-winner presentation screens during a WorldSkills
Closing Ceremony (and other skill competition ceremonies).

## Project model

Everything the app needs to run a ceremony lives in a **project folder**:

```
my-ceremony/
  project.json          # frames, sizes, ordering
  translations.json
  data/                  # skills.json, members.json, flags/*.png, sponsors/*
  template/              # slide html, grid.html, css, fonts, images — fully self-contained
```

`projects/bare-project` ships in this repo as the starter project — open it directly, or use it as
the seed for new ones ("Create New Project" copies it). Because it's a normal folder checked into
source control, any organiser's real project can live alongside it under `projects/` and be shared
with the whole team just by sharing the repo — no separate "bundle" build step required. The
startup screen lists everything under `projects/` alongside your OS-level recent-projects list.

## Installation

```
npm install
```

## Preparing data

`<project>/data/{skills,members}.json` and `data/flags/*.png` are trimmed pulls from the
WorldSkills API. Regenerate them for a project with:

```
node bin/fetch-skills.js
node bin/fetch-members.js
```

`project-name` defaults to `bare-project`; pass another project's folder name (under `projects/`)
to refresh its data instead. The optional second and third arguments select the catalogue event and
sponsor-source event respectively. For example, the starter project can retain event 611's skills
while importing sponsor assignments from event 579:

```
node bin/fetch-skills.js bare-project 611 579
```

`fetch-skills` also preserves the API's `sponsors` array for every skill and downloads each
unique `sponsor.logo.thumbnail` to `data/sponsors/`. It writes `sponsor.logo.local` as a relative
path, so presentation playback needs no network connection. A failed logo download is reported
and leaves the sponsor name as the on-screen fallback. The starter catalog deliberately uses
`"sponsors": []`; a populated entry looks like:

```json
{
  "name": "Example Partner",
  "sort": 10,
  "logo": { "id": 42, "thumbnail": "https://…", "local": "sponsors/42.png" }
}
```

## Output feeds

Projects remain schema version 2 and declare their own output feeds. There are no fixed feed
names: a project may configure 1–6 feeds with any identifiers and labels it likes, and the whole
app — window management, grid view, blanking, the tablet remote, Operator and the Stream Deck
command contract — follows whatever it declares. The first feed in the list is the _audience_
feed: anything that does not name a feed falls back to it. Projects without `feedTypes` are
treated as a single feed called `main`, retaining their legacy `gridConfig.frameWidth`/`frameHeight`.

```json
"feedTypes": [
  { "id": "wall",     "label": "LED Wall",       "gridSize": { "width": 1920, "height": 1080 } },
  { "id": "sponsors", "label": "Sponsor Ribbon", "gridSize": { "width": 1100, "height": 500 } }
]
```

`label` is optional (it defaults to the id) and is what the control panel shows on its Blank
buttons, feed pickers and reveal badges — the badge is the label's first letter, so `LED Wall`
badges as `L`.

Feed type and channel are independent: each configured feed can have Live and Preview outputs,
stored under `screen-<frame>-<feed>` and `screen-<frame>-<feed>-preview`. Preview requires a
matching Live window for the same feed. Blanking is per feed (Ctrl+B blanks the audience feed);
showing a Live slide releases all feed blanks. Blank displays the project's logo screen over the
current frame background/video, preserving the selected slide and reveal states for Live to resume.

### Slide routing

Which feed each kind of slide — and each of its reveals — belongs to is project configuration:

```json
"routing": {
  "callup":       { "base": ["wall"], "stateFeed": "wall", "states": { "Sponsors": "sponsors" },
                    "content": { "sponsors": "partners.html" } },
  "medals":       { "base": ["wall", "sponsors"], "stateFeed": "wall",
                    "content": { "sponsors": "partners.html" } },
  "mfe":          { "base": ["wall", "sponsors"], "stateFeed": "wall",
                    "content": { "sponsors": "partners.html" } },
  "bestOfNation": { "base": ["sponsors"], "stateFeed": "sponsors" },
  "albertVidal":  { "base": ["wall"], "stateFeed": "wall" }
}
```

- `base` — the feeds a slide shows on before any reveal is active. May be empty, in which case the
  slide appears on a feed only once a reveal routed there is on.
- `stateFeed` — the feed every reveal of that kind belongs to. Medal names and Best of Nation
  member codes come from the results spreadsheet, so they cannot be enumerated in config; this
  routes all of them at once. Defaults to the kind's first `base` feed.
- `states` — per-reveal overrides by name, for the reveals templates define themselves
  (`Countries`, `Sponsors`, `Name`).
- `content` — gives a feed a template of its own instead of the slide's, e.g. a sponsor wall
  showing `partners.html` while the audience feed shows the medals. The Callup `Sponsors` reveal
  is only offered when some feed is routed to show partners, so a single-feed project gets no
  dead button.

Omit `routing` (or any kind inside it) and the stock table above is used, built from feed order:
the first feed is the audience feed and a second one carries sponsors and Best of Nation. A
single-feed project therefore routes everything to that one feed, with no partners output. Every
feed id named in `routing` must exist in `feedTypes`, an unknown slide kind is rejected rather
than ignored, and `content` values must be a template filename — the project fails to open
otherwise, with the reason shown. `partners.html` is intentionally logo-only, with a name
fallback for unavailable/corrupt local images.

The Stream Deck plugin still offers a fixed Main/Secondary feed picker, so its keys only address
feeds that happen to use those ids.

---

For physical control keys, see the [Ceremonator Stream Deck plugin](plugins/streamdeck/README.md).
It supports slide navigation, configurable grids, live screens and per-frame/feed blanking
against local or remote instances.

```
npm start
```

This launches the Electron app (via `electron-forge start`) straight into the project chooser.
Pick a project, then use the Control window to import results and open Screen windows on each
display.

To build a distributable package:

```
npm run package   # unpacked app
npm run make       # platform installers/zips
```
