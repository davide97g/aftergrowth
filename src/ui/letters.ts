import { ITEMS, type ItemId } from "../../shared/items";
import { type Letter, type Parcel, SENDERS, amount, answer, describe } from "../game/post";
import { type Save, count, give, take } from "../game/state";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** The letters from your mailbox: a list on top, the open letter below, with its gift or favour. */
export class LettersPanel {
  private panel = document.getElementById("letters")!;
  private body = document.getElementById("letters-body")!;
  private current: string | null = null;
  /** something was taken or posted: `msg` pops up */
  onChange: (msg?: string) => void = () => {};

  constructor(private state: Save) {
    document.getElementById("letters-close")!.addEventListener("click", () => this.close());
    addEventListener("keydown", (e) => {
      if (e.code === "Escape" && this.isOpen) this.close();
    });
    this.body.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest("button") as HTMLButtonElement | null;
      if (!b) return;
      if (b.dataset.open) {
        this.current = b.dataset.open;
        return this.render();
      }
      const l = this.letter();
      if (!l) return;
      if (b.dataset.act === "take") this.take(l);
      if (b.dataset.act === "post") this.post(l);
    });
  }

  get isOpen() {
    return !this.panel.hidden;
  }

  private get letters() {
    return this.state.post?.letters ?? [];
  }

  private letter() {
    return this.letters.find((l) => l.id === this.current) ?? null;
  }

  open() {
    const unread = this.letters.filter((l) => !l.read);
    this.current = (unread[0] ?? this.letters[this.letters.length - 1])?.id ?? null;
    this.panel.hidden = false;
    this.render();
  }

  close() {
    this.panel.hidden = true;
  }

  private receive(p: Parcel) {
    if ("coins" in p) this.state.coins += p.coins;
    else give(this.state, p.item, p.n);
  }

  private take(l: Letter) {
    if (!l.gift || l.claimed) return;
    this.receive(l.gift);
    l.claimed = true;
    this.onChange(`+${describe(l.gift)}`);
    this.render();
  }

  private post(l: Letter) {
    const a = l.ask;
    if (!a || a.sent || a.due < this.state.day || !take(this.state, a.item, a.n)) return;
    answer(this.state.post!, l);
    this.onChange(`Posted ${amount(a.item, a.n)} to ${l.from}`);
    this.render();
  }

  render() {
    if (!this.isOpen) return;
    const s = this.state;
    const all = [...this.letters].reverse();
    if (!all.length) {
      this.body.innerHTML = `<p class="paper">No letters yet. The witches at the market write now and then; check again tomorrow morning.</p>`;
      return;
    }
    const l = this.letter() ?? all[0];
    this.current = l.id;
    l.read = true;
    const list = all.map((x) => `<li><button type="button" data-open="${x.id}" class="${x.read ? "" : "new"}" aria-current="${x.id === l.id}"><strong>${x.from}</strong><small>day ${x.day}${x.ask && !x.ask.sent ? " · a favour" : x.gift && !x.claimed ? " · a gift" : ""}</small></button></li>`).join("");
    let extra = "";
    if (l.gift) {
      extra += `<p class="parcel"><span>Enclosed: <b>${esc(describe(l.gift))}</b></span>${l.claimed ? "<em>taken</em>" : `<button type="button" class="act" data-act="take">Take it</button>`}</p>`;
    }
    if (l.ask) {
      const a = l.ask;
      const have = count(s, a.item as ItemId);
      const late = a.due < s.day;
      const state = a.sent ? "<em>posted · a reply comes tomorrow morning</em>"
        : late ? "<em>too late, maybe next time</em>"
          : `<button type="button" class="act" data-act="post" ${have >= a.n ? "" : "disabled"}>Post them</button>`;
      extra += `<p class="parcel"><span>Wants <b>${esc(amount(a.item, a.n))}</b> by day ${a.due} · you have ${have} ${esc(ITEMS[a.item].name.toLowerCase())}</span>${state}</p>`;
    }
    this.body.innerHTML = `<div class="paper"><span class="from">From ${l.from} at ${SENDERS[l.from].place} · day ${l.day}</span>${esc(l.text)}</div>${extra}
      <h3>All letters</h3><ul class="list">${list}</ul>`;
    this.onChange();
  }
}
