import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import MarkdownIt from 'markdown-it';
import { manifestoPages, renderArticle } from '../scripts/render-manifesto.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const config = JSON.parse(await readFile(path.join(root, 'site.config.json'), 'utf8'));
const documents = await Promise.all(manifestoPages.map(async page => ({
  ...page,
  sourceText: await readFile(path.join(root, page.source), 'utf8'),
  html: await readFile(path.join(dist, page.route, 'index.html'), 'utf8'),
})));
const decode = text => text.replace(/&#(\d+);|&#x([\da-f]+);|&(amp|lt|gt|quot|apos);/gi, (_, decimal, hex, named) => decimal
  ? String.fromCodePoint(Number(decimal)) : hex ? String.fromCodePoint(parseInt(hex, 16)) : { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[named.toLowerCase()]);
const plain = html => decode(html.replace(/<sup class="footnote-ref">[\s\S]*?<\/sup>/g, '').replace(/<a[^>]*class="footnote-backref"[^>]*>[\s\S]*?<\/a>/g, '').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const article = html => html.match(/<article\b[^>]*class="manifesto-prose"[^>]*>([\s\S]*?)<\/article>/)[1];
const attributes = (html, name) => [...html.matchAll(new RegExp(`\\b${name}="([^"]*)"`, 'g'))].map(match => decode(match[1]));

test('published articles retain every approved paragraph, heading, slogan and bibliography entry', () => {
  const referenceMarkdown = new MarkdownIt({ html: false, typographer: false });
  for (const document of documents) {
    const output = plain(article(document.html));
    const source = document.sourceText.slice(document.sourceText.indexOf(`## ${document.bodyStart}\n`));
    for (const block of source.split(/\n\s*\n/)) {
      const cleaned = block.replace(/^\[\^\d+\]:\s*/, '').replace(/\[\^\d+\]/g, '');
      const expected = plain(referenceMarkdown.render(cleaned));
      if (expected) assert.ok(output.includes(expected), `${document.route}: approved content remains intact: ${expected.slice(0, 90)}`);
    }
    assert.doesNotMatch(document.html, /Editorial draft|Unpublished|Draft v\d/i);
    assert.equal((document.html.match(/<h1\b/g) || []).length, 1);
    assert.doesNotMatch(document.html, /\{\{[^}]+\}\}/);
  }
  assert.match(article(documents[1].html), /AI\/MAXXI is the public expression of AI maximalism\. This charter distills the manifesto/);
  const principles = [...article(documents[0].html).matchAll(/<h3\b[^>]*>(\d+)\. /g)].map(match => Number(match[1]));
  assert.deepEqual(principles, Array.from({ length: 10 }, (_, index) => index + 1));
});

test('thirteen numbered endnotes preserve their source identity and return to every citation', () => {
  const html = documents[0].html;
  const notes = [...html.matchAll(/<li id="fn-(\d+)"/g)].map(match => Number(match[1]));
  assert.deepEqual(notes, Array.from({ length: 13 }, (_, index) => index + 1));
  for (const note of notes) {
    assert.match(html, new RegExp(`href="#fn-${note}"[^>]*role="doc-noteref"`));
    assert.match(html, new RegExp(`href="#fnref-${note}"[^>]*role="doc-backlink"`));
  }
  assert.match(html, /href="#fn-13" id="fnref-13"[^>]*>13<\/a>/, 'the founding post remains note 13 despite being cited before notes 11 and 12');
  assert.match(html, /href="#fn-8" id="fnref-8-2"/, 'the repeated proactionary citation has a distinct target');
  assert.match(html, /href="#fnref-8-2"[^>]*aria-label="Return to endnote 8, citation 2 in the text"/, 'a second backlink returns to the second citation');
});

test('all article contents, bibliography anchors, routes, sources and local assets resolve', async () => {
  for (const document of documents) {
    const ids = attributes(document.html, 'id');
    assert.equal(ids.length, new Set(ids).size, `${document.route}: IDs remain unique`);
    for (const href of [...attributes(document.html, 'href'), ...attributes(document.html, 'src')]) {
      if (href.startsWith('#')) {
        assert.ok(ids.includes(href.slice(1)), `${document.route}: local anchor exists: ${href}`);
        continue;
      }
      const url = new URL(href, config.url + document.route);
      if (url.origin !== new URL(config.url).origin) {
        assert.equal(url.protocol, 'https:');
        continue;
      }
      let file = path.join(dist, url.pathname);
      if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
      const content = await readFile(file, 'utf8');
      assert.ok(content.length, `Published destination exists: ${href}`);
      if (url.hash) assert.ok(attributes(content, 'id').includes(url.hash.slice(1)), `Cross-page anchor exists: ${href}`);
    }
    assert.equal(await readFile(path.join(dist, document.sourceDownload), 'utf8'), document.sourceText, 'download is the exact approved manuscript');
    assert.match(document.html, new RegExp(`<link rel="canonical" href="${config.url}${document.route}">`));
    assert.ok((await readFile(path.join(dist, 'sitemap.xml'), 'utf8')).includes(`<loc>${config.url}${document.route}</loc>`));
  }
  const homepage = await readFile(path.join(dist, 'index.html'), 'utf8');
  assert.match(homepage, /href="\/manifesto"/, 'homepage exposes the developed doctrine');
  assert.ok(homepage.includes(`href="${config.manifesto}"`), 'the original founding post remains available');
});

test('renderer escapes markup, rejects unsafe citation links and gives tables a keyboard scroll region', () => {
  const { articleContent, articleContents } = renderArticle('## A readable heading\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1)) [insecure](http://example.com) [credentials](https://person:password@example.com/) [safe](https://example.com/paper)\n\n| Principle | Work |\n|---|---|\n| Open | Build |\n');
  assert.doesNotMatch(articleContent, /<script|href="(?:javascript|http:|https:\/\/person:)/);
  assert.match(articleContent, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(articleContent, /href="https:\/\/example.com\/paper" rel="noopener noreferrer"/);
  assert.match(articleContent, /class="table-scroll" role="region" aria-label="A readable heading" tabindex="0"/);
  assert.match(articleContents, /href="#a-readable-heading"/);
  assert.match(articleContent, /id="a-readable-heading"/);
});
