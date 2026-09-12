# Deployment

MigrationScope is a pure client-side app, so it deploys as a static site —
no Lambda, no API Gateway, no database. Infrastructure is defined in
`template.yaml` (deployed via SAM CLI, which works fine for plain
CloudFormation resources) and config is stored in `samconfig.toml`.

## Architecture

```
Browser → CloudFront (HTTPS, cached) → S3 bucket (private, OAC-only)
```

- **S3 bucket** — private (all public access blocked), holds the built
  `dist/` output. Only CloudFront can read it, via Origin Access Control.
- **CloudFront distribution** — HTTPS-only CDN in front of the bucket. Since
  the app uses hash-based routing (`#/applications`, `#/import`, …), the
  browser only ever requests `/index.html`, so no SPA path-rewriting is
  needed.

Both are within AWS free tier limits (S3: 5GB storage; CloudFront: 1TB/month
transfer for the first 12 months of the account).

## Current deployment

| | |
|---|---|
| Stack name | `migration-scope` |
| Region | `us-east-1` |
| Live URL | https://d1v64qdf60rhoq.cloudfront.net |
| S3 bucket | `migration-scope-sitebucket-cmkmvzeicgrj` |
| CloudFront distribution ID | `E2WGKGZ2BRNBJ4` |

## Redeploying after a code change

```bash
npm run build

sam build
sam deploy   # infra rarely changes; safe to skip once the stack exists

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
for a year since a new build always gets a new hash.

## Tearing it down

```bash
BUCKET=migration-scope-sitebucket-cmkmvzeicgrj
aws s3 rm "s3://${BUCKET}" --recursive   # CloudFormation won't delete a non-empty bucket
sam delete --stack-name migration-scope
```
