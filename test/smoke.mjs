/* さわって さんすう図鑑 — スモークテスト
 *   node test/smoke.mjs            … ぜんぶ実行
 * playwright が入っていれば グローバル導入でも動く。
 * 目視では見のがす種類のバグ(押せないボタン・ラベルの重なり・画面外はみ出し)を拾うのが目的。
 */
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PAGE = pathToFileURL(resolve(dirname(fileURLToPath(import.meta.url)), "..", "index.html")).href;
let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  const root = execSync("npm root -g").toString().trim();
  ({ chromium } = await import(pathToFileURL(`${root}/playwright/index.mjs`).href));
}

let fail = 0;
const ok = (cond, name, detail = "") => {
  if (cond) console.log(`  ✅ ${name}`);
  else { fail++; console.log(`  ❌ ${name}${detail ? "  … " + detail : ""}`); }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); // iPhone相当の せまい幅
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(PAGE);

const open = (name) =>
  page.evaluate((n) => {
    [...document.querySelectorAll(".card")].find((c) => c.querySelector(".cap b").textContent === n).click();
  }, name);
const home = () =>
  page.evaluate(() => {
    const s = [...document.querySelectorAll(".screen")].find((x) => x.style.display === "block");
    if (s) s.querySelector(".top button").click();
  });

console.log("\n■ 全モジュール");
const names = await page.evaluate(() => [...document.querySelectorAll(".card")].map((c) => c.querySelector(".cap b").textContent));
ok(names.length >= 20, `カードが ${names.length}枚 ある`);
for (const name of names) {
  await open(name);
  await page.waitForTimeout(140);
  const r = await page.evaluate(() => {
    const s = [...document.querySelectorAll(".screen")].find((x) => x.style.display === "block");
    if (!s) return { err: "画面が ひらかない" };
    const svg = s.querySelector("svg");
    if (svg && svg.innerHTML.trim().length < 20) return { err: "SVGが 空" };
    // 押せないボタンが 残っていないか(表示されているのに サイズ0 / display:none)
    const dead = [...s.querySelectorAll("button")].filter((b) => {
      const bb = b.getBoundingClientRect();
      return bb.width < 1 || bb.height < 1;
    }).map((b) => b.textContent.trim());
    // 画面の 外に はみ出していないか
    const W = document.documentElement.clientWidth;
    const over = [...s.querySelectorAll("*")].filter((el) => {
      const bb = el.getBoundingClientRect();
      return bb.right > W + 1 || bb.left < -1;
    }).map((el) => el.tagName + (el.id ? "#" + el.id : ""));
    return { id: s.id, dead, over };
  });
  ok(!r.err, `${name} が ひらく`, r.err);
  if (r.err) continue;
  ok(r.dead.length === 0, `${name}: 押せないボタンが ない`, r.dead.join(","));
  ok(r.over.length === 0, `${name}: 横に はみ出さない`, r.over.slice(0, 3).join(","));
  await home();
  await page.waitForTimeout(60);
}

console.log("\n■ 円と円周率(m10) — ラベルが 赤い3.14の線と かさならない");
await open("円と円周率");
for (const d of [6, 8, 10, 12]) {
  const hit = await page.evaluate((dd) => {
    const s = document.getElementById("m10d");
    s.value = dd; s.dispatchEvent(new Event("input"));
    const svg = document.getElementById("m10svg");
    const red = [...svg.querySelectorAll("line")].find((l) => l.getAttribute("stroke") === "#E03131");
    const x = +red.getAttribute("x1"), y1 = +red.getAttribute("y1"), y2 = +red.getAttribute("y2");
    return [...svg.querySelectorAll("text")].filter((t) => {
      const b = t.getBBox();
      return b.x - 2 < x && x < b.x + b.width + 2 && b.y < y2 && y1 < b.y + b.height;
    }).map((t) => t.textContent);
  }, d);
  ok(hit.length === 0, `直径${d}cm`, hit.join(","));
}
await home();

console.log("\n■ 図形の角(m14) — かどの和と ちぎる演出");
await open("図形の角");
for (const n of [3, 4, 5, 6]) {
  const r = await page.evaluate((nn) => {
    PG.n = nn; pgInit(); PG.tt = 1; PG.tear = 1; m14draw();
    const sum = document.getElementById("m14sum").textContent.match(/(\d+)°/)[1];
    const msg = document.getElementById("m14svg").querySelector('text[fill="#2F9E44"]');
    const btn = document.getElementById("m14tear").getBoundingClientRect();
    return { sum: +sum, msg: msg ? msg.textContent : "", btn: btn.width > 0 && btn.height > 0 };
  }, n);
  ok(r.sum === (n - 2) * 180, `${n}かく: かどの和 ${r.sum}° ＝ ${(n - 2) * 180}°`);
  ok(r.btn, `${n}かく: ちぎるボタンが 押せる`);
  ok(r.msg.includes(String((n - 2) * 180)), `${n}かく: 演出の文言が 和と 合う`, r.msg);
}
await home();

console.log("\n■ くらい(m19) — くり上がり / くり下がり");
await open("くらい");
const cases = [
  [[1, 0, 0], -1, "o", 99], [[0, 9, 9], 1, "o", 100], [[9, 9, 9], 1, "o", 999],
  [[0, 0, 0], -1, "o", 0], [[2, 0, 0], -1, "t", 190], [[9, 0, 0], 1, "h", 900],
];
for (const [[h, t, o], mode, k, want] of cases) {
  const got = await page.evaluate(([h, t, o, mode, k]) => {
    PL.h = h; PL.t = t; PL.o = o; PL.mode = mode; m19tap(k);
    return PL.h * 100 + PL.t * 10 + PL.o;
  }, [h, t, o, mode, k]);
  ok(got === want, `${h * 100 + t * 10 + o} ${mode > 0 ? "＋" : "−"}${k === "o" ? 1 : k === "t" ? 10 : 100} ＝ ${want}`, `→ ${got}`);
}
await home();

console.log("\n■ わりざん(m20) — 商と あまり");
await open("わりざん");
for (const [n, p] of [[12, 3], [13, 3], [20, 6], [20, 1], [5, 6]]) {
  const txt = await page.evaluate(([n, p]) => {
    DV.n = n; DV.p = p; DV.d = 999; m20draw();
    return document.getElementById("m20eq").textContent;
  }, [n, p]);
  const q = Math.floor(n / p), r = n % p;
  const want = `${n} ÷ ${p} ＝ ${q}` + (r ? ` あまり ${r}` : "");
  ok(txt.replace(/\s/g, "").startsWith(want.replace(/\s/g, "")), want, txt.trim());
}

console.log("\n■ JSエラー");
ok(errors.length === 0, "コンソールに エラーが ない", errors.join(" / "));

await browser.close();
console.log(fail ? `\n💥 ${fail}件 こけました\n` : "\n🎉 ぜんぶ とおりました\n");
process.exit(fail ? 1 : 0);
