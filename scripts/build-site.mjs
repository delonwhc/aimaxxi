import { readFile, writeFile, mkdir, rm, cp, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await readFile(path.join(root, 'site.config.json'), 'utf8'));
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const issue = new URL(`${config.repository}/issues/new`);
issue.searchParams.set('title', '[Transmission] My contribution');
issue.searchParams.set('body', '## The work\nTitle and type (art, meme, film, demo, tool, or other):\n\n## Links\nFinished work:\nEditable source, if available:\n\n## Creator credit\nName and profile link:\n\n## Description\nWhat did you make? What does it do?\n\n## Original or remix\nList any source material, collaborators, and permissions:\n\n## Permission to feature\nMay AI/MAXXI feature this work with the credit above? Yes / No\n\nPlease do not include private information. This issue will be public.');
const share = new URL('https://x.com/intent/post');
share.searchParams.set('text', 'maxxing the future. ↗↗ #AIMAXXI');
share.searchParams.set('url', config.url);
const values = {
  ...config,
  buy: `https://jup.ag/swap?buy=${config.mint}&sell=So11111111111111111111111111111111111111112`,
  chart: `https://dexscreener.com/solana/${config.mint}`,
  explorer: `https://solscan.io/token/${config.mint}`,
  issue: issue.href,
  share: share.href
};
const source = await readFile(path.join(root, 'src/index.html'), 'utf8');
const html = source.replace(/\{\{([a-z]+)\}\}/g, (_, key) => {
  if (!(key in values)) throw new Error(`Unknown template key: ${key}`);
  return escapeHTML(values[key]);
});
if (/\{\{.*?\}\}/.test(html)) throw new Error('Unresolved template marker');
await writeFile(path.join(root, 'index.html'), html);
const dist = path.join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const file of ['index.html', 'icon.png', 'favicon.png', 'lockup.png', 'hero-bg.jpg', 'memes.jpg']) {
  await access(path.join(root, file));
  await cp(path.join(root, file), path.join(dist, file));
}
// An allowlisted publish tree keeps private planning and raw production files off the site.
await cp(path.join(root, 'assets'), path.join(dist, 'assets'), {
  recursive: true,
  filter: (sourcePath) => !sourcePath.split(path.sep).includes('source') && !sourcePath.endsWith('.DS_Store')
});
await writeFile(path.join(dist, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${config.url}/sitemap.xml\n`);
await writeFile(path.join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${config.url}/</loc></url></urlset>\n`);
console.log('Built static site in dist/. No server or runtime dependencies.');
