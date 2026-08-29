'use strict';

const { marked } = require('marked');
const sanitizeHtml = require('sanitize-html');

marked.setOptions({ breaks: true });

const ALLOWED_TAGS = sanitizeHtml.defaults.allowedTags.concat(['h1', 'h2', 'h3', 'img', 'del', 'input']);

// Documents are authored by any team member and read by the whole team (or
// even just the next shift), so their markdown is untrusted input — render
// then strip anything that isn't plain formatting before it ever reaches
// another user's browser.
function renderMarkdown(content) {
  const html = marked.parse(String(content || ''));
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt'],
      input: ['type', 'checked', 'disabled']
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' })
    }
  });
}

module.exports = { renderMarkdown };
