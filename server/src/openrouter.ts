import * as z from 'zod';
import { log, secondsSince } from './log.js';

export const MODEL = 'openai/gpt-oss-120b';

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
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
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
  });
  if (!res.ok) {
    throw new AiError(
      name,
      `OpenRouter request failed with status ${res.status}: ${await res.text()}`,
    );
  }

  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
    usage: Usage;
  };
  const { prompt_tokens, completion_tokens, cost } = data.usage;
  log(
    `${name} done in ${secondsSince(start)}: ${prompt_tokens} prompt + ${completion_tokens} completion tokens, $${cost.toFixed(5)}`,
  );

  const content = data.choices[0]?.message.content ?? '';
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
