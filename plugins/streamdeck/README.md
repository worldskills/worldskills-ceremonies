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
