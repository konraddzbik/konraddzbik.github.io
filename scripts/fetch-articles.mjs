// Snapshots the Medium RSS feed into assets/data/articles.json so the page reads a
// same-origin file instead of depending on a third-party RSS-to-JSON proxy at runtime.
//
//   node scripts/fetch-articles.mjs            # fetch the live feed
//   node scripts/fetch-articles.mjs feed.xml   # use a local copy
//
// On any failure the existing JSON is left untouched and the script exits non-zero.
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const FEED_URL = 'https://medium.com/feed/@dzbik.konrad';
const OUT_FILE = new URL('../assets/data/articles.json', import.meta.url);
const MAX_ITEMS = 6;
const SUMMARY_LENGTH = 220;

function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function tag(xml, name) {
  const match = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  if (!match) return '';
  return match[1].trim().replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1').trim();
}

function httpsUrlOnHost(value, host) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    if (url.hostname !== host && !url.hostname.endsWith('.' + host)) return null;
    return url;
  } catch {
    return null;
  }
}

function toArticle(itemXml) {
  const link = httpsUrlOnHost(tag(itemXml, 'link'), 'medium.com');
  if (!link) return null;
  link.search = ''; // drop ?source=rss-… tracking parameters

  const html = tag(itemXml, 'content:encoded') || tag(itemXml, 'description');
  const imgSrc = html.match(/<img[^>]+src="([^"]+)"/)?.[1];
  const image = imgSrc ? httpsUrlOnHost(decodeEntities(imgSrc), 'medium.com')?.href ?? null : null;

  const text = decodeEntities(
    html
      .replace(/<figure[\s\S]*?<\/figure>/g, ' ') // captions are not a useful summary
      .replace(/<h[1-6][\s\S]*?<\/h[1-6]>/g, ' ') // nor is the repeated title
      .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ').trim();
  const summary = text.length > SUMMARY_LENGTH
    ? text.slice(0, SUMMARY_LENGTH).replace(/\s+\S*$/, '') + '…'
    : text;

  const published = new Date(tag(itemXml, 'pubDate'));

  return {
    title: decodeEntities(tag(itemXml, 'title')),
    link: link.href,
    published: isNaN(published) ? null : published.toISOString(),
    image,
    summary,
  };
}

async function loadFeed(source) {
  if (source) return readFile(source, 'utf8');
  const res = await fetch(FEED_URL, { headers: { 'User-Agent': 'konraddzbik.github.io article snapshot' } });
  if (!res.ok) throw new Error(`feed responded ${res.status}`);
  return res.text();
}

const xml = await loadFeed(process.argv[2]);
const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => toArticle(m[1])).filter(Boolean);
if (!items.length) throw new Error('feed contained no usable items — refusing to overwrite articles.json');

await mkdir(new URL('.', OUT_FILE), { recursive: true });
await writeFile(OUT_FILE, JSON.stringify({ source: FEED_URL, items: items.slice(0, MAX_ITEMS) }, null, 2) + '\n');
console.log(`wrote ${Math.min(items.length, MAX_ITEMS)} articles`);
