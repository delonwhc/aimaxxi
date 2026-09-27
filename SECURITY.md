# Security

Report vulnerabilities privately using [GitHub's vulnerability reporting form](https://github.com/geoffreywoo/aimaxxi/security/advisories/new). Do not put credentials, exploit details, or personal information in public contribution issues.

## Public source and deployment access

This is intentionally a public, static website. Visitors can read its source, download assets, and propose changes. A public GitHub repository, Vercel deployment URL, API endpoint, or project/team identifier does not grant permission to modify production. The Vercel API requires an authorized credential; Git deployments require permission to update the linked repository.

Treat API tokens, private keys, and Vercel **Deploy Hook** URLs as secrets. A deploy hook is different from a preview URL: possession of a hook can trigger a deployment. Temporary `_vercel_share` links grant viewing access to a protected preview, not upload privileges; avoid committing them too. If a real credential is exposed, revoke it at the provider first. Removing a file or making the repository private does not invalidate a leaked credential or its copies.

The obsolete manual production upload script has been removed. The site does not need a Vercel token, wallet secret, database password, or server environment variable to build or run.

## Browser and build boundaries

- CSP permits scripts, styles, fonts and images from this site. Inline scripts, JavaScript event attributes, evaluation, embedded objects, framing, HTML form submissions, and document base changes are blocked. Image data URLs are allowed for community artwork compatibility.
- Network connections are limited to the same origin and the existing `www.clawfable.com/api/public/antihunter/analytics-control` endpoint. Its response is data only; scripts cannot load from that host. Existing measurement remains governed by its expiring control.
- Camera, microphone, location, payments, USB and clipboard reading are disabled. Clipboard writing is limited to this origin, preserving the mint-copy button.
- Every new-tab link uses `noopener noreferrer`. HTTPS/HSTS and MIME-sniffing protection remain enabled.
- `scripts/public-assets.json` is the explicit publication list. Review additions to it carefully. Raw artwork source, planning, credentials and unlisted files are not copied to `dist/`; asset symlinks and path traversal are rejected.
- Vercel runs the build and all tests before publishing. There are no npm runtime dependencies, backend routes, uploads, wallet connections, or automatic issue/post submissions in this site.

The mission page renders reviewed repository data, not incoming GitHub submissions. Submitted work must be reviewed before it enters the site; URL validation and HTML escaping are not substitutes for reviewing destination content and creator permission.

## Repository and account controls

The repository's `main` branch requires an up-to-date PR and a successful status from the Vercel GitHub App. The rule includes administrators, prohibits force pushes and branch deletion, and requires review conversations to be resolved. The sole maintainer can merge a passing PR without a second approver; add required independent review if the maintainer team grows.

GitHub secret scanning and push protection are enabled. Dependabot alerts/security updates and private vulnerability reporting are enabled. GitHub Actions has read-only default token permissions and requires approval for workflows from all external contributors. These settings live in GitHub, not this file, and should be checked periodically by the operator.

Repository rules and CSP reduce risk; they do not protect against every account compromise or a malicious change deliberately approved by an authorized maintainer. Secure GitHub, Vercel and the domain registrar with passkeys or strong two-factor authentication, review account sessions and installed integrations, and keep recovery codes offline. Account MFA and registrar access are not verified by repository tests.

## Release and recovery

Use a feature branch and PR. Inspect the Vercel preview and test results, then merge through GitHub. Keep deployment credentials out of pull-request code and avoid workflows that execute untrusted PR code with privileged tokens. Do not relax the browser policy just to enable an injected preview toolbar.

Before release, record the previous production deployment. After release, check the custom domain, response headers, both pages, token destinations and the complete kit. If a release fails, restore the previous deployment through Vercel and fix the source through another PR. Do not delete the rollback deployment during recovery.
