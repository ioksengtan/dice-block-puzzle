import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  DICE,
  dailyStorageKey,
  readFirstSeconds,
  rememberFirstCompletion,
  rollDaily,
  shareText,
  taipeiDateKey,
} from "../site/daily.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function memoryStorage() {
  const items = new Map();
  return {
    getItem(key) {
      return items.has(key) ? items.get(key) : null;
    },
    setItem(key, value) {
      items.set(key, String(value));
    },
  };
}

test("沿用既有七顆骰子的骰面座標", () => {
  assert.deepEqual(DICE, [
    ["A1", "C1", "D1", "D2", "E2", "F3"],
    ["A2", "B2", "C2", "A3", "B1", "B3"],
    ["C3", "D3", "E3", "B4", "C4", "D4"],
    ["E1", "F2", "F2", "B6", "A5", "A5"],
    ["A4", "B5", "C6", "C5", "D6", "F6"],
    ["E4", "F4", "E5", "F5", "D5", "E6"],
    ["F1", "F1", "F1", "A6", "A6", "A6"],
  ]);
});

test("同一日期產生相同骰子", () => {
  const morning = rollDaily(new Date("2026-10-26T00:00:00.000+08:00"));
  const noon = rollDaily(new Date("2026-10-26T12:00:00.000+08:00"));
  const evening = rollDaily(new Date("2026-10-26T23:59:59.999+08:00"));

  assert.equal(morning.dateKey, "2026-10-26");
  assert.equal(noon.dateKey, "2026-10-26");
  assert.equal(evening.dateKey, "2026-10-26");
  assert.deepEqual(morning.dice, noon.dice);
  assert.deepEqual(morning.dice, evening.dice);
  assert.equal(morning.dice.length, 7);
  morning.dice.forEach((face, index) => {
    assert.ok(DICE[index].includes(face), `第 ${index + 1} 顆骰子的 ${face} 不在既有骰面`);
  });
  assert.notEqual(morning.dice, noon.dice);
});

test("不同日期產生不同骰子", () => {
  const days = [];
  for (let offset = 0; offset < 32; offset += 1) {
    days.push(rollDaily(new Date(Date.UTC(2026, 9, 1 + offset, 4, 0, 0))));
  }
  days.push(rollDaily(new Date("2024-02-29T12:00:00.000+08:00")));
  days.push(rollDaily(new Date("2027-01-01T12:00:00.000+08:00")));

  const signatures = days.map((puzzle) => puzzle.dice.join(","));
  assert.equal(new Set(signatures).size, signatures.length);
  assert.notDeepEqual(
    rollDaily(new Date("2026-10-26T12:00:00.000+08:00")).dice,
    rollDaily(new Date("2026-10-27T12:00:00.000+08:00")).dice,
  );
});

test("台北時區換日邊界正確", () => {
  const beforeMidnight = new Date("2026-10-25T15:59:59.999Z");
  const midnight = new Date("2026-10-25T16:00:00.000Z");
  assert.equal(taipeiDateKey(beforeMidnight), "2026-10-25");
  assert.equal(taipeiDateKey(midnight), "2026-10-26");
  assert.equal(rollDaily(beforeMidnight).dateKey, "2026-10-25");
  assert.equal(rollDaily(midnight).dateKey, "2026-10-26");
  assert.deepEqual(
    rollDaily(beforeMidnight).dice,
    rollDaily(new Date("2026-10-25T23:59:59.999+08:00")).dice,
  );
  assert.deepEqual(
    rollDaily(midnight).dice,
    rollDaily(new Date("2026-10-26T00:00:00.000+08:00")).dice,
  );
  assert.notDeepEqual(rollDaily(beforeMidnight).dice, rollDaily(midnight).dice);

  assert.equal(taipeiDateKey(new Date("2026-12-31T15:59:59.999Z")), "2026-12-31");
  assert.equal(taipeiDateKey(new Date("2026-12-31T16:00:00.000Z")), "2027-01-01");
  assert.equal(taipeiDateKey(new Date("2024-02-28T15:59:59.999Z")), "2024-02-28");
  assert.equal(taipeiDateKey(new Date("2024-02-28T16:00:00.000Z")), "2024-02-29");
  assert.equal(taipeiDateKey(new Date("2024-02-29T15:59:59.999Z")), "2024-02-29");
  assert.equal(taipeiDateKey(new Date("2024-02-29T16:00:00.000Z")), "2024-03-01");
});

test("台北時區換日不依裝置時區", () => {
  const modulePath = path.join(root, "site", "daily.js");
  const script = `
    import { taipeiDateKey, rollDaily } from ${JSON.stringify(modulePath)};
    const beforeMidnight = new Date("2026-10-25T15:59:59.999Z");
    const midnight = new Date("2026-10-25T16:00:00.000Z");
    const beforeKey = taipeiDateKey(beforeMidnight);
    const afterKey = taipeiDateKey(midnight);
    if (beforeKey !== "2026-10-25" || afterKey !== "2026-10-26") {
      console.error(beforeKey + " " + afterKey);
      process.exit(1);
    }
    const localHour = midnight.getHours();
    if (localHour === 0) {
      console.error("device zone unexpectedly matches Taipei midnight");
      process.exit(1);
    }
    if (rollDaily(beforeMidnight).dice.join(",") === rollDaily(midnight).dice.join(",")) {
      console.error("dice did not change at Taipei midnight");
      process.exit(1);
    }
    console.log(afterKey);
  `;
  const output = execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    env: { ...process.env, TZ: "Pacific/Honolulu" },
    encoding: "utf8",
  });
  assert.match(output, /2026-10-26/);
});

test("每日一題一天只記第一次完成的秒數", () => {
  const storage = memoryStorage();
  const dateKey = "2026-10-26";
  assert.equal(dailyStorageKey(dateKey), "骰陣拼圖每日一題 2026-10-26");
  assert.equal(readFirstSeconds(storage, dateKey), null);

  const first = rememberFirstCompletion(storage, dateKey, 83.9);
  assert.deepEqual(first, { saved: true, seconds: 83 });
  assert.equal(storage.getItem(dailyStorageKey(dateKey)), "83");

  const second = rememberFirstCompletion(storage, dateKey, 20);
  assert.deepEqual(second, { saved: false, seconds: 83 });
  assert.equal(readFirstSeconds(storage, dateKey), 83);

  const nextDay = rememberFirstCompletion(storage, "2026-10-27", 41);
  assert.deepEqual(nextDay, { saved: true, seconds: 41 });
  assert.equal(readFirstSeconds(storage, dateKey), 83);

  const zeroStorage = memoryStorage();
  assert.deepEqual(rememberFirstCompletion(zeroStorage, "2026-01-01", 0), {
    saved: true,
    seconds: 0,
  });
  assert.deepEqual(rememberFirstCompletion(zeroStorage, "2026-01-01", 9), {
    saved: false,
    seconds: 0,
  });
  assert.equal(readFirstSeconds(zeroStorage, "2026-01-01"), 0);
});

test("分享文字只有日期和秒數", () => {
  assert.equal(shareText("2026-10-26", 83), "骰陣拼圖每日一題 2026-10-26：83 秒");
  assert.equal(shareText("2026-10-26", 83.8), "骰陣拼圖每日一題 2026-10-26：83 秒");
});
