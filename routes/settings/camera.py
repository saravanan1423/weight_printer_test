import time
import site
import sys
import socket
from urllib.parse import quote

from flask import Response, jsonify, render_template, request
from sqlalchemy import inspect, text
from sqlalchemy.exc import SQLAlchemyError

from models.models import Camera_error_log, Camera_settings, db
from . import settings_bp

try:
    import cv2
except ImportError:  # pragma: no cover
    user_site_packages = site.getusersitepackages()
    if user_site_packages not in sys.path:
        sys.path.append(user_site_packages)
    try:
        import cv2
    except ImportError:
        cv2 = None


CAMERA_TABLE = "camera_settings"
CAMERA_LOG_TABLE = "camera_error_log"
MAX_CAMERAS = 4
DEFAULT_CAMERA_PORT = 554
DEFAULT_STREAM_PATH = "Streaming/Channels/101"
CAMERA_SUCCESS_LOG = "Camera connected"
INFO_LOG_PREFIXES = (
    CAMERA_SUCCESS_LOG,
    "Camera settings saved",
    "Camera settings deleted",
    "Camera preview closed",
)


@settings_bp.route("/camera")
def camera():
    ensure_camera_schema()
    return render_template("camera_settings.html")


def ensure_camera_schema():
    inspector = inspect(db.engine)
    table_names = set(inspector.get_table_names())

    if CAMERA_TABLE not in table_names:
        Camera_settings.__table__.create(db.engine)
    else:
        columns = {column["name"] for column in inspector.get_columns(CAMERA_TABLE)}
        if "port" not in columns:
            db.session.execute(
                text(
                    f"ALTER TABLE {CAMERA_TABLE} "
                    f"ADD COLUMN port INTEGER NOT NULL DEFAULT {DEFAULT_CAMERA_PORT}"
                )
            )
        if "stream_path" not in columns:
            db.session.execute(
                text(
                    f"ALTER TABLE {CAMERA_TABLE} "
                    f"ADD COLUMN stream_path VARCHAR(255) NOT NULL DEFAULT '{DEFAULT_STREAM_PATH}'"
                )
            )
        if "is_connected" not in columns:
            db.session.execute(
                text(
                    f"ALTER TABLE {CAMERA_TABLE} "
                    "ADD COLUMN is_connected BOOLEAN NOT NULL DEFAULT 0"
                )
            )
        db.session.commit()

    inspector = inspect(db.engine)
    table_names = set(inspector.get_table_names())
    if CAMERA_LOG_TABLE not in table_names:
        Camera_error_log.__table__.create(db.engine)


def normalize_log_message(message):
    return " ".join(str(message or "").split()).strip()


def is_error_message(message):
    normalized = normalize_log_message(message)
    normalized_lower = normalized.lower()
    return bool(normalized) and any(
        term in normalized_lower
        for term in ("error", "failed", "timeout", "unreachable", "not available")
    )


def add_camera_log(message, *, dedupe=False):
    normalized = normalize_log_message(message)
    if not normalized:
        return
    if not is_error_message(normalized):
        return

    if dedupe:
        last_log = Camera_error_log.query.order_by(
            Camera_error_log.timestamp.desc(),
            Camera_error_log.id.desc(),
        ).first()
        if last_log and normalize_log_message(last_log.error_log) == normalized:
            return

    db.session.add(Camera_error_log(error_log=normalized))
    db.session.commit()


def serialize_camera(row):
    has_camera = bool(row.ip_address)
    is_connected = bool(row.is_connected)
    return {
        "id": row.id,
        "cameraNo": row.camera_no,
        "ipAddress": row.ip_address,
        "username": row.username,
        "password": row.password,
        "port": str(row.port or DEFAULT_CAMERA_PORT),
        "streamPath": row.stream_path or DEFAULT_STREAM_PATH,
        "isConnected": is_connected,
        "streamUrl": f"/settings/api/cameras/{row.camera_no}/stream" if has_camera and is_connected else "",
        "snapshotUrl": f"/settings/api/cameras/{row.camera_no}/snapshot" if has_camera and is_connected else "",
    }


def serialize_empty_camera(camera_no):
    return {
        "id": None,
        "cameraNo": camera_no,
        "ipAddress": "",
        "username": "",
        "password": "",
        "port": str(DEFAULT_CAMERA_PORT),
        "streamPath": DEFAULT_STREAM_PATH,
        "isConnected": False,
        "streamUrl": "",
        "snapshotUrl": "",
    }


def validate_camera(payload, *, require_credentials=True):
    try:
        camera_no = int(payload.get("cameraNo"))
    except (TypeError, ValueError):
        return None, "Camera number must be 1 to 4"

    ip_address = (payload.get("ipAddress") or "").strip()
    username = (payload.get("username") or "").strip()
    password = (payload.get("password") or "").strip()
    stream_path = (payload.get("streamPath") or DEFAULT_STREAM_PATH).strip().lstrip("/")

    try:
        port = int(payload.get("port") or DEFAULT_CAMERA_PORT)
    except (TypeError, ValueError):
        return None, "Camera port must be a number"

    if camera_no < 1 or camera_no > MAX_CAMERAS:
        return None, "Camera number must be 1 to 4"
    if not ip_address:
        return None, "Camera IP number is required"
    if require_credentials and not username:
        return None, "Camera username is required"
    if require_credentials and not password:
        return None, "Camera password is required"
    if port < 1 or port > 65535:
        return None, "Camera port must be between 1 and 65535"
    if not stream_path:
        return None, "Camera stream path is required"

    return {
        "camera_no": camera_no,
        "ip_address": ip_address,
        "username": username,
        "password": password,
        "port": port,
        "stream_path": stream_path,
    }, None


def is_blank_camera_payload(payload):
    return not any(
        str(payload.get(field) or "").strip()
        for field in ("ipAddress", "username", "password")
    )


def build_rtsp_url_from_parts(username, password, ip_address, port, stream_path):
    username = quote(username or "", safe="")
    password = quote(password or "", safe="")
    stream_path = (stream_path or DEFAULT_STREAM_PATH).lstrip("/")
    return f"rtsp://{username}:{password}@{ip_address}:{port}/{stream_path}"


def build_rtsp_url(camera_row):
    return build_rtsp_url_from_parts(
        camera_row.username,
        camera_row.password,
        camera_row.ip_address,
        camera_row.port,
        camera_row.stream_path,
    )


def check_camera_network(ip_address, port, timeout_seconds=3):
    try:
        with socket.create_connection((ip_address, port), timeout=timeout_seconds):
            return ""
    except OSError as exc:
        detail = str(exc).strip() or "Network is unreachable"
        return f"Network error: {detail}"


def read_camera_frame(rtsp_url, timeout_seconds=6):
    if cv2 is None:
        return None, "Camera streaming driver is not available"

    started = time.monotonic()
    capture = cv2.VideoCapture(rtsp_url, cv2.CAP_FFMPEG)
    try:
        if hasattr(cv2, "CAP_PROP_OPEN_TIMEOUT_MSEC"):
            capture.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, timeout_seconds * 1000)
        if hasattr(cv2, "CAP_PROP_READ_TIMEOUT_MSEC"):
            capture.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, timeout_seconds * 1000)

        while time.monotonic() - started < timeout_seconds:
            ok, frame = capture.read()
            if ok and frame is not None:
                return frame, ""
            time.sleep(0.15)
    finally:
        capture.release()

    return None, f"Network error: camera stream timeout after {timeout_seconds} seconds"


def test_camera_stream(camera_data):
    started = time.monotonic()
    network_error = check_camera_network(
        camera_data["ip_address"],
        camera_data["port"],
        timeout_seconds=3,
    )
    if network_error:
        return {
            "status": "network_error",
            "message": f"Camera {camera_data['camera_no']} connection error: {network_error}",
            "elapsedMs": int((time.monotonic() - started) * 1000),
        }

    rtsp_url = build_rtsp_url_from_parts(
        camera_data["username"],
        camera_data["password"],
        camera_data["ip_address"],
        camera_data["port"],
        camera_data["stream_path"],
    )
    frame, error_message = read_camera_frame(rtsp_url)
    elapsed_ms = int((time.monotonic() - started) * 1000)

    if frame is not None:
        return {
            "status": "success",
            "message": f"Camera {camera_data['camera_no']} connected",
            "elapsedMs": elapsed_ms,
        }

    return {
        "status": "network_error" if "network" in error_message.lower() else "not_connected",
        "message": f"Camera {camera_data['camera_no']} connection error: {error_message}",
        "elapsedMs": elapsed_ms,
    }


def get_camera_row(camera_no):
    return Camera_settings.query.filter_by(camera_no=camera_no).first()


@settings_bp.route("/api/cameras", methods=["GET"])
def camera_details():
    ensure_camera_schema()
    rows = {
        row.camera_no: serialize_camera(row)
        for row in Camera_settings.query.order_by(Camera_settings.camera_no.asc()).all()
    }
    logs = Camera_error_log.query.order_by(
        Camera_error_log.timestamp.desc(),
        Camera_error_log.id.desc(),
    ).limit(100).all()

    return jsonify({
        "cameras": [
            rows.get(camera_no, serialize_empty_camera(camera_no))
            for camera_no in range(1, MAX_CAMERAS + 1)
        ],
        "logs": [
            {
                "id": log.id,
                "message": log.error_log,
                "timestamp": log.timestamp.isoformat() if log.timestamp else None,
                "type": "error" if is_error_message(log.error_log) else "info",
            }
            for log in logs
        ],
    })


@settings_bp.route("/api/cameras", methods=["POST"])
def camera_save():
    ensure_camera_schema()
    payload = request.get_json(silent=True) or {}
    camera_payloads = payload.get("cameras") or []
    if not isinstance(camera_payloads, list):
        return jsonify({"message": "Camera settings must be a list"}), 400

    saved_rows = []
    try:
        for item in camera_payloads[:MAX_CAMERAS]:
            if is_blank_camera_payload(item):
                try:
                    camera_no = int(item.get("cameraNo"))
                except (TypeError, ValueError):
                    continue
                row = get_camera_row(camera_no)
                if row is not None:
                    row.is_connected = False
                continue

            data, message = validate_camera(item)
            if message:
                return jsonify({"message": message}), 400

            row = get_camera_row(data["camera_no"])
            if row is None:
                row = Camera_settings(**data)
                db.session.add(row)
            else:
                row.ip_address = data["ip_address"]
                row.username = data["username"]
                row.password = data["password"]
                row.port = data["port"]
                row.stream_path = data["stream_path"]
                row.is_connected = True
            saved_rows.append(row)

        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return jsonify({"message": "Failed to save camera settings"}), 500

    return jsonify({
        "message": "Camera settings saved successfully",
        "cameras": [serialize_camera(row) for row in saved_rows],
    })


@settings_bp.route("/api/cameras/<int:camera_no>/test", methods=["POST"])
def camera_test(camera_no):
    ensure_camera_schema()
    payload = request.get_json(silent=True) or {}
    payload["cameraNo"] = camera_no
    data, message = validate_camera(payload)
    if message:
        return jsonify({"message": message}), 400

    result = test_camera_stream(data)
    return jsonify({
        **result,
        "camera": {
            "cameraNo": camera_no,
            "ipAddress": data["ip_address"],
            "username": data["username"],
            "password": data["password"],
            "port": str(data["port"]),
            "streamPath": data["stream_path"],
            "isConnected": result["status"] == "success",
            "streamUrl": "",
            "snapshotUrl": (
                f"/settings/api/cameras/preview/snapshot"
                f"?username={quote(data['username'], safe='')}"
                f"&password={quote(data['password'], safe='')}"
                f"&ipAddress={quote(data['ip_address'], safe='')}"
                f"&port={data['port']}"
                f"&streamPath={quote(data['stream_path'], safe='')}"
            ) if result["status"] == "success" else "",
        },
    }), 200 if result["status"] == "success" else 503


@settings_bp.route("/api/cameras/<int:camera_no>/close", methods=["POST"])
def camera_close(camera_no):
    ensure_camera_schema()
    row = get_camera_row(camera_no)
    if row is None:
        return jsonify({"message": "Camera is not found"}), 404

    return jsonify({
        "message": f"Camera {camera_no} preview closed",
        "camera": serialize_camera(row),
    })


@settings_bp.route("/api/cameras/<int:camera_no>", methods=["DELETE"])
def camera_delete(camera_no):
    ensure_camera_schema()
    row = get_camera_row(camera_no)
    if row is None:
        return jsonify({"message": "Camera is not found"}), 404

    try:
        db.session.delete(row)
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return jsonify({"message": "Failed to delete camera setting"}), 500

    return jsonify({
        "message": f"Camera {camera_no} deleted",
        "camera": serialize_empty_camera(camera_no),
    })


@settings_bp.route("/api/cameras/status", methods=["GET"])
def camera_status():
    ensure_camera_schema()
    connected_count = Camera_settings.query.filter_by(is_connected=True).count()
    return jsonify({
        "status": "success" if connected_count else "not_connected",
        "connectedCount": connected_count,
    })


def generate_camera_frames(camera_row):
    rtsp_url = build_rtsp_url(camera_row)
    while True:
        capture = cv2.VideoCapture(rtsp_url, cv2.CAP_FFMPEG)
        if not capture.isOpened():
            time.sleep(2)
            continue

        try:
            while True:
                ok, frame = capture.read()
                if not ok:
                    break
                ok, buffer = cv2.imencode(".jpg", frame)
                if not ok:
                    continue
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n"
                    + buffer.tobytes()
                    + b"\r\n"
                )
        finally:
            capture.release()
        time.sleep(1)


@settings_bp.route("/api/cameras/<int:camera_no>/stream", methods=["GET"])
def camera_stream(camera_no):
    ensure_camera_schema()
    row = get_camera_row(camera_no)
    if row is None or not row.ip_address:
        return jsonify({"message": "Camera is not found"}), 404
    if cv2 is None:
        return jsonify({"message": "Camera streaming driver is not available"}), 500
    network_error = check_camera_network(row.ip_address, row.port, timeout_seconds=3)
    if network_error:
        return jsonify({"message": network_error}), 503

    return Response(
        generate_camera_frames(row),
        mimetype="multipart/x-mixed-replace; boundary=frame",
    )


@settings_bp.route("/api/cameras/<int:camera_no>/snapshot", methods=["GET"])
def camera_snapshot(camera_no):
    ensure_camera_schema()
    row = get_camera_row(camera_no)
    if row is None or not row.ip_address:
        return jsonify({"message": "Camera is not found"}), 404

    frame, error_message = read_camera_frame(build_rtsp_url(row), timeout_seconds=6)
    if frame is None:
        try:
            row.is_connected = False
            db.session.commit()
            add_camera_log(f"Camera {camera_no} preview error: {error_message}", dedupe=True)
        except SQLAlchemyError:
            db.session.rollback()
        return jsonify({"message": error_message}), 500

    ok, buffer = cv2.imencode(".jpg", frame)
    if not ok:
        return jsonify({"message": "Failed to encode camera preview"}), 500

    return Response(buffer.tobytes(), mimetype="image/jpeg")


@settings_bp.route("/api/cameras/preview/snapshot", methods=["GET"])
def camera_preview_snapshot():
    camera_data = {
        "username": (request.args.get("username") or "").strip(),
        "password": (request.args.get("password") or "").strip(),
        "ip_address": (request.args.get("ipAddress") or "").strip(),
        "port": int(request.args.get("port") or DEFAULT_CAMERA_PORT),
        "stream_path": (request.args.get("streamPath") or DEFAULT_STREAM_PATH).strip().lstrip("/"),
    }
    rtsp_url = build_rtsp_url_from_parts(
        camera_data["username"],
        camera_data["password"],
        camera_data["ip_address"],
        camera_data["port"],
        camera_data["stream_path"],
    )
    frame, error_message = read_camera_frame(rtsp_url, timeout_seconds=6)
    if frame is None:
        return jsonify({"message": error_message}), 500

    ok, buffer = cv2.imencode(".jpg", frame)
    if not ok:
        return jsonify({"message": "Failed to encode camera preview"}), 500

    return Response(buffer.tobytes(), mimetype="image/jpeg")
