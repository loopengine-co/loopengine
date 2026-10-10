# Runtime image for a hosted LoopEngine workspace: one scaffolded project
# (from create-loopengine) mounted at /workspace, with its own
# node_modules, served as-is. Unlike the repo-root Dockerfile, nothing is
# baked in — agents, abilities and their code live on the mounted volume
# and change at runtime, so the server runs the project's TypeScript
# directly with tsx, the same way `npm run dev` does.
#
# Expected environment (set by the host, not baked in):
#   LOOPENGINE_TRUSTED_PROXY_SECRET  — only the host's router can call in
#   LOOPENGINE_EXIT_ON_CODE_CHANGE=1 — exit after an ability install so
#                                      the host restarts with the new code
#   LOOPENGINE_USAGE_LOG=stdout      — optional, per-call token usage
#   plus the workspace's own secrets (model API keys, ability env vars).
FROM node:22-slim

# git: `npm pack` (ability installs) accepts git+https specs.
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# No NODE_ENV=production: tsx is a devDependency of a scaffolded project,
# and the Admin UI's "Install dependencies" runs npm install in here —
# production mode would skip (or prune) it and break the next start.
ENV LOOPENGINE_EXIT_ON_CODE_CHANGE=1
WORKDIR /workspace
EXPOSE 8787

# Node itself as PID 1, with tsx loaded as a loader (not `npx tsx` or
# `npx loopengine serve`): the host's SIGTERM then reaches the server
# directly, so it drains in-flight turns (adapters/http.ts's shutdown())
# instead of being killed through a wrapper process — confirmed: under
# `npx tsx` the server never saw the signal.
CMD ["node", "--import", "tsx", "--env-file-if-exists=.env", "adapters/http.ts"]
