import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteRoot = path.join(root, "site");
const chromePath = process.env.CHROME_PATH || "/usr/local/bin/google-chrome";
const shotDir = process.env.SCREENSHOT_DIR || "";

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const relative = decodeURIComponent(url.pathname);
    const file = path.join(siteRoot, relative === "/" ? "index.html" : relative);
    if (!file.startsWith(siteRoot)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(file, (error, data) => {
      if (error) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
      res.end(data);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function loadBrowser() {
  if (!fs.existsSync(chromePath)) return null;
  try {
    const mod = await import("puppeteer-core");
    return mod.default;
  } catch {
    return null;
  }
}

const puppeteer = await loadBrowser();

function inside(rect, width, height) {
  return rect.w > 0 && rect.h > 0 && rect.x >= -1 && rect.y >= -1 && rect.right <= width + 1 && rect.bottom <= height + 1;
}

async function readLayout(page) {
  return page.evaluate(() => {
    const box = (el) => {
      const rect = el.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        w: rect.width,
        h: rect.height,
        right: rect.right,
        bottom: rect.bottom,
      };
    };
    const doc = document.documentElement;
    const cell = document.querySelector("#board .cell");
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      scrollWidth: doc.scrollWidth,
      scrollHeight: doc.scrollHeight,
      clientWidth: doc.clientWidth,
      clientHeight: doc.clientHeight,
      app: box(document.querySelector(".app")),
      tight: document.querySelector(".app").classList.contains("is-tight"),
      board: box(document.querySelector("#board")),
      cell: box(cell),
      cells: [...document.querySelectorAll("#board .cell")].map(box),
      cards: [...document.querySelectorAll("#tray .card")].map((el) => ({
        id: el.dataset.piece,
        box: box(el),
      })),
      trayScrollHeight: document.querySelector("#tray").scrollHeight,
      trayClientHeight: document.querySelector("#tray").clientHeight,
      dice: document.querySelectorAll("#dice li").length,
      buttons: ["#mode-daily", "#mode-random", "#again", "#flip"].map((selector) => {
        const el = document.querySelector(selector);
        return { selector, box: box(el), disabled: el.disabled };
      }),
      ledeHeight: document.querySelector(".lede").getBoundingClientRect().height,
    };
  });
}

function assertPlayfield(layout, { minCell, minCard }) {
  assert.equal(layout.scrollWidth <= layout.clientWidth + 1, true, "有水平捲動");
  assert.equal(layout.scrollHeight <= layout.clientHeight + 1, true, "有垂直捲動");
  assert.equal(layout.trayScrollHeight <= layout.trayClientHeight + 1, true, "拼圖托盤還要內部捲動");
  assert.equal(layout.cells.length, 36);
  assert.equal(layout.cards.length, 9);
  assert.equal(layout.dice, 7);
  assert.equal(inside(layout.board, layout.innerWidth, layout.innerHeight), true, "棋盤超出可視範圍");
  for (const cell of layout.cells) {
    assert.equal(inside(cell, layout.innerWidth, layout.innerHeight), true, "棋盤格子超出可視範圍");
  }
  assert.ok(layout.cell.w >= minCell && layout.cell.h >= minCell, `格子過小 ${layout.cell.w}`);
  for (const card of layout.cards) {
    assert.equal(inside(card.box, layout.innerWidth, layout.innerHeight), true, `${card.id} 超出可視範圍`);
    assert.ok(card.box.w >= minCard && card.box.h >= minCard, `${card.id} 小於可拖曳尺寸`);
  }
  for (const button of layout.buttons) {
    assert.equal(button.disabled, false, button.selector);
    assert.equal(inside(button.box, layout.innerWidth, layout.innerHeight), true, button.selector);
    assert.ok(button.box.h >= 36 && button.box.w >= 36, button.selector);
  }
}

async function openPage(browser, url, { width, height, mobile }) {
  const page = await browser.newPage();
  page.on("pageerror", (error) => {
    throw error;
  });
  await page.setViewport({
    width,
    height,
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
  });
  await page.goto(url, { waitUntil: "networkidle0" });
  await page.waitForSelector("#tray .card");
  return page;
}

test("手機與桌機可視區", { skip: !puppeteer && "需要本機 Chrome 與 puppeteer-core" }, async () => {
  const server = await startServer();
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}/`;
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const results = [];
  try {
    const cases = [
      { name: "390x844", width: 390, height: 844, mobile: true, minCell: 20, minCard: 44, maxApp: 630 },
      { name: "390x700", width: 390, height: 700, mobile: true, minCell: 20, minCard: 44 },
      { name: "390x620", width: 390, height: 620, mobile: true, minCell: 20, minCard: 44 },
      { name: "1440x1100", width: 1440, height: 1100, mobile: false, minCell: 40, minCard: 44, minBoard: 440 },
    ];
    for (const item of cases) {
      const page = await openPage(browser, url, item);
      const layout = await readLayout(page);
      assertPlayfield(layout, item);
      if (item.maxApp) assert.ok(layout.app.h <= item.maxApp, `版面仍伸進工具列區 ${layout.app.h}`);
      if (item.minBoard) {
        assert.ok(layout.board.w >= item.minBoard, `桌機棋盤變小 ${layout.board.w}`);
        assert.ok(layout.ledeHeight > 8, "桌機說明被收起");
        assert.equal(layout.tight, false);
      }
      if (shotDir) {
        fs.mkdirSync(shotDir, { recursive: true });
        await page.screenshot({ path: path.join(shotDir, `viewport_${item.name}.png`) });
      }
      results.push({
        name: item.name,
        inner: { w: layout.innerWidth, h: layout.innerHeight },
        app: layout.app,
        board: layout.board,
        cell: layout.cell,
        cards: layout.cards.map((card) => ({ id: card.id, ...card.box })),
        scroll: {
          w: layout.scrollWidth,
          h: layout.scrollHeight,
          clientW: layout.clientWidth,
          clientH: layout.clientHeight,
        },
        tight: layout.tight,
      });
      await page.close();
    }

    const page = await openPage(browser, url, { width: 390, height: 700, mobile: true });
    const before = await page.$eval('[data-piece="angle3"]', (el) => el.dataset.cells);
    await page.click('[data-piece="angle3"]');
    const rotated = await page.$eval('[data-piece="angle3"]', (el) => el.dataset.cells);
    assert.notEqual(rotated, before);
    await page.click("#flip");
    const flipped = await page.$eval('[data-piece="angle3"]', (el) => el.dataset.cells);
    assert.notEqual(flipped, rotated);

    const target = await page.evaluate(() => {
      const free = [...document.querySelectorAll(".cell")].find((el) => !el.classList.contains("blocked"));
      const rect = free.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    const origin = await page.$eval('[data-piece="mono"]', (el) => {
      const rect = el.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    await page.mouse.move(origin.x, origin.y);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 12 });
    await page.mouse.up();
    const placed = await page.$eval('#board [data-piece="mono"]', (el) => el.dataset.anchor);
    assert.equal(placed, "0,0");
    await page.click("#again");
    await page.waitForSelector("#tray [data-piece=\"mono\"]");
    const restored = await page.evaluate(() => ({
      tray: document.querySelectorAll("#tray .card").length,
      dice: document.querySelectorAll("#dice li").length,
      boardPieces: document.querySelectorAll("#board .piece").length,
    }));
    assert.deepEqual(restored, { tray: 9, dice: 7, boardPieces: 0 });
    await page.click("#mode-random");
    const randomMode = await page.$eval("#daily-date", (el) => el.hidden);
    assert.equal(randomMode, true);
    assert.equal(await page.$$eval("#dice li", (items) => items.length), 7);
    if (shotDir) await page.screenshot({ path: path.join(shotDir, "viewport_390x700_after_actions.png") });
    await page.close();
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
  if (shotDir) fs.writeFileSync(path.join(shotDir, "viewport-results.json"), JSON.stringify(results, null, 2));
});
