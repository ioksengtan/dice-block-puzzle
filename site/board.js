// 盤面代碼：讓兩台裝置打開完全相同的一盤。
//
// 一組盤面代碼決定七顆骰子各自抽到的骰面，因此兩台裝置輸入同一組代碼
// （或打開帶同一網址參數的頁面）就會得到完全相同的七個阻擋格與棋盤。
// 抽面沿用每日一題的同一張骰面表（daily.js 的 DICE），所以任何代碼都對應
// 既有的 6^7 種骰子組合之一，必定有解，不會造出無解的阻擋配置。
//
// 代碼使用 Crockford Base32 字母表（不含 I、L、O、U），短又方便口頭對讀、
// 拍進畫面。輸入時大小寫不拘，連字號與空白會自動忽略，常見誤讀（O→0、
// I/L→1）也會自動校正。

import { DICE, hashSeed, mulberry32 } from "./daily.js";

export const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const CODE_LENGTH = 4;

export function normalizeBoardCode(raw) {
  let text = String(raw ?? "").toUpperCase();
  text = text.replace(/O/g, "0").replace(/[IL]/g, "1").replace(/U/g, "V");
  return Array.from(text)
    .filter((character) => CODE_ALPHABET.includes(character))
    .join("");
}

export function isValidBoardCode(raw) {
  const code = normalizeBoardCode(raw);
  return code.length >= 3 && code.length <= 12;
}

export function rollBoardFromCode(raw) {
  const code = normalizeBoardCode(raw);
  if (code.length < 3) {
    throw new TypeError("盤面代碼太短");
  }
  const random = mulberry32(hashSeed(code));
  const dice = DICE.map((faces) => faces[Math.floor(random() * faces.length)]);
  return { code, dice };
}

export function makeBoardCode(unit = Math.random) {
  let code = "";
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    const pick = Math.floor(unit() * CODE_ALPHABET.length) % CODE_ALPHABET.length;
    code += CODE_ALPHABET[pick];
  }
  return code;
}

export function readBoardCodeFromSearch(search) {
  const params = new URLSearchParams(search || "");
  const raw = params.get("b") ?? params.get("board");
  if (raw == null) return null;
  const code = normalizeBoardCode(raw);
  return code.length >= 3 ? code : null;
}
