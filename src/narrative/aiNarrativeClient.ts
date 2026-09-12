import type { ApplicationRecord, EstimateResult } from '../model/types';

// Talks to the optional narrative Lambda (backend/narrative-lambda). Never
// throws — any failure (no endpoint configured, network error, non-2xx,
// malformed response) resolves to null so the caller can fall back to the
// deterministic TemplateNarrativeProvider, which always works.

export interface AiNarrative {
  executive: string;
  technicalTopDrivers: string;
  evidenceImprovement: string;
  dataQualityAnomaly: string;
}

const REQUIRED_FIELDS: (keyof AiNarrative)[] = ['executive', 'technicalTopDrivers', 'evidenceImprovement', 'dataQualityAnomaly'];

function isAiNarrative(value: unknown): value is AiNarrative {
  if (!value || typeof value !== 'object') return false;
  return REQUIRED_FIELDS.every((f) => typeof (value as Record<string, unknown>)[f] === 'string');
}

export async function fetchAiNarrative(app: ApplicationRecord, result: EstimateResult): Promise<AiNarrative | null> {
  const endpoint = import.meta.env.VITE_NARRATIVE_API_URL;
  if (!endpoint) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ app, result }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = await response.json();
    return isAiNarrative(data) ? data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
