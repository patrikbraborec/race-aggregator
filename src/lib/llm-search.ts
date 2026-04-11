import Anthropic from '@anthropic-ai/sdk';
import type { TerrainType } from './types';
import { validTerrains } from './types';

export interface LLMParsedQuery {
  terrain?: TerrainType;
  city?: string;
  month?: number;
  km?: number;
  proximity?: boolean;
  searchText: string;
}

const SEARCH_TOOL: Anthropic.Messages.Tool = {
  name: 'search_filters',
  description: 'Extract structured search filters from a Czech running race query.',
  input_schema: {
    type: 'object' as const,
    properties: {
      terrain: {
        type: 'string',
        enum: ['road', 'trail', 'cross', 'obstacle', 'mixed'],
        description:
          'Race terrain type. road = silniční/asfalt/městský, trail = trailový/terénní/horský, cross = kros/přespolní, obstacle = překážkový/spartan, mixed = kombinace. IMPORTANT: "ultra" is NOT a terrain — it is a distance category. If the user mentions "ultra", set km to 50 instead.',
      },
      city: {
        type: 'string',
        description:
          'Czech city, town, or geographic area name in nominative case. Normalize declensions: "v Praze" → "Praha", "v Brně" → "Brno", "v Beskydech" → "Beskydy", "na Šumavě" → "Šumava", "v Jizerských horách" → "Jizerské hory". Include both cities and geographic regions (mountain ranges, areas).',
      },
      month: {
        type: 'integer',
        minimum: 1,
        maximum: 12,
        description: 'Month number (1-12). Recognize Czech month names in all declensions.',
      },
      km: {
        type: 'number',
        description:
          'Target distance in km. "půlmaraton/půlka" = 21, "maraton" = 42, "desítka" = 10, "pětka" = 5, "ultra" = 50. Only extract when clearly a distance filter, not part of a race name like "Jizerská 50".',
      },
      proximity: {
        type: 'boolean',
        description:
          'True when the user wants races AROUND a city, not just IN that city. Trigger words: "okolo", "v okolí", "poblíž", "blízko", "nedaleko". Example: "závody okolo Brna" → proximity=true, city="Brno". "závody v Brně" → proximity=false, city="Brno".',
      },
      searchText: {
        type: 'string',
        description:
          'Remaining text for race name matching after extracting structured filters. If the query is a race name (e.g. "Jizerská 50", "Pražský maraton", "Běchovice"), put it here. Empty string if the entire query was consumed by filters.',
      },
    },
    required: ['searchText'],
  },
};

const SYSTEM_PROMPT = `Jsi parser vyhledávacích dotazů pro český běžecký kalendář. Extrahuj strukturované filtry z dotazu uživatele.

Pravidla:
- Rozpoznej české názvy měsíců ve všech pádech (leden/lednu/ledna, únor/února, březen/března, duben/dubna, květen/května, červen/června, červenec/července, srpen/srpna, září, říjen/října, listopad/listopadu, prosinec/prosince)
- Rozpoznej české města a regiony ve všech pádech a převeď na 1. pád (v Praze → Praha, v Brně → Brno, v Beskydech → Beskydy, na Šumavě → Šumava, v Jizerských horách → Jizerské hory)
- Rozpoznej typ terénu z českých i anglických výrazů. POZOR: "ultra" NENÍ terén — je to vzdálenostní kategorie. Pokud uživatel zmíní "ultra", nastav km na 50
- "na podzim" = měsíce 9-11, "na jaře" = měsíce 3-5, "v létě" = měsíce 6-8, "v zimě" = měsíce 12-2 → vyber prostřední měsíc sezóny (podzim→10, jaro→4, léto→7, zima→1)
- Pokud dotaz vypadá jako název závodu (např. "Jizerská 50", "Běchovice", "Pražský maraton"), vlož ho celý do searchText a NEEXTRAHUJ vzdálenost ani město
- Čísla jako "50" extrahuj jako vzdálenost POUZE když je jasně filtr (např. "závod na 50 km", "běh kolem 10 km"), NE když je součástí názvu závodu
- Nastav proximity=true pokud uživatel hledá závody OKOLO/V OKOLÍ/POBLÍŽ/BLÍZKO/NEDALEKO města. Příklady: "závody okolo Brna" → proximity=true, "závody v Brně" → proximity=false`;

const LLM_TIMEOUT_MS = 5000;

export async function parseSearchQueryWithLLM(
  rawQuery: string,
  apiKey: string,
): Promise<LLMParsedQuery | null> {
  const client = new Anthropic({ apiKey });

  try {
    const response = await Promise.race([
      client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        system: SYSTEM_PROMPT,
        tools: [SEARCH_TOOL],
        tool_choice: { type: 'tool', name: 'search_filters' },
        messages: [{ role: 'user', content: rawQuery }],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('LLM timeout')), LLM_TIMEOUT_MS),
      ),
    ]);

    const toolBlock = response.content.find(
      (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use',
    );
    if (!toolBlock) return null;

    const input = toolBlock.input as Record<string, unknown>;

    const terrain = typeof input.terrain === 'string' && validTerrains.has(input.terrain)
      ? (input.terrain as TerrainType)
      : undefined;

    const city = typeof input.city === 'string' && input.city.length >= 2
      ? input.city
      : undefined;

    const month = typeof input.month === 'number' && input.month >= 1 && input.month <= 12
      ? input.month
      : undefined;

    const km = typeof input.km === 'number' && input.km > 0
      ? input.km
      : undefined;

    const proximity = input.proximity === true ? true : undefined;

    const searchText = typeof input.searchText === 'string'
      ? input.searchText.trim()
      : '';

    console.log('[llm-search] Parsed query:', { terrain, city, month, km, proximity, searchText });
    return { terrain, city, month, km, proximity, searchText };
  } catch (err) {
    console.error('[llm-search] Failed to parse query with LLM:', err);
    return null;
  }
}
