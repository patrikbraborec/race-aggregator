export const prerender = false;

import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';

const SYSTEM_PROMPT = `You are a Czech running race search assistant. The user will type a search query (in Czech or English) about running races in the Czech Republic.

Extract structured filters from the query. Return ONLY valid JSON with these fields:
- "q": search keywords (string) — ALWAYS include this with relevant Czech word stems (kořeny slov) stripped of declension suffixes. For geographic names, include the base form (e.g., "Beskydech" → "Beskyd", "Praze" → "Prah", "Jizerských" → "Jizer"). Separate multiple keywords with spaces.
- "terrain": one of "road", "trail", "ultra", "cross", "obstacle", "mixed" — ONLY if the user explicitly names a terrain type. Do NOT infer terrain from race names or locations.
- "region": Czech region/kraj name (string) — only if a specific region/kraj is explicitly mentioned
- "km": distance in kilometers (number) — only if a specific distance is mentioned

Common distance mappings:
- "5k" or "5 km" → 5
- "10k" or "10 km" or "desítka" → 10
- "půlmaraton" or "půlmaratón" → 21
- "maraton" or "maratón" → 42

IMPORTANT rules:
- Always populate "q" with searchable keyword stems. Prefer short stems that match across Czech word forms.
- Example: "Ultra v Beskydech" → {"q": "ultra beskyd", "terrain": "ultra"}
- Example: "trail závody na Moravě" → {"q": "morav trail"}
- Example: "běh v Praze na 10 km" → {"q": "prah", "km": 10}
- Use structured filters sparingly — only when the user's intent is unambiguous. When in doubt, put it in "q".

Return ONLY the JSON object, no explanation.`;

export const GET: APIRoute = async ({ url, redirect }) => {
  const query = url.searchParams.get('q')?.trim();

  if (!query) {
    return redirect('/zavody', 302);
  }

  // Simple heuristic: if the query is 1-2 words with no Czech natural language markers,
  // skip AI and go straight to keyword search
  const isSimpleQuery = query.split(/\s+/).length <= 2
    && !/chci|chtel|chtěl|hledám|hledam|běžet|bezet|běhat|behat|závod|zavod|kde|jaký|jaky|okolo|kolem|poblíž|pobliz|v\s|na\s/i.test(query);

  if (isSimpleQuery) {
    return redirect(`/zavody?q=${encodeURIComponent(query)}`, 302);
  }

  const apiKey = import.meta.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Fallback to basic keyword search if no API key
    return redirect(`/zavody?q=${encodeURIComponent(query)}`, 302);
  }

  try {
    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: query }],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    const filters = JSON.parse(text);

    const params = new URLSearchParams();
    // Always include keywords — structured filters are only used for
    // explicit user-chosen dropdowns, not LLM-inferred values, to avoid
    // over-restricting results (e.g., "ultra" terrain filter excluding
    // races tagged as "trail" that are actually ultra-distance).
    if (filters.q) params.set('q', filters.q);
    if (filters.km) params.set('km', String(filters.km));

    // If city was extracted, add it to the keyword search
    if (filters.city) {
      const currentQ = params.get('q') ?? '';
      params.set('q', (currentQ + ' ' + filters.city).trim());
    }

    return redirect(`/zavody?${params.toString()}`, 302);
  } catch {
    // On any error, fall back to keyword search
    return redirect(`/zavody?q=${encodeURIComponent(query)}`, 302);
  }
};
