import json
import os
import shutil
import sqlite3
import threading
import time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from flask import current_app

from admin_config import (
    BACKUP_ENABLED_KEY,
    BACKUP_INTERVAL_MINUTES_KEY,
    BACKUP_LAST_RUN_AT_KEY,
    BACKUP_TARGET_DIR_KEY,
    ensure_admin_settings_schema,
    get_admin_setting_bool,
    get_admin_setting_int,
    get_admin_setting_value,
    set_admin_setting_value,
)
from models.models import db


DEFAULT_BACKUP_INTERVAL_MINUTES = 60
MIN_BACKUP_INTERVAL_MINUTES = 5
MAX_BACKUP_INTERVAL_MINUTES = 24 * 60
BACKUP_THREAD_KEY = "WEIGHMAN_BACKUP_THREAD_STARTED"


def kolkata_now():
    return datetime.now(ZoneInfo("Asia/Kolkata"))


def detect_google_drive_backup_dir():
    candidates = []
    for env_key in ("GOOGLE_DRIVE", "GOOGLEDRIVE", "GDRIVE"):
        value = os.environ.get(env_key)
        if value:
            candidates.append(Path(value))

    user_profile = Path(os.environ.get("USERPROFILE") or Path.home())
    candidates.extend([
        user_profile / "Google Drive",
        user_profile / "My Drive",
        user_profile / "GoogleDrive",
        user_profile / "Drive",
        Path("G:/My Drive"),
        Path("G:/Google Drive"),
    ])

    for candidate in candidates:
        if candidate.exists() and candidate.is_dir():
            return str(candidate / "Weighman WMS Backups")
    return ""


def get_backup_settings():
    ensure_admin_settings_schema()
    return {
        "enabled": get_admin_setting_bool(BACKUP_ENABLED_KEY, False),
        "intervalMinutes": get_admin_setting_int(
            BACKUP_INTERVAL_MINUTES_KEY,
            DEFAULT_BACKUP_INTERVAL_MINUTES,
            MIN_BACKUP_INTERVAL_MINUTES,
            MAX_BACKUP_INTERVAL_MINUTES,
        ),
        "targetDir": get_admin_setting_value(BACKUP_TARGET_DIR_KEY, ""),
        "googleDriveDir": detect_google_drive_backup_dir(),
        "lastRunAt": get_admin_setting_value(BACKUP_LAST_RUN_AT_KEY, ""),
    }


def save_backup_settings(enabled, interval_minutes, target_dir):
    interval = max(
        MIN_BACKUP_INTERVAL_MINUTES,
        min(MAX_BACKUP_INTERVAL_MINUTES, int(interval_minutes or DEFAULT_BACKUP_INTERVAL_MINUTES)),
    )
    set_admin_setting_value(BACKUP_ENABLED_KEY, "true" if enabled else "false")
    set_admin_setting_value(BACKUP_INTERVAL_MINUTES_KEY, str(interval))
    set_admin_setting_value(BACKUP_TARGET_DIR_KEY, str(target_dir or "").strip())
    return get_backup_settings()


def backup_root_for_app(app):
    settings = get_backup_settings()
    configured_path = str(settings.get("targetDir") or "").strip()
    data_dir = Path(app.config["WEIGHMAN_DATA_DIR"]).resolve()
    root = Path(configured_path).expanduser().resolve() if configured_path else data_dir / "backups"
    root.mkdir(parents=True, exist_ok=True)
    return root


def database_path_for_app():
    database = db.engine.url.database
    if not database:
        raise RuntimeError("SQLite database path is not available")
    return Path(database).resolve()


def copy_sqlite_database(source_path, target_path):
    target_path.parent.mkdir(parents=True, exist_ok=True)
    source = sqlite3.connect(str(source_path))
    try:
        destination = sqlite3.connect(str(target_path))
        try:
            source.backup(destination)
        finally:
            destination.close()
    finally:
        source.close()


def copy_today_captures(app, target_dir, today):
    capture_root = Path(app.config["WEIGHMAN_CAPTURE_ROOT"]).resolve()
    source_dir = capture_root / today
    if not source_dir.exists():
        return 0

    target_capture_dir = target_dir / "weighment_captures" / today
    if target_capture_dir.exists():
        shutil.rmtree(target_capture_dir)
    shutil.copytree(source_dir, target_capture_dir)
    return sum(1 for path in target_capture_dir.rglob("*") if path.is_file())


def create_backup(reason="manual"):
    app = current_app._get_current_object()
    now = kolkata_now()
    today = now.strftime("%Y-%m-%d")
    backup_name = f"weighman_backup_{now.strftime('%Y%m%d_%H%M%S')}"
    target_dir = backup_root_for_app(app) / backup_name
    target_dir.mkdir(parents=True, exist_ok=False)

    source_db = database_path_for_app()
    target_db = target_dir / "weighbridge_main.db"
    copy_sqlite_database(source_db, target_db)
    image_count = copy_today_captures(app, target_dir, today)

    manifest = {
        "createdAt": now.isoformat(),
        "reason": reason,
        "database": "weighbridge_main.db",
        "captureFolder": f"weighment_captures/{today}",
        "currentDayImageCount": image_count,
    }
    (target_dir / "backup_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    set_admin_setting_value(BACKUP_LAST_RUN_AT_KEY, now.isoformat())

    return {
        "name": backup_name,
        "path": str(target_dir),
        "createdAt": manifest["createdAt"],
        "database": str(target_db),
        "imageCount": image_count,
        "captureFolder": manifest["captureFolder"],
    }


def list_backups(limit=12):
    app = current_app._get_current_object()
    root = backup_root_for_app(app)
    backups = []
    for path in root.glob("weighman_backup_*"):
        if not path.is_dir():
            continue
        manifest_path = path / "backup_manifest.json"
        manifest = {}
        if manifest_path.exists():
            try:
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                manifest = {}
        backups.append({
            "name": path.name,
            "path": str(path),
            "createdAt": manifest.get("createdAt", ""),
            "imageCount": manifest.get("currentDayImageCount", 0),
            "captureFolder": manifest.get("captureFolder", ""),
            "hasDatabase": (path / "weighbridge_main.db").exists(),
        })
    backups.sort(key=lambda item: item["name"], reverse=True)
    return backups[:limit]


def should_run_scheduled_backup(settings):
    last_run_at = str(settings.get("lastRunAt") or "").strip()
    if not last_run_at:
        return True
    try:
        last_run = datetime.fromisoformat(last_run_at)
    except ValueError:
        return True
    elapsed_seconds = (kolkata_now() - last_run).total_seconds()
    return elapsed_seconds >= int(settings["intervalMinutes"]) * 60


def backup_scheduler_loop(app):
    time.sleep(20)
    while True:
        try:
            with app.app_context():
                settings = get_backup_settings()
                if settings["enabled"] and should_run_scheduled_backup(settings):
                    create_backup(reason="scheduled")
        except Exception as error:
            app.logger.warning("Scheduled backup failed: %s", error)
        time.sleep(60)


def start_backup_scheduler(app):
    if app.config.get(BACKUP_THREAD_KEY):
        return
    app.config[BACKUP_THREAD_KEY] = True
    thread = threading.Thread(target=backup_scheduler_loop, args=(app,), daemon=True)
    thread.start()
