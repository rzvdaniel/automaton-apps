#!/usr/bin/env python3
"""Build an app into dist/ the way its manifest says, then start it from dist/ and wait for its health route.

Usage: smoke_build.py [NAME=value ...] <app-folder> [<app-folder> ...]

NAME=value arguments set environment variables for the started app (a setting it refuses to start without).

A file the app reads at start but the build does not copy into dist/ passes the app's own tests (they run from the
source folder) and fails only on deploy; this catches it in CI. The app is built in a temporary copy and started with
`AUTOMATON_PORT` set to a free port and a throwaway data folder. Only apps whose runtime is a plain command in dist/
and whose build needs no Docker are checked; others are skipped with a note.
"""
import json, os, shutil, socket, subprocess, sys, tempfile, time, urllib.error, urllib.request
from pathlib import Path

root = Path(__file__).resolve().parent.parent
START_SECONDS = 20


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def command_line(command):
    return [command["executable"], *command.get("arguments", [])], command.get("workingDirectory", ".")


def smoke(folder, extra_env=None):
    manifest = json.loads((root / folder / "automaton.json").read_text())["application"]
    build, runtime, health = manifest.get("build"), manifest.get("runtime"), manifest.get("health") or {}
    if not build or not runtime or "command" not in build or "command" not in runtime:
        return None, "no build and runtime command"
    if build.get("outputDirectory") != "dist" or runtime["command"].get("workingDirectory") != "dist" \
            or runtime["command"]["executable"] != "python":
        return None, "does not run a Python app from dist/"
    path = health.get("path", "/")
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp) / "app"
        (Path(tmp) / "bin").mkdir()
        (Path(tmp) / "bin" / "python").symlink_to(sys.executable)  # the manifests say `python`; some machines only have python3
        pip = Path(tmp) / "bin" / "pip"
        pip.write_text(f'#!/bin/sh\nexec "{sys.executable}" -m pip "$@"\n')
        pip.chmod(0o755)
        path_env = f"{Path(tmp) / 'bin'}{os.pathsep}{os.environ['PATH']}"
        shutil.copytree(root / folder, work, ignore=shutil.ignore_patterns(".automaton", "node_modules", "__pycache__", "dist", "data"))
        argv, cwd = command_line(build["command"])
        built = subprocess.run(argv, cwd=work / cwd, env={**os.environ, "PATH": path_env}, capture_output=True, text=True, timeout=build.get("timeoutSeconds", 600))
        if built.returncode != 0:
            return False, f"build failed ({built.returncode}):\n{built.stdout[-2000:]}{built.stderr[-2000:]}"
        argv, cwd = command_line(runtime["command"])
        port = free_port()
        env = {**os.environ, "PATH": path_env, **(extra_env or {}), "AUTOMATON_PORT": str(port), "AUTOMATON_APP_DATA_DIR": str(Path(tmp) / "data")}
        log = open(Path(tmp) / "app.log", "w+")  # a file, so a chatty app never blocks on a full pipe
        proc = subprocess.Popen(argv, cwd=work / cwd, env=env, stdout=log, stderr=subprocess.STDOUT, text=True)
        url = f"http://127.0.0.1:{port}{path}"
        deadline = time.time() + START_SECONDS
        try:
            while time.time() < deadline:
                if proc.poll() is not None:
                    return False, f"exited with {proc.returncode} before answering {path}:\n{(log.seek(0), log.read()[-3000:])[1]}"
                try:
                    with urllib.request.urlopen(url, timeout=2) as r:
                        return True, f"answered {r.status} on {path}"
                except urllib.error.HTTPError as e:
                    if e.code < 500:  # it is up; a login wall is not a missing file
                        return True, f"answered {e.code} on {path}"
                except OSError:
                    pass
                time.sleep(0.3)
            return False, f"did not answer {url} within {START_SECONDS}s"
        finally:
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(5)
                except subprocess.TimeoutExpired:
                    proc.kill()


def main(args):
    extra = dict(a.split("=", 1) for a in args if "=" in a and "/" not in a.split("=", 1)[0])
    folders = [a for a in args if a not in [f"{k}={v}" for k, v in extra.items()]]
    failed = False
    for folder in folders:
        ok, note = smoke(folder, extra)
        print(f"{'skip' if ok is None else 'ok  ' if ok else 'FAIL'} {folder}: {note}")
        failed |= ok is False
    return 1 if failed else 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    sys.exit(main(sys.argv[1:]))
