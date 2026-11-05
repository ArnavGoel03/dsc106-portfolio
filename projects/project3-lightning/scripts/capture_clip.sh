#!/bin/bash
# Screen capture of the prototype stepping through the 24 local solar hours as PNG frames,
# later stitched to a clip by build_video.py. Needs a static server on :8766 and chrome-headless-shell on :9333.
cd "$(dirname "$0")/.."
mkdir -p shots/clip && rm -f shots/clip/*.png
i=0
for h in $(seq 0 23); do
  f=$(printf "shots/clip/f%03d.png" $i)
  node ~/.claude/scripts/shot.mjs '{"url":"http://localhost:8766/index.html","width":1800,"scale":1,"out":"'$f'","settle":1200,"before":"(async()=>{await new Promise(r=>setTimeout(r,900));const y=document.querySelector(\"#hour\");y.value='$h';y.dispatchEvent(new Event(\"input\"));})()"}' >/dev/null 2>&1
  i=$((i+1))
done
ls shots/clip | wc -l
