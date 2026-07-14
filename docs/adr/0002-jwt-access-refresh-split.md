# ADR 0002 — Short access tokens, refresh tokens in an httpOnly cookie

**Status:** Accepted
**Date:** 2026-07

## Context

The original auth was half-built in a way that looked finished. It issued two
tokens and called one of them a refresh token, but:

- both were signed with `JWT_SECRET`, and both expired in 7 days;
- `JWT_REFRESH_SECRET` was *required* at boot and validated to be different from
  `JWT_SECRET` — and then never used to sign or verify anything;
- both tokens were returned in the JSON body and persisted to `localStorage`.

So the "refresh token" was just a second access token with a longer name. And
because any XSS on the page could read `localStorage`, an attacker got a
7-day credential either way. The rotation logic in the database — which was
written, and was correct — could not help, because the thing being rotated was
not the thing granting access.

## Decision

Give each token a distinct job, and make the storage match.

| | Access token | Refresh token |
|---|---|---|
| Signed with | `JWT_SECRET` | `JWT_REFRESH_SECRET` |
| Lifetime | 15 minutes | 7 days |
| Travels in | `Authorization: Bearer` | `httpOnly` cookie, `Path=/api/auth` |
| Stored client-side | in memory / Zustand | never — JavaScript cannot read it |
| Revocable | no (short-lived instead) | yes — a row in `refresh_tokens` |

Refresh rotates: presenting a refresh token deletes that row and issues a new
pair, so a stolen-and-replayed token fails.

## Consequences

An XSS now yields at most a 15-minute credential, and the refresh token is out
of JavaScript's reach entirely. The two secrets are finally load-bearing: a token
signed with one genuinely does not verify under the other, and there is a test
that asserts exactly that.

`secure` on the cookie follows the client's scheme rather than `NODE_ENV`,
because a production build served over plain HTTP (which is what `docker compose
up` on localhost is) would otherwise silently drop the cookie and break login
with no error.

`SameSite=Lax` assumes the client and API share a site. They do, in every way
this is deployed. A genuinely cross-domain deployment would need
`SameSite=None; Secure` — noted here so the tradeoff is a decision and not a
surprise.

Route protection remains client-side (`AuthProvider`), so a protected page
flashes briefly before redirecting. Edge middleware would fix that; it is not
done, and it is a known gap rather than an oversight.
