# AI/MAXXI security hardening — September 27, 2026

## Findings

The public repository did not expose a confirmed deployment credential in the audit. Seven reachable commits, 128 distinct Git blobs and the text entries in the 73-file brand kit were scanned. The legacy uploader read `VERCEL_TOKEN` from the environment; its API hostname and team ID were ordinary public identifiers. No committed private key, deploy-hook URL or preview-share token was found. This is a bounded repository audit, not a claim that external accounts are uncompromised.

The material gaps were missing browser restrictions and an unprotected production branch. This change adds an enforced CSP, anti-framing headers, browser capability restrictions, isolated new tabs, an explicit publication manifest, URL validation and regression tests. It removes the obsolete uploader and blocks common local credential files from Git/deploy packaging.

The security branch is based on `cac969b`, preserving the AI CEO, active mission and controlled analytics additions. The analytics control endpoint is explicitly allowed in `connect-src`; external executable scripts remain blocked. No mission, token, identity or community policy is changed.

## GitHub controls verified

- Main requires PRs, up-to-date Vercel status bound to App ID 8329, and resolved review conversations. Administrators are covered; force pushes and branch deletion are blocked.
- No second reviewer is required because this repository currently has one maintainer.
- Existing secret scanning/push protection remain enabled; no open secret alerts were reported by GitHub at audit time.
- Dependency vulnerability alerts, automatic security update PRs, and private vulnerability reporting are enabled.
- Actions uses a read-only default token and cannot approve PRs. Workflows from all external contributors now need approval.

No additional GitHub OAuth scopes were requested. The Vercel build runs tests directly; a workflow with privileged tokens is unnecessary for this static site.

## Limits and follow-up

GitHub's non-provider secret patterns remained disabled after an API request; they are not represented as enabled. Account MFA, Vercel team membership/token inventory, Git Fork Protection, domain registrar protection and Vercel deployment-retention settings were not verified. The Vercel settings page required an interactive login, and the project connector did not expose these controls. Keep Vercel Git Fork Protection enabled and review untrusted PR code before authorizing any deployment; GitHub Actions approval is a separate control. The site benefits from platform HTTPS and DDoS protections, but a bandwidth bill, provider outage, account takeover or domain compromise is still possible. No blanket bot blocking or rate-limit rule was introduced without traffic evidence.

Keep provider tokens and deploy hooks out of the public repository. If one is ever exposed, revoke it first; rewriting Git history alone does not remove copies or authority. Ordinary deployment URLs do not need to be secret.
