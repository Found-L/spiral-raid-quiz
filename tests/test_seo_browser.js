// Verify the static search landing pages, sitemap, and links into the interactive site.
const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const {chromium} = require('playwright');

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
  });
}
async function waitReady(url) {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('preview server did not start');
}

(async () => {
  const port = await freePort(), base = `http://127.0.0.1:${port}/`;
  const server = spawn(process.env.PYTHON_BIN || 'python', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'],
    {cwd:path.resolve(__dirname, '..'), stdio:'ignore', windowsHide:true});
  let browser;
  try {
    await waitReady(base);
    browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
    const context = await browser.newContext({javaScriptEnabled:false, viewport:{width:390, height:844}});
    const page = await context.newPage();
    const sitemapResponse = await page.request.get(`${base}sitemap.xml`);
    assert.equal(sitemapResponse.status(), 200);
    const sitemap = await sitemapResponse.text();
    const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);
    const canonicalBase = 'https://www.lysue.com/spiral-raid-quiz/';
    assert.deepEqual(urls, [canonicalBase, ...['twins','spirit','witch','badges'].map(slug => `${canonicalBase}guides/${slug}/`)]);
    const titles = new Set(), descriptions = new Set();
    for (const [slug, term] of [['twins','双剑'], ['spirit','超魔灵'], ['witch','黑风魔女'], ['badges','勋章']]) {
      const response = await page.goto(`${base}guides/${slug}/`);
      assert.equal(response.status(), 200, `${slug} returns HTML`);
      const data = await page.evaluate(() => ({
        title:document.title,
        description:document.querySelector('meta[name="description"]')?.content,
        canonical:document.querySelector('link[rel="canonical"]')?.href,
        h1:document.querySelector('h1')?.innerText,
        text:document.querySelector('article')?.innerText,
        sectionCount:document.querySelectorAll('.article-body section').length,
        overflow:document.documentElement.scrollWidth > innerWidth,
        heroImage:document.querySelector('.hero-image')?.currentSrc,
        ogImage:document.querySelector('meta[property="og:image"]')?.content,
        schema:JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)
      }));
      assert.match(data.title, new RegExp(term));
      assert.match(data.description, new RegExp(term));
      assert.match(data.h1, new RegExp(term));
      assert.equal(data.canonical, `${canonicalBase}guides/${slug}/`);
      assert.equal(data.schema.url, data.canonical);
      assert.ok(data.text.length > 300 && data.sectionCount >= 4, `${slug} contains useful text without JavaScript`);
      assert.doesNotMatch(data.text, /魔女试卷/);
      assert.equal(data.overflow, false, `${slug} fits mobile`);
      assert.equal((await page.request.get(data.heroImage)).status(), 200, `${slug} illustration exists`);
      assert.equal((await page.request.get(new URL(data.ogImage).pathname.replace('/spiral-raid-quiz/', base))).status(), 200, 'share image exists');
      titles.add(data.title); descriptions.add(data.description);
    }
    assert.equal(titles.size, 4); assert.equal(descriptions.size, 4);
    await context.close();

    const interactive = await browser.newPage({viewport:{width:1440, height:900}});
    await interactive.route('**/api/**', route => route.fulfill({json:{entries:[], boards:[]}, headers:{'Access-Control-Allow-Origin':'*'}}));
    await interactive.goto(`${base}?api=local`);
    assert.equal(await interactive.locator('link[rel="canonical"]').getAttribute('href'), canonicalBase);
    await interactive.locator('.reading-links a[href="guides/witch/"]').click();
    assert.match(await interactive.locator('h1').innerText(), /黑风魔女/);
    await interactive.locator('.hero-actions a').first().click();
    await interactive.waitForFunction(() => document.querySelector('#guide-title').textContent.includes('黑风魔女'));
    assert.equal(new URL(interactive.url()).hash, '#guide-witch');
    assert.equal(await interactive.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await interactive.close();
    console.log('PASS static SEO pages, sitemap, mobile layout and interactive guide links');
  } finally {
    await browser?.close();
    server.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
