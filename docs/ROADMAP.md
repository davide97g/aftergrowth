# Roadmap

## Known issues and limits

- **Not deployed.** `npm run build && npm start` serves everything on one port; it will be hosted on
  the homelab mini PC.
- **No real accounts.** Identity is a secret token in the browser; clearing site data makes a new witch.
- **Reloads.** Travelling, visiting and saving the editor reload the page (behind the portal veil or
  a loading screen).
- **Editor is permissive.** Objects can overlap each other.
- **Clock is personal.** Each player has their own time of day and weather, also when visiting.
- **Gazebo can't be sat in**; only your own beehives make honey for you.
- **Phones** have touch controls and a layout, but haven't been tested on a real device.
- **Performance** hasn't been measured beyond a desktop browser.

## Ideas, roughly by size

Small:
- Materials (wood, stone) as well as coins for editor changes.
- More plots or a second field once all 12 are cleared.
- Paths and fences that snap together; a grid toggle in the editor.
- A tea table, bird bath (attracts birds), telescope for night skies.
- Ink quality: flower colour changes the ink (gold ink from yellow flowers is stronger).

Medium:
- Interior decorating: place furniture inside the cottage.
- More island shapes and a second terrace level.
- Seasons, and crops that prefer some of them.
- Contraptions on objects (a watering can that waters by itself, an enchanted lantern).
- Sound: a mixing pass on real speakers; a music track outside the cottage.

Large:
- Hosting with accounts, and live travel without a page reload.
- Shared glyphs in multiplayer: one witch draws the sigil, another closes the seal.
- Quests or letters from NPC witches that teach new sigils.
