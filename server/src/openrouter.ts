import * as z from 'zod';

export const MODEL = 'openai/gpt-oss-120b';

// Thrown for OpenRouter failures and invalid model output; the report endpoint maps it to 502
// and logs the raw model output, when there is one, so rejected answers can be investigated.
export class AiError extends Error {
  modelOutput?: string;

  constructor(message: string, modelOutput?: string) {
    super(message);
    this.modelOutput = modelOutput;
  }
}

export async function chatJson<T extends z.ZodType>(
  name: string,
  schema: T,
  system: string,
  user: string,
): Promise<z.infer<T>> {
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
    throw new AiError(`OpenRouter request failed with status ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  const content = data.choices[0]?.message.content ?? '';
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    throw new AiError(`Model output is not valid JSON: ${content.slice(0, 200)}`, content);
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new AiError(
      `Model output does not match the schema: ${z.prettifyError(result.error)}`,
      content,
    );
  }
  return result.data;
}
