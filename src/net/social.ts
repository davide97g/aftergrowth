import { Camera, Mesh, Object3D, Scene, Vector3 } from "three";
import { type AtlasEntry, type Deed, type Gift, HUB_ID, type IslandSnap, MARKET_ID, PHRASES, type Pose, type Profile } from "../../shared/protocol";
import type { Action } from "../game/interact";
import { CROPS, CROP_IDS, type CropId, FLOWER_COLORS, type FlowerColor, type ItemId, type Save, count, give, take } from "../game/state";
import type { Hud } from "../ui/hud";
import { Witch } from "../player/witch";
import { COLORS, type Me, type Net, THEMES, saveMe } from "./net";

interface Peer { profile: Profile; witch: Witch | null; pose: Pose | null; tag: HTMLElement; bubbleUntil: number }

const THEME_NAMES: Record<string, string> = { meadow: "Meadow", blossom: "Blossom", autumn: "Autumn", mint: "Mint" };

/**
 * Everything multiplayer: other witches on this island, the portal's atlas, the mailbox,
 * publishing your island for visitors, and the deeds visitors left while you were away.
 */
export class Social {
  private peers = new Map<string, Peer>();
  private labels = document.getElementById("labels")!;
  private myTag: HTMLElement;
  private myBubbleUntil = 0;
  private poseTimer = 0;
  private lastPose = "";
  private publishTimer = 0;
  private lastPublished = "";
  private mailFlag: Mesh | null = null;
  readonly visiting: boolean;
  readonly islandId: string;
  onTravel: (island: string | null) => void = () => {};
  onRemoteSpell: (spell: string, at: Vector3, power: number) => void = () => {};

  constructor(
    private net: Net,
    private me: Me,
    private scene: Scene,
    private camera: Camera,
    private hud: Hud,
    private state: Save,
    island: string,
    private host: IslandSnap | null,
  ) {
    this.islandId = island;
    this.visiting = island !== me.id;
    this.seenDeeds = state.seenDeeds ?? 0;
    this.myTag = this.makeTag(me.name, me.color);

    net.on("peers", (m) => {
      for (const p of [...this.peers.keys()]) this.drop(p);
      for (const { profile, pose } of m.peers) this.add(profile, pose);
    });
    net.on("joined", (m) => {
      this.add(m.profile, null);
      this.hud.pop(`${m.profile.name} arrived`);
    });
    net.on("left", (m) => {
      const p = this.peers.get(m.id);
      if (p) this.hud.pop(`${p.profile.name} left`);
      this.drop(m.id);
    });
    net.on("pose", (m) => {
      const p = this.peers.get(m.id);
      if (p) p.pose = m.pose;
    });
    net.on("say", (m) => {
      const p = this.peers.get(m.id);
      if (p) this.bubble(p.tag, PHRASES[m.phrase], (t) => (p.bubbleUntil = t));
    });
    net.on("spell", (m) => this.onRemoteSpell(m.spell, new Vector3(m.x, 0, m.z), m.power));
    net.on("island", (m) => {
      // the owner changed something while we visit: refresh plots and carvings in place
      if (!m.island || !this.host || m.island.id !== this.host.id) return;
      m.island.plots.forEach((p, i) => Object.assign(this.host!.plots[i] ?? {}, p, { locked: !!p.locked }));
    });
    net.on("deed", (m) => this.applyDeeds([m.deed], true));
    net.on("welcome", (m) => this.applyDeeds(m.deeds, false));
    net.onStatus = (online) => {
      document.body.classList.toggle("online", online);
      if (!online) for (const p of [...this.peers.keys()]) this.drop(p);
    };

    document.getElementById("say-menu")!.innerHTML = PHRASES.map((p, i) => `<button type="button" data-phrase="${i}">${p}</button>`).join("");
    document.getElementById("btn-say")!.addEventListener("click", () => this.toggleSay());
    document.getElementById("say-menu")!.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest("button[data-phrase]") as HTMLButtonElement | null;
      if (b) this.say(Number(b.dataset.phrase));
    });
    addEventListener("keydown", (e) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.code === "KeyT") this.toggleSay();
    });
    document.getElementById("atlas-close")!.addEventListener("click", () => this.openAtlas(false));
    document.getElementById("atlas")!.addEventListener("click", (e) => this.onAtlasClick(e));
  }

  // ---------- peers ----------

  private makeTag(name: string, color: string) {
    const el = document.createElement("div");
    el.className = "nametag";
    el.innerHTML = `<span class="bubble" hidden></span><span class="name"><i style="background:${color}"></i></span>`;
    el.querySelector(".name")!.append(name);
    this.labels.append(el);
    return el;
  }

  private add(profile: Profile, pose: Pose | null) {
    if (this.peers.has(profile.id) || profile.id === this.me.id) return;
    const peer: Peer = { profile, witch: null, pose, tag: this.makeTag(profile.name, profile.color), bubbleUntil: 0 };
    this.peers.set(profile.id, peer);
    void Witch.load(profile.color).then((w) => {
      if (!this.peers.has(profile.id)) return;
      peer.witch = w;
      if (pose) w.position.set(pose.x, 0, pose.z);
      this.scene.add(w.root);
    });
  }

  private drop(id: string) {
    const p = this.peers.get(id);
    if (!p) return;
    if (p.witch) this.scene.remove(p.witch.root);
    p.tag.remove();
    this.peers.delete(id);
  }

  private bubble(tag: HTMLElement, text: string, setUntil: (t: number) => void) {
    const b = tag.querySelector(".bubble") as HTMLElement;
    b.textContent = text;
    b.hidden = false;
    setUntil(performance.now() + 4000);
  }

  private toggleSay(open?: boolean) {
    const menu = document.getElementById("say-menu")!;
    menu.hidden = open === undefined ? !menu.hidden : !open;
  }

  private say(i: number) {
    this.toggleSay(false);
    this.bubble(this.myTag, PHRASES[i], (t) => (this.myBubbleUntil = t));
    this.net.send({ t: "say", phrase: i });
  }

  /** Tell the room about a spell, so they see it too. */
  castSpell(spell: string, at: Vector3, power: number) {
    this.net.send({ t: "spell", spell, x: at.x, z: at.z, power });
  }

  // ---------- island publishing and deeds ----------

  private snapshot(): IslandSnap {
    return {
      id: this.me.id, name: this.me.name, color: this.me.color, theme: this.me.theme,
      plots: this.state.plots.map((p) => ({ crop: p.crop, growth: Math.round(p.growth * 100) / 100, wet: Math.round(p.wet * 100) / 100, ...(p.locked ? { locked: true } : {}) })),
      stones: this.state.stones.map((s) => (s ? { spell: s.spell, power: s.power, strokes: s.strokes } : null)),
      layout: this.state.island,
      updated: Date.now(),
    };
  }

  private publish(force = false) {
    if (this.visiting || !this.net.online) return;
    const snap = this.snapshot();
    const key = JSON.stringify([snap.plots.map((p) => [p.crop, Math.floor(p.growth), p.wet > 0, !!p.locked]), snap.stones.map((s) => s?.spell), snap.theme, snap.name, snap.layout]);
    if (!force && key === this.lastPublished) return;
    this.lastPublished = key;
    this.net.send({ t: "publish", island: snap });
  }

  private seenDeeds = 0;

  private applyDeeds(all: Deed[], live: boolean) {
    // the server repeats deeds until we acknowledge them; apply each one once
    const deeds = all.filter((d) => d.at > this.seenDeeds);
    if (!deeds.length) return;
    if (live && this.visiting) {
      // someone else watered the island we're visiting
      for (const d of deeds) if (d.kind === "water" && this.host?.plots[d.plot]) this.host.plots[d.plot].wet = 10;
      return;
    }
    this.seenDeeds = Math.max(this.seenDeeds, ...deeds.map((d) => d.at));
    this.state.seenDeeds = this.seenDeeds;
    this.net.send({ t: "ack", upTo: this.seenDeeds });
    const watered = new Set<string>();
    let plots = 0;
    const gifts: string[] = [];
    for (const d of deeds) {
      if (d.kind === "water") {
        if (this.state.plots[d.plot]) this.state.plots[d.plot].wet = 10;
        watered.add(d.by);
        plots++;
      } else {
        (this.state.mailbox ??= []).push(d.gift);
        gifts.push(d.by);
      }
    }
    const parts: string[] = [];
    if (plots) parts.push(`${[...watered].join(", ")} watered ${plots} ${plots === 1 ? "crop" : "crops"}`);
    if (gifts.length) parts.push(`${gifts.length} ${gifts.length === 1 ? "gift" : "gifts"} in the mailbox from ${[...new Set(gifts)].join(", ")}`);
    this.hud.toast(live ? "A visitor helped" : "While you were away", parts.join(" · "));
  }

  // ---------- mailbox ----------

  /** The mailbox the world built: its flag goes up when gifts are waiting. */
  useMailbox(obj: Object3D | null, at: Vector3 | null) {
    this.mailFlag = (obj?.getObjectByName("flag") as Mesh | undefined) ?? null;
    this.mailboxAt = at;
  }
  private mailboxAt: Vector3 | null = null;

  mailbox = (near: Vector3): Action | null => {
    const pos = this.mailboxAt;
    if (!pos || Math.hypot(pos.x - near.x, pos.z - near.z) > 1.4) return null;
    const s = this.state;
    if (!this.visiting) {
      const mail = s.mailbox ?? [];
      if (!mail.length) return { pos, reach: 1.4, label: "Mailbox · empty", act: null };
      return {
        pos, reach: 1.4, label: `Mailbox · ${mail.length} ${mail.length === 1 ? "gift" : "gifts"}`,
        act: () => {
          for (const g of mail) {
            if (g.kind === "flower") give(s, `flower:${g.color as FlowerColor}`);
            if (g.kind === "crop") give(s, `crop:${g.crop as CropId}`);
          }
          const from = [...new Set(mail.map((g) => g.from))].join(", ");
          this.hud.toast(`${mail.length} ${mail.length === 1 ? "gift" : "gifts"} collected`, `From ${from}.`);
          s.mailbox = [];
        },
      };
    }
    if (!this.net.online || !this.host) return { pos, reach: 1.4, label: "Mailbox · the owner can't receive gifts right now", act: null };
    const most = <T extends string>(ids: T[], key: (id: T) => ItemId) => ids.filter((c) => count(s, key(c)) > 0).sort((a, b) => count(s, key(b)) - count(s, key(a)))[0];
    const crop = most(CROP_IDS, (c) => `crop:${c}`);
    const flower = most(FLOWER_COLORS, (c) => `flower:${c}`);
    if (!crop && !flower) return { pos, reach: 1.4, label: `Mailbox · nothing to give ${this.host.name}`, act: null };
    const gift: Gift = crop ? { from: this.me.name, kind: "crop", crop } : { from: this.me.name, kind: "flower", color: flower! };
    const what = crop ? CROPS[crop].name.toLowerCase() : `${flower} flower`;
    return {
      pos, reach: 1.4, label: `Leave a ${what} for ${this.host.name}`,
      act: () => {
        if (crop) take(s, `crop:${crop}`);
        else take(s, `flower:${flower!}`);
        this.net.send({ t: "gift", island: this.host!.id, gift });
        this.hud.toast("Gift left", `${this.host!.name} will find a ${what} in the mailbox.`);
      },
    };
  };

  // ---------- portal and atlas ----------

  portal(pos: Vector3) {
    return (near: Vector3): Action | null => {
      if (Math.hypot(pos.x - near.x, pos.z - near.z) > 2.2) return null;
      return { pos, reach: 2.2, label: "Step into the portal", act: () => this.openAtlas(true), priority: 1.5 };
    };
  }

  openAtlas(open: boolean) {
    const el = document.getElementById("atlas")!;
    el.hidden = !open;
    if (!open) return;
    this.renderAtlas(null);
    if (this.net.online) {
      this.net.send({ t: "atlas" });
      void this.net.next("atlas", 3000).then((m) => this.renderAtlas(m?.islands ?? []));
    }
  }

  private renderAtlas(islands: AtlasEntry[] | null) {
    const ago = (t: number) => {
      const m = Math.round((Date.now() - t) / 60000);
      return m < 2 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
    };
    const row = (e: AtlasEntry) => {
      const here = e.id === this.islandId;
      const status = e.id === HUB_ID || e.id === MARKET_ID ? `${e.here} here now` : e.online ? `online${e.here ? ` · ${e.here} here` : ""}` : `away · ${ago(e.lastSeen)}`;
      return `<li><i style="background:${e.color}"></i><span><strong></strong><em>${e.id === MARKET_ID ? "Six shops, new prices daily" : `${THEME_NAMES[e.theme] ?? ""} island`} · ${status}</em></span>${here ? `<b>you are here</b>` : `<button type="button" data-go="${e.id}">Travel</button>`}</li>`;
    };
    let list: string;
    if (!this.net.online) list = `<p class="quiet">The portal is quiet: the island server is offline. You can still go home.</p>`;
    else if (!islands) list = `<p class="quiet">The portal shimmers…</p>`;
    else {
      const others = islands.filter((e) => e.id !== this.me.id);
      list = `<ul class="islands">${others.map(row).join("")}</ul>${others.length < 2 ? `<p class="quiet">No other witches yet. Open the game in another browser to visit yourself.</p>` : ""}`;
    }
    const home = this.visiting ? `<button type="button" class="home" data-go="">Go home to ${this.me.name}'s island</button>` : "";
    const swatches = COLORS.map((c) => `<button type="button" class="swatch" data-color="${c}" style="background:${c}" aria-label="Hat colour ${c}" aria-pressed="${c === this.me.color}"></button>`).join("");
    const themes = THEMES.map((t) => `<button type="button" data-theme="${t}" aria-pressed="${t === this.me.theme}">${THEME_NAMES[t]}</button>`).join("");
    document.getElementById("atlas-body")!.innerHTML = `
      ${home}
      <section><h3>Islands</h3>${list}</section>
      <section><h3>You</h3>
        <label for="me-name">Name</label>
        <input id="me-name" maxlength="24" value="">
        <div class="row"><span>Hat</span>${swatches}</div>
        <div class="row"><span>Your island</span>${themes}</div>
      </section>`;
    const strong = document.querySelectorAll("#atlas .islands strong");
    islands?.filter((e) => e.id !== this.me.id).forEach((e, i) => (strong[i].textContent = e.name));
    const input = document.getElementById("me-name") as HTMLInputElement;
    input.value = this.me.name;
    input.addEventListener("change", () => this.updateMe({ name: input.value.trim().slice(0, 24) || this.me.name }));
  }

  private updateMe(patch: Partial<Me>) {
    Object.assign(this.me, patch);
    saveMe(this.me);
    this.myTag.querySelector(".name")!.lastChild!.textContent = this.me.name;
    (this.myTag.querySelector(".name i") as HTMLElement).style.background = this.me.color;
    this.net.send({ t: "hello", profile: { id: this.me.id, name: this.me.name, color: this.me.color }, token: this.me.token });
    this.publish(true);
  }

  private onAtlasClick(e: MouseEvent) {
    const t = e.target as HTMLElement;
    const go = t.closest("button[data-go]") as HTMLButtonElement | null;
    if (go) return this.onTravel(go.dataset.go || null);
    const color = t.closest("button[data-color]") as HTMLButtonElement | null;
    if (color) {
      this.updateMe({ color: color.dataset.color! });
      this.renderAtlas(null);
      this.openAtlas(true);
      this.hud.toast("New hat colour", "Other witches see it now. Your own hat changes next time you travel.");
      return;
    }
    const theme = t.closest("button[data-theme]") as HTMLButtonElement | null;
    if (theme) {
      this.updateMe({ theme: theme.dataset.theme as Me["theme"] });
      if (!this.visiting) this.onTravel(null);
      else this.openAtlas(true);
    }
  }

  // ---------- per frame ----------

  /** `stand` overrides where others see you, e.g. at the door while you're inside. */
  update(dt: number, witch: Witch, stand: Vector3 | null = null) {
    this.poseTimer -= dt;
    if (this.poseTimer <= 0 && this.net.online) {
      this.poseTimer = 0.1;
      const at = stand ?? witch.position;
      const pose: Pose = { x: +at.x.toFixed(2), z: +at.z.toFixed(2), yaw: +witch.yaw.toFixed(2), speed: stand ? 0 : +witch.speed.toFixed(2), drawing: witch.drawing };
      const key = JSON.stringify(pose);
      if (key !== this.lastPose) {
        this.lastPose = key;
        this.net.send({ t: "pose", pose });
      }
    }
    this.publishTimer -= dt;
    if (this.publishTimer <= 0) {
      this.publishTimer = 8;
      this.publish();
    }
    if (this.mailFlag) this.mailFlag.rotation.z = (this.state.mailbox?.length ?? 0) && !this.visiting ? 0 : -1.4;
    const now = performance.now();
    this.place(this.myTag, witch.position, now < this.myBubbleUntil && !stand);
    for (const p of this.peers.values()) {
      if (p.witch && p.pose) p.witch.follow(dt, p.pose);
      if (p.witch) this.place(p.tag, p.witch.position, now < p.bubbleUntil);
    }
  }

  private place(tag: HTMLElement, at: Vector3, bubble: boolean) {
    const p = at.clone().setY(2.3).project(this.camera);
    tag.style.transform = `translate(${((p.x + 1) / 2) * innerWidth}px, ${((1 - p.y) / 2) * innerHeight}px) translate(-50%, -100%)`;
    (tag.querySelector(".bubble") as HTMLElement).hidden = !bubble;
    // your own tag only shows a bubble, never your name
    tag.classList.toggle("mine", tag === this.myTag);
  }

  /** Publish right away, e.g. before leaving the page. */
  flush() {
    this.publish(true);
  }
}
