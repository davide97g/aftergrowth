import { TEAS, TEA_CUPS, TEA_FLOWERS, TEA_IDS, type TeaId } from "../../shared/items";
import { type Save, count, give, take } from "../game/state";

/** The kettle by the cottage fire: two flowers of one colour make two cups of tea. */
export class KettlePanel {
  private panel = document.getElementById("kettle")!;
  private body = document.getElementById("kettle-body")!;
  /** a pot was brewed */
  onBrew: (tea: TeaId) => void = () => {};

  constructor(private state: Save) {
    document.getElementById("kettle-close")!.addEventListener("click", () => this.close());
    addEventListener("keydown", (e) => {
      if (e.code === "Escape" && this.isOpen) this.close();
    });
    this.body.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest("button[data-brew]") as HTMLButtonElement | null;
      if (!b) return;
      const tea = b.dataset.brew as TeaId;
      if (!take(this.state, `flower:${TEAS[tea].flower}`, TEA_FLOWERS)) return;
      give(this.state, `tea:${tea}`, TEA_CUPS);
      this.onBrew(tea);
      this.render();
    });
  }

  get isOpen() {
    return !this.panel.hidden;
  }

  open() {
    this.panel.hidden = false;
    this.render();
  }

  close() {
    this.panel.hidden = true;
  }

  render() {
    if (!this.isOpen) return;
    const s = this.state;
    const rows = TEA_IDS.map((t) => {
      const d = TEAS[t];
      const have = count(s, `flower:${d.flower}`);
      return `<li><strong>${d.name}</strong><em>${d.effect}</em><small>${TEA_FLOWERS} ${d.flower} flowers · you have ${have} · ${count(s, `tea:${t}`)} cups in the satchel</small><button type="button" class="act" data-brew="${t}" ${have >= TEA_FLOWERS ? "" : "disabled"}>Brew</button></li>`;
    }).join("");
    this.body.innerHTML = `<ul class="teas">${rows}</ul><p class="note">A pot makes ${TEA_CUPS} cups. Drink them from the satchel (I), anywhere.</p>`;
  }
}
