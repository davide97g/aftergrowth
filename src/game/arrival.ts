import { HUB_ID, type IslandSnap, KINGDOM_ID, MARKET_ID } from "../../shared/protocol";
import { type IslandLayout, commonsLayout, defaultHome, marketLayout, sanitizeLayout } from "../island/layout";
import { kingdomLayout } from "../kingdom/world";
import type { Me } from "../net/account";
import type { Net } from "../net/net";
import { seedOf } from "../world/world";
import type { Save } from "./state";

/** Where this page load takes place: your island, someone else's, the commons or the market. */
export interface Arrival {
  islandId: string;
  commons: boolean;
  market: boolean;
  /** Aetherhold, the royal city */
  kingdom: boolean;
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
  const market = islandId === MARKET_ID;
  const kingdom = islandId === KINGDOM_ID;
  const visiting = islandId !== me.id && !commons && !market && !kingdom;
  net.send({ t: "enter", island: islandId });
  let host: IslandSnap | null = null;
  if (visiting) {
    host = (await net.next("island", 5000))?.island ?? null;
    if (!host) return null;
  }
  return { islandId, commons, market, kingdom, visiting, host, viaPortal: params.get("via") === "portal" };
}

/** Your own saved island, the host's published one, the commons or the market. */
export function layoutFor(a: Arrival, me: Me, state: Save): IslandLayout {
  if (a.commons) return commonsLayout();
  if (a.market) return marketLayout();
  if (a.kingdom) return kingdomLayout();
  if (a.host) return sanitizeLayout(a.host.layout, defaultHome(seedOf(a.host.id)));
  return sanitizeLayout(state.island, defaultHome(seedOf(me.id)));
}
