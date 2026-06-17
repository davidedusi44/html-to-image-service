const express = require('express');
const puppeteer = require('puppeteer');
const FormData = require('form-data');
const fetch = require('node-fetch');

const app = express();
app.use(express.json({ limit: '10mb' }));

const IMGBB_API_KEY = process.env.IMGBB_API_KEY;

if (!IMGBB_API_KEY) {
  console.warn('WARNING: IMGBB_API_KEY env var not set. Uploads will fail.');
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/render', async (req, res) => {
  const {
    html,
    viewport_width = 1080,
    viewport_height = 1350,
  } = req.body;

  if (!html) {
    return res.status(400).json({ error: 'Missing required parameter: html' });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: viewport_width, height: viewport_height });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });

    const screenshot = await page.screenshot({
      type: 'png',
      encoding: 'base64',
      clip: { x: 0, y: 0, width: viewport_width, height: viewport_height },
    });

    await browser.close();
    browser = null;

    const form = new FormData();
    form.append('image', screenshot);

    const uploadRes = await fetch(
      `https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`,
      { method: 'POST', body: form }
    );

    const uploadData = await uploadRes.json();

    if (!uploadData.success) {
      return res.status(502).json({ error: 'Image upload failed', detail: uploadData });
    }

    res.json({ url: uploadData.data.url, id: uploadData.data.id });

  } catch (err) {
    console.error('Render error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (browser) { try { await browser.close(); } catch (_) {} }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`html-to-image service running on port ${PORT}`));
