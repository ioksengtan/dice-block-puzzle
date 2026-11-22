import assert from "node:assert/strict";
import test from "node:test";

import { DICE } from "../site/daily.js";
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  isValidBoardCode,
  makeBoardCode,
  normalizeBoardCode,
  readBoardCodeFromSearch,
  rollBoardFromCode,
} from "../site/board.js";

function signature(dice) {
  return dice.join(",");
}

// 以索引產生固定、可重現的一組代碼，讓測試結果不隨執行而變動。
function codeForIndex(index) {
  let value = index;
  let code = "";
  for (let position = 0; position < CODE_LENGTH; position += 1) {
    code = CODE_ALPHABET[value % CODE_ALPHABET.length] + code;
    value = Math.floor(value / CODE_ALPHABET.length);
  }
  return code;
}

test("同一組代碼永遠產生相同盤面", () => {
  const first = rollBoardFromCode("K7P2");
  const second = rollBoardFromCode("K7P2");
  assert.equal(first.code, "K7P2");
  assert.deepEqual(first.dice, second.dice);
  assert.equal(first.dice.length, 7);
});

test("代碼抽到的骰面都來自既有骰面表，且七個阻擋格互不重複", () => {
  for (let index = 0; index < 50; index += 1) {
    const { dice } = rollBoardFromCode(codeForIndex(index * 37 + 11));
    assert.equal(dice.length, 7);
    dice.forEach((face, die) => {
      assert.ok(DICE[die].includes(face), `第 ${die + 1} 顆骰子的 ${face} 不在既有骰面`);
    });
    // 每個座標只屬於一顆骰子，所以七個阻擋格一定各不相同。
    assert.equal(new Set(dice).size, 7);
  }
});

test("代碼大小寫、連字號與常見誤讀都視為同一組", () => {
  const base = rollBoardFromCode("K7P2");
  assert.deepEqual(rollBoardFromCode("k7p2").dice, base.dice);
  assert.deepEqual(rollBoardFromCode(" K7-P2 ").dice, base.dice);
  assert.deepEqual(rollBoardFromCode("K7P2").code, "K7P2");

  // O→0、I/L→1 的校正讓口頭對讀更不容易出錯。
  const corrected = rollBoardFromCode("0I1O");
  assert.equal(corrected.code, "0110");
  assert.deepEqual(rollBoardFromCode("0110").dice, corrected.dice);
});

test("透過網址參數載入的代碼與直接載入完全相同", () => {
  const fromB = readBoardCodeFromSearch("?b=K7P2");
  const fromBoard = readBoardCodeFromSearch("?board=k7-p2&foo=1");
  assert.equal(fromB, "K7P2");
  assert.equal(fromBoard, "K7P2");
  assert.deepEqual(rollBoardFromCode(fromB).dice, rollBoardFromCode("K7P2").dice);
  assert.deepEqual(rollBoardFromCode(fromBoard).dice, rollBoardFromCode("K7P2").dice);

  assert.equal(readBoardCodeFromSearch(""), null);
  assert.equal(readBoardCodeFromSearch("?x=1"), null);
  assert.equal(readBoardCodeFromSearch("?b=--"), null);
});

test("不同代碼會產生不同盤面（足夠多樣本）", () => {
  const samples = 300;
  const signatures = new Set();
  for (let index = 0; index < samples; index += 1) {
    signatures.add(signature(rollBoardFromCode(codeForIndex(index)).dice));
  }
  // 總共只有 62208 種盤面，理論上允許極少量碰撞，但絕大多數應各不相同。
  assert.ok(
    signatures.size >= samples * 0.95,
    `不同代碼的盤面太容易重複：${samples} 組只有 ${signatures.size} 種`,
  );

  // 相鄰代碼也不會剛好相同。
  assert.notDeepEqual(
    rollBoardFromCode("AAAA").dice,
    rollBoardFromCode("AAAB").dice,
  );
});

test("makeBoardCode 只會用合法字母，且長度固定", () => {
  // 以可重現的序列代替亂數，確認產生的代碼可以直接載入。
  let tick = 0.123;
  const unit = () => {
    tick = (tick * 7.17 + 0.31) % 1;
    return tick;
  };
  for (let index = 0; index < 100; index += 1) {
    const code = makeBoardCode(unit);
    assert.equal(code.length, CODE_LENGTH);
    for (const character of code) {
      assert.ok(CODE_ALPHABET.includes(character), `${character} 不是合法字母`);
    }
    assert.ok(isValidBoardCode(code));
    assert.equal(rollBoardFromCode(code).dice.length, 7);
  }
});

test("isValidBoardCode 擋掉太短或空白的輸入", () => {
  assert.equal(isValidBoardCode("K7P2"), true);
  assert.equal(isValidBoardCode("abc"), true);
  assert.equal(isValidBoardCode("ab"), false);
  assert.equal(isValidBoardCode("   "), false);
  assert.equal(isValidBoardCode(""), false);
  assert.equal(normalizeBoardCode("k7-p2"), "K7P2");
});
