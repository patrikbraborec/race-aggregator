export const prerender = false;

import type { APIRoute } from 'astro';
import { parseSearchQueryWithLLM } from '../../lib/llm-search';
import { parseSearchQuery } from '../../lib/search';

const MAX_QUERY_LENGTH = 200;

export const GET: APIRoute = async ({ url, redirect }) => {
  const query = url.searchParams.get('q')?.trim().slice(0, MAX_QUERY_LENGTH);

  if (!query) {
    return redirect('/zavody', 302);
  }

  const apiKey = import.meta.env.ANTHROPIC_API_KEY;
  const params = new URLSearchParams();
  params.set('q', query);

  if (apiKey) {
    const llmResult = await parseSearchQueryWithLLM(query, apiKey);

    if (llmResult) {
      if (llmResult.terrain) params.set('teren', llmResult.terrain);
      if (llmResult.month) params.set('mesic', String(llmResult.month));
      if (llmResult.km) params.set('km', String(llmResult.km));
      if (llmResult.city) params.set('mesto', llmResult.city);
      if (llmResult.searchText) params.set('qt', llmResult.searchText);

      return redirect(`/zavody?${params.toString()}`, 302);
    }
  }

  // Fallback to regex parser
  const parsed = parseSearchQuery(query);
  if (parsed.terrain) params.set('teren', parsed.terrain);
  if (parsed.month) params.set('mesic', String(parsed.month));
  if (parsed.km) params.set('km', String(parsed.km));
  if (parsed.city) params.set('mesto', parsed.city);

  return redirect(`/zavody?${params.toString()}`, 302);
};
