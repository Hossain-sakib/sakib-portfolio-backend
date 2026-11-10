# Sakib Portfolio — API

A small Express API for the portfolio CMS, contact inbox, lead pipeline, and follow-up tasks. Runs locally on Node.js 24 and in Netlify Functions. MongoDB Atlas stores records, sessions, and rate limits. Cloudinary stores optimized images.

## Local setup

```sh
npm ci
cp .env.example .env
npm run admin:password
npm run dev
```

Set `MONGODB_URI`, `MONGODB_DB=sakib_portfolio`, and `ADMIN_PASSWORD_HASH` in `.env`. Use a database user restricted to this database. Use the generated scrypt hash, not a plaintext password. Configure `FRONTEND_ORIGIN` with exact allowed frontend origins.

## Netlify

Import this repository and keep `netlify.toml`. Set the following in the backend site's environment settings:

- `MONGODB_URI` and `MONGODB_DB`
- `FRONTEND_ORIGIN=https://sakib-studio.netlify.app`
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- Either `ADMIN_PASSWORD_HASH`, or `BOOTSTRAP_TOKEN_HASH` for a one-time admin setup invite.

For bootstrap setup, generate a cryptographically random 32-byte hex token, store only its SHA-256 hash as `BOOTSTRAP_TOKEN_HASH`, and open `/admin?setup=TOKEN` on the frontend. The first successful setup atomically creates the sole administrator in MongoDB. The invite cannot create another administrator afterward. Remove the bootstrap environment value after setup and redeploy. To recover access, use a trusted database console to replace `credentials.admin.passwordHash` with a newly generated scrypt hash; remove active sessions. There is no public password reset endpoint.

Atlas must permit connections from Netlify. Standard Netlify Functions do not provide a fixed outbound IP. Prefer an egress/IP solution when restricting Atlas to fixed IPs; a broad Atlas IP rule requires strong credentials and explicit acceptance of the broader network exposure. TLS verification stays enabled.

## Structure

- `src/app.js`: middleware and route composition.
- `src/db.js`: cached MongoDB connection pool, indexes, and initial portfolio content.
- `src/routes/auth.js`: login and single-use admin setup.
- `src/routes/content.js`: optimistic version checks, publish, and revision restore.
- `src/routes/crm.js`: messages, leads, and tasks.
- `src/routes/media.js`: authenticated uploads and Cloudinary deletion.
- `src/lib/validation.js`: bounded request schemas shared across routes.
- `src/middleware/auth.js`: hashed sessions and database-backed rate limiting.
- `scripts/password.js`: interactive local password-hash generation.

## API

Public: `GET /api/health`, `GET /api/content`, `POST /api/contact`, `POST /api/auth/login`, `POST /api/auth/setup`.

All `/api/admin/*` routes require a bearer session. Content updates and CRM edits include the current version; stale writes return 409. Images are decoded, resized, stripped of metadata, converted to WebP, and uploaded server-side. SVG/HTML uploads are rejected. An image referenced by draft or published content cannot be deleted.

Sessions expire after eight hours. Only a hash of each random session token is stored. Login, contact, and setup attempts use persistent rate-limit buckets with TTL indexes. Draft/published content are separate and the last 50 revisions are retained. The contact inbox stores messages; replying uses the administrator's mail app. No email delivery service is configured.

## Checks and operations

```sh
npm test
npm audit --omit=dev
```

Tests cover password hashing, input/URL validation, every protected resource, malformed requests, and security headers. Configure Atlas backups, monitor function failures, rotate credentials shared outside secure settings, and review dependency updates regularly. Do not commit `.env`, tokens, images, function bundles, or generated deployment data. Deployments need a new build after environment changes.

The curated photo set is uploaded to the `sakib-portfolio/curated` Cloudinary folder. `src/media-seed.json` contains public asset metadata only. It is registered in MongoDB once, so deleting an unused library asset does not cause it to reappear after a cold start. Deleting an asset referenced by either its Cloudinary URL or its original local path is blocked until the content is updated.
