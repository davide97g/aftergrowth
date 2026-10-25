import { HUB_ID, type IslandSnap } from "../../shared/protocol";
import { type IslandLayout, commonsLayout, defaultHome, sanitizeLayout } from "../island/layout";
import type { Me, Net } from "../net/net";
import { seedOf } from "../world/world";
import type { Save } from "./state";

/** Where this page load takes place: your island, someone else's, or the commons. */
export interface Arrival {
  islandId: string;
  commons: boolean;
  visiting: boolean;
  /** the visited island's published snapshot (null at home and on the commons) */
  host: IslandSnap | null;
  viaPortal: boolean;
}

/**
 * Read `?island=` and `?via=portal`, join the island's room on the server, and fetch the host's
 * snapshot when visiting. Returns null if the visited island can't be reached.
 */
export async function arrive(me: Me, net: Net, params: URLSearchParams): Promise<Arrival | null> {
  const target = params.get("island");
  const islandId = target && target !== me.id ? target : me.id;
  const commons = islandId === HUB_ID;
  const visiting = islandId !== me.id && !commons;
  net.send({ t: "enter", island: islandId });
  let host: IslandSnap | null = null;
  if (visiting) {
    host = (await net.next("island", 5000))?.island ?? null;
    if (!host) return null;
  }
  return { islandId, commons, visiting, host, viaPortal: params.get("via") === "portal" };
}

/** Your own saved island, the host's published one, or the commons. */
export function layoutFor(a: Arrival, me: Me, state: Save): IslandLayout {
  if (a.commons) return commonsLayout();
  if (a.host) return sanitizeLayout(a.host.layout, defaultHome(seedOf(a.host.id)));
  return sanitizeLayout(state.island, defaultHome(seedOf(me.id)));
}
