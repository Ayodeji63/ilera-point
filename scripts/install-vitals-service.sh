#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
service_user="${SUDO_USER:-$(id -un)}"
service_template="$project_root/deploy/ilerapoint-vitals.service"
service_target="/etc/systemd/system/ilerapoint-vitals.service"

sudo usermod -aG i2c "$service_user"
python3 -m venv "$project_root/.venv"
"$project_root/.venv/bin/pip" install -r "$project_root/vitals_bridge/requirements.txt"
sed -e "s|__ILERA_USER__|$service_user|g" -e "s|__ILERA_ROOT__|$project_root|g" "$service_template" | sudo tee "$service_target" >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now ilerapoint-vitals.service
sudo systemctl status --no-pager ilerapoint-vitals.service
