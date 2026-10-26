// Daily puzzle for 骰陣拼圖.
// The calendar date in Asia/Taipei is the seed. Every player who starts
// that Taipei date receives the same seven faces. The device time zone
// is never consulted.
//
// Die faces name one blocked cell each (rows A–F, columns 1–6). Each of
// the 36 cells appears on exactly one die; two dice repeat faces. These
// are the physical faces listed by ManGo's Gaming (corrected) and by
// mitchblank/gsqsolve, which cites the same coordinates:
// https://mangosgaming.uk/portfolio/review-genius-square/
// https://github.com/mitchblank/gsqsolve/blob/main/gsqsolve.cpp
// https://www.reddit.com/r/boardgames/comments/kxt1q3/comment/gjc5m2n/
// Keep the face lists in sync with tools/verify_solvability.py.

export const DICE = [
  ["A1", "C1", "D1", "D2", "E2", "F3"],
  ["A2", "B2", "C2", "A3", "B1", "B3"],
  ["C3", "D3", "E3", "B4", "C4", "D4"],
  ["E1", "F2", "F2", "B6", "A5", "A5"],
  ["A4", "B5", "C6", "C5", "D6", "F6"],
  ["E4", "F4", "E5", "F5", "D5", "E6"],
  ["F1", "F1", "F1", "A6", "A6", "A6"],
];

const TAIPEI_TIME_ZONE = "Asia/Taipei";
const STORAGE_PREFIX = "骰陣拼圖每日一題 ";

export function taipeiDateKey(instant = new Date()) {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("需要有效的時間");
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TAIPEI_TIME_ZONE,
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type) => parts.find((part) => part.type === type)?.value;
  const year = value("year");
  const month = value("month");
  const day = value("day");
  if (!year || !month || !day) {
    throw new TypeError("無法換算台北時區的日期");
  }
  return `${year}-${month}-${day}`;
}

function hashSeed(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export function rollDaily(instant = new Date()) {
  const dateKey = taipeiDateKey(instant);
  const random = mulberry32(hashSeed(dateKey));
  const dice = DICE.map((faces) => faces[Math.floor(random() * faces.length)]);
  return { dateKey, dice };
}

export function shareText(dateKey, seconds) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new TypeError("分享文字只能包含日期");
  }
  const wholeSeconds = Math.floor(Number(seconds));
  if (!Number.isFinite(wholeSeconds) || wholeSeconds < 0) {
    throw new TypeError("分享文字只能包含秒數");
  }
  return `骰陣拼圖每日一題 ${dateKey}：${wholeSeconds} 秒`;
}

export function dailyStorageKey(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new TypeError("日期必須是年月日");
  }
  return `${STORAGE_PREFIX}${dateKey}`;
}

export function readFirstSeconds(storage, dateKey) {
  const raw = storage.getItem(dailyStorageKey(dateKey));
  if (raw === null || !/^\d+$/.test(raw)) return null;
  return Number(raw);
}

export function rememberFirstCompletion(storage, dateKey, seconds) {
  const key = dailyStorageKey(dateKey);
  const existing = storage.getItem(key);
  if (existing !== null && /^\d+$/.test(existing)) {
    return { saved: false, seconds: Number(existing) };
  }
  const wholeSeconds = Math.floor(Number(seconds));
  if (!Number.isFinite(wholeSeconds) || wholeSeconds < 0) {
    throw new TypeError("秒數必須是零或正整數");
  }
  storage.setItem(key, String(wholeSeconds));
  return { saved: true, seconds: wholeSeconds };
}
