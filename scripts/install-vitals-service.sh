#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
service_user="${SUDO_USER:-$(id -un)}"
service_template="$project_root/deploy/ilerapoint-vitals.service"
service_target="/etc/systemd/system/ilerapoint-vitals.service"
api_template="$project_root/deploy/ilerapoint-local-api.service"
api_target="/etc/systemd/system/ilerapoint-local-api.service"
kiosk_origin="${KIOSK_ORIGIN:-https://ilera-point.vercel.app}"
node_bin="$(command -v node || true)"

if [[ -z "$node_bin" ]]; then
  echo "Node.js is required. Install Node.js 20 or newer, then run this installer again." >&2
  exit 1
fi

sudo usermod -aG i2c "$service_user"
python3 -m venv "$project_root/.venv"
"$project_root/.venv/bin/pip" install -r "$project_root/vitals_bridge/requirements.txt"
npm --prefix "$project_root" install --omit=dev
sed -e "s|__ILERA_USER__|$service_user|g" -e "s|__ILERA_ROOT__|$project_root|g" "$service_template" | sudo tee "$service_target" >/dev/null
sed -e "s|__ILERA_USER__|$service_user|g" \
  -e "s|__ILERA_ROOT__|$project_root|g" \
  -e "s|__NODE_BIN__|$node_bin|g" \
  -e "s|__KIOSK_ORIGIN__|$kiosk_origin|g" \
  "$api_template" | sudo tee "$api_target" >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now ilerapoint-vitals.service ilerapoint-local-api.service
sudo systemctl status --no-pager ilerapoint-vitals.service
sudo systemctl status --no-pager ilerapoint-local-api.service
