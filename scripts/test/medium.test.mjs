import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeEntities, htmlToText, parseFeed, pickImage, validateArticles } from '../lib/medium.mjs';

const BEACON = '<img src="https://medium.com/_/stat?event=post.clientViewed&amp;postId=1" width="1" height="1" alt="">';

function feed(items) {
  return `<rss><channel>${items.map(i => `<item>
    <title><![CDATA[${i.title ?? 'Title'}]]></title>
    <link>${i.link ?? 'https://medium.com/@dzbik.konrad/post-abc?source=rss-1'}</link>
    <pubDate>${i.pubDate ?? 'Fri, 14 Nov 2025 15:15:03 GMT'}</pubDate>
    <content:encoded><![CDATA[${i.html ?? '<p>Body</p>'}]]></content:encoded>
  </item>`).join('')}</channel></rss>`;
}

test('pickImage skips the 1x1 view beacon', () => {
  assert.equal(pickImage(`<p>text</p>${BEACON}`), null);
  assert.equal(
    pickImage(`<figure><img src="https://cdn-images-1.medium.com/max/1024/1*a.png"></figure>${BEACON}`),
    'https://cdn-images-1.medium.com/max/1024/1*a.png'
  );
});

test('pickImage rejects hosts outside the CDN allow-list', () => {
  assert.equal(pickImage('<img src="https://evil.example/x.png">'), null);
  assert.equal(pickImage('<img src="http://cdn-images-1.medium.com/x.png">'), null);
  assert.equal(pickImage('<img src="https://medium.com/x.png">'), null);
  assert.equal(pickImage('<img src="https://miro.medium.com/v2/x.png">'), 'https://miro.medium.com/v2/x.png');
});

test('htmlToText keeps punctuation attached to inline elements', () => {
  assert.equal(htmlToText('configuration <a href="#">here</a>. If you'), 'configuration here. If you');
  assert.equal(htmlToText('<p>One</p><p>Two</p>'), 'One Two');
  assert.equal(htmlToText('a <strong>b</strong>, c'), 'a b, c');
});

test('htmlToText drops script/style bodies and decodes entities once', () => {
  assert.equal(htmlToText('<script>alert(1)</script>Hi &amp;lt;b&amp;gt;'), 'Hi &lt;b&gt;');
  assert.equal(decodeEntities('&#x41;&#66;&quot;'), 'AB"');
});

test('parseFeed strips tracking params, normalizes dates, ignores non-Medium links', () => {
  const data = parseFeed(feed([
    { html: `<h3>Title</h3><p>Intro <a>link</a>.</p>${BEACON}` },
    { link: 'javascript:alert(1)' },
    { link: 'https://evil.example/post' },
  ]));
  assert.equal(data.items.length, 1);
  const [a] = data.items;
  assert.equal(a.link, 'https://medium.com/@dzbik.konrad/post-abc');
  assert.equal(a.published, '2025-11-14T15:15:03.000Z');
  assert.equal(a.image, null);
  assert.equal(a.summary, 'Intro link.');
  validateArticles(data);
});

test('parseFeed caps item count and summary length', () => {
  const data = parseFeed(feed(Array.from({ length: 9 }, () => ({ html: `<p>${'word '.repeat(200)}</p>` }))));
  assert.equal(data.items.length, 6);
  assert.ok(data.items[0].summary.length <= 221);
  assert.ok(data.items[0].summary.endsWith('…'));
});

test('validateArticles rejects tampered data', () => {
  const ok = { items: [{ title: 't', link: 'https://medium.com/@x/y', image: null, published: null, summary: '' }] };
  validateArticles(ok);
  assert.throws(() => validateArticles({ items: [{ ...ok.items[0], link: 'javascript:alert(1)' }] }));
  assert.throws(() => validateArticles({ items: [{ ...ok.items[0], image: 'https://medium.com/_/stat' }] }));
  assert.throws(() => validateArticles({ items: [{ ...ok.items[0], published: 'yesterday' }] }));
  assert.throws(() => validateArticles({}));
});
