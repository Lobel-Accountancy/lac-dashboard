#!/bin/bash
# Weekly KPI digest runner — invoked by cron Monday 7:00 AM
set -e
LOG=/home/jlobel/lac_automation/phase5/digest.log

echo "=== $(date) ===" >> "$LOG"

# Use the Flask backend's venv (already has all dependencies)
VENV=/home/jlobel/lac_automation/phase5/auth_backend/venv

set -a
source /home/jlobel/lac_automation/.env
set +a

"$VENV/bin/python" /home/jlobel/lac_automation/phase5/weekly_kpi_digest.py 2>&1 | tee -a "$LOG"
