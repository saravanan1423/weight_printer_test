import re

import serial
from sample_serial_data import (
    BAUD_RATE,
    SERIAL_PORT,
    printable_text,
    read_complete_serial_frame,
    read_serial_data,
)


BYTE_SIZE_MAP = {
    5: serial.FIVEBITS,
    6: serial.SIXBITS,
    7: serial.SEVENBITS,
    8: serial.EIGHTBITS,
}

PARITY_MAP = {
    "None": serial.PARITY_NONE,
    "Even": serial.PARITY_EVEN,
    "Odd": serial.PARITY_ODD,
}

STOP_BITS_MAP = {
    "1": serial.STOPBITS_ONE,
    "1.5": serial.STOPBITS_ONE_POINT_FIVE,
    "2": serial.STOPBITS_TWO,
}

CONTROL_PREFIX = "".join(chr(index) for index in range(32))
VALUE_PATTERN = re.compile(r"-?\d+(?:\.\d+)?")


def extract_weight_value(raw_text):
    match = VALUE_PATTERN.search(raw_text or "")
    return match.group(0) if match else ""


def normalize_weight_value(
    raw_text,
    start_character="",
    end_character="",
    start_address=0,
    end_address=0,
    reverse_weight=False,
):
    text = str(raw_text or "")
    if not text:
        return ""

    start_marker = str(start_character or "")
    end_marker = str(end_character or "")
    if not start_marker:
        text = text.lstrip(CONTROL_PREFIX)
    if not start_marker and not end_marker:
        text = text.strip()

    if start_marker:
        start_pos = text.find(start_marker)
        if start_pos == -1:
            return ""
        text = text[start_pos + len(start_marker):]

    if end_marker:
        end_pos = text.find(end_marker)
        if end_pos == -1:
            return ""
        text = text[:end_pos]

    start_pos = max(int(start_address or 0), 0)
    end_pos = max(int(end_address or 0), 0)

    if start_pos or end_pos:
        start_index = max(start_pos - 1, 0) if start_pos else 0
        if end_pos:
            end_index = max(end_pos - 1, 0)
            if end_index < start_index:
                return ""
            text = text[start_index:end_index + 1]
        else:
            text = text[start_index:]

    stripped = text.strip()
    if reverse_weight:
        stripped = stripped[::-1].strip()

    if not stripped:
        return ""

    match = VALUE_PATTERN.fullmatch(stripped)
    if not match:
        return stripped

    value = match.group(0)
    negative = value.startswith("-")
    numeric_portion = value[1:] if negative else value

    if "." in numeric_portion:
        integer_part, fraction_part = numeric_portion.split(".", 1)
        integer_part = integer_part.lstrip("0") or "0"
        fraction_part = fraction_part.rstrip("0")
        normalized = integer_part if not fraction_part else f"{integer_part}.{fraction_part}"
    else:
        normalized = numeric_portion.lstrip("0") or "0"

    return f"-{normalized}" if negative else normalized


def test_serial_connection(
    port=SERIAL_PORT,
    baud_rate=BAUD_RATE,
    data_bits=8,
    parity="None",
    stop_bits="1",
    timeout_seconds=5,
    poll_interval=0.1,
    start_character="",
    end_character="",
    start_address=0,
    end_address=0,
):
    ser = None
    try:
        effective_timeout = max(float(timeout_seconds or 0), 0.1)
        ser = serial.Serial(
            port=port,
            baudrate=baud_rate,
            bytesize=BYTE_SIZE_MAP[int(data_bits)],
            parity=PARITY_MAP[parity],
            stopbits=STOP_BITS_MAP[str(stop_bits)],
            timeout=effective_timeout,
        )

        frame = read_complete_serial_frame(
            ser,
            timeout_seconds=effective_timeout,
        )
        if frame:
            return {
                "status": "success",
                "message": "Connected",
                "value": printable_text(frame),
            }

        return {
            "status": "not_connected",
            "message": f"Port opened but no data received within {format_timeout_label(effective_timeout)}",
            "value": "",
        }
    except serial.SerialException as exc:
        return {
            "status": "not_connected",
            "message": f"Serial connection error: {exc}",
            "value": "",
        }
    finally:
        if ser is not None:
            try:
                ser.close()
            except Exception:
                pass


def format_timeout_label(timeout_seconds):
    if timeout_seconds < 1:
        return f"{int(round(timeout_seconds * 1000))} ms"
    if float(timeout_seconds).is_integer():
        seconds = int(timeout_seconds)
        return f"{seconds} second" if seconds == 1 else f"{seconds} seconds"
    return f"{timeout_seconds:.1f} seconds"


if __name__ == "__main__":
    read_serial_data()
