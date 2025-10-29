/*
 * Script to publish Markdown blog posts to a WordPress site using the REST API.
 *
 * This script reads Markdown files that have changed in the current commit,
 * extracts the front‑matter using gray-matter, converts the Markdown body
 * to HTML using remark, and then publishes each post via a POST request
 * to the WordPress REST API. The script uses basic authentication with
 * an application password.
 *
 * Environment variables consumed by this script:
 *   WP_URL               – Base URL of the WordPress site (no trailing slash)
 *   WP_USER              – Username or email for WordPress authentication
 *   WP_APP_PASSWORD      – Application password for WordPress authentication
 *   CHANGED_FILES        – Newline separated list of changed files
 *   POSTS_DIR            – Directory containing blog posts (default: content/posts)
 */

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { remark } = require('remark');
const html = require('remark-html');
const fetch = require('node-fetch');

/**
 * Convert Markdown string to HTML.
 * @param {string} markdown Markdown content
 * @returns {Promise<string>} HTML representation
 */
async function mdToHtml(markdown) {
  const processed = await remark().use(html).process(markdown);
  return String(processed);
}

/**
 * Publish a single post to WordPress.
 * @param {string} filePath Absolute path to the Markdown file
 */
async function publishPost(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const { data, content } = matter(raw);
  const bodyHtml = await mdToHtml(content);

  const wpUrl = process.env.WP_URL.replace(/\/$/, '');
  const auth = Buffer.from(`${process.env.WP_USER}:${process.env.WP_APP_PASSWORD}`).toString('base64');

  // Build the payload for the WP REST API
  const payload = {
    title: data.title || path.basename(filePath),
    status: data.status || 'draft',
    slug: data.slug || path.basename(filePath, path.extname(filePath)),
    excerpt: data.excerpt || '',
    content: bodyHtml,
    date: data.date || new Date().toISOString(),
  };

  const endpoint = `${wpUrl}/wp-json/wp/v2/posts`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to publish ${filePath}: ${res.status} ${text}`);
  }
  const json = await res.json();
  console.log(`Published ${filePath} → ${json.link || json.slug}`);
}

/**
 * Main function: determine changed files and publish posts
 */
async function main() {
  const postsDir = process.env.POSTS_DIR || 'content/posts';
  const changedFilesEnv = process.env.CHANGED_FILES || '';
  const changed = changedFilesEnv
    .split(/\r?\n/)
    .filter((p) => p && p.startsWith(`${postsDir}/`) && p.endsWith('.md'));
  if (changed.length === 0) {
    console.log('No Markdown posts changed. Nothing to publish.');
    return;
  }
  for (const relPath of changed) {
    const absPath = path.resolve(relPath);
    try {
      await publishPost(absPath);
    } catch (err) {
      console.error(err.message);
    }
  }
}

// Execute the script
main().catch((err) => {
  console.error(err);
  process.exit(1);
});