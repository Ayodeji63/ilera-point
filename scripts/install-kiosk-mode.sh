#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -eq 0 ]]; then
  echo "Run this installer as the Raspberry Pi desktop user, not with sudo." >&2
  exit 1
fi

kiosk_url="${KIOSK_URL:-https://ilera-point.vercel.app}"
start_delay="${KIOSK_START_DELAY:-5}"

if [[ ! "$kiosk_url" =~ ^https?://[^/]+ ]]; then
  echo "KIOSK_URL must be a complete http:// or https:// URL." >&2
  exit 1
fi

kiosk_origin="${BASH_REMATCH[0]}"
chromium_bin="$(command -v chromium || command -v chromium-browser || true)"

if [[ -z "$chromium_bin" ]]; then
  echo "Chromium was not found. Install it with: sudo apt install chromium" >&2
  exit 1
fi

profile_dir="$HOME/.config/ilerapoint-chromium"
launcher_dir="$HOME/.local/bin"
launcher_path="$launcher_dir/ilerapoint-kiosk"

install -d -m 755 "$profile_dir" "$launcher_dir"

{
  printf '%s\n' '#!/usr/bin/env bash'
  printf '%s\n' 'set -euo pipefail'
  printf 'chromium_bin=%q\n' "$chromium_bin"
  printf 'profile_dir=%q\n' "$profile_dir"
  printf 'kiosk_url=%q\n' "$kiosk_url"
  printf 'start_delay=%q\n' "$start_delay"
  printf '%s\n' 'common_flags=(' \
    '  "--user-data-dir=$profile_dir"' \
    '  --password-store=basic' \
    '  --no-first-run' \
    '  --disable-session-crashed-bubble' \
    '  --autoplay-policy=no-user-gesture-required' \
    ')'
  printf '%s\n' 'if [[ "${1:-}" == "--setup" ]]; then' \
    '  exec "$chromium_bin" "${common_flags[@]}" "$kiosk_url"' \
    'fi' \
    'sleep "$start_delay"' \
    'exec "$chromium_bin" "${common_flags[@]}" --kiosk "$kiosk_url"'
} >"$launcher_path"
chmod 755 "$launcher_path"

if [[ -r /etc/xdg/labwc/autostart ]]; then
  labwc_dir="$HOME/.config/labwc"
  labwc_autostart="$labwc_dir/autostart"
  install -d -m 755 "$labwc_dir"

  if [[ ! -e "$labwc_autostart" ]]; then
    cp /etc/xdg/labwc/autostart "$labwc_autostart"
  fi

  if ! grep -Fq '# IleraPoint kiosk' "$labwc_autostart"; then
    {
      printf '\n%s\n' '# IleraPoint kiosk'
      printf '%q &\n' "$launcher_path"
    } >>"$labwc_autostart"
  fi
  autostart_target="$labwc_autostart"
else
  xdg_autostart_dir="$HOME/.config/autostart"
  xdg_entry="$xdg_autostart_dir/ilerapoint-kiosk.desktop"
  install -d -m 755 "$xdg_autostart_dir"
  {
    printf '%s\n' \
      '[Desktop Entry]' \
      'Type=Application' \
      'Name=IleraPoint Kiosk' \
      "Exec=$launcher_path" \
      'Terminal=false' \
      'X-GNOME-Autostart-enabled=true'
  } >"$xdg_entry"
  chmod 644 "$xdg_entry"
  autostart_target="$xdg_entry"
fi

policy_dir="/etc/chromium/policies/managed"
policy_file="$policy_dir/ilerapoint.json"
sudo install -d -m 755 "$policy_dir"
printf '{\n  "LoopbackNetworkAllowedForUrls": ["%s"],\n  "LocalNetworkAccessAllowedForUrls": ["%s"]\n}\n' \
  "$kiosk_origin" "$kiosk_origin" | sudo tee "$policy_file" >/dev/null

if command -v raspi-config >/dev/null 2>&1; then
  sudo raspi-config nonint do_blanking 1 || \
    echo "Could not disable screen blanking automatically; disable it in raspi-config." >&2
fi

printf '\nIleraPoint kiosk mode is installed.\n'
printf 'Autostart: %s\n' "$autostart_target"
printf 'Chromium profile: %s\n\n' "$profile_dir"
printf 'Before rebooting, run this once and allow microphone, camera, and Local Network Access:\n'
printf '  %q --setup\n\n' "$launcher_path"
printf 'Then enable Desktop Autologin in raspi-config and reboot:\n'
printf '  sudo raspi-config\n'
printf '  sudo reboot\n\n'
printf 'Do not run pnpm dev on the Pi; the systemd sensor services already own port 8787.\n'
