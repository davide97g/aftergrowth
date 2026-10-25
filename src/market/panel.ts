import { ITEMS, type ItemId } from "../../shared/items";
import { marketDay, msToNextDay } from "../../shared/prices";
import { type Save, count, give, inkMax, take } from "../game/state";
import { type Offer, type Shop, buyPrice, gear, offerKey, offerName, sellPrice, todaysSpecial, trend } from "./shops";

const ARROW = { [-1]: `<i class="down" title="Cheaper than yesterday">↓</i>`, 0: "", 1: `<i class="up" title="Dearer than yesterday">↑</i>` };

/** The buy-and-sell panel for any shop: the crate at home or a shop on the market island. */
export class ShopPanel {
  private panel = document.getElementById("market")!;
  private shop: Shop | null = null;
  private tab: "buy" | "sell" = "buy";

  constructor(private state: Save, private onChange: (msg?: string) => void) {
    document.getElementById("market-close")!.addEventListener("click", () => this.close());
    this.panel.addEventListener("click", (e) => this.click(e));
    addEventListener("keydown", (e) => {
      if (e.code === "Escape" && this.isOpen) this.close();
    });
  }

  get isOpen() {
    return !this.panel.hidden;
  }

  open(shop: Shop) {
    if (this.shop !== shop) this.tab = shop.sells.length ? "buy" : "sell";
    this.shop = shop;
    this.panel.hidden = false;
    this.render();
  }

  close() {
    this.panel.hidden = true;
  }

  private click(e: MouseEvent) {
    const b = (e.target as HTMLElement).closest("button[data-act]") as HTMLButtonElement | null;
    const shop = this.shop;
    if (!b || !shop) return;
    const s = this.state;
    const day = marketDay();
    const d = b.dataset;
    if (d.act === "tab") {
      this.tab = d.tab as typeof this.tab;
    } else if (d.act === "buy") {
      const o = shop.sells[Number(d.i)];
      const price = buyPrice(shop, o, s, day);
      if (price === null) return;
      let n = Math.min(Number(d.n), Math.floor(s.coins / price));
      if ("ink" in o) n = Math.min(n, inkMax(s) - s.ink);
      if (n <= 0) return;
      s.coins -= n * price;
      if ("item" in o) give(s, o.item, n);
      else if ("ink" in o) s.ink += n;
      else if ("sapling" in o) s.shed[o.sapling] = (s.shed[o.sapling] ?? 0) + n;
      else gear(s, o.gear).buy();
      this.onChange("gear" in o ? `${gear(s, o.gear).now}!` : "sapling" in o ? `${offerName(o)} · in your shed` : `+${n} ${offerName(o).toLowerCase()}`);
    } else if (d.act === "sell") {
      const id = d.id as ItemId | "ink";
      const have = id === "ink" ? s.ink : count(s, id);
      const n = Math.min(have, d.n === "all" ? have : Number(d.n));
      if (n <= 0) return;
      if (id === "ink") s.ink -= n;
      else take(s, id, n);
      const coins = n * sellPrice(shop, id, day);
      s.coins += coins;
      this.onChange(`+${coins} coins`);
    }
    this.render();
  }

  /** Redraw if open (the inventory may have changed underneath). */
  render() {
    const shop = this.shop;
    if (!shop || !this.isOpen) return;
    const s = this.state;
    const day = marketDay();
    const sp = todaysSpecial(shop, day);
    const k = shop.keeper;
    const tabs = shop.sells.length && shop.buys.length
      ? `<div class="tabs" role="tablist">${(["buy", "sell"] as const).map((t) => `<button type="button" role="tab" data-act="tab" data-tab="${t}" aria-selected="${this.tab === t}">${t === "buy" ? "Buy" : "Sell"}</button>`).join("")}</div>`
      : "";
    const tab = shop.sells.length ? (shop.buys.length ? this.tab : "buy") : "sell";
    const special = sp ? `<p class="special"><b>Today:</b> ${sp.kind === "sale" ? `${nameOf(sp.item)} on sale` : `wanted, ${nameOf(sp.item).toLowerCase()} · paying extra`}</p>` : "";
    document.querySelector("#market header h2")!.textContent = shop.name;
    document.getElementById("market-body")!.innerHTML = `
      ${k ? `<p class="keeper"><span class="hat" style="background:${k.color}"></span><span><b>${k.name}:</b> “${k.greeting}”</span></p>` : ""}
      ${special}
      <p class="coins">${s.coins} coins${shop.daily ? ` · <small>prices change in ${Math.ceil(msToNextDay() / 3_600_000)}h</small>` : ""}</p>
      ${tabs}
      ${tab === "buy" ? this.buyRows(shop, day) : this.sellRows(shop, day)}
      ${shop.soon ? `<p class="note">${shop.soon}</p>` : ""}
      ${shop.daily ? "" : `<p class="note">The Lantern Market pays more and sells everything else. Take the portal.</p>`}`;
  }

  private buyRows(shop: Shop, day: number) {
    const s = this.state;
    const sp = todaysSpecial(shop, day);
    const rows: string[] = [];
    const cards: string[] = [];
    shop.sells.forEach((o, i) => {
      const price = buyPrice(shop, o, s, day);
      if ("gear" in o) {
        const g = gear(s, o.gear);
        cards.push(g.next
          ? `<p class="upgrade"><span><strong>${g.next.name}</strong> ${g.blurb}</span><button data-act="buy" data-i="${i}" data-n="1" ${s.coins >= price! ? "" : "disabled"}>Buy · ${price}c</button></p>`
          : `<p class="upgrade"><span>Your <strong>${g.now}</strong> is the best there is.</span></p>`);
        return;
      }
      const key = offerKey(o);
      const have = "item" in o ? count(s, o.item) : "ink" in o ? `${s.ink}/${inkMax(s)}` : s.shed[o.sapling] ?? 0;
      const ok = price !== null && s.coins >= price && (!("ink" in o) || s.ink < inkMax(s));
      const many = !("sapling" in o);
      rows.push(`<tr${sp?.item === key ? ` class="hot"` : ""}>
        <th scope="row">${offerName(o)}${sp?.item === key ? `<small>on sale today</small>` : "sapling" in o ? `<small>goes to your shed</small>` : ""}</th>
        <td>${have}</td>
        <td class="price">${price}c ${shop.daily && sp?.item !== key ? ARROW[trend(key, day)] : ""}</td>
        <td><button data-act="buy" data-i="${i}" data-n="1" ${ok ? "" : "disabled"}>+1</button>${many ? `<button data-act="buy" data-i="${i}" data-n="5" ${ok ? "" : "disabled"}>+5</button>` : ""}</td>
      </tr>`);
    });
    return `${rows.length ? `<div class="table-wrap"><table><thead><tr><th></th><th>Have</th><th>Price</th><th></th></tr></thead><tbody>${rows.join("")}</tbody></table></div>` : ""}${cards.join("")}`;
  }

  private sellRows(shop: Shop, day: number) {
    const s = this.state;
    const sp = todaysSpecial(shop, day);
    const rows = shop.buys.map((id) => {
      const have = id === "ink" ? s.ink : count(s, id);
      if (!have && sp?.item !== id) return "";
      const price = sellPrice(shop, id, day);
      return `<tr${sp?.item === id ? ` class="hot"` : ""}>
        <th scope="row">${nameOf(id)}${sp?.item === id ? `<small>wanted today</small>` : ""}</th>
        <td>${have}</td>
        <td class="price">${price}c ${shop.daily && sp?.item !== id ? ARROW[trend(id, day)] : ""}</td>
        <td><button data-act="sell" data-id="${id}" data-n="1" ${have ? "" : "disabled"}>Sell 1</button><button data-act="sell" data-id="${id}" data-n="all" ${have ? "" : "disabled"}>All</button></td>
      </tr>`;
    }).join("");
    const wants = shop.buys.map((id) => nameOf(id).toLowerCase()).join(", ");
    return rows
      ? `<div class="table-wrap"><table><thead><tr><th></th><th>Have</th><th>Pays</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
      : `<p class="note">${wants ? `You have nothing ${shop.keeper?.name ?? "the crate"} buys (${wants}).` : "Nothing to sell here yet."}</p>`;
  }
}

function nameOf(id: string) {
  if (id === "ink") return "Ink";
  if (id in ITEMS) return ITEMS[id as ItemId].name;
  return offerName({ sapling: id.replace("sapling:", "") } as Offer);
}
