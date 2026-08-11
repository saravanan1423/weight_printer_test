from flask import jsonify, render_template, request

from . import settings_bp
from backup_manager import create_backup, get_backup_settings, list_backups, save_backup_settings


@settings_bp.route("/backup")
def backup():
    return render_template("backup_settings.html")


@settings_bp.route("/api/backup", methods=["GET"])
def backup_details():
    return jsonify({
        "settings": get_backup_settings(),
        "backups": list_backups(),
    })


@settings_bp.route("/api/backup", methods=["POST"])
def backup_save():
    payload = request.get_json(silent=True) or {}
    try:
        settings = save_backup_settings(
            bool(payload.get("enabled")),
            payload.get("intervalMinutes"),
            payload.get("targetDir"),
        )
    except (TypeError, ValueError):
        return jsonify({"message": "Enter a valid backup interval"}), 400
    except OSError as error:
        return jsonify({"message": f"Unable to use backup folder: {error}"}), 400

    return jsonify({
        "message": "Backup settings saved",
        "settings": settings,
        "backups": list_backups(),
    })


@settings_bp.route("/api/backup/run", methods=["POST"])
def backup_run():
    try:
        backup = create_backup(reason="manual")
    except OSError as error:
        return jsonify({"message": f"Backup failed: {error}"}), 500
    except RuntimeError as error:
        return jsonify({"message": str(error)}), 500

    return jsonify({
        "message": "Backup completed",
        "backup": backup,
        "settings": get_backup_settings(),
        "backups": list_backups(),
    })
