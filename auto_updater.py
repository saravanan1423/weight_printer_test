import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

from app_version import APP_VERSION


UPDATE_TIMEOUT_SECONDS = 30
UPDATE_STATUS_LOCK = threading.Lock()
UPDATE_STATUS = {
    "running": False,
    "percent": 0,
    "stage": "idle",
    "message": "No update running.",
    "error": "",
}


def app_dir():
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def data_dir():
    return Path(os.environ.get("WEIGHMAN_DATA_DIR") or app_dir()).resolve()


def runtime_update_dir():
    return Path(tempfile.gettempdir()).resolve() / "WeighmanWMS" / "update"


def set_update_status(**values):
    with UPDATE_STATUS_LOCK:
        UPDATE_STATUS.update(values)
        return dict(UPDATE_STATUS)


def get_update_status():
    with UPDATE_STATUS_LOCK:
        return dict(UPDATE_STATUS)


def reset_update_status():
    return set_update_status(
        running=False,
        percent=0,
        stage="idle",
        message="No update running.",
        error="",
    )


def parse_version(value):
    parts = []
    for chunk in str(value or "0").replace("-", ".").split("."):
        number = "".join(char for char in chunk if char.isdigit())
        parts.append(int(number or 0))
    return tuple(parts or [0])


def is_newer_version(remote_version, current_version=APP_VERSION):
    remote_parts = parse_version(remote_version)
    current_parts = parse_version(current_version)
    max_length = max(len(remote_parts), len(current_parts))
    remote_parts += (0,) * (max_length - len(remote_parts))
    current_parts += (0,) * (max_length - len(current_parts))
    return remote_parts > current_parts


def fetch_json(url):
    request = urllib.request.Request(url, headers={"User-Agent": f"Weighman-WMS/{APP_VERSION}"})
    with urllib.request.urlopen(request, timeout=UPDATE_TIMEOUT_SECONDS) as response:
        return json.loads(response.read().decode("utf-8"))


def check_for_update(manifest_url):
    manifest_url = str(manifest_url or "").strip()
    if not manifest_url:
        return {
            "configured": False,
            "currentVersion": APP_VERSION,
            "updateAvailable": False,
            "message": "Update manifest URL is not configured.",
        }

    try:
        manifest = fetch_json(manifest_url)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
        return {
            "configured": True,
            "currentVersion": APP_VERSION,
            "updateAvailable": False,
            "message": f"Unable to check for updates: {exc}",
        }

    remote_version = str(manifest.get("version") or "").strip()
    download_url = str(manifest.get("downloadUrl") or manifest.get("download_url") or "").strip()
    update_available = bool(remote_version and download_url and is_newer_version(remote_version))

    return {
        "configured": True,
        "currentVersion": APP_VERSION,
        "latestVersion": remote_version or APP_VERSION,
        "downloadUrl": download_url,
        "sha256": str(manifest.get("sha256") or "").strip(),
        "notes": str(manifest.get("notes") or "").strip(),
        "updateAvailable": update_available,
        "message": "Update available." if update_available else "Already up to date.",
        "manifest": manifest,
    }


def download_file(url, destination, progress_callback=None):
    request = urllib.request.Request(url, headers={"User-Agent": f"Weighman-WMS/{APP_VERSION}"})
    with urllib.request.urlopen(request, timeout=UPDATE_TIMEOUT_SECONDS) as response:
        total_size = int(response.headers.get("Content-Length") or 0)
        downloaded_size = 0
        with destination.open("wb") as file_handle:
            while True:
                chunk = response.read(1024 * 256)
                if not chunk:
                    break
                file_handle.write(chunk)
                downloaded_size += len(chunk)
                if progress_callback and total_size:
                    progress_callback(downloaded_size, total_size)


def file_sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as file_handle:
        for block in iter(lambda: file_handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def update_root(extract_dir):
    entries = [entry for entry in Path(extract_dir).iterdir() if entry.name not in {"__MACOSX"}]
    if len(entries) == 1 and entries[0].is_dir():
        return entries[0]
    return Path(extract_dir)


def find_update_payload_root(extract_dir):
    extract_path = Path(extract_dir)
    current_exe_name = Path(sys.executable).name if getattr(sys, "frozen", False) else "desktop.exe"
    exe_matches = [
        path
        for path in extract_path.rglob("*.exe")
        if path.name.lower() == current_exe_name.lower()
    ]
    if exe_matches:
        return exe_matches[0].parent
    return update_root(extract_path)


def stage_update(update_info, progress_callback=None):
    download_url = update_info.get("downloadUrl")
    latest_version = update_info.get("latestVersion") or "latest"
    if not download_url:
        raise ValueError("Update download URL is missing.")

    updates_dir = runtime_update_dir()
    if updates_dir.exists():
        shutil.rmtree(updates_dir)
    updates_dir.mkdir(parents=True, exist_ok=True)
    zip_path = updates_dir / f"weighman-update-{latest_version}.zip"
    extract_dir = updates_dir / f"weighman-update-{latest_version}"

    if extract_dir.exists():
        shutil.rmtree(extract_dir)
    extract_dir.mkdir(parents=True, exist_ok=True)

    if progress_callback:
        progress_callback("download_start", None)
    download_file(download_url, zip_path, progress_callback)

    expected_sha = str(update_info.get("sha256") or "").strip().lower()
    if expected_sha:
        if progress_callback:
            progress_callback("verify", None)
        actual_sha = file_sha256(zip_path)
        if actual_sha.lower() != expected_sha:
            raise ValueError("Downloaded update checksum does not match.")

    if progress_callback:
        progress_callback("extract", None)
    with zipfile.ZipFile(zip_path, "r") as archive:
        archive.extractall(extract_dir)

    return find_update_payload_root(extract_dir)


def write_windows_update_script(staged_dir):
    current_exe = Path(sys.executable).resolve()
    target_dir = current_exe.parent
    script_path = runtime_update_dir() / "apply_update.bat"
    backup_exe = script_path.parent / f"{current_exe.name}.bak"
    staged_exe = Path(staged_dir) / current_exe.name
    log_path = script_path.parent / "update.log"
    script_path.parent.mkdir(parents=True, exist_ok=True)

    if not staged_exe.exists():
        payload_exe = next(
            (
                path
                for path in Path(staged_dir).rglob("*.exe")
                if path.name.lower() not in {"apply_update.exe"}
            ),
            None,
        )
        if payload_exe is not None:
            staged_exe.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(payload_exe, staged_exe)

    script_path.write_text(
        "\n".join(
            [
                "@echo off",
                "setlocal",
                f'echo Applying update from "{staged_dir}" to "{target_dir}" > "{log_path}"',
                "timeout /t 2 /nobreak > nul",
                f'taskkill /pid {os.getpid()} /f > nul 2> nul',
                f'taskkill /im "{current_exe.name}" /f > nul 2> nul',
                "timeout /t 2 /nobreak > nul",
                f'if not exist "{staged_exe}" (echo New exe not found: "{staged_exe}" >> "{log_path}" & exit /b 1)',
                f'copy /Y "{current_exe}" "{backup_exe}" >> "{log_path}" 2>&1',
                f'copy /Y "{staged_exe}" "{current_exe}" >> "{log_path}" 2>&1',
                f'robocopy "{staged_dir}" "{target_dir}" /E /IS /IT /XF "{current_exe.name}" /R:5 /W:1 >> "{log_path}" 2>&1',
                "set RC=%ERRORLEVEL%",
                'if %RC% GEQ 8 (echo Robocopy failed with code %RC% >> "{0}" & copy /Y "{1}" "{2}" >> "{0}" 2>&1 & start "" "{2}" & exit /b %RC%)'.format(log_path, backup_exe, current_exe),
                f'if not exist "{current_exe}" (echo Updated exe missing, restoring backup >> "{log_path}" & copy /Y "{backup_exe}" "{current_exe}" >> "{log_path}" 2>&1)',
                f'start "" "{current_exe}"',
                "endlocal",
            ]
        ),
        encoding="utf-8",
    )
    return script_path


def apply_update_and_restart(update_info, progress_callback=None):
    if not getattr(sys, "frozen", False):
        raise RuntimeError("Auto update apply is available only in the packaged .exe.")

    staged_dir = stage_update(update_info, progress_callback)
    if progress_callback:
        progress_callback("restart", None)
    script_path = write_windows_update_script(staged_dir)
    subprocess.Popen(
        ["cmd.exe", "/c", str(script_path)],
        cwd=str(runtime_update_dir()),
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )

    def exit_soon():
        time.sleep(0.8)
        os._exit(0)

    threading.Thread(target=exit_soon, daemon=True).start()


def update_progress_callback(done, total):
    if done == "download_start":
        set_update_status(running=True, percent=1, stage="download", message="Downloading update 1%")
        return
    if done == "verify":
        set_update_status(running=True, percent=85, stage="verify", message="Verifying update 85%")
        return
    if done == "extract":
        set_update_status(running=True, percent=92, stage="extract", message="Extracting update 92%")
        return
    if done == "restart":
        set_update_status(running=True, percent=100, stage="restart", message="Update downloaded 100%. Restarting now...")
        return
    if total:
        download_percent = max(1, min(84, int((int(done) / int(total)) * 84)))
        set_update_status(
            running=True,
            percent=download_percent,
            stage="download",
            message=f"Downloading update {download_percent}%",
        )


def begin_update_and_restart(update_info):
    if get_update_status().get("running"):
        return get_update_status()

    set_update_status(
        running=True,
        percent=0,
        stage="starting",
        message="Starting update 0%",
        error="",
    )

    def worker():
        try:
            apply_update_and_restart(update_info, update_progress_callback)
        except Exception as exc:
            set_update_status(
                running=False,
                percent=0,
                stage="error",
                message=str(exc),
                error=str(exc),
            )

    threading.Thread(target=worker, daemon=True).start()
    return get_update_status()
