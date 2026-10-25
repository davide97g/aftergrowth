import { ITEMS, type ItemCat, type ItemId } from "../../shared/items";
import { type Save, count } from "../game/state";

const SECTIONS: { cat: ItemCat; label: string }[] = [
  { cat: "crop", label: "Harvest" },
  { cat: "produce", label: "Goods" },
  { cat: "flower", label: "Flowers" },
  { cat: "material", label: "Materials" },
  { cat: "seed", label: "Seeds" },
];

/** Everything you carry, by kind. Opens with I or the satchel button. */
export class Satchel {
  private panel = document.getElementById("satchel")!;

  constructor(private state: Save) {
    document.getElementById("btn-satchel")!.addEventListener("click", () => this.toggle());
    document.getElementById("satchel-close")!.addEventListener("click", () => this.toggle(false));
    addEventListener("keydown", (e) => {
      if (e.code === "KeyI" && (e.target as HTMLElement).tagName !== "INPUT") this.toggle();
      if (e.code === "Escape" && this.open) this.toggle(false);
    });
  }

  get open() {
    return !this.panel.hidden;
  }

  toggle(open = !this.open) {
    this.panel.hidden = !open;
    if (open) this.render();
  }

  render() {
    if (!this.open) return;
    const s = this.state;
    const held = (Object.keys(s.bag) as ItemId[]).filter((id) => count(s, id) > 0 && id in ITEMS);
    const sections = SECTIONS.map(({ cat, label }) => {
      const ids = held.filter((id) => ITEMS[id].cat === cat);
      if (!ids.length) return "";
      return `<h3>${label}</h3><ul class="items">${ids.map((id) => `<li>${ITEMS[id].name} <b>${count(s, id)}</b></li>`).join("")}</ul>`;
    }).join("");
    document.getElementById("satchel-body")!.innerHTML = `${sections || "<p class=\"note\">Empty. Pick flowers, harvest crops, prune trees, collect honey.</p>"}
      <p class="note">${s.coins} coins · ${s.ink} drops of ink. Sell at the market crate, or at the Lantern Market through the portal.</p>`;
  }
}
