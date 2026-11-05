"""Build the checkpoint mp4 from narration/timing.json (stdlib + ffmpeg only).
No audio arguments: silent draft (with an empty audio track as the slot).
With audio files (m4a/mp3/wav, in order): mux the real recording, re-time every slide to the recording's
length, and speed the audio up slightly if it runs past the 2:00 limit. Never generates a voice."""
import json, shutil, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LIMIT = 120.0          # Gradescope checkpoint limit, seconds
TARGET_MAX = 119.0     # stay a hair under the limit
MAX_TEMPO = 1.15       # faster than this sounds rushed: ask for a re-record instead
TAIL = 0.6             # seconds of picture after the last word
W, H, FPS = 1920, 1080, 30
CLIP_FPS = 4   # 24 hourly frames at 4 fps = 6 s loop


def run(*a):
    r = subprocess.run([str(x) for x in a], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    if r.returncode:
        sys.exit(f"ffmpeg failed:\n{r.stderr[-1500:]}")


def dur(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         check=True, capture_output=True, text=True).stdout
    return float(out.strip())


def make_clip():
    frames = sorted((ROOT / "shots" / "clip").glob("f*.png"))
    if not frames:
        sys.exit("no frames in shots/clip, run scripts/capture_clip.sh first")
    out = ROOT / "shots" / "clip.mp4"
    run("ffmpeg", "-y", "-framerate", CLIP_FPS, "-i", ROOT / "shots/clip/f%03d.png", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", 16, out)
    return out


def main():
    audio = [Path(a).resolve() for a in sys.argv[1:]]
    if audio:  # final build: never ship the placeholder team name or a card built for another name
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from check_team import check
        if problems := check():
            sys.exit("FINAL BUILD BLOCKED:\n  " + "\n  ".join(problems))
    for a in audio:
        if not a.exists():
            sys.exit(f"missing audio file: {a}")
    timing = json.loads((ROOT / "narration/timing.json").read_text())
    T = timing["total"]
    tempo, L = 1.0, T
    per_seg = None
    if audio:
        with tempfile.TemporaryDirectory() as td:
            lst = Path(td) / "a.txt"
            lst.write_text("".join("file '" + str(a).replace("'", "'\\''") + "'\n" for a in audio))
            joined = Path(td) / "joined.wav"
            run("ffmpeg", "-y", "-f", "concat", "-safe", 0, "-i", lst, "-ar", 48000, "-ac", 2, joined)
            D = dur(joined)
        if D + TAIL > TARGET_MAX:
            tempo = (D + TAIL) / TARGET_MAX
            if tempo > MAX_TEMPO:
                sys.exit(f"recording is {D:.1f}s, needs {tempo:.2f}x speed-up to fit 2:00. Trim it to about {TARGET_MAX * MAX_TEMPO - TAIL:.0f}s or less and re-record.")
        L = min(D / tempo + TAIL, TARGET_MAX)
        if len(audio) == len(timing["segments"]):  # one clip per script segment: time each slide to its own clip
            per_seg = [dur(a) / tempo for a in audio]
            per_seg[-1] += TAIL
        print(f"recording {D:.1f}s, tempo {tempo:.2f}x, video {L:.1f}s")
    f = L / T
    clip = None
    work = Path(tempfile.mkdtemp(prefix="p3video_"))
    parts = []
    for si, seg in enumerate(timing["segments"]):
        if per_seg:
            seg = {**seg, "dur": per_seg[si] / f}
        for v in seg["visual"]:
            path, share = (v if isinstance(v, list) else [v, 1.0])
            d = seg["dur"] * share * f
            src = ROOT / path
            if path.endswith("clip.mp4"):
                src = clip = make_clip()
                vf = f"setpts=PTS*{d / dur(src):.5f},scale={W}:{H},fps={FPS},format=yuv420p"
                inp = ["-i", src]
            else:
                vf = f"scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:white,fps={FPS},format=yuv420p"
                inp = ["-loop", 1, "-framerate", FPS, "-i", src]
            out = work / f"{len(parts):02d}.mp4"
            run("ffmpeg", "-y", *inp, "-vf", vf, "-t", f"{d:.3f}", "-c:v", "libx264", "-preset", "veryfast", "-crf", 18, "-an", out)
            parts.append(out)
    lst = work / "v.txt"
    lst.write_text("".join(f"file '{p}'\n" for p in parts))
    name = "DSC106_P3_checkpoint.mp4" if audio else "DSC106_P3_checkpoint_SILENT_DRAFT.mp4"
    out = ROOT / "video" / name
    out.parent.mkdir(exist_ok=True)
    cmd = ["ffmpeg", "-y", "-f", "concat", "-safe", 0, "-i", lst]
    if audio:
        for a in audio:
            cmd += ["-i", a]
        n = len(audio)
        ins = "".join(f"[{i + 1}:a]" for i in range(n))
        chain = f"{ins}concat=n={n}:v=0:a=1[c];[c]" + (f"atempo={tempo:.4f}," if tempo > 1 else "") + f"loudnorm=I=-16:TP=-1.5,apad=whole_dur={L:.3f}[a]"
        cmd += ["-filter_complex", chain, "-map", "0:v", "-map", "[a]"]
    else:
        cmd += ["-f", "lavfi", "-i", f"anullsrc=r=48000:cl=stereo", "-map", "0:v", "-map", "1:a", "-af", "volume=0"]
    cmd += ["-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-t", f"{L:.3f}", "-movflags", "+faststart", out]
    run(*cmd)
    final = dur(out)
    shutil.rmtree(work, ignore_errors=True)
    print(f"wrote {out} ({final:.1f}s)")
    if final > LIMIT:
        sys.exit(f"ERROR: {final:.1f}s is over the {LIMIT:.0f}s limit")


main()
