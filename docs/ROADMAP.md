# Roadmap

## Known issues and limits

- **Hosted on one homelab box** (`deploy/README.md`): one container, one JSON file of state, no
  replicas. Back it up; a disk failure loses every island.
- **Accounts are minimal.** No email verification and no password reset yet: a forgotten password
  means a new witch.
- **Friends are by code.** No search by name, no blocking beyond unfriending.
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
- Live travel without a page reload.
- Password reset by email; signing in with a passkey.
- Shared glyphs in multiplayer: one witch draws the sigil, another closes the seal.
- Quests or letters from NPC witches that teach new sigils.
