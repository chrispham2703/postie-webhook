#!/usr/bin/env bash
# Blocks any bash command that would read or print secrets.
payload=$(cat)
command=$(jq -r '.tool_input.command // empty' <<<"$payload")
if grep -qE '(\.env|PRIVATE KEY|HMAC_SECRET|AWS_SECRET|DATABASE_URL)' <<<"$command"; then
  echo "Blocked: command touches secrets. Do it yourself." >&2
  exit 2
fi
exit 0
