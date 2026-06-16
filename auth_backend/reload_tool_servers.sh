#!/bin/bash
# After lac-auth is ready, tell Open WebUI to reload its tool server connections.
# Runs as ExecStartPost in lac-auth.service.

OPEN_WEBUI="http://localhost:3001"

# Wait for the auth backend to be healthy (max 30s)
for i in $(seq 1 30); do
    if curl -sf http://localhost:5001/health > /dev/null 2>&1; then
        break
    fi
    sleep 1
done

# Wait for Open WebUI to be healthy (max 120s)
for i in $(seq 1 60); do
    if curl -sf "$OPEN_WEBUI/health" > /dev/null 2>&1; then
        break
    fi
    sleep 2
done

# Generate a short-lived admin token via the Open WebUI container
TOKEN=$(docker exec open-webui python3 -c "
import os, sys
sys.path.insert(0, '/app/backend')
os.chdir('/app/backend')
from open_webui.utils.auth import create_token
print(create_token(data={'id': 'ae934bae-4711-4aab-a828-9c0c8924a050'}))
" 2>/dev/null) || exit 0

[ -z "$TOKEN" ] && exit 0

# Trigger a tool server config save — calls set_tool_servers() internally
curl -sf -X POST "$OPEN_WEBUI/api/v1/configs/tool_servers" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "TOOL_SERVER_CONNECTIONS": [{
        "url": "https://auth.lobelaccountancy.com",
        "path": "/ai/openapi.json",
        "type": "openapi",
        "auth_type": "bearer",
        "key": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImFpLXNlcnZpY2VAbG9iZWxhY2NvdW50YW5jeS5jb20iLCJyb2xlIjoic2VydmljZSIsImV4cCI6MjA4MjY3MjAwMH0.BTDakF3wGkShQpMW3YD-kqdWyZTXbsOgHkeAkO5WKmE",
        "headers": null,
        "config": {"enable": true},
        "info": {"title": "LAC Tools", "version": "1.0.0", "id": "lac-tools"}
      }]
    }' > /dev/null 2>&1

echo "LAC tool servers reloaded in Open WebUI" >&2
