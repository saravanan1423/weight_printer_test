import os
import json
import socket
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path

from werkzeug.serving import make_server


APP_TITLE = "Weighman WMS"
HOST = "127.0.0.1"
START_PORT = 5000
WINDOW_WIDTH = 1280
WINDOW_HEIGHT = 800
DESKTOP_ZOOM = 0.9
START_FULLSCREEN = False


def executable_dir():
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


os.environ.setdefault("WEIGHMAN_DATA_DIR", str(executable_dir()))

from app import app


def find_free_port(start_port=START_PORT):
    port = start_port
    while True:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            try:
                sock.bind((HOST, port))
            except OSError:
                port += 1
                continue
            return port


class FlaskServer:
    def __init__(self, flask_app):
        self.port = find_free_port()
        self.url = f"http://{HOST}:{self.port}"
        self.server = make_server(HOST, self.port, flask_app, threaded=True)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    def start(self):
        self.thread.start()

    def stop(self):
        self.server.shutdown()
        self.thread.join(timeout=2)


def main():
    server = FlaskServer(app)
    server.start()

    try:
        if "--kiosk-print" in sys.argv or os.environ.get("WEIGHMAN_KIOSK_PRINT") == "1":
            if open_chrome_kiosk_printing(server.url):
                return

        try:
            import webview
        except Exception as exc:
            run_browser_fallback(server, f"PyWebView is not available: {exc}")
            return

        window = webview.create_window(
            APP_TITLE,
            server.url,
            width=WINDOW_WIDTH,
            height=WINDOW_HEIGHT,
            min_size=(1024, 680),
            fullscreen=START_FULLSCREEN,
        )

        def apply_default_zoom():
            try:
                window.maximize()
            except Exception:
                pass
            scaled_size = 100 / DESKTOP_ZOOM
            window.evaluate_js(
                f"""
                (() => {{
                  const styleId = "pywebview-desktop-zoom";
                  document.getElementById(styleId)?.remove();
                  const style = document.createElement("style");
                  style.id = styleId;
                  style.textContent = `
                    body {{
                      overflow: hidden;
                    }}

                    .app {{
                      width: {scaled_size}vw !important;
                      height: {scaled_size}vh !important;
                      transform: scale({DESKTOP_ZOOM});
                      transform-origin: top left;
                    }}
                  `;
                  document.head.appendChild(style);
                }})();
                """
            )

        window.events.loaded += apply_default_zoom
        try:
            webview.start(debug=False)
        except Exception as exc:
            run_browser_fallback(server, f"PyWebView runtime failed: {exc}")
    finally:
        server.stop()


def chrome_executable_candidates():
    local_app_data = os.environ.get("LOCALAPPDATA", "")
    program_files = os.environ.get("PROGRAMFILES", "")
    program_files_x86 = os.environ.get("PROGRAMFILES(X86)", "")
    return [
        Path(program_files_x86) / "Microsoft" / "Edge" / "Application" / "msedge.exe",
        Path(program_files) / "Microsoft" / "Edge" / "Application" / "msedge.exe",
        Path(local_app_data) / "Google" / "Chrome" / "Application" / "chrome.exe",
        Path(program_files) / "Google" / "Chrome" / "Application" / "chrome.exe",
        Path(program_files_x86) / "Google" / "Chrome" / "Application" / "chrome.exe",
    ]


def find_chrome_executable():
    for candidate in chrome_executable_candidates():
        if candidate and candidate.exists():
            return candidate
    return None


def open_chrome_kiosk_printing(url):
    chrome_path = find_chrome_executable()
    if chrome_path is None:
        return False

    profile_dir = executable_dir() / "chrome_print_profile"
    profile_dir.mkdir(parents=True, exist_ok=True)
    configure_chrome_print_preferences(profile_dir)
    subprocess.Popen(
        [
            str(chrome_path),
            f"--user-data-dir={profile_dir}",
            "--kiosk-printing",
            "--new-window",
            f"--app={url}",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    return True


def get_configured_browser_printer_name():
    try:
        from admin_config import get_default_printer_name
        with app.app_context():
            printer_name = str(get_default_printer_name() or "").strip()
    except Exception:
        return ""
    return "" if printer_name == "Default Printer" else printer_name


def configure_chrome_print_preferences(profile_dir):
    printer_name = get_configured_browser_printer_name()
    if not printer_name:
        return

    default_profile_dir = profile_dir / "Default"
    default_profile_dir.mkdir(parents=True, exist_ok=True)
    preferences_path = default_profile_dir / "Preferences"
    preferences = {}
    if preferences_path.exists():
        try:
            preferences = json.loads(preferences_path.read_text(encoding="utf-8") or "{}")
        except Exception:
            preferences = {}

    app_state = {
        "version": 2,
        "isHeaderFooterEnabled": False,
        "isCssBackgroundEnabled": True,
        "selectedDestinationId": printer_name,
        "recentDestinations": [
            {
                "id": printer_name,
                "origin": "local",
                "account": "",
            }
        ],
    }
    printing = preferences.setdefault("printing", {})
    sticky = printing.setdefault("print_preview_sticky_settings", {})
    sticky["appState"] = json.dumps(app_state, separators=(",", ":"))
    preferences_path.write_text(json.dumps(preferences, indent=2), encoding="utf-8")


def run_browser_fallback(server, reason):
    if not open_chrome_kiosk_printing(server.url):
        webbrowser.open(server.url)

    try:
        from tkinter import Button, Label, Tk
    except Exception:
        try:
            import ctypes
            ctypes.windll.user32.MessageBoxW(
                None,
                f"Weighman WMS is running in your browser.\n\n{reason}\n\nKeep this app open while using it.",
                APP_TITLE,
                0x40,
            )
        except Exception:
            pass
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            return

    root = Tk()
    root.title(APP_TITLE)
    root.geometry("420x160")
    root.resizable(False, False)
    root.protocol("WM_DELETE_WINDOW", root.destroy)

    Label(
        root,
        text="Weighman WMS is running in your browser.",
        font=("Segoe UI", 11, "bold"),
        pady=12,
    ).pack()
    Label(
        root,
        text=f"{reason}\n\nKeep this window open while using the app.",
        wraplength=380,
        justify="center",
        font=("Segoe UI", 9),
    ).pack()
    Button(root, text="Open App", command=lambda: webbrowser.open(server.url), width=14).pack(pady=8)

    root.mainloop()
    time.sleep(.2)


if __name__ == "__main__":
    main()
