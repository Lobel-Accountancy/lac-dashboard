#!/bin/bash
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
set -a; source /home/jlobel/lac_automation/.env; set +a
exec "$DIR/venv/bin/python" "$DIR/app.py"
