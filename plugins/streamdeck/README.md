# Ceremonator for Stream Deck

Six configurable key actions connect to local or remote Ceremonator instances over the existing
PIN-authenticated WebSocket server. Each key stores its own instance URL and PIN; keys with the
same connection settings share a socket. No additional server or port is required.

## Build and install

From the repository root, with the app dependencies installed:

```sh
npm run streamdeck:build
```

This assembles `../../out/streamdeck/org.worldskills.ceremonator.sdPlugin`, including the `ws` dependency
and its license. The installed plugin does not depend on this repository or a system Node.js.
It uses Stream Deck's Node.js 20 runtime; the manifest targets Stream Deck 6.6+ on macOS 12+
or Windows 10+.

To make a double-click installer, use the official [Elgato CLI](https://docs.elgato.com/streamdeck/cli/intro/)
(the current CLI requires Node.js 24+):

```sh
npx --yes --package=@elgato/cli streamdeck pack out/streamdeck/org.worldskills.ceremonator.sdPlugin --output out/streamdeck
```

The [pack command](https://docs.elgato.com/streamdeck/cli/commands/pack/) validates the plugin
before producing a `.streamDeckPlugin` installer. Double-click that file to install it.
For development, `streamdeck link out/streamdeck/org.worldskills.ceremonator.sdPlugin` links the
built folder instead. Rebuild after editing the source, then restart the plugin in Stream Deck.

Alternatively, with Stream Deck quit, copy the built `.sdPlugin` folder into the appropriate
plugin directory, then reopen Stream Deck:

- macOS: `~/Library/Application Support/com.elgato.StreamDeck/Plugins/`
- Windows: `%APPDATA%\Elgato\StreamDeck\Plugins\`

## Configure keys

Open a project in the updated Ceremonator app and enable Remote in its Remote settings.
Drag an action from the Ceremonator category onto a key. Enter the URL and six-digit PIN,
then Apply settings to connect. Frame choices appear once the control window publishes state.
Choose the target and Apply again. Duplicate configured keys to reuse their connection settings.

Use `http://127.0.0.1:17321` for the same computer, or the target computer's LAN URL and configured
port. `http`, `https`, `ws`, and `wss` URLs are accepted; the plugin connects at `/ws`. TLS requires
a reverse proxy in front of Ceremonator; preserve the target Host/Origin relationship. Plain `ws`
uses the same unencrypted transport as the existing LAN remote. PINs are stored in Stream Deck
action settings, so exported profiles containing these actions also contain their PINs.

| Action | Settings and behavior |
| --- | --- |
| Previous / Next Slide | Select one frame. Uses the operator UI's navigation, stepping through reveal states before changing slides. Select an initial Live slide in Ceremonator first. At the beginning/end, navigation does nothing. |
| Open Grid | Specify columns, cell width/height in pixels, Main/Secondary feed, Live/Preview channel and fullscreen. Optional comma-separated frame IDs choose a subset in that order; empty means all current frames. Opens on the target computer's primary display. |
| Open Live Screen | Select a frame and Main/Secondary feed. Uses the frame's configured size, position, monitor and fullscreen setting. |
| Continue Live — Next Slide | Select a frame. Shows the next slide directly, skipping remaining reveals on the old slide and clearing both feed blanks. Starts with the first slide if no slide is selected. At the end, reports an error without wrapping or clearing blanks. Does not open a window. |
| Blank Frames / Feed | Specify one or more comma-separated frame IDs and Main, Secondary, or All enabled feeds. Blanks both Live and Preview for the chosen feed(s), retaining slide/reveal state. Showing a Live slide clears all blanks on that frame. This is a blank command, not a toggle. |

Feed and channel are separate: Main/Secondary is the output programme, Live/Preview is its playback
channel. A Secondary feed must be enabled in the project. A Preview grid requires an already-open
Live grid with the same frames and output feed, matching the existing app restriction.

Output windows open on the **Ceremonator computer**, including when Stream Deck is remote.
Each Open press creates a new window. The commands do not stream video to the Stream Deck computer
or change the control panel's saved grid configuration.

The key shows Offline until connected. A green check means the control window acknowledged the
command; a warning means it failed or its result is unknown. Select the key to read the error in
its settings. Window-open acknowledgement means Electron accepted window creation, not that the
screen has finished rendering. Connections retry after a drop, but key presses are never queued
or replayed. An incorrect PIN stops retries until settings are applied again. If a connection drops
after a press, check the output before retrying: the command may already have executed.

## Stream Deck+ layout

The build also creates `out/streamdeck/Ceremonator-Stream-Deck-Plus.streamDeckProfile` (paths here
are relative to the repository root) and embeds it in the plugin installer. Install plugin v1.1.0
and import that profile by double-clicking it, or accept the profile offered during plugin installation.
The current installer is v1.1.1 at `out/streamdeck/org.worldskills.ceremonator.streamDeckPlugin`;
install this matching version before importing the latest profile.
Use the updated Ceremonator code for the new Continue Live command. The profile uses the ProfilesV3
format used by the installed Stream Deck app, targets the Stream Deck+ 4×2 keypad, and leaves dials
and the touch strip unassigned.

The home row is **Test | Prod | Frames | Blank**, with distinct test-flask, production-screen,
colored-frame and blank-screen icons. Each Test/Prod folder has
**Back | Show Grid view: Main | Show Grid view: Secondary | —** on its top row. All four grid keys use six columns, the Live channel,
all current frames, and fullscreen disabled:

| Folder | Main frame size | Secondary frame size |
| --- | --- | --- |
| Test | 770×350 | 640×400 |
| Prod | 1100×500 | 800×500 |

Frames folder:

```text
Prev Red   Prev Yellow   Prev Blue   Back
Next Red   Next Yellow   Next Blue   —
```

Frames is implemented as the second top-level page, reached through the Frames key; its Back key
returns to Home. Native child folders reserve the top-left key for Back and replaced Prev Red
during import, so this page arrangement is necessary to preserve the requested coordinates.
The remaining sections use native folders. The profile also omits the optional default-page alias
that caused duplicate-page remapping warnings during import.

Blank folder and each nested frame folder:

```text
Blank:        Back   Red          Yellow            Blue
Red/Yellow/Blue:
              Back   Blank Main   Blank Secondary   Live
```

The second row is empty in these Blank folders. Blank Main and Blank Secondary affect only that
frame's selected feed (both Live and Preview channels). Live advances to the next slide and clears
both feed blanks. The normal Prev/Next keys retain reveal-by-reveal navigation.

The profile maps Red to `a`, Yellow to `c`, and Blue to `b`, matching `projects/bare-project/project.json`.
Connection defaults are localhost port 17321 and the bundled project's default PIN, 173210.
To target another instance, edit `plugins/streamdeck/layout.json` and rebuild/reimport, or edit each
key's URL/PIN in Stream Deck. That file also holds the frame mappings and exact grid presets.
The generator writes only build artifacts; it never changes installed profiles.

## Manual verification

Runtime verification is intentionally left to the operator, per `../../.claude/CONTEXT.md`.

1. Connect locally, then from a second computer. Confirm frame discovery and independent keys for
   two different instances. Verify incorrect PIN, disabled Remote and unavailable-host feedback.
2. Select a slide with reveal states; verify Next/Previous match the operator UI and affect only
   the chosen frame. Verify a removed frame produces an error.
3. Open windowed and fullscreen grids with different columns, frame dimensions, subsets and feeds.
   Open the matching Live grid before Preview. Confirm disabled Secondary is rejected.
4. Open Live outputs for each enabled feed; verify the frame's configured display/size and confirm
   repeated presses create separate windows.
5. Blank Main on one frame, Secondary on another, then all enabled feeds on both. Verify isolation,
   matching Preview blanks and restoration when a Live slide is shown.
6. Disconnect during a press and reconnect. Confirm no delayed command executes; verify restart,
   PIN changes, settings edits, profile switches and Stream Deck Multi Actions on hardware.
7. Import the Stream Deck+ profile. Check all folders and Back buttons, then blank Main and
   Secondary independently on each color. Press Live while the current slide still has hidden
   reveals: the next slide should appear and both feed blanks should clear. Verify the first-slide
   case and that the final-slide case reports an error while preserving the current blank state.

## Protocol and implementation

The plugin implements Elgato's documented [WebSocket registration and key events](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/)
and [property inspector API](https://docs.elgato.com/streamdeck/sdk/references/websocket/ui/).
It authenticates with `{ "type": "auth", "pin": "…" }` and requires the `stream-deck-v1` capability
in `auth-ok`, so an older Ceremonator cannot silently accept unsupported commands.

Commands use `{ "type": "command", "id": "unique-request-id", "command": { … } }`. Results are
`{ "type": "command-result", "id": "unique-request-id", "ok": true }` or `ok: false` with `error`.
The server validates parameters, assigns an internal correlation ID, forwards to the control
renderer and returns its result. Pending requests time out and are discarded on disconnect.
The existing tablet action protocol and HTTP static-file allowlist are unchanged.

Command shapes are defined in `../../src/main/remote-commands.js`; execution is in
`../../src/js/control/control-remote.js`. `remote-client.js` owns connection/authentication/heartbeat
and pending results; `plugin.js` owns Stream Deck events and shared connections; `inspector.*`
owns the settings form. Icons are editable SVG source assets.
