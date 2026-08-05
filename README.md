# WorldSkills Ceremonies (Ceremonator)

An Electron desktop app for driving the medal-winner presentation screens during a WorldSkills
Closing Ceremony (and other skill competition ceremonies).

## Project model

Everything the app needs to run a ceremony lives in a **project folder**:

```
my-ceremony/
  project.json          # frames, sizes, ordering
  translations.json
  data/                  # skills.json, members.json, flags/*.png
  template/              # slide html, css, fonts, images — fully self-contained
```

`projects/bare-project` ships in this repo as the starter project — open it directly, or use it as
the seed for new ones ("Create New Project" copies it). Because it's a normal folder checked into
source control, any organiser's real project can live alongside it under `projects/` and be shared
with the whole team just by sharing the repo — no separate "bundle" build step required. The
startup screen lists everything under `projects/` alongside your OS-level recent-projects list.

`boilerplate/screens/*.html` is a plain, uncoupled reference copy of the slide templates (no css/
fonts/images) — handy for reading or diffing, not used at runtime.

## Installation

```
npm install
```

## Preparing data

`<project>/data/{skills,members}.json` and `data/flags/*.png` are trimmed pulls from the
WorldSkills API. Regenerate them for a project with:

```
bin/fetch.js [project-name]
```

`project-name` defaults to `bare-project`; pass another project's folder name (under `projects/`)
to refresh its data instead.

## Usage

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

## Contributing

The source code has been made available primarily for WorldSkills Members organizing their own
skill competitions. We highly encourage them to share their own versions so knowledge can be
shared — that's exactly what the `projects/` folder is for.

Fork this repository to start developing your own version. To suggest changes to this repository
create a new branch in your own fork based on this [master branch](https://github.com/worldskills/worldskills-ceremonies/tree/master)
and submit a pull request.
