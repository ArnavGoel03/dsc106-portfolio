"""Assemble the checkpoint write-up as one PDF: the shared 92-day write-up, this version's changes, every EDA graph,
the prototype screenshots and the narration script, so a teammate can read everything in one file.
Output: ../pdf/<name>.pdf. Needs pandoc and chrome-headless-shell on :9333 (print_pdf.mjs)."""
import re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = ROOT.parent / "project3-lightning"            # the shared sections live in the 92-day write-up
NAME = sys.argv[1] if len(sys.argv) > 1 else "DSC106_P3_checkpoint_writeup"
OUT = ROOT / "pdf"; OUT.mkdir(exist_ok=True)

def md_images(folder, pattern, heading):
    files = sorted(folder.glob(pattern))
    if not files: return ""
    body = "\n\n".join(f"![{f.stem}]({f.resolve()})" for f in files)
    return f"\n\n## {heading}\n\n{body}\n"

own = (ROOT / "WRITEUP-DRAFT.md").read_text()
title = own.splitlines()[0].strip()
parts = []
narr = ROOT / "narration" / "NARRATION_split.md"
if narr.exists():  # the script first: it is what the presenters read from
    parts.append("# Narration script (2 minutes, Yash then Chau then Yash)\n\n" + narr.read_text().split("\n", 1)[1])
parts.append("\n\n# Write-up\n\n" + own.split("\n", 1)[1])
if BASE.exists() and BASE != ROOT:
    base = (BASE / "WRITEUP-DRAFT.md").read_text()
    parts.append("\n\n# Shared write-up (from the 92-day version)\n\n" + base.split("\n", 1)[1])
parts.append(md_images(ROOT / "eda", "g*.png", "Exploratory graphs"))
parts.append(md_images(ROOT / "shots", "proto_*.png", "Prototype screenshots"))
parts.append(md_images(ROOT / "cards", "card_*.png", "Video cards"))
md = "\n".join(parts)
md = re.sub(r"^- ", "* ", md, flags=re.M)
src = OUT / f"{NAME}.md"; src.write_text(md)
html = OUT / f"{NAME}.html"
css = OUT / "pdf.css"
css.write_text("""body{font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:11pt;line-height:1.4;color:#1d2733;max-width:none}
h1{font-size:20pt;margin-top:1.2em} h2{font-size:15pt;margin-top:1em;border-bottom:1px solid #ccc} h3{font-size:12pt}
img{max-width:100%;page-break-inside:avoid;display:block;margin:0.6em auto} ul{padding-left:1.2em} code{font-size:9.5pt}
@page{size:A4;margin:14mm} h1,h2{page-break-after:avoid}""")
subprocess.run(["pandoc", str(src), "-f", "markdown+lists_without_preceding_blankline", "-o", str(html), "--standalone", "--embed-resources", "--css", str(css), "--metadata", f"title={title}"], check=True)
pdf = OUT / f"{NAME}.pdf"
subprocess.run(["node", str(ROOT / "scripts" / "print_pdf.mjs"), str(html), str(pdf)], check=True)
html.unlink(); src.unlink(); css.unlink()
print(pdf)
