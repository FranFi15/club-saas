/** Extrae el ID de video de URLs comunes de YouTube. */
export function parseYouTubeVideoId(url) {
  if (!url || typeof url !== 'string') return null;
  const raw = url.trim();
  if (!raw) return null;

  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const u = new URL(withProto);
    const host = u.hostname.replace(/^www\./i, '').toLowerCase();

    if (host === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '').split('/')[0];
      return id || null;
    }

    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (u.pathname.startsWith('/embed/')) {
        return u.pathname.split('/')[2] || null;
      }
      if (u.pathname.startsWith('/shorts/')) {
        return u.pathname.split('/')[2] || null;
      }
      const v = u.searchParams.get('v');
      if (v) return v;
    }
  } catch {
    /* fall through */
  }

  const embedMatch = raw.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/i);
  if (embedMatch) return embedMatch[1];

  const shortsMatch = raw.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{6,})/i);
  if (shortsMatch) return shortsMatch[1];

  const watchMatch = raw.match(/[?&]v=([a-zA-Z0-9_-]{6,})/i);
  if (watchMatch) return watchMatch[1];

  const shortMatch = raw.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/i);
  if (shortMatch) return shortMatch[1];

  return null;
}

export function isYouTubeUrl(url) {
  return !!parseYouTubeVideoId(url);
}

export function normalizeYouTubeWatchUrl(url) {
  const id = parseYouTubeVideoId(url);
  if (!id) return null;
  return `https://www.youtube.com/watch?v=${id}`;
}

export function youTubeEmbedUrl(url) {
  const id = parseYouTubeVideoId(url);
  if (!id) return null;
  return `https://www.youtube.com/embed/${id}?playsinline=1&rel=0`;
}

export function youTubeThumbnailUrl(url) {
  const id = parseYouTubeVideoId(url);
  if (!id) return null;
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}
