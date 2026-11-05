import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export function assessVertical({ beforeY, afterY, beforeX, afterX, direction, programmaticWrites, inputDelivered }) {
  if (![beforeY, afterY, beforeX, afterX, direction, programmaticWrites].every(Number.isFinite)
    || ![1, -1].includes(direction) || programmaticWrites !== 0 || inputDelivered !== true) return { status: 'INVALID', reason: 'Missing observations/input or programmatic horizontal reset' };
  const verticalDelta = afterY - beforeY, horizontalDelta = afterX - beforeX;
  return { status: direction * verticalDelta > 40 && Math.abs(horizontalDelta) < 2 ? 'PASS' : 'FAIL', verticalDelta, horizontalDelta };
}

export function fullyVisibleCards(rail, cards) {
  return cards.filter(card => card.left >= rail.left - 2 && card.right <= rail.right + 2).map(card => card.index);
}

export function gesturePoint(rect, viewport) {
  const left = Math.max(8, rect.left), right = Math.min(viewport.width - 8, rect.right);
  const top = Math.max(8, rect.top), bottom = Math.min(viewport.height - 8, rect.bottom);
  if (right - left < 64 || bottom - top < 64) throw new Error('Rail must have a visible gesture area');
  return { x: (left + right) / 2, y: (top + bottom) / 2, left: left + 24, right: right - 24 };
}

export function cardPanDistance(delta, maxTravel, touchSlop = 15) {
  return Math.sign(delta) * Math.min(maxTravel, Math.max(touchSlop + 1, Math.abs(delta) + touchSlop));
}

// Read-only browser QA. It never saves CMS data, submits forms or resets rail scrollLeft.
export async function runAccountScrollQA({ chromium, url, output, browsers, widths, repeats, credentials }) {
  const report = { url, startedAt: new Date().toISOString(), protocolSHA256: createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'), node: process.version, environment: `${process.platform} Chromium browser emulation; physical devices not tested`, runs: [], failures: [] };
  await mkdir(output, { recursive: true });
  const save = () => writeFile(join(output, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
  for (const channel of browsers) {
    const browser = await chromium.launch({ channel, headless: true });
    try {
      for (const width of widths) for (let repetition = 0; repetition < repeats; repetition++) {
        const run = { channel, version: browser.version(), width, height: 900, repetition, input: 'touch', rails: [] };
        report.runs.push(run);
        const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: true, hasTouch: true, httpCredentials: credentials });
        try {
          const page = await prepare(context, url); const cdp = await context.newCDPSession(page);
          run.artifactId = await page.locator('[data-account-image]').first().evaluate(image => new URL(image.src).pathname.split('/')[2]);
          const rails = page.locator('[data-account-rail]');
          if (await rails.count() !== 5) throw new Error('Expected all five ACCOUNT rails');
          for (let index = 0; index < await rails.count(); index++) {
            const rail = rails.nth(index), result = { index, name: await rail.getAttribute('aria-label'), forward: [], backward: [], vertical: [] };
            run.rails.push(result);
            try {
              await rail.scrollIntoViewIfNeeded(); await settle(page, rail);
              const total = await rail.locator(':scope > article').count(); result.cards = total;
              const vertical = async (position, dx = 0) => {
                for (const direction of [1, -1]) {
                  await rail.scrollIntoViewIfNeeded(); await settle(page, rail);
                  const before = await observe(page, rail), point = gesturePoint(before.rect, { width, height: 900 });
                  await checkTarget(page, rail, point);
                  await rawSwipe(cdp, page, point.x, point.y, point.x + dx * direction, point.y - 150 * direction, 20);
                  await settle(page, rail); const after = await observe(page, rail);
                  const verdict = assessVertical({ beforeY: before.y, afterY: after.y, beforeX: before.x, afterX: after.x, direction, programmaticWrites: after.writes, inputDelivered: after.touchStarts > before.touchStarts });
                  result.vertical.push({ position, direction, diagonal: dx !== 0, before: before.y, after: after.y, railXBefore: before.left, railXAfter: after.left, ...verdict });
                  if (verdict.status !== 'PASS') throw new Error(`Vertical ${position}/${direction}: ${verdict.status}`);
                }
              };
              await vertical('first');
              for (let card = 0; card < total; card++) {
                await reachCard(page, cdp, rail, card, width); result.forward.push(card);
                if (card === Math.floor(total / 2)) { await vertical('middle'); await vertical('middle-diagonal', 24); }
                if (card === total - 1) await vertical('last');
              }
              for (let card = total - 1; card >= 0; card--) { await reachCard(page, cdp, rail, card, width); result.backward.push(card); }
              await vertical('returned-first');
              // A fast raw swipe immediately followed by another finger gesture; no timer/reset between them.
              await rail.scrollIntoViewIfNeeded(); const initial = await observe(page, rail), point = gesturePoint(initial.rect, { width, height: 900 });
              await rawSwipe(cdp, page, point.right, point.y, point.left, point.y, 8, 0);
              const beforeFast = await observe(page, rail);
              await rawSwipe(cdp, page, point.x, point.y, point.x, point.y - 150, 20);
              await settle(page, rail); const afterFast = await observe(page, rail);
              result.fastTransition = assessVertical({ beforeY: beforeFast.y, afterY: afterFast.y, beforeX: beforeFast.x, afterX: afterFast.x, direction: 1, programmaticWrites: afterFast.writes, inputDelivered: afterFast.touchStarts > beforeFast.touchStarts });
              if (result.fastTransition.status !== 'PASS') throw new Error('Fast horizontal-to-vertical transition failed');
              if (afterFast.overflow || afterFast.writes) throw new Error('Page overflow or invalid protocol');
              result.status = 'PASS';
            } catch (error) { result.status = 'FAIL'; result.error = error.message; report.failures.push({ channel, width, repetition, input: 'touch', rail: index, error: error.message }); await page.screenshot({ path: join(output, `${channel}-${width}-${repetition}-${index}-failure.png`) }); }
            await save(); console.log(JSON.stringify({ channel, width, repetition, input: 'touch', rail: index, status: result.status }));
          }
          run.cardCount = run.rails.reduce((total, rail) => total + (rail.cards || 0), 0);
          if (run.cardCount !== 18) throw new Error('Expected all eighteen ACCOUNT cards');
          run.programmaticWrites = await page.evaluate(() => window.__accountQA.writes);
          if (run.programmaticWrites) throw new Error('A synthetic reset invalidated the touch run');
        } finally { await context.close(); }
      }
      // Mouse/trackpad and keyboard use a fresh non-touch context, never a touch session.
      for (const width of widths) {
        const run = { channel, version: browser.version(), width, height: 900, input: 'wheel-keyboard', rails: [] }; report.runs.push(run);
        const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: false, httpCredentials: credentials });
        try {
          const page = await prepare(context, url), rails = page.locator('[data-account-rail]');
          if (await rails.count() !== 5) throw new Error('Expected all five ACCOUNT rails');
          for (let index = 0; index < await rails.count(); index++) {
            const rail = rails.nth(index), result = { index, name: await rail.getAttribute('aria-label') }; run.rails.push(result);
            try {
              await rail.scrollIntoViewIfNeeded(); await settle(page, rail); const state = await observe(page, rail), point = gesturePoint(state.rect, { width, height: 900 }); await page.mouse.move(point.x, point.y);
              for (let n = 0; n < 12; n++) await page.mouse.wheel(400, 0); await settle(page, rail); const last = await observe(page, rail);
              if (last.max - last.left > 2) throw new Error('Wheel cannot reach last card');
              for (let n = 0; n < 12; n++) await page.mouse.wheel(-400, 0); await settle(page, rail); const first = await observe(page, rail);
              if (first.left > 2) throw new Error('Wheel cannot return to first card');
              await page.mouse.wheel(0, 160); await settle(page, rail); const moved = await observe(page, rail);
              if (assessVertical({ beforeY: first.y, afterY: moved.y, beforeX: first.x, afterX: moved.x, direction: 1, programmaticWrites: moved.writes, inputDelivered: moved.wheelEvents > first.wheelEvents }).status !== 'PASS') throw new Error('Wheel vertical scroll is blocked');
              await rail.focus();
              for (const [key, atEdge] of [['ArrowRight', s => s.max - s.left < 2], ['ArrowLeft', s => s.left < 2]]) {
                let reached = false;
                for (let batch = 0; batch < 8; batch++) { for (let n = 0; n < 8; n++) await page.keyboard.press(key); await settle(page, rail); if (atEdge(await observe(page, rail))) { reached = true; break; } }
                if (!reached) throw new Error(`${key} cannot reach rail edge`);
              }
              result.status = 'PASS'; result.wheelLast = last.left; result.wheelFirst = first.left; result.verticalDelta = moved.y - first.y; result.keyboardBothEdges = true;
            } catch (error) { result.status = 'FAIL'; result.error = error.message; report.failures.push({ channel, width, input: 'wheel-keyboard', rail: index, error: error.message }); }
            await save(); console.log(JSON.stringify({ channel, width, input: 'wheel-keyboard', rail: index, status: result.status }));
          }
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
  report.completedAt = new Date().toISOString(); await save(); return report;
}

async function prepare(context, url) {
  await context.addInitScript(() => {
    window.__accountQA = { writes: 0, touchStarts: 0, wheelEvents: 0 };
    window.addEventListener('touchstart', () => window.__accountQA.touchStarts++, { capture: true, passive: true });
    window.addEventListener('wheel', () => window.__accountQA.wheelEvents++, { capture: true, passive: true });
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollLeft');
    Object.defineProperty(Element.prototype, 'scrollLeft', { ...descriptor, set(value) { if (this.matches('[data-account-rail]')) window.__accountQA.writes++; descriptor.set.call(this, value); } });
  });
  const page = await context.newPage(); const response = await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  if (response.status() !== 200) throw new Error(`Page HTTP ${response.status()}`);
  await page.evaluate(async () => { await document.fonts.ready; for (const image of document.images) image.loading = 'eager'; await Promise.all([...document.images].map(image => image.decode().catch(() => {}))); });
  return page;
}

async function observe(page, rail) {
  const geometry = await rail.evaluate(element => { const r = element.getBoundingClientRect(); return { rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom }, left: element.scrollLeft, max: element.scrollWidth - element.clientWidth, cards: [...element.children].map((card, index) => { const c = card.getBoundingClientRect(); return { index, left: c.left, right: c.right }; }) }; });
  return { ...geometry, ...await page.evaluate(() => ({ x: scrollX, y: scrollY, ...window.__accountQA, overflow: document.documentElement.scrollWidth > innerWidth })) };
}

async function settle(page, rail) {
  await rail.evaluate(element => new Promise((resolvePromise, reject) => {
    let previous, quiet = 0; const started = performance.now();
    const frame = () => { const state = [scrollY, element.scrollLeft, element.getBoundingClientRect().top]; if (previous && state.every((value, i) => Math.abs(value - previous[i]) < .25)) quiet++; else quiet = 0; previous = state; if (quiet >= 8) resolvePromise(); else if (performance.now() - started > 8000) reject(new Error('Scroll did not settle')); else requestAnimationFrame(frame); }; requestAnimationFrame(frame);
  }));
}

async function checkTarget(page, rail, point) {
  if (!await rail.evaluate((element, point) => element.contains(document.elementFromPoint(point.x, point.y)), point)) throw new Error('Gesture starts outside its rail');
}

async function reachCard(page, cdp, rail, index, width) {
  let touchSlop = 15;
  for (let attempt = 0; attempt < 12; attempt++) {
    await rail.scrollIntoViewIfNeeded(); await settle(page, rail); const state = await observe(page, rail);
    if (fullyVisibleCards(state.rect, state.cards).includes(index)) return;
    const card = state.cards[index], delta = card.left < state.rect.left ? card.left - state.rect.left : card.right - state.rect.right;
    const point = gesturePoint(state.rect, { width, height: 900 }); await checkTarget(page, rail, point);
    const distance = cardPanDistance(delta, point.right - point.left, touchSlop);
    const startX = distance > 0 ? point.right : point.left;
    await rawSwipe(cdp, page, startX, point.y, startX - distance, point.y, 20);
    await settle(page, rail); const after = await observe(page, rail);
    if (Math.abs(after.y - state.y) > 4) throw new Error('Horizontal card gesture moved the page vertically');
    const moved = Math.abs(after.left - state.left);
    if (moved > 1 && after.left > 2 && after.max - after.left > 2) touchSlop = Math.max(0, Math.min(40, Math.abs(distance) - moved));
  }
  throw new Error(`Card ${index} is not fully reachable`);
}

async function rawSwipe(cdp, page, x1, y1, x2, y2, interval, releaseHold = 80) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y: y1, id: 0 }] });
  for (let n = 1; n <= 10; n++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x1 + (x2 - x1) * n / 10, y: y1 + (y2 - y1) * n / 10, id: 0 }] }); await page.waitForTimeout(interval); }
  if (releaseHold) await page.waitForTimeout(releaseHold);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    try { process.loadEnvFile('.env'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const args = Object.fromEntries(process.argv.slice(2).map(arg => arg.replace(/^--/, '').split('=')));
    const url = new URL(args.url || 'https://tv-internet-dom.ru/lichnyy-kabinet-dom-ru');
    if (url.origin !== 'https://tv-internet-dom.ru' || url.username || url.password || url.search || url.hash) throw new Error('Only the protected ACCOUNT test origin without credentials/query/hash is allowed');
    if (!process.env.BASIC_AUTH_USERNAME || !process.env.BASIC_AUTH_PASSWORD) throw new Error('Test Basic Auth environment is required');
    const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
    const widths = (args.widths || '390,320').split(',').map(Number), repeats = Number(args.repeat || 2);
    if (widths.some(width => ![390, 320].includes(width)) || !Number.isInteger(repeats) || repeats < 1 || repeats > 5) throw new Error('Expected mobile widths390/320 and1–5 repeats');
    const result = await runAccountScrollQA({ chromium, url: url.href, output: resolve(args.out || `.codex-tmp/account-mobile-scroll-${Date.now()}`), browsers: (args.browsers || 'msedge,chrome').split(','), widths, repeats,
      credentials: { origin: url.origin, username: process.env.BASIC_AUTH_USERNAME, password: process.env.BASIC_AUTH_PASSWORD } });
    console.log(JSON.stringify({ runs: result.runs.length, failures: result.failures.length })); if (result.failures.length) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
