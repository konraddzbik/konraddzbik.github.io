// Medium RSS → articles snapshot.
import { MEDIUM_IMAGE_HOSTS, assert, fetchWithTimeout, httpsUrlOn, isIsoDate } from './snapshot.mjs';

export const FEED_URL = 'https://medium.com/feed/@dzbik.konrad';
const MAX_ITEMS = 6;
const SUMMARY_LENGTH = 220;
const TITLE_LENGTH = 200;
const BLOCK_TAGS = 'p|div|br|hr|li|ul|ol|h[1-6]|figure|figcaption|blockquote|pre|table|tr|td|th|section';

export function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&'); // last, so "&amp;lt;" stays "&lt;"
}

function tag(xml, name) {
  const match = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  if (!match) return '';
  return match[1].trim().replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1').trim();
}

// HTML → plain text. Block tags become spaces; inline tags vanish so "<a>here</a>." stays "here.".
export function htmlToText(html) {
  const text = decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(new RegExp(`</?(?:${BLOCK_TAGS})\\b[^>]*>`, 'gi'), ' ')
      .replace(/<[^>]+>/g, '')
  );
  return text.replace(/\s+/g, ' ').replace(/\s+([.,;:!?)])/g, '$1').trim();
}

function truncate(text, max) {
  return text.length > max ? text.slice(0, max).replace(/\s+\S*$/, '') + '…' : text;
}

// First real content image: skips Medium's 1×1 view beacon (medium.com/_/stat) and anything
// off the CDN allow-list.
export function pickImage(html) {
  for (const [imgTag] of html.matchAll(/<img\b[^>]*>/gi)) {
    if (/\bwidth=["']?1["'\s>]/i.test(imgTag) || /\bheight=["']?1["'\s>]/i.test(imgTag)) continue;
    const src = imgTag.match(/\bsrc="([^"]+)"/i)?.[1];
    if (!src) continue;
    const url = httpsUrlOn(decodeEntities(src), MEDIUM_IMAGE_HOSTS);
    if (url) return url.href;
  }
  return null;
}

function toArticle(itemXml) {
  const link = httpsUrlOn(decodeEntities(tag(itemXml, 'link')), ['.medium.com']);
  if (!link) return null;
  link.search = ''; // drop ?source=rss-… tracking parameters
  link.hash = '';

  const html = tag(itemXml, 'content:encoded') || tag(itemXml, 'description');
  const summaryHtml = html
    .replace(/<figure[\s\S]*?<\/figure>/gi, ' ') // captions are not a useful summary
    .replace(/<h[1-6][\s\S]*?<\/h[1-6]>/gi, ' '); // nor is the repeated title
  const published = new Date(tag(itemXml, 'pubDate'));
  const title = truncate(htmlToText(tag(itemXml, 'title')), TITLE_LENGTH);
  if (!title) return null;

  return {
    title,
    link: link.href,
    published: isNaN(published) ? null : published.toISOString(),
    image: pickImage(html),
    summary: truncate(htmlToText(summaryHtml), SUMMARY_LENGTH),
  };
}

export function parseFeed(xml) {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => toArticle(m[1])).filter(Boolean);
  return { generatedAt: new Date().toISOString(), source: FEED_URL, items: items.slice(0, MAX_ITEMS) };
}

export function validateArticles(data) {
  assert(data && typeof data === 'object' && Array.isArray(data.items), 'articles: items must be an array');
  assert(data.items.length <= MAX_ITEMS, 'articles: too many items');
  for (const a of data.items) {
    assert(typeof a.title === 'string' && a.title.length > 0 && a.title.length <= TITLE_LENGTH + 1, 'articles: bad title');
    assert(httpsUrlOn(a.link, ['.medium.com']), `articles: bad link ${a.link}`);
    assert(a.image === null || httpsUrlOn(a.image, MEDIUM_IMAGE_HOSTS), `articles: bad image ${a.image}`);
    assert(a.published === null || isIsoDate(a.published), 'articles: bad date');
    assert(typeof a.summary === 'string' && a.summary.length <= SUMMARY_LENGTH + 1, 'articles: bad summary');
  }
}

export async function fetchArticles() {
  const res = await fetchWithTimeout(FEED_URL, { headers: { 'User-Agent': 'konraddzbik.github.io build' } });
  const data = parseFeed(await res.text());
  assert(data.items.length > 0, 'articles: feed contained no usable items');
  return data;
}
