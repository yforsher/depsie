import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';
import { fakeFetch } from './fixtureResponses.js';

// Analytics writes are not part of this test.
vi.mock('@neondatabase/serverless', () => ({ neon: () => async () => [] }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fakeFetch', () => {
  it('answers every outside call of a report from the fixtures', async () => {
    vi.stubGlobal('fetch', vi.fn(fakeFetch));

    const response = await request(createApp('client-dist'))
      .post('/api/report')
      .send({ need: 'validate forms', framework: 'React' });

    expect(response.status).toBe(200);
    expect(response.body.ranking.map((entry: { name: string }) => entry.name)).toEqual([
      '@hookform/resolvers',
    ]);
  });

  // Answering by schema name, not by call order, keeps reports that overlap in time correct.
  it('answers an AI call by the schema it asks for, whatever came before', async () => {
    const aiCall = (name: string) =>
      fakeFetch('https://openrouter.ai/api/v1/chat/completions', {
        body: JSON.stringify({ response_format: { json_schema: { name } } }),
      });
    const answer = async (response: Response) =>
      JSON.parse(
        ((await response.json()) as { choices: { message: { content: string } }[] }).choices[0]!
          .message.content,
      ) as Record<string, unknown>;

    // Out of the pipeline's order, and repeated, so neither call order nor a fixed answer passes.
    const answers = [];
    for (const name of ['comparison', 'query_expansion', 'query_expansion', 'comparison']) {
      answers.push(await answer(await aiCall(name)));
    }

    expect(answers.map((a) => Object.keys(a).includes('ranking'))).toEqual([
      true,
      false,
      false,
      true,
    ]);
    expect(answers[1]).toEqual({ keywords: [], packages: ['@hookform/resolvers'] });
  });
});
