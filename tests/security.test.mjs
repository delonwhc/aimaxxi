import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { publishAssets, publishRegularFile, validateAssetPath, validateHttpsURL } from '../scripts/security.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const config = JSON.parse(await readFile(path.join(root, 'site.config.json'), 'utf8'));

async function filesUnder(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    files.push(...(entry.isDirectory() ? await filesUnder(file) : [file]));
  }
  return files;
}

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'aimaxxi-security-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'source');
  const destination = path.join(directory, 'published');
  await mkdir(path.join(source, 'assets', 'kit'), { recursive: true });
  return { directory, source, destination };
}

const decodeHTML = (value) => value.replace(/&(?:#x([\da-f]+)|#(\d+)|(amp|quot|apos|lt|gt|colon|Tab|NewLine));/gi,
  (_, hex, decimal, named) => hex ? String.fromCodePoint(parseInt(hex, 16))
    : decimal ? String.fromCodePoint(Number(decimal))
      : ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', colon: ':', tab: '\t', newline: '\n' }[named.toLowerCase()]));

function tags(source) {
  return [...source.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)].map((match) => {
    const attributes = {};
    for (const attr of match[2].matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
      attributes[attr[1].toLowerCase()] = decodeHTML(attr[2] ?? attr[3] ?? attr[4] ?? '');
    }
    return { name: match[1].toLowerCase(), attributes };
  });
}

function zipNames(bytes) {
  let end = bytes.length - 22;
  const limit = Math.max(0, end - 65535);
  while (end >= limit && bytes.readUInt32LE(end) !== 0x06054b50) end--;
  assert.ok(end >= limit, 'ZIP has an end-of-central-directory record');
  const count = bytes.readUInt16LE(end + 10);
  let cursor = bytes.readUInt32LE(end + 16);
  const names = [];
  for (let index = 0; index < count; index++) {
    assert.equal(bytes.readUInt32LE(cursor), 0x02014b50, 'ZIP entry header is valid');
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    names.push(bytes.toString('utf8', cursor + 46, cursor + 46 + nameLength));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}

test('configured destinations reject executable schemes, credentials and ambiguous whitespace', () => {
  const accepted = 'https://github.com/geoffreywoo/aimaxxi/issues/new?title=My%20contribution';
  assert.equal(validateHttpsURL(accepted).href, accepted);
  for (const value of [
    'javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'http://aimaxxi.com',
    '//evil.example/path', '/relative/path', 'https://person:password@example.com/',
    'https://person@example.com/', ' https://example.com/', 'https://example.com/ ',
    'https:\\example.com/', 'https://exa\nmple.com/', 'https://example.com/\tpath',
    'https://example.com/\u0000path', 'https://example.com/\u007fpath',
    'https://example.com/a b', null, undefined, {},
  ]) {
    assert.throws(() => validateHttpsURL(value), undefined, `Unsafe configured URL rejected: ${JSON.stringify(value)}`);
  }
});

test('publication copies only explicitly selected files, leaving adjacent private files behind', async (t) => {
  const { source, destination } = await fixture(t);
  const content = 'A reviewed community guide.\n';
  await writeFile(path.join(source, 'assets/kit/guide.md'), content);
  await writeFile(path.join(source, 'assets/kit/.env'), 'FAKE_TEST_SECRET=never-publish');
  await writeFile(path.join(source, 'assets/kit/private-notes.md'), 'private fixture');
  await writeFile(path.join(source, 'assets/kit/unlisted.png'), 'unreviewed fixture');
  await publishAssets(source, destination, ['assets/kit/guide.md']);
  assert.deepEqual((await filesUnder(destination)).map((file) => path.relative(destination, file)), ['assets/kit/guide.md']);
  assert.equal(await readFile(path.join(destination, 'assets/kit/guide.md'), 'utf8'), content);
});

test('asset publication rejects traversal, credential paths and duplicate entries', async (t) => {
  const { source, destination } = await fixture(t);
  for (const unsafe of [
    '../private.md', '/assets/kit/guide.md', 'assets/kit/../../private.md',
    'assets/kit/../brand/guide.md', 'assets/kit/%2e%2e/private.md',
    'assets\\kit\\guide.md', 'assets/kit/.env', 'assets/kit/account.key',
    'assets/art/source/private.md', 'assets/kit/guide.md\n',
  ]) {
    assert.throws(() => validateAssetPath(unsafe), /Unapproved public asset path/);
    await assert.rejects(publishAssets(source, destination, [unsafe]), /Unapproved public asset path/);
  }
  await writeFile(path.join(source, 'assets/kit/guide.md'), 'guide');
  await assert.rejects(publishAssets(source, destination, ['assets/kit/guide.md', 'assets/kit/guide.md']), /Duplicate public asset/);
});

test('publication refuses symlink files and symlink parent directories', async (t) => {
  const { directory, source, destination } = await fixture(t);
  const privateDirectory = path.join(directory, 'private');
  await mkdir(privateDirectory);
  await writeFile(path.join(privateDirectory, 'secret.md'), 'private fixture');
  await symlink(path.join(privateDirectory, 'secret.md'), path.join(source, 'assets/kit/disguised.md'));
  await assert.rejects(publishAssets(source, destination, ['assets/kit/disguised.md']), /without symlinks/);
  await symlink(privateDirectory, path.join(source, 'assets/brand'));
  await assert.rejects(publishAssets(source, destination, ['assets/brand/secret.md']), /without symlinks/);

  const secondSource = path.join(directory, 'second-source');
  await mkdir(secondSource);
  await symlink(path.join(source, 'assets'), path.join(secondSource, 'assets'));
  await assert.rejects(publishAssets(secondSource, destination, ['assets/kit/disguised.md']), /without symlinks/);
});

test('legacy root exports use the same regular-file boundary as manifest assets', async (t) => {
  const { directory, source, destination } = await fixture(t);
  const privateFile = path.join(directory, 'private.txt');
  await writeFile(privateFile, 'private fixture must remain outside publication');
  await symlink(privateFile, path.join(source, 'icon.png'));
  await assert.rejects(publishRegularFile(source, destination, 'icon.png'), /without symlinks/);
  await assert.rejects(readFile(path.join(destination, 'icon.png')), { code: 'ENOENT' });

  const publicContent = Buffer.from('reviewed compatibility image fixture');
  await writeFile(path.join(source, 'favicon.png'), publicContent);
  await publishRegularFile(source, destination, 'favicon.png');
  assert.deepEqual(await readFile(path.join(destination, 'favicon.png')), publicContent);
  for (const unsafe of ['../private.txt', '/private.txt', 'assets/../private.txt', 'assets\\private.txt']) {
    await assert.rejects(publishRegularFile(source, destination, unsafe), /safe relative path/);
  }
  await mkdir(path.join(source, 'lockup.png'));
  await assert.rejects(publishRegularFile(source, destination, 'lockup.png'), /regular file/);
});

test('every rendered page uses local script and stylesheet files without executable inline HTML', async () => {
  const pages = (await filesUnder(dist)).filter((file) => file.endsWith('.html'));
  assert.ok(pages.length >= 2, 'homepage and mission route are both checked');
  assert.ok(pages.some((file) => path.relative(dist, file).startsWith('missions/')), 'mission output is covered');
  for (const page of pages) {
    const relative = path.relative(dist, page);
    const html = await readFile(page, 'utf8');
    for (const { name, attributes } of tags(html)) {
      assert.notEqual(name, 'style', `${relative}: inline styles are forbidden by policy`);
      for (const [key, value] of Object.entries(attributes)) {
        assert.ok(!/^on/i.test(key), `${relative}: inline event handler ${key} is forbidden`);
        assert.notEqual(key, 'style', `${relative}: inline style attributes are forbidden`);
        if (['href', 'src', 'action', 'formaction', 'xlink:href'].includes(key)) {
          assert.doesNotMatch(value.replace(/[\s\u0000-\u001f\u007f]/g, ''), /^(?:javascript|vbscript):/i, `${relative}: executable URL`);
        }
      }
      const asset = name === 'script' ? attributes.src
        : name === 'link' && /(?:^|\s)stylesheet(?:\s|$)/i.test(attributes.rel ?? '') ? attributes.href : null;
      if (name === 'script') assert.ok(asset, `${relative}: scripts have external files`);
      if (asset !== null) {
        assert.ok(asset?.startsWith('/') && !asset.startsWith('//'), `${relative}: script/style is a root-relative file`);
        const url = new URL(asset, config.url);
        assert.equal(url.origin, new URL(config.url).origin, `${relative}: script/style origin stays local`);
        assert.ok((await readFile(path.join(dist, decodeURIComponent(url.pathname)))).length > 0, `${relative}: script/style file exists`);
      }
    }
    for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
      assert.equal(script[1].trim(), '', `${relative}: no inline script body`);
    }
  }
});

test('security headers limit code execution, framing, submissions and browser capabilities', async () => {
  const vercel = JSON.parse(await readFile(path.join(root, 'vercel.json'), 'utf8'));
  assert.match(vercel.buildCommand, /(?:npm run build|node scripts\/build-site\.mjs)\s*&&\s*npm test/, 'deployment requires a successful build and tests');
  const headers = new Map(vercel.headers.find((rule) => rule.source === '/(.*)').headers.map(({ key, value }) => [key.toLowerCase(), value]));
  const directives = new Map(headers.get('content-security-policy').split(';').map((value) => value.trim().split(/\s+/)).filter(([name]) => name).map(([name, ...values]) => [name, values]));
  for (const name of ['default-src', 'base-uri', 'object-src', 'frame-ancestors', 'form-action', 'script-src-attr', 'style-src-attr']) {
    assert.deepEqual(directives.get(name), ["'none'"], `${name} denies the attack surface`);
  }
  for (const name of ['script-src', 'style-src', 'font-src']) assert.deepEqual(directives.get(name), ["'self'"], `${name} only loads first-party assets`);
  assert.deepEqual(directives.get('connect-src'), ["'self'", 'https://www.clawfable.com/api/public/antihunter/analytics-control'], 'only the existing public analytics control endpoint is authorized');
  assert.ok(directives.has('upgrade-insecure-requests'));
  assert.equal(headers.get('x-frame-options'), 'DENY');
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
  assert.equal(headers.get('cross-origin-opener-policy'), 'same-origin');
  assert.equal(headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  const permissions = new Map(headers.get('permissions-policy').split(',').map((value) => value.trim().split('=')));
  for (const name of ['camera', 'microphone', 'geolocation', 'payment', 'usb', 'clipboard-read']) assert.equal(permissions.get(name), '()', `${name} is disabled`);
  assert.equal(permissions.get('clipboard-write'), '(self)', 'same-origin mint copy remains available');
});

test('published archives contain no environment files, private-key filenames or escaping paths', async () => {
  const archives = (await filesUnder(dist)).filter((file) => file.endsWith('.zip'));
  assert.ok(archives.length > 0, 'downloadable kit is checked');
  for (const archive of archives) {
    const names = zipNames(await readFile(archive));
    assert.ok(names.length > 0, 'archive contains files');
    for (const name of names) {
      assert.ok(!name.startsWith('/') && !name.includes('\\') && !name.split('/').includes('..'), `Archive path stays inside extraction directory: ${name}`);
      assert.doesNotMatch(name, /(?:^|\/)(?:\.env(?:\..*)?|\.npmrc|\.pypirc|auth\.json|credentials(?:\..*)?|secrets?(?:\..*)?|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?)$/i, `No credential filename in archive: ${name}`);
      assert.doesNotMatch(name, /\.(?:pem|key|p12|pfx)$/i, `No private-key container in archive: ${name}`);
    }
  }
});
