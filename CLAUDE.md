## Approach
- Read existing files before writing. Don't re-read unless changed.
- Thorough in reasoning, concise in output.
- Skip files over 100KB unless required.
- No sycophantic openers or closing fluff.
- No emojis or em-dashes.
- Do not guess APIs, versions, flags, commit SHAs, or package names. Verify by reading code or docs before asserting.

<!-- BEGIN MANAGED VIBE CODING WORKFLOW -->
## Development workflow (managed)

1. Use **GSD** (`/gsd-help`) for non-trivial features, refactors, or multi-file work.
2. Use **Ponytail** and **Caveman** as already configured (do not disable).
3. Brevity rules must never cause skipping: requirements, tests, security checks, or rollback considerations.
4. Use **Context7** whenever current library/API documentation is needed.
5. Use **OpenSpace** skill discovery (`skill-discovery`) before complex or repeated work.
6. Use **Playwright MCP** after user-interface or browser-flow changes.
7. Run relevant unit, integration, type, and lint checks.
8. Run **Semgrep** before considering security-sensitive work complete.
9. Run **Gitleaks** before commits (a staged pre-commit hook is installed).
10. Ask **Codex** (`/codex:review`) for an independent read-only review after implementation and tests.
11. Use **adversarial Codex review** (`/codex:adversarial-review`) for authentication, payments, permissions, cryptography, database migrations, or destructive operations.
12. Use **GitHub MCP** for read-only issue, pull-request, and CI context by default (the registered endpoint is read-only).
13. Require explicit approval before GitHub MCP performs write actions (switch off the read-only endpoint only with consent).
14. Use **Repomix** only for deliberate cross-model handoff to ChatGPT or Gemini.
15. Never include secrets in Repomix output.
<!-- END MANAGED VIBE CODING WORKFLOW -->
