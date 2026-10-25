import { sound } from "../audio/sound";
import { CANS, CROPS, CROP_IDS, type CropId, type Save, count, inkMax } from "../game/state";
import { formatHour } from "../world/daycycle";
import { type Season, inSeason } from "../../shared/seasons";

const SUN = `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3.6" fill="#E8A92A" stroke="#2A2230" stroke-width="1.2"/><g stroke="#2A2230" stroke-width="1.2" stroke-linecap="round"><path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3 3l1.1 1.1M11.9 11.9 13 13M3 13l1.1-1.1M11.9 4.1 13 3"/></g></svg>`;
const MOON = `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M10.8 2.2a6 6 0 1 0 3 9.6A5 5 0 0 1 10.8 2.2Z" fill="#F3E6C8" stroke="#2A2230" stroke-width="1.2" stroke-linejoin="round"/></svg>`;

const WEATHER: Record<string, string> = {
  clear: "",
  cloudy: `<svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true"><path d="M5 12h9a3 3 0 0 0 0-6 4.5 4.5 0 0 0-8.6-1A3.5 3.5 0 0 0 5 12Z" fill="#e6e9f0" stroke="#2A2230" stroke-width="1.2" stroke-linejoin="round"/></svg>`,
  rain: `<svg width="18" height="16" viewBox="0 0 18 16" aria-hidden="true"><path d="M5 9h9a3 3 0 0 0 0-6 4.5 4.5 0 0 0-8.6-1A3.5 3.5 0 0 0 5 9Z" fill="#c9d0de" stroke="#2A2230" stroke-width="1.2" stroke-linejoin="round"/><path d="M6 11l-1 3M10 11l-1 3M14 11l-1 3" stroke="#3a6fd0" stroke-width="1.3" stroke-linecap="round"/></svg>`,
  windy: `<svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true"><path d="M1 5h10a2.5 2.5 0 1 0-2.5-2.5M1 9h13a2.5 2.5 0 1 1-2.5 2.5" fill="none" stroke="#2A2230" stroke-width="1.3" stroke-linecap="round"/></svg>`,
};

/** Clock pill with a time scrubber and speed buttons; fades the controls hint after the first input. */
export class Hud {
  private time = document.getElementById("clock-time")!;
  private icon = document.getElementById("clock-icon")!;
  private slider = document.getElementById("time-slider") as HTMLInputElement;
  private hint = document.getElementById("hint")!;
  private night: boolean | null = null;
  private hintTimer = 0;

  constructor(private clock: { hour: number; speed: number }) {
    const toggle = document.getElementById("clock-toggle")!;
    const panel = document.getElementById("clock-panel")!;
    toggle.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
      toggle.setAttribute("aria-expanded", String(!panel.hidden));
    });
    this.slider.addEventListener("input", () => (this.clock.hour = Number(this.slider.value)));
    for (const b of panel.querySelectorAll<HTMLButtonElement>("[data-speed]")) {
      b.addEventListener("click", () => {
        this.clock.speed = Number(b.dataset.speed);
        panel.querySelectorAll("[data-speed]").forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
      });
    }
    this.hintTimer = performance.now();
    document.getElementById("seeds")!.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest("button[data-seed]") as HTMLButtonElement | null;
      if (b) this.onSelectSeed(b.dataset.seed as CropId);
    });
    const mute = document.getElementById("sound-toggle")!;
    const showMute = (muted: boolean) => {
      mute.textContent = `Sound ${muted ? "off" : "on"} · M`;
      mute.setAttribute("aria-pressed", String(!muted));
    };
    mute.addEventListener("click", () => sound.toggle());
    sound.onMute = showMute;
    showMute(sound.muted);
    const music = document.getElementById("music-toggle")!;
    const showMusic = (on: boolean) => {
      music.textContent = `Music ${on ? "on" : "off"} · N`;
      music.setAttribute("aria-pressed", String(on));
    };
    music.addEventListener("click", () => sound.toggleMusic());
    sound.onMusic = showMusic;
    showMusic(sound.music);
    const reset = document.getElementById("reset-save") as HTMLButtonElement;
    reset.addEventListener("click", () => {
      if (reset.dataset.armed) return this.onReset();
      reset.dataset.armed = "1";
      reset.textContent = "Tap again to erase your save";
      setTimeout(() => {
        delete reset.dataset.armed;
        reset.textContent = "Start over";
      }, 3000);
    });
  }

  /** the season, to mark seeds that grow faster now */
  season: Season | null = null;
  private toastTimer = 0;
  private popTimer = 0;
  private invKey = "";
  onSelectSeed: (c: CropId) => void = () => {};
  /** after the inventory changed: open panels redraw */
  onInventory: () => void = () => {};
  onReset: () => void = () => {};

  /** A short line that floats up above the inventory: "+1 Turnip". */
  pop(text: string) {
    const el = document.getElementById("pop")!;
    el.textContent = text;
    el.hidden = false;
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");
    clearTimeout(this.popTimer);
    this.popTimer = window.setTimeout(() => (el.hidden = true), 1400);
  }

  /** Ink bottle, coins, can, the satchel button and the seeds (selectable). */
  inventory(s: Save) {
    const key = JSON.stringify([s.ink, s.bottle, s.coins, s.bag, s.selected, s.can]);
    if (key === this.invKey) return;
    this.invKey = key;
    const fill = s.ink / inkMax(s);
    document.getElementById("ink-level")!.setAttribute("y", String(6 + 15 * (1 - fill)));
    document.getElementById("ink-level")!.setAttribute("height", String(15 * fill));
    document.getElementById("ink-count")!.textContent = `${s.ink}/${inkMax(s)}`;
    document.getElementById("coins")!.textContent = String(s.coins);
    document.getElementById("can-count")!.textContent = `${s.can.water}/${CANS[s.can.level].holds}`;
    const seeds = document.getElementById("seeds")!;
    const fresh = (c: CropId) => this.season && inSeason(c, this.season);
    seeds.innerHTML = CROP_IDS.map((c, i) => `<button type="button" data-seed="${c}" aria-pressed="${s.selected === c}" ${count(s, `seed:${c}`) ? "" : "class=\"none\""} ${fresh(c) ? "title=\"In season: grows faster\"" : ""}><kbd>${i + 1}</kbd>${CROPS[c].name}${fresh(c) ? " ✿" : ""} <b>${count(s, `seed:${c}`)}</b></button>`).join("");
    const carried = Object.entries(s.bag).filter(([id]) => !id.startsWith("seed:")).reduce((a, [, n]) => a + (n ?? 0), 0);
    document.getElementById("satchel-count")!.textContent = `Satchel · ${carried}`;
    this.onInventory();
  }

  /** A parchment note at the top of the screen. */
  toast(title: string, note = "") {
    const el = document.getElementById("toast")!;
    el.innerHTML = `<strong></strong>${note ? "<span></span>" : ""}`;
    el.querySelector("strong")!.textContent = title;
    if (note) el.querySelector("span")!.textContent = note;
    el.hidden = false;
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (el.hidden = true), 4200);
  }

  private sky = "";

  update(hour: number, glow: number, interacted: boolean, sky = "clear") {
    if (sky !== this.sky) {
      this.sky = sky;
      const el = document.getElementById("clock-weather")!;
      el.innerHTML = WEATHER[sky] ?? "";
      el.title = sky === "clear" ? "" : sky[0].toUpperCase() + sky.slice(1);
    }
    this.time.textContent = formatHour(hour);
    if (document.activeElement !== this.slider) this.slider.value = String(hour);
    const night = glow > 0.5;
    if (night !== this.night) {
      this.night = night;
      this.icon.innerHTML = night ? MOON : SUN;
    }
    if (interacted && performance.now() - this.hintTimer > 6000) this.hint.classList.add("gone");
  }
}
