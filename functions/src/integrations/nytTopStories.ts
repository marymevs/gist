import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';

export const NYT_API_KEY = defineSecret('NYT_API_KEY');

type NytTopStoriesResponse = {
  status?: string;
  results?: NytTopStory[];
};

type NytTopStory = {
  title?: string;
  abstract?: string;
  byline?: string;
};

type WorldItem = {
  headline: string;
  implication: string;
};

function cleanText(value?: string | null): string | null {
  const text = value?.replace(/\s+/g, ' ').trim();
  return text ? text : null;
}

function truncateAtWord(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  const candidate = text.slice(0, maxLength + 1);
  const lastSpace = candidate.lastIndexOf(' ');
  const cutAt = lastSpace > Math.floor(maxLength * 0.6) ? lastSpace : maxLength;
  return `${candidate.slice(0, cutAt).trimEnd()}...`;
}

function toWorldItem(story: NytTopStory): WorldItem | null {
  const title = cleanText(story.title);
  if (!title) return null;

  const summary = cleanText(story.abstract);
  const byline = cleanText(story.byline)?.replace(/^By\s+/i, '');

  const implicationCore = summary
    ? truncateAtWord(summary, 180)
    : 'Top world development to keep on your radar.';
  const implication = byline
    ? `${implicationCore} Source: ${byline}.`
    : implicationCore;

  return {
    headline: truncateAtWord(title, 140),
    implication,
  };
}

export async function fetchNytTopStories(params?: {
  section?: string;
  limit?: number;
}): Promise<WorldItem[]> {
  const section = params?.section?.trim().toLowerCase() || 'us';
  const limit = Math.max(1, Math.min(params?.limit ?? 3, 10));

  let apiKey: string;
  try {
    apiKey = NYT_API_KEY.value();
  } catch {
    logger.warn('NYT_API_KEY secret is not available in this runtime.');
    return [];
  }

  const url = new URL(
    `https://api.nytimes.com/svc/topstories/v2/${encodeURIComponent(section)}.json`,
  );
  url.searchParams.set('api-key', apiKey);

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`NYT Top Stories API ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as NytTopStoriesResponse;
  if (!Array.isArray(data.results)) return [];

  return data.results
    .map(toWorldItem)
    .filter((item): item is WorldItem => item !== null)
    .slice(0, limit);
}
