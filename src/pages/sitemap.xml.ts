import type { APIRoute } from 'astro';
import { siteConfig } from '../data/site';
import { getRealCollections, getRealVideos } from '../lib/content';

/**
 * Dynamic XML sitemap (`/sitemap.xml`).
 *
 * Production integrity guarantee:
 * Only real, published (`status: 'published'` AND `demo: false`) collections and videos
 * are ever included in the sitemap — demo entries are excluded even in preview builds.
 */
export const GET: APIRoute = async ({ site }) => {
  const base = site ?? new URL(siteConfig.url);
  const [collections, videos] = await Promise.all([getRealCollections(), getRealVideos()]);

  const paths = [
    '/',
    '/works',
    ...collections.map((c) => `/collections/${c.id}`),
    ...videos.map((v) => `/videos/${v.id}`),
  ];

  const urls = paths
    .map((p) => {
      const loc = new URL(p, base).toString();
      return `  <url>\n    <loc>${loc}</loc>\n  </url>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
    },
  });
};

