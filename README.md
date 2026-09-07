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
{ "name": "Example Partner", "sort": 10,
  "logo": { "id": 42, "thumbnail": "https://…", "local": "sponsors/42.png" } }
```

## Output feeds

Projects remain schema version 2 and may declare the fixed programme feeds below. Main is required;
Secondary is optional. Projects without `feedTypes` are treated as Main-only, retaining their legacy
`gridConfig.frameWidth` and `frameHeight`.

```json
"feedTypes": [
  { "id": "main", "gridSize": { "width": 1100, "height": 500 } },
  { "id": "secondary", "gridSize": { "width": 800, "height": 500 } }
]
```

Feed type and channel are independent: each configured feed can have Live and Preview outputs.
Main keeps `screen-<frame>` and `screen-<frame>-preview` storage keys; Secondary uses
`screen-<frame>-secondary` and `screen-<frame>-secondary-preview`. Preview requires a matching
Live window for the same feed. Blanking is per feed (Ctrl+B blanks Main); showing a Live slide
releases all feed blanks.
Blank displays the project's logo screen over the current frame background/video,
preserving the selected slide and reveal states for Live to resume.

The stock routing sends Callup Countries and all medal/MFE presentation states to Main; Callup
Sponsors and the full medal/MFE Secondary output show skill sponsor logos. Best of Nation is
Secondary-only and Albert Vidal is Main-only. `partners.html` is intentionally logo-only, with a
name fallback for unavailable/corrupt local images.

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
