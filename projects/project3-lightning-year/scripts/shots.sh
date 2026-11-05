#!/bin/bash
# Screenshot the prototype at 1920x1080 in several interaction states (needs a static server on :8766
# and chrome-headless-shell on :9333, see ~/.claude/scripts/shot.mjs).
cd "$(dirname "$0")/.."
S=~/.claude/scripts/shot.mjs
U=http://localhost:8766/index.html
node $S '{"url":"'$U'","width":1800,"scale":1,"out":"shots/proto_default.png","settle":2500}'
node $S '{"url":"'$U'","width":1800,"scale":1,"out":"shots/proto_night.png","settle":2500,"before":"(async()=>{await new Promise(r=>setTimeout(r,1200));document.querySelectorAll(\".jump\")[1].click();document.querySelectorAll(\".jump\")[2].click();await new Promise(r=>setTimeout(r,300));})()"}'
node $S '{"url":"'$U'","width":1800,"scale":1,"out":"shots/proto_utc.png","settle":2500,"before":"(async()=>{await new Promise(r=>setTimeout(r,1200));document.querySelector(\"input[name=clock][value=utc]\").click();await new Promise(r=>setTimeout(r,300));})()"}'
