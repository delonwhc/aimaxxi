import MarkdownIt from 'markdown-it';
import footnote from 'markdown-it-footnote';
import { lstat, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { validateHttpsURL } from './security.mjs';

const escapeHTML = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

export const manifestoPages = [
  {
    route: '/manifesto',
    source: 'docs/manifesto/AI-MAXIMALIST-MANIFESTO.md',
    sourceDownload: '/manifesto/ai-maximalist-manifesto.md',
    bodyStart: 'The opening act',
    title: 'The AI Maximalist Manifesto',
    articleTitle: 'The AI Maximalist Manifesto',
    subtitle: 'For Abundant Intelligence and More Life',
    pageLabel: 'Founding doctrine',
    description: 'Advance two frontiers together: what intelligence can do, and who can wield it. The founding doctrine of AI maximalism. More intelligence. More agency. More life.',
    companionUrl: '/manifesto/principles',
    companionLabel: 'READ THE PRINCIPLES',
  },
  {
    route: '/manifesto/principles',
    source: 'docs/manifesto/PRINCIPLES-AND-PRACTICE.md',
    sourceDownload: '/manifesto/principles-and-practice.md',
    bodyStart: 'Principles charter',
    includePreface: true,
    title: 'Principles and Practice',
    articleTitle: 'Principles and Practice',
    subtitle: 'Ten commitments. A civilization to build.',
    pageLabel: 'AI maximalism',
    description: 'The ten commitments of AI maximalism, twelve lines to carry forward, and concrete ways to build and imagine a future with abundant intelligence.',
    companionUrl: '/manifesto',
    companionLabel: 'READ THE MANIFESTO',
  },
];

export function articleMarkdown(source, bodyStart, includePreface = false) {
  const marker = `## ${bodyStart}\n`;
  const beginning = source.indexOf(marker);
  if (beginning < 0) throw new Error(`Manuscript is missing its opening section: ${bodyStart}`);
  const preface = includePreface ? source.slice(0, beginning).split(/\n\s*\n/).filter(block => {
    return block.trim() && !/^# /.test(block) && !/^\*(?:First edition|Draft v\d|Published)\b/.test(block);
  }).join('\n\n') : '';
  return (preface ? preface + '\n\n' : '') + source.slice(beginning);
}

function noteNumber(token) {
  if (!/^[1-9]\d*$/.test(token.meta?.label ?? '')) throw new Error('Public endnotes require explicit positive numeric labels');
  return token.meta.label;
}

function referenceID(token) {
  return `fnref-${noteNumber(token)}${token.meta.subId ? `-${token.meta.subId + 1}` : ''}`;
}

// Notes keep the manuscript's numbering, even when note 13 is cited before 11.
// Grouping the plugin's output also keeps the bibliography in numerical order.
function orderEndnotes(tokens) {
  const start = tokens.findIndex(token => token.type === 'footnote_block_open');
  if (start < 0) return tokens;
  const end = tokens.findIndex((token, index) => index > start && token.type === 'footnote_block_close');
  const groups = [];
  for (let index = start + 1; index < end;) {
    const group = [tokens[index++]];
    while (index < end && group.at(-1).type !== 'footnote_close') group.push(tokens[index++]);
    groups.push(group);
  }
  groups.sort((first, second) => Number(noteNumber(first[0])) - Number(noteNumber(second[0])));
  return [...tokens.slice(0, start + 1), ...groups.flat(), ...tokens.slice(end)];
}

export function renderArticle(markdown) {
  const md = new MarkdownIt({ html: false, linkify: false, typographer: false }).use(footnote);
  // Article links are citations. Disallow relative URLs and executable schemes;
  // the renderer itself creates the local table-of-contents and note anchors.
  md.validateLink = value => {
    try { validateHttpsURL(value, 'Citation'); return true; } catch { return false; }
  };
  md.disable('image');
  md.renderer.rules.link_open = (tokens, index, options, environment, renderer) => {
    validateHttpsURL(tokens[index].attrGet('href'), 'Citation');
    tokens[index].attrSet('rel', 'noopener noreferrer');
    return renderer.renderToken(tokens, index, options);
  };
  md.renderer.rules.footnote_ref = (tokens, index) => {
    const number = noteNumber(tokens[index]);
    return `<sup class="footnote-ref"><a href="#fn-${number}" id="${referenceID(tokens[index])}" role="doc-noteref" aria-label="Read endnote ${number}">${number}</a></sup>`;
  };
  md.renderer.rules.footnote_block_open = () => '<section class="footnotes" role="doc-endnotes" aria-label="Numbered endnotes"><ol class="footnotes-list">\n';
  md.renderer.rules.footnote_open = (tokens, index) => `<li id="fn-${noteNumber(tokens[index])}" class="footnote-item" tabindex="-1">`;
  md.renderer.rules.footnote_anchor = (tokens, index) => {
    const token = tokens[index];
    const ordinal = token.meta.subId ? `, citation ${token.meta.subId + 1}` : '';
    return ` <a href="#${referenceID(token)}" class="footnote-backref" role="doc-backlink" aria-label="Return to endnote ${noteNumber(token)}${ordinal} in the text">↩</a>`;
  };
  md.renderer.rules.table_open = (tokens, index) => `<div class="table-scroll" role="region" aria-label="${escapeHTML(tokens[index].meta.label)}" tabindex="0"><table>\n`;
  md.renderer.rules.table_close = () => '</table></div>\n';
  const environment = {};
  const tokens = orderEndnotes(md.parse(markdown, environment));
  const contents = [];
  const ids = new Set();
  let sectionLabel = 'Reference table';
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type === 'table_open') token.meta = { label: sectionLabel };
    if (token.type !== 'heading_open') continue;
    const label = tokens[index + 1].children.filter(child => ['text', 'code_inline'].includes(child.type)).map(child => child.content).join('');
    const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    let id = base || 'section';
    for (let suffix = 2; ids.has(id); suffix++) id = `${base}-${suffix}`;
    ids.add(id);
    token.attrSet('id', id);
    if (token.tag === 'h2') {
      sectionLabel = label;
      contents.push({ id, label });
    }
  }
  return {
    articleContent: md.renderer.render(tokens, md.options, environment),
    articleContents: `<ol>${contents.map(({ id, label }) => `<li><a href="#${id}">${escapeHTML(label)}</a></li>`).join('')}</ol>`,
  };
}

// The two manuscripts are explicit public exports, never a recursive docs copy.
async function readPublicManuscript(root, source) {
  const parts = source.split('/');
  for (let index = 1; index <= parts.length; index++) {
    const info = await lstat(path.join(root, ...parts.slice(0, index)));
    if (info.isSymbolicLink() || (index === parts.length ? !info.isFile() : !info.isDirectory())) {
      throw new Error(`Public manuscript must be a regular file without symlinks: ${source}`);
    }
  }
  return readFile(path.join(root, source), 'utf8');
}

export async function publishManifesto(root, dist, config) {
  const template = await readFile(path.join(root, 'src/manifesto.html'), 'utf8');
  for (const page of manifestoPages) {
    const manuscript = await readPublicManuscript(root, page.source);
    const rendered = renderArticle(articleMarkdown(manuscript, page.bodyStart, page.includePreface));
    const values = { ...config, ...page, pageUrl: config.url + page.route, ...rendered };
    const html = template.replace(/\{\{([a-zA-Z]+)\}\}/g, (_, key) => {
      if (!(key in values)) throw new Error(`Unknown manifesto template key: ${key}`);
      return ['articleContent', 'articleContents'].includes(key) ? values[key] : escapeHTML(values[key]);
    });
    if (/\{\{.*?\}\}/.test(html)) throw new Error('Unresolved manifesto template marker');
    const directory = path.join(dist, page.route);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'index.html'), html);
    await writeFile(path.join(dist, page.sourceDownload), manuscript);
  }
  return manifestoPages.map(page => config.url + page.route);
}
