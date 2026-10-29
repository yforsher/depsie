import { afterEach, describe, expect, it, vi } from 'vitest';
import * as z from 'zod';
import { AiError, MODEL, chatJson } from './openrouter.js';
import { usage } from './fixtures.js';

const schema = z.object({ packages: z.array(z.string()) });

function mockOpenRouter(content: string, status = 200, finishReason = 'stop') {
  const fetchMock = vi.fn(async () =>
    Response.json(
      {
        provider: 'DeepInfra',
        choices: [{ finish_reason: finishReason, message: { content } }],
        usage,
      },
      { status },
    ),
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
      new AiError('test', 'Model output is not valid JSON: not json', 'not json'),
    );
  });

  it('rejects output that does not match the schema', async () => {
    mockOpenRouter('{"packages":"zod"}');
    await expect(chatJson('test', schema, 'system', 'user')).rejects.toMatchObject({
      message: expect.stringContaining('does not match the schema'),
      modelOutput: '{"packages":"zod"}',
    });
  });

  it('rejects an OpenRouter error response', async () => {
    mockOpenRouter('', 500);
    await expect(chatJson('test', schema, 'system', 'user')).rejects.toThrow(
      /failed with status 500/,
    );
  });
  it('caps the output length and logs the provider that answered', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetchMock = mockOpenRouter('{"packages":[]}');
    await chatJson('test', schema, 'system', 'user');

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).max_tokens).toBe(8000);
    expect(String(consoleLog.mock.calls[0]?.[0])).toContain('test done in');
    expect(String(consoleLog.mock.calls[0]?.[0])).toContain('by DeepInfra');
    consoleLog.mockRestore();
  });

  it('rejects output cut off at the token limit, keeping it for the log', async () => {
    mockOpenRouter('{"packages":["   ', 200, 'length');
    await expect(chatJson('test', schema, 'system', 'user')).rejects.toMatchObject({
      message: 'Model output stopped at the 8000 token limit',
      modelOutput: '{"packages":["   ',
    });
  });

  it('turns a timeout while waiting or while reading the answer into an AiError', async () => {
    const timeout = new DOMException('The operation timed out.', 'TimeoutError');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw timeout;
      }),
    );
    await expect(chatJson('test', schema, 'system', 'user')).rejects.toThrow(
      new AiError('test', 'OpenRouter did not answer within 120s'),
    );

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => Promise.reject(timeout) })),
    );
    await expect(chatJson('test', schema, 'system', 'user')).rejects.toThrow(
      new AiError('test', 'OpenRouter did not answer within 120s'),
    );
  });
});
