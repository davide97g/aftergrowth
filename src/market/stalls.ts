import { Camera, Vector3 } from "three";
import { ITEMS, type ItemCat, type ItemId, STALL, isItem, stallBounds } from "../../shared/items";
import { marketDay, swing } from "../../shared/prices";
import type { Listing } from "../../shared/protocol";
import type { Action } from "../game/interact";
import { type Save, count, give, take } from "../game/state";
import type { Me, Net } from "../net/net";
import type { Hud } from "../ui/hud";
import type { IslandWorld } from "../world/world";
import { SHOPS, buyPrice } from "./shops";

const CATS: { id: ItemCat | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "crop", label: "Harvest" },
  { id: "produce", label: "Goods" },
  { id: "flower", label: "Flowers" },
  { id: "material", label: "Materials" },
  { id: "charm", label: "Charms" },
  { id: "seed", label: "Seeds" },
];

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** The cheapest a market shop sells an item for today, to compare a stall's price against. */
function shopPrice(s: Save, id: ItemId): number | null {
  let best: number | null = null;
  for (const shop of SHOPS) {
    for (const o of shop.sells) {
      if (!("item" in o) || o.item !== id) continue;
      const p = buyPrice(shop, o, s, marketDay());
      if (p !== null && (best === null || p < best)) best = p;
    }
  }
  return best;
}

interface Booth { pos: Vector3; front: Vector3; tag: HTMLElement; seller: string | null }

/**
 * Player stalls on the market. The server holds listed goods; buying shrinks the listing on the
 * server first and the seller is paid by a `sale` deed, live or when they next come online.
 * The notice board lists everything; the eight booths show the most recent sellers.
 */
export class Stalls {
  private listings: Listing[] = [];
  private panel = document.getElementById("stalls")!;
  private view: { kind: "board"; seller: string | null } | { kind: "mine" } = { kind: "board", seller: null };
  private cat: ItemCat | "all" = "all";
  private booths: Booth[] = [];
  private buying: { id: string; qty: number; coins: number }[] = [];
  private listing: { item: ItemId; qty: number }[] = [];

  constructor(private net: Net, private me: Me, private state: Save, private world: IslandWorld, private camera: Camera, private hud: Hud, private onChange: (msg?: string) => void) {
    const labels = document.getElementById("labels")!;
    for (const o of world.layout.objects.filter((x) => x.kind === "stall_booth")) {
      const tag = document.createElement("div");
      tag.className = "nametag booth";
      tag.innerHTML = `<span class="name"><i></i><b></b></span>`;
      tag.hidden = true;
      labels.append(tag);
      const front = new Vector3(Math.sin(o.rot), 0, Math.cos(o.rot));
      this.booths.push({ pos: new Vector3(o.x, 0, o.z), front, tag, seller: null });
    }
    net.on("listings", (m) => {
      this.listings = m.listings;
      this.assignBooths();
      this.render();
    });
    net.on("bought", (m) => this.onBought(m));
    net.on("listed", (m) => this.onListed(m));
    net.send({ t: "listings" });
    document.getElementById("stalls-close")!.addEventListener("click", () => this.close());
    this.panel.addEventListener("click", (e) => this.click(e));
    // picking another item resets the amount and the suggested price
    this.panel.addEventListener("change", (e) => {
      const sel = e.target as HTMLSelectElement;
      if (sel.id !== "stall-item") return;
      const o = sel.selectedOptions[0].dataset;
      const qty = this.panel.querySelector("#stall-qty") as HTMLInputElement;
      const price = this.panel.querySelector("#stall-price") as HTMLInputElement;
      qty.max = String(Math.min(Number(o.have), STALL.maxQty));
      qty.value = "1";
      Object.assign(price, { min: o.min, max: o.max, value: o.sug });
    });
    addEventListener("keydown", (e) => {
      if (e.code === "Escape" && this.isOpen) this.close();
    });
  }

  get isOpen() {
    return !this.panel.hidden;
  }

  close() {
    this.panel.hidden = true;
  }

  private open(view: Stalls["view"]) {
    this.view = view;
    this.panel.hidden = false;
    this.render();
  }

  /** The eight booths go to the sellers who listed most recently. */
  private assignBooths() {
    const latest = new Map<string, number>();
    for (const l of this.listings) latest.set(l.seller, Math.max(latest.get(l.seller) ?? 0, l.at));
    const sellers = [...latest.keys()].sort((a, b) => latest.get(b)! - latest.get(a)!);
    this.booths.forEach((b, i) => {
      b.seller = sellers[i] ?? null;
      const l = this.listings.find((x) => x.seller === b.seller);
      b.tag.hidden = !l;
      if (!l) return;
      (b.tag.querySelector("i") as HTMLElement).style.background = l.color;
      b.tag.querySelector("b")!.textContent = `${l.name}'s stall`;
    });
  }

  update() {
    for (const b of this.booths) {
      if (b.tag.hidden) continue;
      const p = b.pos.clone().setY(2.9).project(this.camera);
      b.tag.style.transform = `translate(${((p.x + 1) / 2) * innerWidth}px, ${((1 - p.y) / 2) * innerHeight}px) translate(-50%, -100%)`;
    }
  }

  /** Interaction provider: the notice board, and the booths. */
  action = (near: Vector3): Action | null => {
    const board = this.world.layout.objects.find((o) => o.kind === "notice_board");
    if (board && Math.hypot(board.x - near.x, board.z - near.z) < 1.8) {
      const n = this.listings.length;
      return { pos: new Vector3(board.x, 0, board.z), reach: 1.8, label: `Notice board · ${n ? `${n} ${n === 1 ? "listing" : "listings"}` : "no listings yet"}`, act: () => this.open({ kind: "board", seller: null }) };
    }
    for (const b of this.booths) {
      const pos = b.pos.clone().addScaledVector(b.front, 1.1);
      if (pos.distanceTo(near) > 1.3) continue;
      const seller = b.seller ? this.listings.find((l) => l.seller === b.seller) : null;
      if (seller && seller.seller !== this.me.id) {
        return { pos, reach: 1.3, label: `${seller.name}'s stall`, act: () => this.open({ kind: "board", seller: seller.seller }) };
      }
      return { pos, reach: 1.3, label: seller ? "Your stall" : "An empty stall · set up your own", act: () => this.open({ kind: "mine" }) };
    }
    return null;
  };

  // ---------- buying and listing ----------

  private buy(id: string, qty: number) {
    const l = this.listings.find((x) => x.id === id);
    if (!l || !this.net.online) return;
    const coins = qty * l.price;
    if (this.state.coins < coins) return;
    // the coins are set aside until the server answers, and come back if the sale falls through
    this.state.coins -= coins;
    this.buying.push({ id, qty, coins });
    this.net.send({ t: "buy", id, qty });
    this.onChange();
  }

  private onBought(m: { ok: boolean; id: string; item: string; qty: number; why?: string }) {
    const i = this.buying.findIndex((b) => b.id === m.id && b.qty === m.qty);
    const held = i >= 0 ? this.buying.splice(i, 1)[0] : null;
    if (m.ok && isItem(m.item)) {
      give(this.state, m.item, m.qty);
      this.onChange(`+${m.qty} ${ITEMS[m.item].name.toLowerCase()}`);
    } else {
      if (held) this.state.coins += held.coins;
      this.hud.toast("Not this time", m.why ?? "The stall couldn't sell that.");
      this.onChange();
    }
  }

  private list(item: ItemId, qty: number, price: number) {
    if (!this.net.online) return this.hud.toast("The market is quiet", "The island server is offline, so stalls are closed.");
    if (!take(this.state, item, qty)) return;
    this.listing.push({ item, qty });
    this.net.send({ t: "list", item, qty, price });
    this.onChange();
  }

  private onListed(m: { ok: boolean; item: string; qty: number; why?: string }) {
    const i = this.listing.findIndex((l) => l.item === m.item && l.qty === m.qty);
    const was = i >= 0 ? this.listing.splice(i, 1)[0] : null;
    if (m.ok) {
      this.hud.toast("On your stall", "You'll be paid when it sells, even if you're away.");
    } else {
      if (was) give(this.state, was.item, was.qty);
      this.hud.toast("The stall says no", m.why ?? "");
    }
    this.onChange();
  }

  // ---------- the panel ----------

  private click(e: MouseEvent) {
    const b = (e.target as HTMLElement).closest("button") as HTMLButtonElement | null;
    if (!b) return;
    const d = b.dataset;
    if (d.view === "board") this.view = { kind: "board", seller: null };
    else if (d.view === "mine") this.view = { kind: "mine" };
    else if (d.cat) this.cat = d.cat as typeof this.cat;
    else if (d.buy) {
      const l = this.listings.find((x) => x.id === d.buy);
      if (l) this.buy(l.id, d.n === "all" ? Math.min(l.qty, Math.floor(this.state.coins / l.price)) : 1);
    } else if (d.unlist) this.net.send({ t: "unlist", id: d.unlist });
    else if (d.act === "list") {
      const item = (this.panel.querySelector("#stall-item") as HTMLSelectElement | null)?.value as ItemId | undefined;
      const qty = Math.floor(Number((this.panel.querySelector("#stall-qty") as HTMLInputElement | null)?.value));
      const price = Math.floor(Number((this.panel.querySelector("#stall-price") as HTMLInputElement | null)?.value));
      if (item && isItem(item) && qty > 0) this.list(item, qty, price);
    }
    this.render();
  }

  render() {
    if (!this.isOpen) return;
    const v = this.view;
    const seller = v.kind === "board" && v.seller ? this.listings.find((l) => l.seller === v.seller) : null;
    this.panel.querySelector("h2")!.textContent = v.kind === "mine" ? "Your stall" : seller ? `${seller.name}'s stall` : "Notice board";
    const tabs = `<div class="tabs" role="tablist">
      <button type="button" role="tab" data-view="board" aria-selected="${v.kind === "board"}">All stalls</button>
      <button type="button" role="tab" data-view="mine" aria-selected="${v.kind === "mine"}">Your stall</button>
    </div>`;
    const body = !this.net.online
      ? `<p class="note">The island server is offline, so the stalls are closed.</p>`
      : v.kind === "mine" ? this.mine() : this.board(v.seller);
    document.getElementById("stalls-body")!.innerHTML = `<p class="coins">${this.state.coins} coins</p>${tabs}${body}`;
  }

  private board(seller: string | null) {
    const s = this.state;
    const shown = this.listings.filter((l) => isItem(l.item) && (!seller || l.seller === seller) && (this.cat === "all" || ITEMS[l.item as ItemId].cat === this.cat));
    const chips = seller ? "" : `<div class="chips">${CATS.map((c) => `<button type="button" data-cat="${c.id}" aria-pressed="${this.cat === c.id}">${c.label}</button>`).join("")}</div>`;
    const rows = shown.sort((a, b) => a.item.localeCompare(b.item) || a.price - b.price).map((l) => {
      const id = l.item as ItemId;
      const shop = shopPrice(s, id);
      const mine = l.seller === this.me.id;
      const can = !mine && s.coins >= l.price;
      return `<tr>
        <th scope="row">${ITEMS[id].name}<small><i style="background:${esc(l.color)}"></i>${esc(l.name)}</small></th>
        <td>${l.qty}</td>
        <td class="price">${l.price}c${shop !== null ? `<small>shops ${shop}c</small>` : ""}</td>
        <td>${mine ? `<small>yours</small>` : `<button data-buy="${l.id}" data-n="1" ${can ? "" : "disabled"}>+1</button><button data-buy="${l.id}" data-n="all" ${can ? "" : "disabled"}>All</button>`}</td>
      </tr>`;
    }).join("");
    return `${chips}${rows
      ? `<div class="table-wrap"><table><thead><tr><th></th><th>Left</th><th>Each</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
      : `<p class="note">${this.listings.length ? "Nothing in this corner of the board." : "No one is selling yet. Be the first: set up your stall."}</p>`}`;
  }

  private mine() {
    const s = this.state;
    const ours = this.listings.filter((l) => l.seller === this.me.id && isItem(l.item));
    const rows = ours.map((l) => `<tr><th scope="row">${ITEMS[l.item as ItemId].name}</th><td>${l.qty}</td><td class="price">${l.price}c</td><td><button data-unlist="${l.id}">Take down</button></td></tr>`).join("");
    const held = (Object.keys(s.bag) as ItemId[]).filter((id) => isItem(id) && count(s, id) > 0);
    const first = held[0];
    const form = ours.length >= STALL.slots
      ? `<p class="note">Your stall is full (${STALL.slots} listings). Take something down to list more.</p>`
      : !first ? `<p class="note">Your satchel is empty. Bring something to sell.</p>`
      : `<div class="list-form">
          <label>Item <select id="stall-item">${held.map((id) => `<option value="${id}" data-have="${count(s, id)}" data-min="${stallBounds(id).min}" data-max="${stallBounds(id).max}" data-sug="${suggest(id)}">${ITEMS[id].name} (${count(s, id)})</option>`).join("")}</select></label>
          <label>How many <input id="stall-qty" type="number" min="1" max="${Math.min(count(s, first), STALL.maxQty)}" value="1"></label>
          <label>Each <input id="stall-price" type="number" min="${stallBounds(first).min}" max="${stallBounds(first).max}" value="${suggest(first)}"></label>
          <button type="button" data-act="list" class="primary">Put on the stall</button>
        </div>
        <p class="note">Goods leave your satchel while they're on the stall. You're paid when they sell, even while away; anything unsold comes back after ${STALL.days} days, or when you take it down.</p>`;
    return `${rows ? `<div class="table-wrap"><table><thead><tr><th></th><th>Left</th><th>Each</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="note">Nothing on your stall yet.</p>`}${form}`;
  }
}

/** A fair asking price: today's shop price for it. */
function suggest(id: ItemId) {
  const b = stallBounds(id);
  return Math.min(b.max, Math.max(b.min, Math.round(ITEMS[id].price * swing(id, marketDay()))));
}
