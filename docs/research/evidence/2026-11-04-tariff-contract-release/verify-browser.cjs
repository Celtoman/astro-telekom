const fs = require('node:fs');
const pw = require(process.argv[2]);
const root = require('node:path').resolve(__dirname, '../../../..');
const { quoteTariffConfiguration: quote } = require(root+'/apps/api/dist/tariff-configuration.service.js');
const env = Object.fromEntries(fs.readFileSync(root+'/.env','utf8').split(/\r?\n/).filter(x=>/^\w+=/.test(x)).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1).trim().replace(/^(['"])(.*)\1$/,'$2')]}));
const samples = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const norm = x => x.replace(/\s+/g,' ').trim();
const assert = require('node:assert/strict');
(async () => {
  const browser = await pw.chromium.launch({headless:true, executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args:['--no-proxy-server']});
  const results = [];
  try {
    for (const width of [1440,834,390,320]) {
      const context = await browser.newContext({httpCredentials:{username:env.BASIC_AUTH_USERNAME,password:env.BASIC_AUTH_PASSWORD},viewport:{width,height:1000}});
      try {
        for (const sample of samples) {
          const page = await context.newPage(), errors = [], requests = [];
          page.on('pageerror', e => errors.push(e.message));
          page.on('response', r => {if(r.url().includes('/api/v1/') && r.status()>=400) requests.push({url:r.url(),status:r.status()})});
          try {
            const response = await page.goto('https://tv-internet-dom.ru'+sample.path,{waitUntil:'domcontentloaded',timeout:30000});
            assert.equal(response.status(),200);
            const calculator = page.locator('.tariff-configurator');
            await page.locator('.tariff-configurator[aria-busy="false"] [aria-live]').waitFor({timeout:30000});
            await page.evaluate(() => document.fonts.ready);
            const text = norm(await calculator.innerText());
            const base = quote(sample.tariff);
            const rubles = n => new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(n)+' ₽';
            assert.ok(text.includes(norm(rubles(base.totals.monthly))));
            assert.ok(text.includes(norm(rubles(base.totals.oneTime))));
            if (sample.kind==='ont') {
              assert.ok(text.includes('ONT-терминал: 4 900 ₽'));
              assert.equal(await calculator.getByRole('combobox',{name:'ТВ-приставка',exact:true}).count(),0);
            }
            const bounds = await page.evaluate(() => ({viewport:innerWidth,document:document.documentElement.scrollWidth}));
            assert.ok(bounds.document<=bounds.viewport+1,JSON.stringify(bounds));
            await page.screenshot({path:__dirname+'/'+sample.kind+'-'+width+'-top.png'});
            await calculator.screenshot({path:__dirname+'/'+sample.kind+'-'+width+'-calculator.png'});
            const cinema = page.locator('[data-tariff-block="cinemas"]');
            if (await cinema.count()) {
              assert.equal(await cinema.getByRole('heading',{name:'Подписки в тарифе',exact:true}).count(),1);
              assert.ok(!norm(await cinema.innerText()).includes('Уже включено'));
              await cinema.screenshot({path:__dirname+'/'+sample.kind+'-'+width+'-cinemas.png'});
            }
            const equipment = base.choices.equipment.find(e=>e.code===(sample.kind==='ont'?'router':'tvbox'));
            const selected = equipment?.options.find(o=>o.code==='BUYOUT');
            let changed = null;
            if (selected) {
              const expected = quote(sample.tariff,{[equipment.code]:'BUYOUT'});
              const pending = page.waitForResponse(r=>r.url().endsWith('/quote') && r.request().method()==='POST');
              await calculator.getByRole('combobox',{name:equipment.title,exact:true}).selectOption('BUYOUT');
              const result = await (await pending).json();
              assert.deepEqual(result.totals,expected.totals);
              await page.locator('.tariff-configurator[aria-busy="false"]').waitFor();
              assert.ok(norm(await calculator.innerText()).includes(norm(rubles(expected.totals.oneTime))));
              changed = result.totals;
            }
            assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
            results.push({width,path:sample.path,kind:sample.kind,bounds,defaultTotals:base.totals,selectedBuyoutTotals:changed,errors,failedApiRequests:requests,passed:true});
            console.log(JSON.stringify(results.at(-1)));
          } finally {await page.close();}
        }
      } finally {await context.close();}
    }
    fs.writeFileSync(__dirname+'/browser-validation.json',JSON.stringify({results,passed:true},null,2)+'\n');
  } finally {await browser.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
