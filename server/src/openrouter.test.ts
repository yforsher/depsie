import { afterEach, describe, expect, it, vi } from 'vitest';
import * as z from 'zod';
import { AiError, MODEL, chatJson } from './openrouter.js';

const schema = z.object({ packages: z.array(z.string()) });

function mockOpenRouter(content: string, status = 200) {
  const fetchMock = vi.fn(async () =>
    Response.json({ choices: [{ message: { content } }] }, { status }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('chatJson', () => {
  it('sends the model, provider routing and JSON schema', async () => {
    const fetchMock = mockOpenRouter('{"packages":[]}');
    await chatJson('test', schema, 'system', 'user');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe(MODEL);
    expect(body.provider).toEqual({ require_parameters: true });
    expect(body.response_format.json_schema).toMatchObject({
      name: 'test',
      strict: true,
      schema: { type: 'object', required: ['packages'] },
    });
  });

  it('parses valid model output', async () => {
    mockOpenRouter('{"packages":["zod"]}');
    await expect(chatJson('test', schema, 'system', 'user')).resolves.toEqual({
      packages: ['zod'],
    });
  });

  it('rejects output that is not JSON', async () => {
    mockOpenRouter('not json');
    await expect(chatJson('test', schema, 'system', 'user')).rejects.toThrow(
      new AiError('Model output is not valid JSON: not json'),
    );
  });

  it('rejects output that does not match the schema', async () => {
    mockOpenRouter('{"packages":"zod"}');
    await expect(chatJson('test', schema, 'system', 'user')).rejects.toThrow(
      /does not match the schema/,
    );
  });

  it('rejects an OpenRouter error response', async () => {
    mockOpenRouter('', 500);
    await expect(chatJson('test', schema, 'system', 'user')).rejects.toThrow(
      /failed with status 500/,
    );
  });
});
