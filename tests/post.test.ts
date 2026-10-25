import assert from "node:assert/strict";
import test from "node:test";
import { answer, deliver, letterFor, newPost, unread } from "../src/game/post.ts";

test("the first morning brings Hazel's welcome, with flowers for tea", () => {
  const post = newPost();
  assert.equal(deliver(post, "witch-a", 1), 1);
  assert.equal(post.letters[0].from, "Hazel");
  assert.deepEqual(post.letters[0].gift, { item: "flower:white", n: 2 });
  assert.equal(unread(post), 1);
  // the same day again brings nothing
  assert.equal(deliver(post, "witch-a", 1), 0);
});

test("letters are the same for the same witch and day, and most days bring one", () => {
  assert.deepEqual(letterFor("witch-a", 7), letterFor("witch-a", 7));
  let n = 0;
  for (let d = 2; d < 102; d++) if (letterFor("witch-b", d)) n++;
  assert.ok(n > 60 && n < 95, `${n} letters in 100 days`);
});

test("a favour answered comes back as a thank-you with the reward next morning", () => {
  const post = newPost();
  deliver(post, "witch-c", 1);
  let day = 2;
  let ask = null;
  while (!ask && day < 200) {
    deliver(post, "witch-c", day);
    ask = post.letters.find((l) => l.ask && !l.ask.sent) ?? null;
    day++;
  }
  assert.ok(ask?.ask, "some day asks for a favour");
  answer(post, ask);
  assert.equal(post.outbox.length, 1);
  deliver(post, "witch-c", day);
  const thanks = post.letters.find((l) => l.text.startsWith("Thank you"));
  assert.deepEqual(thanks?.gift, ask.ask.reward);
});

test("unanswered favours are forgotten after their day", () => {
  const post = newPost();
  deliver(post, "witch-d", 1);
  for (let d = 2; d < 60; d++) deliver(post, "witch-d", d);
  assert.ok(post.letters.every((l) => !l.ask || l.ask.due >= 59));
  assert.ok(post.letters.length <= 30);
});
