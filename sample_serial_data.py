import time
import re
import threading

import serial


SERIAL_PORT = "com7"
BAUD_RATE = 2400
READ_TIMEOUT_SECONDS = 1
INTER_FRAME_GAP_SECONDS = 2

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
_LIVE_READER_LOCK = threading.Lock()
_LIVE_READER = None


def printable_text(data):
    """Display every received byte without silently discarding invalid bytes."""
    return data.decode("ascii", errors="backslashreplace").rstrip("\r\n")


def print_frame(frame):
    if not frame:
        return
    print("RAW bytes :", frame)
    print("TEXT      :", printable_text(frame))
    print("HEX       :", frame.hex(" ").upper())
    print("-" * 40)


def take_complete_frames(buffer):
    """Remove and return CR/LF-terminated frames from a persistent buffer."""
    frames = []
    while buffer:
        delimiter_positions = [
            position
            for position in (buffer.find(b"\r"), buffer.find(b"\n"))
            if position >= 0
        ]
        if not delimiter_positions:
            break

        delimiter_position = min(delimiter_positions)
        # Keep a trailing CR briefly so an LF arriving in the next serial chunk
        # is joined to the same frame instead of becoming a false blank frame.
        if delimiter_position == len(buffer) - 1 and buffer[delimiter_position] == 13:
            break

        frame_end = delimiter_position + 1
        while frame_end < len(buffer) and buffer[frame_end] in (10, 13):
            frame_end += 1

        frames.append(bytes(buffer[:frame_end]))
        del buffer[:frame_end]

    return frames


def read_complete_serial_frame(
    ser,
    timeout_seconds=1.0,
    inter_frame_gap_seconds=INTER_FRAME_GAP_SECONDS,
    receive_buffer=None,
):
    """Read and reconstruct one frame using the same logic as the sample tool."""
    receive_buffer = receive_buffer if receive_buffer is not None else bytearray()
    buffered_frames = take_complete_frames(receive_buffer)
    if buffered_frames:
        if len(buffered_frames) > 1:
            receive_buffer[:0] = b"".join(buffered_frames[1:])
        return buffered_frames[0]

    last_byte_time = None
    deadline = time.monotonic() + max(float(timeout_seconds or 0), 0.1)

    while time.monotonic() <= deadline:
        waiting = ser.in_waiting
        chunk = ser.read(waiting if waiting > 0 else 1)

        if chunk:
            receive_buffer.extend(chunk)
            last_byte_time = time.monotonic()
            frames = take_complete_frames(receive_buffer)
            if frames:
                if len(frames) > 1:
                    receive_buffer[:0] = b"".join(frames[1:])
                return frames[0]
            continue

        if (
            receive_buffer
            and last_byte_time is not None
            and time.monotonic() - last_byte_time >= inter_frame_gap_seconds
        ):
            frame = bytes(receive_buffer)
            receive_buffer.clear()
            return frame

    frame = bytes(receive_buffer)
    receive_buffer.clear()
    return frame


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
        marker_position = text.find(start_marker)
        if marker_position < 0:
            return ""
        text = text[marker_position + len(start_marker):]
    if end_marker:
        marker_position = text.find(end_marker)
        if marker_position < 0:
            return ""
        text = text[:marker_position]

    start_position = max(int(start_address or 0), 0)
    end_position = max(int(end_address or 0), 0)
    if start_position or end_position:
        start_index = max(start_position - 1, 0) if start_position else 0
        end_index = max(end_position - 1, 0) + 1 if end_position else None
        if end_index is not None and end_index <= start_index:
            return ""
        text = text[start_index:end_index]

    stripped = text.strip()
    if reverse_weight:
        stripped = stripped[::-1].strip()

    match = VALUE_PATTERN.fullmatch(stripped)
    if not match:
        return stripped

    value = match.group(0)
    negative = value.startswith("-")
    numeric = value[1:] if negative else value
    if "." in numeric:
        integer_part, fraction_part = numeric.split(".", 1)
        integer_part = integer_part.lstrip("0") or "0"
        fraction_part = fraction_part.rstrip("0")
        normalized = integer_part if not fraction_part else f"{integer_part}.{fraction_part}"
    else:
        normalized = numeric.lstrip("0") or "0"
    return f"-{normalized}" if negative else normalized


def format_timeout_label(timeout_seconds):
    if timeout_seconds < 1:
        return f"{int(round(timeout_seconds * 1000))} ms"
    seconds = int(timeout_seconds) if float(timeout_seconds).is_integer() else timeout_seconds
    return f"{seconds} second" if seconds == 1 else f"{seconds} seconds"


class ContinuousSerialReader:
    def __init__(self, config):
        self.config = config
        self.stop_event = threading.Event()
        self.value_event = threading.Event()
        self.state_lock = threading.Lock()
        self.latest_value = ""
        self.error_message = "Waiting for scale data"
        self.connected = False
        self.thread = threading.Thread(target=self._run, daemon=True)

    def start(self):
        self.thread.start()

    def stop(self):
        self.stop_event.set()
        self.thread.join(timeout=self.config[6] + 0.5)

    def snapshot(self, wait_seconds):
        if not self.value_event.is_set():
            self.value_event.wait(timeout=max(float(wait_seconds or 0), 0.1))
        with self.state_lock:
            if self.connected and self.latest_value:
                return {"status": "success", "message": "Connected", "value": self.latest_value}
            return {"status": "not_connected", "message": self.error_message, "value": ""}

    def _set_value(self, value):
        with self.state_lock:
            self.latest_value = value
            self.connected = True
            self.error_message = ""
        self.value_event.set()

    def _set_error(self, message):
        with self.state_lock:
            self.connected = False
            self.error_message = message
        self.value_event.set()

    def _run(self):
        ser = None
        receive_buffer = bytearray()
        port, baud_rate, data_bits, parity, stop_bits, read_timeout, _ = self.config
        try:
            ser = serial.Serial(
                port=port,
                baudrate=baud_rate,
                bytesize=BYTE_SIZE_MAP[int(data_bits)],
                parity=PARITY_MAP[parity],
                stopbits=STOP_BITS_MAP[str(stop_bits)],
                timeout=read_timeout,
            )
            while not self.stop_event.is_set():
                frame = read_complete_serial_frame(
                    ser,
                    timeout_seconds=read_timeout,
                    receive_buffer=receive_buffer,
                )
                if frame:
                    self._set_value(printable_text(frame))
        except (serial.SerialException, OSError, ValueError, KeyError) as error:
            self._set_error(f"Serial connection error: {error}")
        finally:
            if ser is not None and ser.is_open:
                ser.close()


def get_continuous_serial_reader(config):
    global _LIVE_READER
    with _LIVE_READER_LOCK:
        if _LIVE_READER is None or _LIVE_READER.config != config or not _LIVE_READER.thread.is_alive():
            if _LIVE_READER is not None:
                _LIVE_READER.stop()
            _LIVE_READER = ContinuousSerialReader(config)
            _LIVE_READER.start()
        return _LIVE_READER


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
    del poll_interval, start_character, end_character, start_address, end_address
    effective_timeout = max(float(timeout_seconds or 0), 0.1)
    config = (
        port,
        int(baud_rate),
        int(data_bits),
        parity,
        str(stop_bits),
        min(effective_timeout, 0.25),
        effective_timeout,
    )
    reader = get_continuous_serial_reader(config)
    return reader.snapshot(effective_timeout)


def read_serial_data():
    ser = None
    receive_buffer = bytearray()
    try:
        ser = serial.Serial(
            port=SERIAL_PORT,
            baudrate=BAUD_RATE,
            bytesize=serial.EIGHTBITS,
            parity=serial.PARITY_NONE,
            stopbits=serial.STOPBITS_ONE,
            timeout=READ_TIMEOUT_SECONDS,
        )

        print(f"Connected to {SERIAL_PORT}")
        print("Reading buffered serial data... Press Ctrl+C to stop.")

        while True:
            frame = read_complete_serial_frame(
                ser,
                timeout_seconds=1.0,
                receive_buffer=receive_buffer,
            )
            if frame:
                print_frame(frame)

    except serial.SerialException as error:
        print("Serial Error:", error)
    except KeyboardInterrupt:
        print("\nStopped by user.")
    finally:
        if ser is not None and ser.is_open:
            ser.close()
            print("Serial connection closed.")


if __name__ == "__main__":
    read_serial_data()
