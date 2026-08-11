from flask import jsonify, render_template, request
from sqlalchemy import inspect, text
from sqlalchemy.exc import SQLAlchemyError

from models.models import Communication_error_log, Communication_port_settings, db
from sample_serial_data import normalize_weight_value, test_serial_connection
from . import settings_bp

try:
    import serial
    from serial.tools import list_ports
    from serial import SerialException
except ImportError:  # pragma: no cover
    serial = None
    list_ports = None

    class SerialException(Exception):
        pass


COMMUNICATION_TABLE = "communication_port_setting"
LEGACY_COMMUNICATION_TABLE = "communication_port_settings"
ERROR_LOG_TABLE = "communication_error_log"

PARITY_MAP = {
    "None": "N",
    "Even": "E",
    "Odd": "O",
}

STOP_BITS_MAP = {
    "1": 1,
    "1.5": 1.5,
    "2": 2,
}

INFO_LOG_PREFIXES = (
    "Communication settings saved ",
    "Communication connected",
)

TEST_ERROR_PREFIX = "Test connection error: "
CONNECTION_SUCCESS_LOG = "Communication connected"

@settings_bp.route("/communication")
def communication():
    ensure_communication_schema()
    return render_template("communication_settings.html")


def ensure_communication_schema():
    inspector = inspect(db.engine)
    table_names = set(inspector.get_table_names())

    if LEGACY_COMMUNICATION_TABLE in table_names and COMMUNICATION_TABLE not in table_names:
        db.session.execute(
            text(f"ALTER TABLE {LEGACY_COMMUNICATION_TABLE} RENAME TO {COMMUNICATION_TABLE}")
        )
        db.session.commit()
        inspector = inspect(db.engine)
        table_names = set(inspector.get_table_names())

    if COMMUNICATION_TABLE not in table_names:
        Communication_port_settings.__table__.create(db.engine)
        inspector = inspect(db.engine)
    else:
        settings_columns = {column["name"] for column in inspector.get_columns(COMMUNICATION_TABLE)}
        if "timeout" not in settings_columns:
            db.session.execute(
                text(
                    f"ALTER TABLE {COMMUNICATION_TABLE} "
                    "ADD COLUMN timeout INTEGER NOT NULL DEFAULT 1000"
                )
            )
            db.session.commit()
            inspector = inspect(db.engine)
            settings_columns = {column["name"] for column in inspector.get_columns(COMMUNICATION_TABLE)}

        if "start_character" not in settings_columns:
            db.session.execute(
                text(
                    f"ALTER TABLE {COMMUNICATION_TABLE} "
                    "ADD COLUMN start_character VARCHAR(8) NOT NULL DEFAULT ''"
                )
            )
            db.session.commit()
            inspector = inspect(db.engine)
            settings_columns = {column["name"] for column in inspector.get_columns(COMMUNICATION_TABLE)}

        if "end_character" not in settings_columns:
            db.session.execute(
                text(
                    f"ALTER TABLE {COMMUNICATION_TABLE} "
                    "ADD COLUMN end_character VARCHAR(8) NOT NULL DEFAULT ''"
                )
            )
            db.session.commit()
            inspector = inspect(db.engine)
            settings_columns = {column["name"] for column in inspector.get_columns(COMMUNICATION_TABLE)}

        if "start_address" not in settings_columns:
            db.session.execute(
                text(
                    f"ALTER TABLE {COMMUNICATION_TABLE} "
                    "ADD COLUMN start_address INTEGER NOT NULL DEFAULT 0"
                )
            )
            db.session.commit()
            inspector = inspect(db.engine)
            settings_columns = {column["name"] for column in inspector.get_columns(COMMUNICATION_TABLE)}

        if "end_address" not in settings_columns:
            db.session.execute(
                text(
                    f"ALTER TABLE {COMMUNICATION_TABLE} "
                    "ADD COLUMN end_address INTEGER NOT NULL DEFAULT 0"
                )
            )
            db.session.commit()
            inspector = inspect(db.engine)

        settings_columns = {column["name"] for column in inspector.get_columns(COMMUNICATION_TABLE)}
        if "reverse_weight" not in settings_columns:
            db.session.execute(
                text(
                    f"ALTER TABLE {COMMUNICATION_TABLE} "
                    "ADD COLUMN reverse_weight BOOLEAN NOT NULL DEFAULT 0"
                )
            )
            db.session.commit()
            inspector = inspect(db.engine)

    if ERROR_LOG_TABLE not in table_names:
        Communication_error_log.__table__.create(db.engine)
    else:
        log_columns = {column["name"] for column in inspector.get_columns(ERROR_LOG_TABLE)}
        if "error_message" in log_columns and "error_log" not in log_columns:
            db.session.execute(
                text(
                    f"ALTER TABLE {ERROR_LOG_TABLE} "
                    "RENAME COLUMN error_message TO error_log"
                )
            )
            db.session.commit()


def serialize_settings(row):
    if row is None:
        return {
            "portName": "",
            "baudRate": "9600",
            "timeout": "1000",
            "dataBits": "8",
            "parity": "None",
            "stopBits": "1",
            "startCharacter": "",
            "endCharacter": "",
            "startAddress": "0",
            "endAddress": "0",
            "reverseWeight": False,
        }

    return {
        "portName": row.port_name,
        "baudRate": str(row.baud_rate),
        "timeout": str(row.timeout),
        "dataBits": str(row.data_bits),
        "parity": row.parity,
        "stopBits": format_stop_bits(row.stop_bits),
        "startCharacter": getattr(row, "start_character", "") or "",
        "endCharacter": getattr(row, "end_character", "") or "",
        "startAddress": str(getattr(row, "start_address", 0) or 0),
        "endAddress": str(getattr(row, "end_address", 0) or 0),
        "reverseWeight": bool(getattr(row, "reverse_weight", False)),
    }


def list_available_ports():
    if list_ports is None:
        return []

    return [
        {
            "device": port.device,
            "description": port.description or port.device,
            "label": f"{port.device} - {port.description}" if port.description else port.device,
        }
        for port in list_ports.comports()
    ]


def format_stop_bits(stop_bits):
    if int(stop_bits) == stop_bits:
        return str(int(stop_bits))
    return str(stop_bits)


def parse_ascii_character(value):
    text_value = str(value or "")
    if not text_value:
        return "", None

    stripped_value = text_value.strip()
    if stripped_value.isdigit():
        ascii_code = int(stripped_value)
        if ascii_code < 0 or ascii_code > 127:
            return None, "ASCII value must be between 0 and 127"
        return chr(ascii_code), None

    if len(text_value) == 1:
        return text_value, None

    return None, "Character must be a single character or ASCII value"


def validate_settings(payload):
    port_name = (payload.get("portName") or "").strip()
    parity = (payload.get("parity") or "").strip()
    baud_rate = payload.get("baudRate")
    timeout = payload.get("timeout")
    data_bits = payload.get("dataBits")
    stop_bits = payload.get("stopBits")
    start_character, start_character_error = parse_ascii_character(payload.get("startCharacter"))
    end_character, end_character_error = parse_ascii_character(payload.get("endCharacter"))
    start_address = payload.get("startAddress")
    end_address = payload.get("endAddress")
    reverse_weight = bool(payload.get("reverseWeight"))

    if not port_name:
        return None, "Port name is required"

    if start_character_error:
        return None, f"Start {start_character_error}"

    if end_character_error:
        return None, f"End {end_character_error}"

    if parity not in PARITY_MAP:
        return None, "Parity must be None, Even, or Odd"

    try:
        baud_rate = int(baud_rate)
    except (TypeError, ValueError):
        return None, "Baud rate must be a number"

    try:
        timeout = int(timeout)
    except (TypeError, ValueError):
        return None, "Timeout must be a number"

    try:
        data_bits = int(data_bits)
    except (TypeError, ValueError):
        return None, "Data bits must be a number"

    try:
        stop_bits = float(stop_bits)
    except (TypeError, ValueError):
        return None, "Stop bits must be 1, 1.5, or 2"

    try:
        start_address = int(start_address or 0)
    except (TypeError, ValueError):
        return None, "Start address must be a number"

    try:
        end_address = int(end_address or 0)
    except (TypeError, ValueError):
        return None, "End address must be a number"

    if data_bits not in {5, 6, 7, 8}:
        return None, "Data bits must be 5, 6, 7, or 8"

    if timeout < 0:
        return None, "Timeout must be 0 or greater"

    if stop_bits not in {1.0, 1.5, 2.0}:
        return None, "Stop bits must be 1, 1.5, or 2"

    if start_character and len(start_character) != 1:
        return None, "Start character must be a single character"

    if end_character and len(end_character) != 1:
        return None, "End character must be a single character"

    if start_address < 0:
        return None, "Start address must be 0 or greater"

    if end_address < 0:
        return None, "End address must be 0 or greater"

    return {
        "port_name": port_name,
        "baud_rate": baud_rate,
        "timeout": timeout,
        "data_bits": data_bits,
        "parity": parity,
        "stop_bits": stop_bits,
        "start_character": start_character,
        "end_character": end_character,
        "start_address": start_address,
        "end_address": end_address,
        "reverse_weight": reverse_weight,
    }, None


def normalize_log_message(message):
    return " ".join(str(message or "").split()).strip()


def normalize_error_message(message):
    normalized = normalize_log_message(message)
    if normalized.startswith(TEST_ERROR_PREFIX):
        normalized = normalized[len(TEST_ERROR_PREFIX):].strip()
    return normalized


def is_error_message(message):
    normalized = normalize_log_message(message)
    return bool(normalized) and not any(
        normalized.startswith(prefix) for prefix in INFO_LOG_PREFIXES
    )


def get_last_relevant_log():
    logs = Communication_error_log.query.order_by(
        Communication_error_log.timestamp.desc(),
        Communication_error_log.id.desc()
    ).limit(100).all()

    for log in logs:
        normalized = normalize_log_message(log.error_log)
        if not normalized or normalized.startswith("Communication settings saved "):
            continue

        if is_error_message(normalized):
            return ("error", normalize_error_message(normalized))

        return ("info", normalized)

    return None


def add_error_log(message, *, dedupe_by_error=False):
    normalized_message = normalize_log_message(message)
    if not normalized_message:
        return

    if dedupe_by_error:
        last_relevant_log = get_last_relevant_log()
        if (
            last_relevant_log
            and last_relevant_log[0] == "error"
            and last_relevant_log[1] == normalize_error_message(normalized_message)
        ):
            return
    else:
        last_log = Communication_error_log.query.order_by(
            Communication_error_log.timestamp.desc(),
            Communication_error_log.id.desc()
        ).first()
        if last_log and normalize_log_message(last_log.error_log) == normalized_message:
            return

    db.session.add(Communication_error_log(error_log=normalized_message))
    db.session.commit()


def add_connection_success_log():
    last_relevant_log = get_last_relevant_log()
    if last_relevant_log == ("info", CONNECTION_SUCCESS_LOG):
        return
    if last_relevant_log is None or last_relevant_log[0] != "error":
        return

    db.session.add(Communication_error_log(error_log=CONNECTION_SUCCESS_LOG))
    db.session.commit()


def get_latest_settings_row():
    return Communication_port_settings.query.order_by(
        Communication_port_settings.updated_at.desc(),
        Communication_port_settings.id.desc()
    ).first()


def get_live_scale_result(settings_row):
    if settings_row is None:
        return {
            "message": "Communication settings not saved",
            "status": "not_connected",
            "value": "",
            "rawValue": "",
            "timeoutMs": 1000,
        }

    result = test_serial_connection(
        port=settings_row.port_name,
        baud_rate=settings_row.baud_rate,
        data_bits=settings_row.data_bits,
        parity=settings_row.parity,
        stop_bits=format_stop_bits(settings_row.stop_bits),
        timeout_seconds=max(settings_row.timeout, 1) / 1000,
        start_character=settings_row.start_character,
        end_character=settings_row.end_character,
        start_address=settings_row.start_address,
        end_address=settings_row.end_address,
    )
    raw_value = result.get("value") or ""
    result["value"] = normalize_weight_value(
        raw_value,
        start_character=settings_row.start_character,
        end_character=settings_row.end_character,
        start_address=settings_row.start_address,
        end_address=settings_row.end_address,
        reverse_weight=getattr(settings_row, "reverse_weight", False),
    )
    result["rawValue"] = raw_value
    result["timeoutMs"] = settings_row.timeout
    return result


@settings_bp.route("/api/communication", methods=["GET"])
def communication_details():
    ensure_communication_schema()
    settings_row = get_latest_settings_row()
    logs = Communication_error_log.query.order_by(
        Communication_error_log.timestamp.desc(),
        Communication_error_log.id.desc()
    ).limit(100).all()

    return jsonify({
        "settings": serialize_settings(settings_row),
        "availablePorts": list_available_ports(),
        "logs": [
            {
                "id": log.id,
                "message": log.error_log,
                "timestamp": log.timestamp.isoformat() if log.timestamp else None,
            }
            for log in logs
        ],
    })


@settings_bp.route("/api/communication", methods=["POST"])
def communication_save():
    ensure_communication_schema()
    payload = request.get_json(silent=True) or {}
    settings_data, validation_message = validate_settings(payload)

    if validation_message:
        return jsonify({"message": validation_message}), 400

    row = Communication_port_settings.query.order_by(
        Communication_port_settings.id.desc()
    ).first()
    if row is None:
        row = Communication_port_settings(**settings_data)
        db.session.add(row)
    else:
        row.port_name = settings_data["port_name"]
        row.baud_rate = settings_data["baud_rate"]
        row.timeout = settings_data["timeout"]
        row.data_bits = settings_data["data_bits"]
        row.parity = settings_data["parity"]
        row.stop_bits = settings_data["stop_bits"]
        row.start_character = settings_data["start_character"]
        row.end_character = settings_data["end_character"]
        row.start_address = settings_data["start_address"]
        row.end_address = settings_data["end_address"]
        row.reverse_weight = settings_data["reverse_weight"]

    try:
        db.session.commit()
        add_error_log(
            "Communication settings saved "
            f"({row.port_name}, {row.baud_rate}, {row.timeout}, {row.data_bits}, {row.parity}, {format_stop_bits(row.stop_bits)})"
        )
    except SQLAlchemyError:
        db.session.rollback()
        return jsonify({"message": "Failed to save communication settings"}), 500

    return jsonify({
        "message": "Communication details saved successfully",
        "settings": serialize_settings(row),
        "availablePorts": list_available_ports(),
    })


@settings_bp.route("/api/communication/test", methods=["POST"])
def communication_test():
    ensure_communication_schema()
    payload = request.get_json(silent=True) or {}
    settings_data, validation_message = validate_settings(payload)

    if validation_message:
        return jsonify({"message": validation_message}), 400

    if serial is None:
        error_message = "Serial driver is not available"
        try:
            add_error_log(error_message, dedupe_by_error=True)
        except SQLAlchemyError:
            db.session.rollback()
        return jsonify({
            "message": error_message,
            "status": "not_connected",
            "value": "",
            "rawValue": "",
        }), 500

    try:
        result = {
            **test_serial_connection(
                port=settings_data["port_name"],
                baud_rate=settings_data["baud_rate"],
                data_bits=settings_data["data_bits"],
                parity=settings_data["parity"],
                stop_bits=format_stop_bits(settings_data["stop_bits"]),
                timeout_seconds=max(settings_data["timeout"], 1) / 1000,
                start_character=settings_data["start_character"],
                end_character=settings_data["end_character"],
                start_address=settings_data["start_address"],
                end_address=settings_data["end_address"],
            ),
            "timeoutMs": settings_data["timeout"],
        }

        if result["status"] == "success":
            try:
                add_connection_success_log()
            except SQLAlchemyError:
                db.session.rollback()
        else:
            try:
                add_error_log(result["message"], dedupe_by_error=True)
            except SQLAlchemyError:
                db.session.rollback()

        return jsonify({
            "message": result["message"],
            "status": result["status"],
            "value": result["value"],
            "rawValue": result["value"],
            "timeoutMs": result["timeoutMs"],
        })
    except (SerialException, ValueError, OSError, KeyError) as exc:
        error_message = str(exc).strip() or "Connection failed"
        try:
            add_error_log(error_message, dedupe_by_error=True)
        except SQLAlchemyError:
            db.session.rollback()
        return jsonify({
            "message": error_message,
            "status": "not_connected",
            "value": "",
            "rawValue": "",
            "timeoutMs": settings_data["timeout"],
        }), 500


@settings_bp.route("/api/communication/live", methods=["GET"])
def communication_live():
    ensure_communication_schema()
    settings_row = get_latest_settings_row()

    if serial is None:
        error_message = "Serial driver is not available"
        try:
            add_error_log(error_message, dedupe_by_error=True)
        except SQLAlchemyError:
            db.session.rollback()
        return jsonify({
            "message": error_message,
            "status": "not_connected",
            "value": "",
            "rawValue": "",
            "timeoutMs": settings_row.timeout if settings_row else 1000,
        }), 500

    try:
        result = get_live_scale_result(settings_row)
        if result["status"] == "success":
            try:
                add_connection_success_log()
            except SQLAlchemyError:
                db.session.rollback()
        else:
            try:
                add_error_log(result["message"], dedupe_by_error=True)
            except SQLAlchemyError:
                db.session.rollback()

        return jsonify(result)
    except (SerialException, ValueError, OSError, KeyError) as exc:
        error_message = str(exc).strip() or "Connection failed"
        try:
            add_error_log(error_message, dedupe_by_error=True)
        except SQLAlchemyError:
            db.session.rollback()
        return jsonify({
            "message": error_message,
            "status": "not_connected",
            "value": "",
            "rawValue": "",
            "timeoutMs": settings_row.timeout if settings_row else 1000,
        }), 500
