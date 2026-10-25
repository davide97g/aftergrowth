import { Camera, Mesh, Object3D, Scene, Vector3 } from "three";
import { unread } from "../game/post";
import { type Deed, type Gift, type HatStyle, type IslandSnap, PHRASES, type Pose, type Profile } from "../../shared/protocol";
import type { Action } from "../game/interact";
import { ITEMS, isItem } from "../../shared/items";
import { addMeal } from "../farm/livestock";
import { CROPS, CROP_IDS, type CropId, FLOWER_COLORS, type FlowerColor, type ItemId, type Save, count, give, take } from "../game/state";
import type { Hud } from "../ui/hud";
import { Witch } from "../player/witch";
import type { Me } from "./account";
import type { Net } from "./net";

interface Peer { profile: Profile; witch: Witch | null; pose: Pose | null; tag: HTMLElement; bubbleUntil: number }

/**
 * Everything multiplayer on this island: other witches, the mailbox, publishing your island for
 * visitors, and the deeds visitors left while you were away. Friends and travel are on the map.
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
    net.on("welcome", (m) => {
      // renamed or recoloured on another device since this page loaded
      if (m.profile.name !== this.me.name || m.profile.color !== this.me.color) this.updateMe({ name: m.profile.name, color: m.profile.color }, false);
      this.applyDeeds(m.deeds, false);
    });
    net.on("closed", (m) => {
      if (m.island !== this.islandId) return;
      this.hud.toast("The portal closed", `${this.host?.name ?? "The owner"} closed their portal. Home you go.`);
      setTimeout(() => this.onTravel(null), 1800);
    });
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
    void Witch.load(profile.color, profile.hat).then((w) => {
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
      familiar: this.state.familiar,
      updated: Date.now(),
    };
  }

  private publish(force = false) {
    if (this.visiting || !this.net.online) return;
    const snap = this.snapshot();
    const key = JSON.stringify([snap.plots.map((p) => [p.crop, Math.floor(p.growth), p.wet > 0, !!p.locked]), snap.stones.map((s) => s?.spell), snap.theme, snap.name, snap.layout, snap.familiar]);
    if (!force && key === this.lastPublished) return;
    this.lastPublished = key;
    this.net.send({ t: "publish", island: snap });
  }

  private seenDeeds = 0;
  /** after deeds changed the save (coins from a sale, goods back from a stall) */
  onDeeds: () => void = () => {};

  private applyDeeds(all: Deed[], live: boolean) {
    // the server repeats deeds until we acknowledge them; apply each one once
    const deeds = all.filter((d) => d.at > this.seenDeeds);
    if (!deeds.length) return;
    if (live && this.host) {
      // on someone's island, live deeds are about theirs (someone else watered it); ours wait until we're
      // home. On the commons and the market they are ours: a stall sale is paid on the spot.
      for (const d of deeds) if (d.kind === "water" && this.host?.plots[d.plot]) this.host.plots[d.plot].wet = 10;
      return;
    }
    this.seenDeeds = Math.max(this.seenDeeds, ...deeds.map((d) => d.at));
    this.state.seenDeeds = this.seenDeeds;
    this.net.send({ t: "ack", upTo: this.seenDeeds });
    const watered = new Set<string>();
    let plots = 0;
    const gifts: string[] = [];
    const fed = new Set<string>();
    const sales: string[] = [];
    for (const d of deeds) {
      if (d.kind === "water") {
        if (this.state.plots[d.plot]) this.state.plots[d.plot].wet = 10;
        watered.add(d.by);
        plots++;
      } else if (d.kind === "feed") {
        if (d.crop in CROPS) addMeal(this.state.herd, d.trough, d.crop as CropId);
        fed.add(d.by);
      } else if (d.kind === "sale") {
        this.state.coins += d.coins;
        if (isItem(d.item)) sales.push(`${d.by} bought ${d.qty} ${ITEMS[d.item].name.toLowerCase()} (+${d.coins}c)`);
      } else if (d.kind === "return") {
        if (isItem(d.item)) {
          give(this.state, d.item, d.qty);
          sales.push(`${d.qty} ${ITEMS[d.item].name.toLowerCase()} back from your stall`);
        }
      } else {
        (this.state.mailbox ??= []).push(d.gift);
        gifts.push(d.by);
      }
    }
    const parts: string[] = [];
    if (plots) parts.push(`${[...watered].join(", ")} watered ${plots} ${plots === 1 ? "crop" : "crops"}`);
    if (fed.size) parts.push(`${[...fed].join(", ")} fed your animals`);
    parts.push(...sales);
    if (gifts.length) parts.push(`${gifts.length} ${gifts.length === 1 ? "gift" : "gifts"} in the mailbox from ${[...new Set(gifts)].join(", ")}`);
    this.hud.toast(live ? (sales.length && !plots && !gifts.length && !fed.size ? "Your stall" : "A visitor helped") : "While you were away", parts.join(" · "));
    this.onDeeds();
  }

  // ---------- mailbox ----------

  /** The mailbox the world built: its flag goes up when gifts are waiting. */
  useMailbox(obj: Object3D | null, at: Vector3 | null) {
    this.mailFlag = (obj?.getObjectByName("flag") as Mesh | undefined) ?? null;
    this.mailboxAt = at;
  }
  private mailboxAt: Vector3 | null = null;
  /** open the letters panel */
  onLetters: () => void = () => {};

  mailbox = (near: Vector3): Action | null => {
    const pos = this.mailboxAt;
    if (!pos || Math.hypot(pos.x - near.x, pos.z - near.z) > 1.4) return null;
    const s = this.state;
    if (!this.visiting) {
      const mail = s.mailbox ?? [];
      const letters = s.post?.letters.length ?? 0;
      const fresh = unread(s.post);
      if (!mail.length && !letters) return { pos, reach: 1.4, label: "Mailbox · empty", act: null };
      const parts = [
        ...(fresh ? [`${fresh} new ${fresh === 1 ? "letter" : "letters"}`] : []),
        ...(mail.length ? [`${mail.length} ${mail.length === 1 ? "gift" : "gifts"}`] : []),
      ];
      return {
        pos, reach: 1.4, label: parts.length ? `Mailbox · ${parts.join(" · ")}` : "Mailbox · read your letters",
        act: () => {
          if (mail.length) {
            for (const g of mail) {
              if (g.kind === "flower") give(s, `flower:${g.color as FlowerColor}`);
              if (g.kind === "crop") give(s, `crop:${g.crop as CropId}`);
            }
            const from = [...new Set(mail.map((g) => g.from))].join(", ");
            this.hud.toast(`${mail.length} ${mail.length === 1 ? "gift" : "gifts"} collected`, `From ${from}.`);
            s.mailbox = [];
          }
          if (letters) this.onLetters();
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

  /** The witches standing on this island with you, and where. */
  others(): (Profile & { at: Vector3 | null })[] {
    return [...this.peers.values()].map((p) => ({ ...p.profile, at: p.witch?.position ?? null }));
  }

  /** Change your name, hat or island theme; `tell` sends it to the server. */
  updateMe(patch: Partial<Pick<Me, "name" | "color" | "hat" | "theme">>, tell = true) {
    Object.assign(this.me, patch);
    this.myTag.querySelector(".name")!.lastChild!.textContent = this.me.name;
    (this.myTag.querySelector(".name i") as HTMLElement).style.background = this.me.color;
    if (!tell) return;
    this.net.send({ t: "profile", ...patch });
    this.publish(true);
  }

  /** Put on another hat shape: saved in your profile, seen by others the next time they meet you. */
  wearHat(hat: HatStyle) {
    this.updateMe({ hat });
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
    if (this.mailFlag) this.mailFlag.rotation.z = ((this.state.mailbox?.length ?? 0) || unread(this.state.post)) && !this.visiting ? 0 : -1.4;
    const now = performance.now();
    this.place(this.myTag, witch.position, now < this.myBubbleUntil && !stand);
    for (const p of this.peers.values()) {
      if (p.witch && p.pose) p.witch.follow(dt, p.pose);
      if (p.witch) this.place(p.tag, p.witch.position, now < p.bubbleUntil);
      // indoors the others are out of sight
      p.tag.hidden = !!stand;
    }
  }

  private place(tag: HTMLElement, at: Vector3, bubble: boolean) {
    const p = at.clone().setY(at.y + 2.3).project(this.camera);
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
