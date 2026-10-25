# Endpoints

Response shapes recorded from one real call to each endpoint. Only the fields the server uses or
may use are listed. Verified 2026-10-25.

## npm registry search

`GET https://registry.npmjs.org/-/v1/search?text=<keywords>&size=<n>`

```
{
  objects: [{
    package: { name, version, description, keywords, license, date, publisher, maintainers,
               links: { homepage, repository, bugs, npm } },
    downloads: { weekly, monthly },
    dependents,          // string, e.g. "342"
    updated,             // ISO date
    searchScore, score: { final, detail: { popularity, quality, maintenance } },
    flags: { insecure }
  }],
  total, time
}
```

## npm registry package metadata

`GET https://registry.npmjs.org/<name>/latest` (scoped names work unencoded, e.g. `@hookform/resolvers`)

About 2 KB. The version document of the `latest` dist-tag: `name`, `version`, `description`,
`license`, `maintainers`, `dependencies`, `peerDependencies`, `types`, `repository`, `homepage`,
`dist: { tarball, fileCount, unpackedSize, integrity }`. No README.

Unknown package: 404 with body `"Not Found"`.

`GET https://registry.npmjs.org/<name>` (full document)

Large: about 460 KB compressed for `zod` (1013 versions). Top-level `dist-tags`, `versions` (map of
version documents as above), `time` (publish date per version, plus `created` and `modified`),
`license`, `maintainers`, `repository`, and `readme` / `readmeFilename`. The README is only here,
for the latest version, not in the per-version documents.

The abbreviated document (`Accept: application/vnd.npm.install-v1+json`) has no README and is
larger for `zod` (about 1.1 MB), so it is not useful here.

## OpenRouter chat completions

`POST https://openrouter.ai/api/v1/chat/completions` with `Authorization: Bearer <OPENROUTER_API_KEY>`

Request:

```
{
  model: "openai/gpt-oss-120b",
  provider: { require_parameters: true },   // only providers that support response_format
  messages: [{ role, content }],
  response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }
}
```

Response:

```
{
  id, model, provider,                       // e.g. provider "Near AI"
  choices: [{
    finish_reason,                           // "stop"
    message: { role, content, refusal, reasoning }   // content is the JSON string
  }],
  usage: { prompt_tokens, completion_tokens, cost,
           completion_tokens_details: { reasoning_tokens } }
}
```

A test call with a two-field schema returned valid JSON matching the schema: 83 prompt tokens,
374 completion tokens (203 of them reasoning), cost $0.00006.

## Example: one `findCandidates()` run

Real traffic from one run on 2026-10-25, trimmed to the fields that matter. The request was:

```json
{
  "need": "validate forms with good TypeScript types",
  "framework": "React",
  "dependencies": [{ "name": "react", "range": "^19.0.0" }]
}
```

It made 9 calls: 1 to OpenRouter, then 5 `/latest` lookups and 3 searches in parallel.

### 1. OpenRouter (AI call 1)

Sent:

```json
{
  "model": "openai/gpt-oss-120b",
  "provider": { "require_parameters": true },
  "messages": [
    {
      "role": "system",
      "content": "You help a developer find npm packages for a need.\nReturn up to 3 short npm search keyword phrases and up to 5 npm package names that\ndirectly address the need, most suitable first. Only name packages you know exist on npm.\nIf the developer's current dependencies are listed, prefer packages that fit alongside them."
    },
    {
      "role": "user",
      "content": "Need: validate forms with good TypeScript types\nFramework: React\nCurrent dependencies:\n- react@^19.0.0"
    }
  ],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "query_expansion",
      "strict": true,
      "schema": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "keywords": { "type": "array", "items": { "type": "string" } },
          "packages": { "type": "array", "items": { "type": "string" } }
        },
        "required": ["keywords", "packages"],
        "additionalProperties": false
      }
    }
  }
}
```

Received (the body starts with whitespace padding before the JSON; `res.json()` handles it):

```json
{
  "provider": "DekaLLM",
  "model": "openai/gpt-oss-120b",
  "choices": [
    {
      "finish_reason": "stop",
      "message": {
        "role": "assistant",
        "content": "{\"keywords\":[\"react hook form typescript\",\"zod schema validation react\",\"formik typescript\"],\"packages\":[\"react-hook-form\",\"@hookform/resolvers\",\"zod\",\"yup\",\"formik\"]}",
        "reasoning": "We need to suggest up to 3 short npm search keyword phrases and up to 5 npm package names ..."
      }
    }
  ],
  "usage": {
    "prompt_tokens": 166,
    "completion_tokens": 267,
    "completion_tokens_details": { "reasoning_tokens": 190 },
    "cost": 0.00005304
  }
}
```

The `content` string is formatted with newlines in the real response; it is shown compact here.

### 2. npm `/latest` for each named package

`GET https://registry.npmjs.org/react-hook-form/latest` returned 200:

```json
{
  "name": "react-hook-form",
  "version": "7.91.0",
  "description": "Performant, flexible and extensible forms library for React Hooks",
  "license": "MIT",
  "peerDependencies": { "react": "^16.8.0 || ^17 || ^18 || ^19", "@types/react": "*" },
  "types": "dist/index.d.ts",
  "maintainers": [{ "name": "(redacted)", "email": "(redacted)" }],
  "dist": { "unpackedSize": 1639036, "fileCount": 235 }
}
```

A name that does not exist, for example `GET https://registry.npmjs.org/no-such-package-xyz-123/latest`,
returns 404 with body `"Not Found"`, and the candidate is dropped.

### 3. npm search for each keyword phrase

`GET https://registry.npmjs.org/-/v1/search?text=zod%20schema%20validation%20react&size=5` returned
200 with `total: 643429` and these 5 hits (name, version, weekly downloads):

| Name                   | Version | Weekly downloads |
| ---------------------- | ------- | ---------------- |
| `zod`                  | 4.6.7   | 221,643,257      |
| `@hookform/resolvers`  | 6.0.0   | 26,765,823       |
| `zod-validation-error` | 5.0.0   | 34,068,823       |
| `zod-to-json-schema`   | 3.25.2  | 44,977,855       |
| `react-hook-form`      | 7.91.0  | 32,173,754       |

First hit in full:

```json
{
  "downloads": { "monthly": 1252658568, "weekly": 221643257 },
  "dependents": "140376",
  "updated": "2026-10-24T01:17:30.899Z",
  "searchScore": 192.58232,
  "package": {
    "name": "zod",
    "version": "4.6.7",
    "description": "TypeScript-first schema declaration and validation library with static type inference",
    "license": "MIT",
    "date": "2026-10-12T16:29:37.778Z",
    "links": {
      "homepage": "https://zod.dev",
      "repository": "git+https://github.com/colinhacks/zod.git",
      "bugs": "https://github.com/colinhacks/zod/issues",
      "npm": "https://www.npmjs.com/package/zod"
    }
  },
  "flags": { "insecure": 0 }
}
```

### Result

All 5 model-named packages exist, so they fill every slot and the search hits are not used:

```json
[
  { "name": "react-hook-form", "version": "7.91.0" },
  { "name": "@hookform/resolvers", "version": "6.0.0" },
  { "name": "zod", "version": "4.6.7" },
  { "name": "yup", "version": "1.7.1" },
  { "name": "formik", "version": "2.4.9" }
]
```
