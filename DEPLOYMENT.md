# Deployment

MigrationScope is mostly a client-side static site, plus one small optional
Lambda + HTTP API for the "Show AI narrative" feature. Infrastructure is
defined in `template.yaml` (deployed via SAM CLI) and config is stored in
`samconfig.toml`.

## Architecture

```
Browser → CloudFront (HTTPS, cached) → S3 bucket (private, OAC-only)
       ↘ (optional) POST /narrative → API Gateway (HTTP API) → Lambda → Anthropic API (Claude Haiku)
```

- **S3 bucket** — private (all public access blocked), holds the built
  `dist/` output. Only CloudFront can read it, via Origin Access Control.
- **CloudFront distribution** — HTTPS-only CDN in front of the bucket. Since
  the app uses hash-based routing (`#/applications`, `#/import`, …), the
  browser only ever requests `/index.html`, so no SPA path-rewriting is
  needed.
- **Narrative Lambda + HTTP API** (`backend/narrative-lambda/`) — optional.
  Calls the Anthropic Messages API (model `claude-haiku-4-5-20251001`) to
  generate the "Show AI narrative" text, reading the API key from SSM
  Parameter Store at runtime. If this is unreachable or unconfigured, the
  app falls back to the deterministic `TemplateNarrativeProvider` — the AI
  panel never breaks the app, it just becomes less eloquent.

S3/CloudFront are within AWS free tier limits (S3: 5GB storage; CloudFront:
1TB/month transfer for the first 12 months). The Lambda/API Gateway calls are
also free-tier eligible on the AWS side, but **each narrative call is a
small, real, non-free charge from Anthropic** — the endpoint is throttled
(burst 5 / rate 2 req/s) as a cost guard since it's public and unauthenticated.

## Current deployment

| | |
|---|---|
| Stack name | `migration-scope` |
| Region | `us-east-1` |
| Live URL | https://d1v64qdf60rhoq.cloudfront.net |
| S3 bucket | `migration-scope-sitebucket-cmkmvzeicgrj` |
| CloudFront distribution ID | `E2WGKGZ2BRNBJ4` |
| Narrative API URL | https://dbyu84c69f.execute-api.us-east-1.amazonaws.com/narrative |

## One-time setup: Anthropic API key

The narrative Lambda reads its API key from SSM Parameter Store — it is
**never** stored in code, `.env` files, or this repo. Store it yourself:

```bash
aws ssm put-parameter \
  --name /migration-scope/anthropic-api-key \
  --type SecureString \
  --value "sk-ant-your-key-here" \
  --region us-east-1
```

Get a key at console.anthropic.com → API Keys if you don't have one. Until
this parameter exists, "Show AI narrative" transparently falls back to the
deterministic templates — nothing else breaks.

## Environment file

`.env.production` (gitignored, per the blanket `.env*` rule — it holds no
secret, just a public URL, but the rule is simpler to keep absolute):

```
VITE_NARRATIVE_API_URL=https://dbyu84c69f.execute-api.us-east-1.amazonaws.com/narrative
```

Local `npm run dev` intentionally has no `.env.development` for this var, so
local development uses the free template fallback by default — add one
yourself (same key) if you want to test the live AI path locally.

## Redeploying after a code change

```bash
npm run build

sam build
sam deploy   # only needed when template.yaml or backend/narrative-lambda/ changed

BUCKET=migration-scope-sitebucket-cmkmvzeicgrj
aws s3 sync dist/ "s3://${BUCKET}/" --delete \
  --cache-control "public,max-age=31536000,immutable" \
  --exclude "index.html"
aws s3 cp dist/index.html "s3://${BUCKET}/index.html" \
  --cache-control "public,max-age=0,must-revalidate"

aws cloudfront create-invalidation \
  --distribution-id E2WGKGZ2BRNBJ4 --paths "/*"
```

`index.html` is served with `no-cache` so every deploy is picked up
immediately; hashed asset filenames (`assets/index-<hash>.js/css`) are cached
for a year since a new build always gets a new hash. If the narrative API URL
ever changes (e.g. stack recreated), update `.env.production` before rebuilding.

## Tearing it down

```bash
BUCKET=migration-scope-sitebucket-cmkmvzeicgrj
aws s3 rm "s3://${BUCKET}" --recursive   # CloudFormation won't delete a non-empty bucket
sam delete --stack-name migration-scope
aws ssm delete-parameter --name /migration-scope/anthropic-api-key --region us-east-1
```
