const express = require('express');
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const CHROME_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
const TMP_DIR = path.join('/tmp', 'quiz-renders');
const ASSETS_DIR = path.join(__dirname, 'assets');
const TEMPLATE_PATH = path.join(__dirname, 'template.html');
const FILE_TTL_MS = 60 * 60 * 1000;

fs.mkdirSync(TMP_DIR, { recursive: true });

const TEMPLATE_HTML = fs.readFileSync(TEMPLATE_PATH, 'utf8');

let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--font-render-hinting=none',
      ],
    });
  }
  return browserPromise;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeUrl(s) {
  return String(s ?? '').replace(/'/g, "%27").replace(/"/g, '%22');
}

function logoUrl() {
  const png = path.join(ASSETS_DIR, 'logo.png');
  if (fs.existsSync(png)) return 'file://' + png;
  return '';
}

function fillTemplate({ question, answer_a, answer_b, background_url }) {
  return TEMPLATE_HTML
    .replace('__QUESTION__', escapeHtml(question))
    .replace('__ANSWER_A__', escapeHtml(answer_a))
    .replace('__ANSWER_B__', escapeHtml(answer_b))
    .replace('__BACKGROUND_URL__', escapeUrl(background_url))
    .replace('__LOGO_URL__', escapeUrl(logoUrl()));
}

async function renderImage(input) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1000, height: 1000, deviceScaleFactor: 1 });
    const html = fillTemplate(input);
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    const buffer = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: 1000, height: 1000 },
      omitBackground: false,
    });
    return buffer;
  } finally {
    await page.close().catch(() => {});
  }
}

function cleanupOldFiles() {
  const now = Date.now();
  try {
    for (const name of fs.readdirSync(TMP_DIR)) {
      const p = path.join(TMP_DIR, name);
      const st = fs.statSync(p);
      if (now - st.mtimeMs > FILE_TTL_MS) fs.unlinkSync(p);
    }
  } catch {}
}

function publicBaseUrl(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

const app = express();
app.use(express.json({ limit: '2mb' }));

app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'quiz-image-server' });
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/render', async (req, res) => {
  const { question, answer_a, answer_b, background_url } = req.body || {};
  if (!question || !answer_a || !answer_b || !background_url) {
    return res.status(400).json({
      error: 'Missing required fields',
      required: ['question', 'answer_a', 'answer_b', 'background_url'],
      received: Object.keys(req.body || {}),
    });
  }
  try {
    cleanupOldFiles();
    const buf = await renderImage({ question, answer_a, answer_b, background_url });
    const id = crypto.randomBytes(8).toString('hex');
    const filename = `${id}.png`;
    fs.writeFileSync(path.join(TMP_DIR, filename), buf);
    const url = `${publicBaseUrl(req)}/i/${filename}`;
    res.json({ image_url: url, id, width: 1000, height: 1000 });
  } catch (err) {
    console.error('render error', err);
    res.status(500).json({ error: 'render_failed', message: err.message });
  }
});

app.get('/i/:filename', (req, res) => {
  const safe = req.params.filename.replace(/[^a-zA-Z0-9._-]/g, '');
  const p = path.join(TMP_DIR, safe);
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'not_found' });
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  fs.createReadStream(p).pipe(res);
});

app.listen(PORT, () => {
  console.log(`quiz-image-server listening on ${PORT}, chromium=${CHROME_PATH}`);
});

process.on('SIGTERM', async () => {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close().catch(() => {});
  }
  process.exit(0);
});
