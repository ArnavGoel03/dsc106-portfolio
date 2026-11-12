#!/bin/bash
# Screenshot the prototype at 1920x1080 in several interaction states (needs a static server on :8766
# and chrome-headless-shell on :9333).
cd "$(dirname "$0")/.."
S="${SHOT_MJS:?set SHOT_MJS to the screenshot helper script}"
U=http://localhost:8767/index.html
node $S '{"url":"'$U'","width":1800,"scale":1,"out":"shots/proto_default.png","settle":2500}'
node $S '{"url":"'$U'","width":1800,"scale":1,"out":"shots/proto_night.png","settle":2500,"before":"(async()=>{await new Promise(r=>setTimeout(r,1200));document.querySelectorAll(\".jump\")[1].click();document.querySelectorAll(\".jump\")[2].click();await new Promise(r=>setTimeout(r,300));})()"}'
node $S '{"url":"'$U'","width":1800,"scale":1,"out":"shots/proto_year.png","settle":2500,"before":"(async()=>{await new Promise(r=>setTimeout(r,1200));document.querySelector(\"input[name=season][value=YEAR]\").click();document.querySelectorAll(\".jump\")[1].click();document.querySelectorAll(\".jump\")[2].click();await new Promise(r=>setTimeout(r,300));})()"}'
