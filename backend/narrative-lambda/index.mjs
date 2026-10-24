import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

// AI is optional and subordinate: this function receives only normalized
// facts and already-calculated outputs, and returns explanatory text — it
// has no way to change a score, formula, or rule, and the client always has
// a deterministic-template fallback if this call fails for any reason.

const ssm = new SSMClient({});
const PARAMETER_NAME = process.env.ANTHROPIC_KEY_PARAMETER ?? '/migration-scope/anthropic-api-key';
const MODEL = 'claude-haiku-4-5-20251001';

let cachedApiKey; // cached across warm invocations of the same execution environment

async function getApiKey() {
  if (cachedApiKey) return cachedApiKey;
  const result = await ssm.send(new GetParameterCommand({ Name: PARAMETER_NAME, WithDecryption: true }));
  cachedApiKey = result.Parameter?.Value;
  if (!cachedApiKey) throw new Error('Anthropic API key parameter is empty');
  return cachedApiKey;
}

const SYSTEM_PROMPT = `You write short, plain-prose explanations of a software migration effort estimate for MigrationScope, an internal AWS migration planning tool.

Rules:
- You are given already-calculated numbers and facts. Never invent, imply, or restate a different number than what is given.
- Never suggest a different score, path, or recommendation than what the data already shows — you explain, you do not decide.
- Plain prose only. No markdown, no headers, no bullet lists, no emphasis characters.
- Each field should be 1-3 sentences, direct and specific to the actual numbers given.
- Respond with ONLY a single JSON object, no other text, matching exactly this shape:
{"executive": "...", "technicalTopDrivers": "...", "evidenceImprovement": "...", "dataQualityAnomaly": "..."}
- "executive": a plain-English summary of the effort, range, risk, confidence, and wave suitability for a non-technical stakeholder.
- "technicalTopDrivers": explain what is driving the size of this estimate, referencing the given top drivers.
- "evidenceImprovement": explain what evidence gaps exist and why closing them would help, referencing the given evidence-improvement actions.
- "dataQualityAnomaly": call out any data-quality anomalies for this application, referencing the given conflicts/flags. If none, say so plainly.`;

function buildUserPrompt(app, result) {
  const facts = {
    applicationName: app.applicationName,
    businessCriticality: app.businessCriticality,
    architectureStyle: app.architectureStyle,
    drTopology: app.drTopology,
    rtoMinutes: app.rtoMinutes,
    rpoMinutes: app.rpoMinutes,
    unknownDependencyIndicator: app.unknownDependencyIndicator,
    conflicts: app.conflicts ?? [],
  };
  const outputs = {
    path: result.path,
    expectedEffortWeeks: result.expectedEffortWeeks,
    optimisticEffortWeeks: result.optimisticEffortWeeks,
    conservativeEffortWeeks: result.conservativeEffortWeeks,
    riskBand: result.riskBand,
    confidenceBand: result.confidenceBand,
    waveSuitability: result.waveSuitability,
    topDrivers: result.topDrivers,
    evidenceImprovementActions: result.evidenceImprovementActions,
    evidenceQualityFreshness: result.evidenceQuality?.freshness,
  };
  return `Application facts:\n${JSON.stringify(facts)}\n\nCalculated outputs:\n${JSON.stringify(outputs)}`;
}

// Only reflect the request Origin back as access-control-allow-origin when it
// is on the allowlist — echoing an arbitrary Origin would let any site read the
// response. Allowed origins come from the ALLOWED_ORIGINS env var (comma-
// separated), set from the stack's AllowedOrigin parameter plus local dev.
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
);

// Reject request bodies larger than this. The payload is a small facts/outputs
// object; anything bigger is abuse (unbounded input would inflate Anthropic
// input-token cost).
const MAX_BODY_BYTES = 64 * 1024;

function resolveCorsOrigin(origin) {
  return origin && ALLOWED_ORIGINS.has(origin) ? origin : null;
}

function jsonResponse(statusCode, body, origin) {
  const allowOrigin = resolveCorsOrigin(origin);
  return {
    statusCode,
    headers: {
      'content-type': 'application/json',
      ...(allowOrigin ? { 'access-control-allow-origin': allowOrigin } : {}),
    },
    body: JSON.stringify(body),
  };
}

export const handler = async (event) => {
  const origin = event.headers?.origin ?? event.headers?.Origin;

  const rawBody = event.body ?? '{}';
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
    return jsonResponse(413, { error: 'Request body too large' }, origin);
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' }, origin);
  }

  const { app, result } = payload;
  if (!app || !result) {
    return jsonResponse(400, { error: 'Request must include app and result' }, origin);
  }

  let apiKey;
  try {
    apiKey = await getApiKey();
  } catch (err) {
    console.error('Failed to load Anthropic API key', err);
    return jsonResponse(500, { error: 'Narrative service is not configured' }, origin);
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserPrompt(app, result) }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error', response.status, errText);
      return jsonResponse(502, { error: 'Narrative model call failed' }, origin);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text ?? '';
    let narrative;
    try {
      narrative = JSON.parse(text);
    } catch {
      // Model occasionally wraps JSON in prose despite instructions — try to salvage it.
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Model did not return parseable JSON');
      narrative = JSON.parse(match[0]);
    }

    const required = ['executive', 'technicalTopDrivers', 'evidenceImprovement', 'dataQualityAnomaly'];
    for (const field of required) {
      if (typeof narrative[field] !== 'string') throw new Error(`Missing field: ${field}`);
    }

    return jsonResponse(200, narrative, origin);
  } catch (err) {
    console.error('Narrative generation failed', err);
    return jsonResponse(502, { error: 'Narrative generation failed' }, origin);
  }
};
