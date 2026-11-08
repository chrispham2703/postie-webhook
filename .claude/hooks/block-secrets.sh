#!/usr/bin/env bash
# Blocks any bash command that would read or print secrets.
payload=$(cat)
command=$(jq -r '.tool_input.command // empty' <<<"$payload")
if grep -qE '(\.en|PRIVATE KEY|SECRET|_KEY|PASSWORD|DATABASE_URL|RABBITMQ_URL|printenv|\benv\b)' <<<"$command"; then
  echo "Blocked: command touches secrets. Do it yourself." >&2
  exit 2
fi
exit 0
