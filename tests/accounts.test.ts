import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { openAccounts } from "../server/accounts.ts";

const dir = mkdtempSync(join(tmpdir(), "aftergrowth-"));
process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret";
const accounts = await openAccounts(join(dir, "test.db"));
after(() => {
  accounts.close();
  rmSync(dir, { recursive: true, force: true });
});

const witch = async (name: string) => {
  const r = await accounts.auth.api.signUpEmail({ body: { name, email: `${name.toLowerCase()}@test.local`, password: "a-long-password" } });
  return r.user.id;
};
const [alba, bruno, cleo] = [await witch("Alba"), await witch("Bruno"), await witch("Cleo")];

test("every account gets a witch with a unique friend code", () => {
  const codes = [alba, bruno, cleo].map((id) => accounts.profile(id)!.code);
  assert.equal(new Set(codes).size, 3);
  assert.equal(accounts.byCode(codes[1].toLowerCase()), bruno);
  assert.equal(accounts.byCode("nope00"), null);
});

test("islands are private until a friend opens their portal", () => {
  assert.ok(accounts.canVisit(alba, alba));
  assert.ok(!accounts.canVisit(alba, bruno));
  // not friends yet: the portal can't open
  assert.equal(accounts.setPortal(bruno, alba, true), false);
  assert.equal(accounts.befriend(alba, bruno), "asked");
  assert.equal(accounts.befriend(alba, bruno), "already");
  assert.equal(accounts.friends(bruno)[0].status, "incoming");
  assert.equal(accounts.friends(alba)[0].status, "outgoing");
  assert.equal(accounts.setPortal(bruno, alba, true), false);
  assert.equal(accounts.befriend(bruno, alba), "friends");
  // friends, but each portal is closed until its owner opens it
  assert.ok(!accounts.canVisit(alba, bruno));
  assert.ok(accounts.setPortal(bruno, alba, true));
  assert.ok(accounts.canVisit(alba, bruno));
  assert.ok(!accounts.canVisit(bruno, alba));
  assert.ok(!accounts.canVisit(cleo, bruno));
  const seen = accounts.friends(alba)[0];
  assert.deepEqual([seen.status, seen.open, seen.mine], ["friend", true, false]);
});

test("unfriending closes both portals", () => {
  accounts.setPortal(alba, bruno, true);
  accounts.unfriend(bruno, alba);
  assert.ok(!accounts.canVisit(alba, bruno));
  assert.ok(!accounts.canVisit(bruno, alba));
  assert.deepEqual(accounts.friends(alba), []);
});

test("saves round-trip and refuse junk", () => {
  assert.equal(accounts.loadSave(cleo), null);
  assert.ok(accounts.storeSave(cleo, JSON.stringify({ version: 1, coins: 7 })));
  assert.deepEqual(JSON.parse(accounts.loadSave(cleo)!.data), { version: 1, coins: 7 });
  assert.equal(accounts.storeSave(cleo, "not json"), false);
  assert.equal(accounts.storeSave(cleo, JSON.stringify("x".repeat(400_000))), false);
  accounts.dropSave(cleo);
  assert.equal(accounts.loadSave(cleo), null);
});

test("profile changes keep only valid values", async () => {
  const p = await accounts.updateProfile(cleo, { name: " <Cleo> Moss ", color: "red", hat: "crown", theme: "autumn" });
  assert.equal(p!.name, "Cleo Moss");
  assert.match(p!.color, /^#[0-9a-f]{6}$/i);
  assert.equal(p!.hat, "crown");
  assert.equal(p!.theme, "autumn");
});
