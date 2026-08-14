/* さわって さんすう図鑑 — タッチ検証（iPadが手元になくても できるぶん）
 *   node test/touch.mjs
 *
 * smoke.mjs が マウス相当で「動くか」を見るのに対して、こちらは
 *   ・iPadの画面サイズ(たて/よこ)で レイアウトが崩れないか
 *   ・指のサイズ(44px)で 押せる大きさが あるか
 *   ・CDPで 本物の touchStart/touchMove を流して ドラッグが 効くか
 *   ・ドラッグしたとき ページが スクロールしてしまわないか(実機で いちばん多い不具合)
 * を見る。ブラウザは Chromium なので Safari固有の差までは 見られない。
 */
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PAGE = pathToFileURL(resolve(dirname(fileURLToPath(import.meta.url)), "..", "index.html")).href;
let chromium;
try { ({ chromium } = await import("playwright")); }
catch {
  const root = execSync("npm root -g").toString().trim();
  ({ chromium } = await import(pathToFileURL(`${root}/playwright/index.mjs`).href));
}

let fail = 0;
const ok = (cond, name, detail = "") => {
  if (cond) console.log(`  ✅ ${name}`);
  else { fail++; console.log(`  ❌ ${name}${detail ? "  … " + detail : ""}`); }
};
const TAP = 44; // Apple の ガイドライン。HANDOFFの デザイン原則にも 書いてある

const browser = await chromium.launch();

/* ---- 1. iPadの たて / よこ で レイアウト ---- */
for (const [label, w, h] of [["iPad たて", 820, 1180], ["iPad よこ", 1180, 820], ["iPhone たて", 390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(PAGE);
  console.log(`\n■ ${label} (${w}×${h})`);

  const names = await page.evaluate(() => [...document.querySelectorAll(".card")].map((c) => c.querySelector(".cap b").textContent));
  const small = [], over = [];
  for (const name of names) {
    await page.evaluate((n) => [...document.querySelectorAll(".card")].find((c) => c.querySelector(".cap b").textContent === n).click(), name);
    await page.waitForTimeout(120);
    const r = await page.evaluate((TAP) => {
      const s = [...document.querySelectorAll(".screen")].find((x) => x.style.display === "block");
      const W = document.documentElement.clientWidth;
      const tooSmall = [...s.querySelectorAll("button, input[type=range], .cell, .tc")].filter((el) => {
        const b = el.getBoundingClientRect();
        return b.width > 0 && (b.width < TAP || b.height < TAP);
      }).map((el) => `${el.id || el.className || el.tagName}:${Math.round(el.getBoundingClientRect().width)}×${Math.round(el.getBoundingClientRect().height)}`);
      const outside = [...s.querySelectorAll("*")].filter((el) => {
        const b = el.getBoundingClientRect();
        return b.right > W + 1 || b.left < -1;
      }).map((el) => el.tagName + (el.id ? "#" + el.id : ""));
      return { id: s.id, tooSmall, outside };
    }, TAP);
    if (r.tooSmall.length) small.push(`${name}[${r.tooSmall.join(" ")}]`);
    if (r.outside.length) over.push(`${name}[${r.outside.slice(0, 2).join(" ")}]`);
    await page.evaluate(() => [...document.querySelectorAll(".screen")].find((x) => x.style.display === "block").querySelector(".top button").click());
    await page.waitForTimeout(50);
  }
  ok(over.length === 0, "横に はみ出す 画面が ない", over.join(" / "));
  ok(small.length === 0, `${TAP}px より 小さい 操作部品が ない`, small.join(" / "));
  ok(errors.length === 0, "JSエラーが ない", errors.join(" / "));
  await ctx.close();
}

/* ---- 2. 本物の タッチで ドラッグできるか ---- */
console.log("\n■ 指で ドラッグ (CDPの touchStart/Move/End)");
const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(PAGE);
const cdp = await ctx.newCDPSession(page);

async function touchDrag(from, to, steps = 14) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x, y: from.y, id: 1 }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps, id: 1 }],
    });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

/* モジュールごとに「どこを つまんで どっちへ 引くか」と「何が 変われば 成功か」 */
const drags = [
  { name: "ギザギザを一枚に", svg: "#m8svg", state: () => JSON.stringify(G.ax), grab: "handle", dx: 60, dy: 0 },
  { name: "円と円周率", svg: "#m10svg", state: () => C.th, grab: "center", dx: 120, dy: 0 },
  { name: "立体を触る", svg: "#m11svg", state: () => S3.ry, grab: "center", dx: 90, dy: 30 },
  { name: "とけい", svg: "#m15svg", state: () => CK.min, grab: "center", dx: 70, dy: -60 },
  { name: "図形の角", svg: "#m14svg", state: () => JSON.stringify(PG.pts), grab: "handle", dx: 40, dy: -40 },
  { name: "立体の投影図", svg: "#m16svg", state: () => V16.ry, grab: "center", dx: 90, dy: 20 },
  { name: "角をつくる", svg: "#m18svg", state: () => AG.a, grab: "arc", dx: 0, dy: 0 },
];
for (const d of drags) {
  await page.evaluate((n) => [...document.querySelectorAll(".card")].find((c) => c.querySelector(".cap b").textContent === n).click(), d.name);
  await page.waitForTimeout(150);
  await page.evaluate(() => window.scrollTo(0, 0));
  const before = await page.evaluate(`(${d.state})()`);
  const box = await page.locator(d.svg).boundingBox();
  // つまむ場所: handle=赤い●の位置 / center=まんなか / arc=分度器の 左うえあたり
  const from = await page.evaluate(([sel, grab, bx, by, bw, bh]) => {
    if (grab !== "handle") {
      return grab === "arc" ? { x: bx + bw * 0.32, y: by + bh * 0.35 } : { x: bx + bw / 2, y: by + bh / 2 };
    }
    const svg = document.querySelector(sel);
    const h = [...svg.querySelectorAll("circle")].find((c) => (c.getAttribute("fill") || "").toUpperCase() === "#E03131");
    const r = h.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, [d.svg, d.grab, box.x, box.y, box.width, box.height]);
  const to = d.grab === "arc" ? { x: box.x + box.width * 0.7, y: box.y + box.height * 0.3 } : { x: from.x + d.dx, y: from.y + d.dy };

  await touchDrag(from, to);
  await page.waitForTimeout(120);
  const after = await page.evaluate(`(${d.state})()`);
  const scrolled = await page.evaluate(() => window.scrollY);
  ok(String(before) !== String(after), `${d.name}: 指で うごく`, `${before} のまま`);
  ok(scrolled === 0, `${d.name}: ドラッグで ページが スクロールしない`, `scrollY=${scrolled}`);
  await page.evaluate(() => [...document.querySelectorAll(".screen")].find((x) => x.style.display === "block").querySelector(".top button").click());
  await page.waitForTimeout(60);
}

/* ---- 3. 指で タップして 数が 増えるか ---- */
console.log("\n■ 指で タップ");
const taps = [
  { name: "くらい", svg: "#m19svg", at: [0.83, 0.6], state: () => PL.h * 100 + PL.t * 10 + PL.o },
  { name: "面積と体積", svg: "#m17svg", at: [0.5, 0.62], state: () => A17.hg.flat().reduce((a, b) => a + b, 0) },
  { name: "わりざん", svg: "#m20svg", at: [0.5, 0.5], state: () => DV.d },
];
for (const t of taps) {
  await page.evaluate((n) => [...document.querySelectorAll(".card")].find((c) => c.querySelector(".cap b").textContent === n).click(), t.name);
  await page.waitForTimeout(150);
  const before = await page.evaluate(`(${t.state})()`);
  const box = await page.locator(t.svg).boundingBox();
  await page.touchscreen.tap(box.x + box.width * t.at[0], box.y + box.height * t.at[1]);
  await page.waitForTimeout(150);
  const after = await page.evaluate(`(${t.state})()`);
  ok(before !== after, `${t.name}: 指で タップが 効く`, `${before} のまま`);
  await page.evaluate(() => [...document.querySelectorAll(".screen")].find((x) => x.style.display === "block").querySelector(".top button").click());
  await page.waitForTimeout(60);
}

/* ---- 4. 実機で ありがちな 設定 ---- */
console.log("\n■ 設定");
const meta = await page.evaluate(() => document.querySelector('meta[name=viewport]').content);
ok(/user-scalable=no|maximum-scale=1/.test(meta), "ダブルタップ拡大が 止めてある", meta);
const noTouchAction = await page.evaluate(() =>
  [...document.querySelectorAll(".screen svg")].filter((s) => {
    const hasDrag = s.onpointerdown || s.getAttribute("onpointerdown");
    return hasDrag && getComputedStyle(s).touchAction !== "none";
  }).map((s) => "#" + s.id));
ok(noTouchAction.length === 0, "ドラッグする SVGは touch-action:none", noTouchAction.join(","));
ok(errors.length === 0, "JSエラーが ない", errors.join(" / "));

await browser.close();
console.log(fail ? `\n💥 ${fail}件 こけました\n` : "\n🎉 ぜんぶ とおりました\n");
process.exit(fail ? 1 : 0);
