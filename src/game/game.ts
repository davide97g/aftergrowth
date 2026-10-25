import { Timer, Vector3 } from "three";
import { sound } from "../audio/sound";
import { CameraRig } from "../core/camera";
import { Input } from "../core/input";
import { setTheme } from "../core/palette";
import { Farm } from "../farm/farm";
import { Flowers } from "../farm/flowers";
import { Garden } from "../farm/garden";
import { Gather } from "../farm/gather";
import { Workshop } from "../farm/workshop";
import { Market } from "../market/market";
import { ShopPanel } from "../market/panel";
import { CRATE } from "../market/shops";
import { PortalOverlay } from "../fx/portal";
import { Tweens } from "../fx/tween";
import { Magic } from "../magic/magic";
import { Net, loadMe } from "../net/net";
import { Social } from "../net/social";
import { Witch } from "../player/witch";
import { shared } from "../render/toon";
import { Hud } from "../ui/hud";
import { Satchel } from "../ui/satchel";
import { Birds } from "../world/birds";
import { sampleMood } from "../world/daycycle";
import { Life } from "../world/life";
import { Weather } from "../world/weather";
import type { Pt } from "../world/walkmask";
import { buildWorld, seedOf } from "../world/world";
import { arrive, layoutFor } from "./arrival";
import { Cottage } from "./cottage";
import { setupEditor } from "./editing";
import { Interactions } from "./interact";
import { Rest } from "./rest";
import { Stage } from "./stage";
import { CROP_IDS, type CropId, type Inscription, type Save, load, resetSave, save } from "./state";
import { PortalTravel } from "./travel";

/** One game day lasts 24 real minutes at 1× speed. */
const HOURS_PER_SECOND = 1 / 60;
/** your home island always has twelve plots and three carving stones */
const HOME = { plots: 12, stones: 3 };

/** 1 standing on the nearest of `points`, fading to 0 at `range`. */
function nearness(at: Vector3, points: Pt[], range: number) {
  let best = Infinity;
  for (const [x, z] of points) best = Math.min(best, Math.hypot(x - at.x, z - at.z));
  return Math.max(0, 1 - best / range) ** 2;
}

/** Build everything for this page load and run the frame loop. */
export async function startGame() {
  const params = new URLSearchParams(location.search);
  const loading = document.getElementById("loading")!;
  const me = loadMe();
  const net = new Net(me);
  const veil = new PortalOverlay();
  if (params.get("via") === "portal") {
    veil.hold("Through the portal…");
    loading.classList.add("done");
  }

  // ---------- where are we ----------
  const here = await arrive(me, net, params);
  if (!here) {
    loading.textContent = "That island could not be reached. Going home…";
    setTimeout(() => (location.href = "/"), 1500);
    return;
  }
  const { islandId, commons, market, visiting, host } = here;
  /** the commons and the market belong to everyone: no farm, no carving stones */
  const everyone = commons || market;
  const mine = !visiting && !everyone;
  setTheme(commons ? "blossom" : market ? "meadow" : host ? host.theme : me.theme);
  const state = load(HOME.plots, HOME.stones);
  const layout = layoutFor(here, me, state);
  // the editor works on the world's copy, so Discard (or a timed save mid-edit) never keeps half an edit
  if (mine) state.island = structuredClone(layout);

  // ---------- the world ----------
  const canvas = document.getElementById("game") as HTMLCanvasElement;
  const stage = new Stage(canvas);
  const scene = stage.scene;
  const world = await buildWorld(scene, { kind: commons ? "commons" : market ? "market" : "home", layout });
  stage.fitShadows(world.bounds.center, world.bounds.radius);
  const witch = await Witch.load(me.color);
  witch.position.copy(world.spawn);
  witch.root.rotation.y = Math.PI / 4;
  scene.add(witch.root);
  const life = await Life.create(scene, world);
  witch.onFootstep = (at, running) => {
    life.footstep(at, running);
    sound.footstep(running);
  };
  const rig = new CameraRig(witch.position);
  stage.usePost(rig.camera);
  const input = new Input(canvas, rig.camera);
  const clock = { hour: Number(params.get("t") ?? state.hour), speed: 1 };
  const hud = new Hud(clock);
  const changed = (msg?: string) => {
    if (msg) {
      hud.pop(msg);
      if (msg.includes("coins")) sound.coins();
      else sound.pop();
    }
    hud.inventory(state);
  };

  // ---------- systems ----------
  // what the farm and the stones show: your save at home, the host's snapshot on a visit
  const view: Save = everyone ? { ...state, plots: [] } : host
    ? { ...state, plots: host.plots.map((p) => ({ crop: (p.crop as CropId | null) ?? null, growth: p.growth, wet: p.wet, locked: !!p.locked })) }
    : state;
  const stones: (Inscription | null)[] = host ? host.stones.map((s) => (s ? { ...s, spell: s.spell as Inscription["spell"], cooldown: 0 } : null)) : state.stones;
  if (host) host.plots = view.plots;

  const social = new Social(net, me, scene, rig.camera, hud, state, islandId, host);
  const farm = await Farm.create(scene, world.plots, view, changed);
  if (host) farm.visit = { owner: host.name, water: (plots) => net.send({ t: "water", island: host.id, plots }) };
  const flowers = new Flowers(world.flowerBeds, state, (c) => changed(`+1 ${c} flower`));
  const shops = new ShopPanel(state, changed);
  const satchel = new Satchel(state);
  hud.onInventory = () => {
    satchel.render();
    shops.render();
  };
  const workshop = new Workshop(scene, world.spots, state, changed, world.pond, () => shops.open(CRATE));
  const bazaar = market ? await Market.create(scene, world, shops) : null;
  const magic = await Magic.create(scene, world, life, witch, rig.camera, hud, state, {
    water: (at, radius) => farm.water(at, radius),
    grow: (at, radius, hours) => farm.grow(at, radius, hours),
    flower: (obj, color) => flowers.addGrown(obj, color),
  }, everyone ? [] : stones, mine);
  magic.onCast = (spell, at, power) => social.castSpell(spell, at, power);
  social.onRemoteSpell = (spell, at, power) => magic.remoteCast(spell, at, power);
  social.useMailbox(world.mailbox, world.spots.mailbox);
  const weather = new Weather(scene, seedOf(islandId));
  weather.force = (params.get("weather") as typeof weather.force) ?? null;
  weather.onRainbow = () => magic.remoteCast("rainbow", witch.position.clone().add(new Vector3(-2.5, 0, -2.5)), 3);
  const birds = new Birds(scene, world);
  const rest = new Rest(witch, clock, hud);
  const owner = commons ? "Blossom Commons" : market ? "Lantern Market" : host ? host.name : me.name;
  const garden = new Garden(scene, world, state, { onChange: changed, sit: rest.sitAt, owner, mine });
  rest.onStand = () => (garden.riding = null);
  const gather = new Gather(world, state, changed, mine);

  const persist = () => {
    state.hour = clock.hour;
    save(state);
    social.flush();
  };
  setInterval(persist, 5000);
  addEventListener("pagehide", persist);
  hud.onReset = () => {
    resetSave();
    removeEventListener("pagehide", persist);
    location.href = "/";
  };

  const cottage = await Cottage.create(
    {
      stage, world, witch, rig, clock, state, hud, rest, persist,
      owner: visiting ? host!.name : null,
      catchUp: (hours) => {
        farm.update(0, hours);
        flowers.update(hours);
      },
    },
    () => magic.openGrimoire(),
  );
  const editor = setupEditor({
    world, rig, canvas,
    canEdit: mine,
    blocked: () => cottage.inside || magic.drawing,
    wallet: state,
    before: structuredClone(layout),
    save: () => {
      state.island = world.layout;
      persist();
      removeEventListener("pagehide", persist);
    },
  });
  const tweens = new Tweens();
  const travel = new PortalTravel(scene, world, witch, rig.camera, veil, tweens, life);
  social.onTravel = (island) => travel.depart(island, () => {
    social.openAtlas(false);
    persist();
  });

  // ---------- what F does outside ----------
  const outdoors = new Interactions(rig.camera);
  for (const p of [rest.action, garden.fill, garden.seat, garden.hive, garden.sign, cottage.door, workshop.cauldron, workshop.market,
    workshop.pondside, ...(bazaar ? [bazaar.action, bazaar.board] : []), magic.contraptions.action, farm.action, flowers.action, gather.action, social.mailbox, social.portal(world.portalPos)]) outdoors.add(p);
  outdoors.onAct = () => witch.react("gesture");
  input.onPick = (p) => (cottage.inside ? cottage.indoors : outdoors).clicked(p);

  addEventListener("keydown", (e) => {
    const i = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6"].indexOf(e.code);
    if (i >= 0 && (e.target as HTMLElement).tagName !== "INPUT") {
      state.selected = CROP_IDS[i];
      hud.inventory(state);
    }
  });
  hud.onSelectSeed = (c) => {
    state.selected = c;
    hud.inventory(state);
  };
  hud.inventory(state);

  const resize = () => {
    stage.resize(innerWidth, innerHeight);
    rig.resize(innerWidth, innerHeight);
    magic.resize(innerWidth, innerHeight);
  };
  addEventListener("resize", resize);
  resize();

  // ---------- frame loop ----------
  const timer = new Timer();
  const atlas = document.getElementById("atlas")!;
  const loop = (now: number) => {
    timer.update(now);
    const dt = Math.min(timer.getDelta(), 0.05);
    shared.uTime.value += dt;

    // time and weather
    const hours = dt * HOURS_PER_SECOND * clock.speed;
    if (clock.hour + hours >= 24) state.day++;
    clock.hour = (clock.hour + hours) % 24;
    const mood = sampleMood(clock.hour);
    weather.update(dt, state.day, clock.hour, witch.position, mood);
    magic.baseWind = weather.windStrength;
    if (weather.raining > 0.4 && mine) farm.rain();
    stage.applyMood(mood, clock.hour, weather.raining, weather.overcast);

    // the witch
    const busy = magic.drawing || shops.isOpen || !atlas.hidden || editor.active || travel.active;
    if (editor.active) editor.focus.addScaledVector(input.wish(editor.focus), dt * 14);
    input.enabled = !editor.active;
    const wish = rest.update(busy ? new Vector3() : input.wish(witch.position), null);
    const before = witch.position.clone();
    witch.update(dt, wish, input.running, cottage.mask);
    rest.update(new Vector3(), garden.swingOffset());
    if (wish.lengthSq() > 0.01 && before.distanceToSquared(witch.position) < 1e-7) input.dropTarget();
    shared.uPlayer.value.copy(witch.position);
    tweens.update(dt);
    travel.update(dt);

    // everything else that lives
    garden.update(dt, hours, mood);
    gather.update(dt);
    life.update(dt, mood, witch.position);
    magic.update(dt, hours, mood);
    farm.update(dt, hours);
    flowers.update(hours);
    workshop.update(dt);
    bazaar?.update(dt, witch.position);
    social.update(dt, witch, cottage.inside ? world.door : null);
    cottage.update(dt, mood);
    birds.update(dt, witch.position, mood.glow > 0.6, weather.raining > 0.5);
    sound.update(dt, {
      wind: Math.min(1, (weather.windStrength - 1) / 1.6),
      rain: weather.raining,
      day: 1 - mood.glow,
      water: world.pond ? nearness(witch.position, world.pond, 6) : 0,
      fire: cottage.inside ? 0.7 : nearness(witch.position, world.flames.map((f) => {
        const p = f.getWorldPosition(new Vector3());
        return [p.x, p.z] as Pt;
      }), 5),
      inside: cottage.inside,
    });

    // prompts, camera, frame
    outdoors.enabled = !magic.drawing && !cottage.inside && !editor.active && !travel.active;
    magic.allowed = !cottage.inside && !editor.active;
    (cottage.inside ? cottage.indoors : outdoors).update(witch.position, dt);
    rig.addZoom(input.zoomDelta);
    input.zoomDelta = 0;
    rig.update(dt, editor.active ? editor.focus : cottage.inside ? cottage.cameraTarget() : witch.position);
    stage.post.render();
    hud.update(clock.hour, mood.glow, input.anyInput, weather.sky);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  loading.classList.add("done");
  if (here.viaPortal) void travel.arrive(world.portalPos.clone().add(new Vector3(1.4, 0, 1.4)));
  if (visiting) hud.toast(`${host!.name}'s island`, "Water their crops, leave a gift in the mailbox. The portal takes you home.");
  if (commons) hud.toast("Blossom Commons", "Everyone's island meets here.");
  if (market) hud.toast("Lantern Market", "Six shops, new prices every day. Talk to a keeper at their counter.");
  // handy in the browser console while developing
  Object.assign(window, { __game: { clock, witch, world, scene, camera: rig.camera, state, net, social, weather, sound } });
}
