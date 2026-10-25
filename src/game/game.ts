import { Timer, Vector3 } from "three";
import { sound } from "../audio/sound";
import { CameraRig } from "../core/camera";
import { Input } from "../core/input";
import { setTheme } from "../core/palette";
import { Farm } from "../farm/farm";
import { Flowers } from "../farm/flowers";
import { Garden } from "../farm/garden";
import { Animals } from "../farm/animals";
import { Gather } from "../farm/gather";
import { Workshop } from "../farm/workshop";
import { Market } from "../market/market";
import { ShopPanel } from "../market/panel";
import { CRATE } from "../market/shops";
import { Stalls } from "../market/stalls";
import { PortalOverlay } from "../fx/portal";
import { Tweens } from "../fx/tween";
import { Magic } from "../magic/magic";
import type { Account } from "../net/account";
import { Net, forgetOldProfile, oldProfile } from "../net/net";
import { Social } from "../net/social";
import { Witch } from "../player/witch";
import { shared } from "../render/toon";
import { fadeThrough } from "../ui/fade";
import { Hud } from "../ui/hud";
import { WorldMap } from "../ui/map";
import { Satchel } from "../ui/satchel";
import { Birds } from "../world/birds";
import { FAMILIAR_KINDS, Familiar, type FamiliarKind } from "../world/familiar";
import { Atmosphere } from "../world/atmosphere";
import { sampleMood } from "../world/daycycle";
import { Life } from "../world/life";
import { Weather } from "../world/weather";
import type { Pt } from "../world/walkmask";
import { buildWorld, seedOf } from "../world/world";
import { arrive, layoutFor } from "./arrival";
import { Cottage } from "./cottage";
import { setupEditor } from "./editing";
import { Interactions } from "./interact";
import { Kingdom } from "../kingdom/kingdom";
import { PalaceHall } from "../kingdom/palace";
import { KingdomWorld } from "../kingdom/world";
import { syncCuts } from "../render/cut";
import { Rest } from "./rest";
import { Stage } from "./stage";
import { BASKETS, BOOTS, CROP_IDS, type CropId, type Inscription, type Save, forgetOldSave, inkMax, load, oldSave, resetSave, save } from "./state";
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
export async function startGame(account: Account) {
  const params = new URLSearchParams(location.search);
  const loading = document.getElementById("loading")!;
  const me = account.me;
  const net = new Net();
  // the first account signed in on a browser that played before accounts takes that island along
  let saved = account.save;
  const old = oldProfile();
  if (!saved && (oldSave() || old)) {
    saved = oldSave();
    forgetOldSave();
    if (old) {
      Object.assign(me, { color: old.color ?? me.color, hat: old.hat ?? me.hat, theme: old.theme ?? me.theme });
      forgetOldProfile();
      void net.next("welcome", 20_000).then((w) => {
        if (!w) return;
        net.send({ t: "claim", id: old.id, token: old.token });
        net.send({ t: "profile", color: me.color, hat: me.hat, theme: me.theme });
      });
    }
  }
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
  const { islandId, commons, market, kingdom, visiting, host } = here;
  /** the commons, the market and the kingdom belong to everyone: no farm, no carving stones */
  const everyone = commons || market || kingdom;
  const mine = !visiting && !everyone;
  const theme = commons ? "blossom" : market || kingdom ? "meadow" : host ? host.theme : me.theme;
  setTheme(theme);
  const state = load(HOME.plots, HOME.stones, me.id, saved);
  const layout = layoutFor(here, me, state);
  // the editor works on the world's copy, so Discard (or a timed save mid-edit) never keeps half an edit
  if (mine) state.island = structuredClone(layout);

  // ---------- the world ----------
  const canvas = document.getElementById("game") as HTMLCanvasElement;
  const stage = new Stage(canvas);
  const scene = stage.scene;
  const world = kingdom ? await KingdomWorld.create(scene) : await buildWorld(scene, { kind: commons ? "commons" : market ? "market" : "home", layout });
  if (kingdom) Witch.ground = (x, z) => world.ground(x, z);
  stage.fitShadows(world.bounds.center, world.bounds.radius);
  const witch = await Witch.load(me.color, me.hat);
  // `?at=<place>` starts at one of the map's places (handy while developing)
  witch.position.copy(world.places.find((p) => p.id === params.get("at"))?.pos ?? world.spawn);
  witch.root.rotation.y = Math.PI / 4;
  scene.add(witch.root);
  const life = await Life.create(scene, world);
  const atmos = new Atmosphere(scene, world, theme);
  witch.onFootstep = (at, running) => {
    const on = atmos.surface(at);
    if (on === "water") atmos.splash(at);
    else life.footstep(at, running);
    sound.footstep(running, on);
    farm.brush(at);
  };
  // your familiar comes everywhere with you, except to a friend's island, where theirs keeps you company
  const familiarOf = () => host
    ? (FAMILIAR_KINDS.includes(host.familiar?.kind as FamiliarKind) ? { kind: host.familiar!.kind as FamiliarKind, name: host.familiar!.name } : null)
    : state.familiar;
  const makeFamiliar = () => {
    const spec = familiarOf();
    if (!spec) return null;
    const f = new Familiar(scene, world, witch, spec);
    f.onVoice = (what) => sound.familiar(spec.kind, what);
    return f;
  };
  let familiar = makeFamiliar();
  const rig = new CameraRig(witch.position);
  stage.usePost(rig.camera);
  if (kingdom) rig.minZoom = 0.4;
  if (params.get("zoom")) rig.addZoom(Math.log(Number(params.get("zoom")) || 1));
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
  const flowers = new Flowers(world.flowerBeds, state, (c) => {
    const n = BASKETS[state.basket].per;
    changed(`+${n} ${c} flower${n > 1 ? "s" : ""}`);
  });
  const shops = new ShopPanel(state, changed);
  const satchel = new Satchel(state);
  hud.onInventory = () => {
    satchel.render();
    shops.render();
    stalls?.render();
    realm?.render();
  };
  shops.onLearn = (s) => magic.learnSigil(s);
  shops.wearing = () => me.hat ?? "classic";
  shops.onWear = (h) => {
    witch.setHat(h);
    social.wearHat(h);
  };
  satchel.onUse = (spell) => magic.useCharm(spell);
  const workshop = new Workshop(scene, world.spots, state, changed, world.pond, () => shops.open(CRATE));
  const bazaar = market ? await Market.create(scene, world, shops) : null;
  const stalls = market ? new Stalls(net, me, state, world, rig.camera, hud, changed) : null;
  const realm = world instanceof KingdomWorld ? await Kingdom.create(scene, world, state, hud, shops, changed) : null;
  const magic = await Magic.create(scene, world, life, witch, rig.camera, hud, state, {
    water: (at, radius) => farm.water(at, radius),
    grow: (at, radius, hours) => farm.grow(at, radius, hours),
    flower: (obj, color) => flowers.addGrown(obj, color),
  }, everyone ? [] : stones, mine);
  magic.onCast = (spell, at, power) => {
    if (familiar && familiar.position.distanceTo(at) < 6) familiar.startle();
    social.castSpell(spell, at, power);
    realm?.onCast(spell, at, power);
  };
  magic.onInventory = () => hud.inventory(state);
  social.onDeeds = () => hud.inventory(state);
  social.onRemoteSpell = (spell, at, power) => magic.remoteCast(spell, at, power);
  social.useMailbox(world.mailbox, world.spots.mailbox);
  const weather = new Weather(scene, seedOf(islandId));
  weather.force = (params.get("weather") as typeof weather.force) ?? null;
  weather.onRainbow = () => magic.remoteCast("rainbow", witch.position.clone().add(new Vector3(-2.5, 0, -2.5)), 3);
  const birds = new Birds(scene, world);
  const rest = new Rest(witch, clock, hud);
  const owner = commons ? "Blossom Commons" : market ? "Lantern Market" : kingdom ? "Aetherhold" : host ? host.name : me.name;
  const garden = new Garden(scene, world, state, { onChange: changed, sit: rest.sitAt, owner, mine });
  rest.onStand = () => (garden.riding = null);
  const gather = new Gather(world, state, changed, mine);
  const animals = new Animals(scene, world, state, {
    onChange: changed, mine, owner,
    feedVisit: host ? (trough, crop) => net.send({ t: "feed", island: host.id, trough, crop }) : null,
  });

  /** `leaving`: the page is about to change, so the upload must outlive it */
  const persist = (leaving = false) => {
    state.hour = clock.hour;
    save(state, leaving);
    social.flush();
  };
  const leave = () => persist(true);
  setInterval(persist, 5000);
  addEventListener("pagehide", leave);
  hud.onReset = async () => {
    removeEventListener("pagehide", leave);
    await resetSave();
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

  // ---------- the Palace of Aether: its great door leads into the throne hall ----------
  const palace = world instanceof KingdomWorld ? await PalaceHall.create({
    exit: () => cottage.leave(),
    read: () => magic.openGrimoire(),
    pop: (t) => hud.pop(t),
    toast: (title, text) => hud.toast(title, text),
    stipend: (coins) => {
      state.coins += coins;
      changed(`+${coins} coins`);
    },
    fillInk: () => {
      if (state.ink >= inkMax(state)) return false;
      state.ink = inkMax(state);
      changed("Ink full");
      return true;
    },
    days: (state.kingdom ??= {}),
  }) : null;
  const palaceDoor = (() => {
    const lot = world instanceof KingdomWorld ? world.plan.lots.find((l) => l.kind === "palace") : null;
    if (!palace || !lot) return () => null;
    palace.watch(witch.position);
    // just outside the great door, on the palace's front face
    const out = (d: number) => {
      const x = lot.x + d * Math.sin(lot.rot);
      const z = lot.z + d * Math.cos(lot.rot);
      return new Vector3(x, world.ground(x, z), z);
    };
    const door = out(lot.hd + 0.9);
    return (near: Vector3) => Math.hypot(door.x - near.x, door.z - near.z) > 1.8 ? null
      : { pos: door, reach: 1.8, label: "Enter the Palace of Aether", act: () => cottage.enter(palace, out(lot.hd + 1.6)), priority: 1 };
  })();
  const editor = setupEditor({
    world, rig, canvas,
    canEdit: mine,
    blocked: () => cottage.inside || magic.drawing,
    wallet: state,
    before: structuredClone(layout),
    save: () => {
      state.island = world.layout;
      persist(true);
      removeEventListener("pagehide", leave);
    },
  });
  const tweens = new Tweens();
  const travel = new PortalTravel(scene, world, witch, rig.camera, veil, tweens, life);
  social.onTravel = (island) => travel.depart(island, () => {
    map.close();
    persist(true);
  }, witch.position.distanceTo(world.portalPos) > 3);

  // ---------- the map: every island you can reach, and every place on this one ----------
  const map = new WorldMap({
    net, me, social, hud, world, witch, islandId,
    home: state.island ?? null,
    travel: (island) => social.onTravel(island),
    teleport: (to) => {
      if (witch.sitting) rest.standUp();
      sound.whoosh();
      life.footstep(witch.position.clone(), true);
      fadeThrough(() => {
        to.y = world.ground(to.x, to.z);
        witch.position.copy(to);
        input.dropTarget();
        rig.snap(rig.zoomLevel, to);
        life.footstep(to.clone(), true);
        witch.react("cast");
      });
    },
    familiar: {
      get: () => state.familiar,
      set: (f) => {
        const kind = f.kind !== state.familiar.kind;
        state.familiar = f;
        persist();
        cottage.refreshPet();
        if (host) return;
        if (kind) {
          familiar?.dispose();
          familiar = makeFamiliar();
        } else if (familiar) familiar.spec = f;
      },
    },
    stuck: () => cottage.inside ? "Step outside first." : editor.active ? "Close the editor first." : travel.active ? "You are already on your way." : magic.drawing ? "Put the pen away first (Esc)." : null,
  });
  const portalAt = world.portalPos;
  const portal = (near: Vector3) => Math.hypot(portalAt.x - near.x, portalAt.z - near.z) > 2.2 ? null : { pos: portalAt, reach: 2.2, label: "Step into the portal", act: () => map.open("world"), priority: 1.5 };

  // ---------- what F does outside ----------
  const outdoors = new Interactions(rig.camera);
  for (const p of [rest.action, garden.fill, garden.seat, garden.hive, garden.sign, cottage.door, workshop.cauldron, workshop.market,
    workshop.pondside, (near: Vector3) => familiar?.action(near) ?? null, ...(bazaar && stalls ? [bazaar.action, stalls.action] : []), ...(realm?.actions ?? []), palaceDoor, magic.contraptions.action, farm.action, flowers.action, gather.action, animals.action, animals.trough, social.mailbox, portal]) outdoors.add(p);
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
  /** seconds the witch has stood still, so the familiar knows when to nap */
  let idle = 0;
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
    if (world instanceof KingdomWorld) {
      syncCuts();
      world.animate(shared.uTime.value, mood.glow);
    }

    // the witch
    const busy = magic.drawing || shops.isOpen || !!stalls?.isOpen || !!realm?.panelOpen || map.isOpen || editor.active || travel.active;
    if (editor.active) editor.focus.addScaledVector(input.wish(editor.focus), dt * 14);
    input.enabled = !editor.active;
    const wish = rest.update(busy ? new Vector3() : input.wish(witch.position), null);
    const before = witch.position.clone();
    // honey mead from the Gilded Griffin: a third faster for a while
    witch.speedUp = BOOTS[state.boots].speed * ((state.kingdom?.meadUntil ?? 0) > Date.now() ? 1.3 : 1);
    // indoors the floor is the room's own: clicks land on it too
    input.ground = Witch.ground;
    witch.update(dt, wish, input.running, cottage.mask);
    rest.update(new Vector3(), garden.swingOffset());
    if (wish.lengthSq() > 0.01 && before.distanceToSquared(witch.position) < 1e-7) input.dropTarget();
    shared.uPlayer.value.copy(witch.position);
    tweens.update(dt);
    travel.update(dt);

    // everything else that lives
    garden.update(dt, hours, mood);
    gather.update(dt);
    animals.update(dt, editor.active);
    life.wind = weather.windStrength;
    life.update(dt, mood, witch.position);
    atmos.update(dt, hours, clock.hour, mood, weather.raining, weather.windStrength, witch.position);
    idle = witch.speed > 0.2 || magic.drawing ? 0 : idle + dt;
    if (familiar) {
      familiar.away = cottage.inside || travel.active;
      familiar.update(dt, {
        raining: weather.raining,
        night: mood.glow,
        idle,
        fires: world.flames.map((f) => f.getWorldPosition(new Vector3())),
        butterfly: (p, r) => life.butterfly(p, r),
      });
    }
    magic.update(dt, hours, mood);
    farm.update(dt, hours);
    flowers.update(hours);
    workshop.update(dt);
    bazaar?.update(dt, witch.position);
    stalls?.update();
    realm?.update(dt, witch.position, mood);
    social.update(dt, witch, cottage.inside ? cottage.outside : null);
    map.update();
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
      crowd: market ? 1 : realm && !cottage.inside ? realm.crowd(witch.position) : 0,
      bees: cottage.inside ? 0 : atmos.hum,
      inside: cottage.inside,
    });

    // prompts, camera, frame
    outdoors.enabled = !magic.drawing && !cottage.inside && !editor.active && !travel.active;
    magic.allowed = !cottage.inside && !editor.active;
    (cottage.inside ? cottage.indoors : outdoors).update(witch.position, dt);
    rig.addZoom(input.zoomDelta);
    input.zoomDelta = 0;
    rig.update(dt, editor.active ? editor.focus : cottage.inside ? cottage.cameraTarget() : realm ? realm.lookAt(witch.position) : witch.position);
    stage.post.render();
    hud.update(clock.hour, mood.glow, input.anyInput, weather.sky);
    if (FPS_PROBE) {
      FPS_PROBE.frames++;
      if (now - FPS_PROBE.since > 2000) {
        document.title = `fps ${Math.round((FPS_PROBE.frames * 1000) / (now - FPS_PROBE.since))} calls ${stage.renderer.info.render.calls} tris ${stage.renderer.info.render.triangles}`;
        FPS_PROBE.frames = 0;
        FPS_PROBE.since = now;
      }
      stage.renderer.info.reset();
    }
    requestAnimationFrame(loop);
  };
  // `?fps` puts frames per second, draw calls and triangles (all passes) in the tab title
  const FPS_PROBE = params.has("fps") ? { frames: 0, since: performance.now() } : null;
  if (FPS_PROBE) stage.renderer.info.autoReset = false;
  requestAnimationFrame(loop);
  loading.classList.add("done");
  if (here.viaPortal) void travel.arrive(world.portalPos.clone().add(new Vector3(1.4, 0, 1.4)));
  if (visiting) hud.toast(`${host!.name}'s island`, "Water their crops, leave a gift in the mailbox. The portal takes you home.");
  if (commons) hud.toast("Blossom Commons", "Everyone's island meets here.");
  if (market) hud.toast("Lantern Market", "Six shops, new prices every day. Talk to a keeper at their counter.");
  if (kingdom) hud.toast("Aetherhold", "The royal city, seat of magic. Climb to the palace; the tavern, the Arcanum and the spell range are on the way.");
  // handy in the browser console while developing
  Object.assign(window, { __game: { familiar: () => familiar, atmos, clock, witch, world, scene, camera: rig.camera, state, net, social, weather, sound, magic, satchel, shops, map } });
}
