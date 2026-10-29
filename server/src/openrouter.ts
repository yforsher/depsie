import * as z from 'zod';
import { addUsage } from './analytics.js';
import { log, secondsSince } from './log.js';

export const MODEL = 'openai/gpt-oss-120b';

// A normal answer takes up to about 3,500 tokens (reasoning included) and 70 seconds. Broken
// answers ran on for 13,000 to 23,000 tokens and up to 14 minutes, so both limits end them early.
const MAX_TOKENS = 8000;
const TIMEOUT_MS = 120_000;

// Thrown for OpenRouter failures and invalid model output; the report endpoint maps it to 502,
// logs the step that failed and the raw model output, when there is one, so rejected answers can
// be investigated.
export class AiError extends Error {
  step: string;
  modelOutput?: string;

  constructor(step: string, message: string, modelOutput?: string) {
    super(message);
    this.step = step;
    this.modelOutput = modelOutput;
  }
}

// The timeout can fire while waiting for the headers or, since OpenRouter sends whitespace while
// the model works, while reading the body.
function timedOut(name: string) {
  return (error: unknown): never => {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new AiError(name, `OpenRouter did not answer within ${TIMEOUT_MS / 1000}s`);
    }
    throw error;
  };
}

interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  cost: number;
}

export async function chatJson<T extends z.ZodType>(
  name: string,
  schema: T,
  system: string,
  user: string,
): Promise<z.infer<T>> {
  const start = performance.now();
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      // Route only to providers that honor response_format.
      provider: { require_parameters: true },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name, strict: true, schema: z.toJSONSchema(schema) },
      },
    }),
  }).catch(timedOut(name));
  if (!res.ok) {
    throw new AiError(
      name,
      `OpenRouter request failed with status ${res.status}: ${await res.text()}`,
    );
  }

  const data = (await res.json().catch(timedOut(name))) as {
    provider: string;
    choices: { finish_reason: string; message: { content: string } }[];
    usage: Usage;
  };
  const { prompt_tokens, completion_tokens, cost } = data.usage;
  addUsage(prompt_tokens, completion_tokens, cost);
  log(
    `${name} done in ${secondsSince(start)} by ${data.provider}: ${prompt_tokens} prompt + ${completion_tokens} completion tokens, $${cost.toFixed(5)}`,
  );

  const content = data.choices[0]?.message.content ?? '';
  if (data.choices[0]?.finish_reason === 'length') {
    throw new AiError(name, `Model output stopped at the ${MAX_TOKENS} token limit`, content);
  }
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    throw new AiError(name, `Model output is not valid JSON: ${content.slice(0, 200)}`, content);
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new AiError(
      name,
      `Model output does not match the schema: ${z.prettifyError(result.error)}`,
      content,
    );
  }
  return result.data;
}
