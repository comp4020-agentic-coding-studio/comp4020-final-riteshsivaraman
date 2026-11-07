#!/bin/sh
# Renders each screen at 237 x 512 (graphics-brief caps textures at 512 px) for each camera cut-out, using the installed Chrome.
# Output: ios-pilot/out/<screen>-<cutout>.png. No new dependency.
cd "$(dirname "$0")" || exit 1
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
mkdir -p out
for screen in lock home; do
  for cut in island notch punch; do
    "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=0.6066 \
      --window-size=390,844 --virtual-time-budget=1000 \
      --screenshot="$PWD/out/$screen-$cut.png" "file://$PWD/$screen.html?cutout=$cut" >/dev/null 2>&1
  done
done
ls out
