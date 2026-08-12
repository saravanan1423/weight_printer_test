# Dot Matrix Raw Line Generation, ESC/P Formatting, and Windows Printing
import subprocess
import tempfile
import sys
from pathlib import Path
from ..common import (
    DOT_MATRIX_RAW_GRID_SIZE,
    DOT_MATRIX_RAW_MAX_LINES,
    DOT_MATRIX_OPTIONAL_STRUCTURAL_BLOCKS,
    number_to_words_inr,
)
from .layout import default_dot_matrix_field_rows

def get_windows_default_printer():
    try:
        import win32print
        return win32print.GetDefaultPrinter()
    except Exception:
        pass
    try:
        import ctypes
        from ctypes import wintypes
        winspool = ctypes.WinDLL("winspool.drv", use_last_error=True)
        buf_size = wintypes.DWORD(0)
        winspool.GetDefaultPrinterW(None, ctypes.byref(buf_size))
        if buf_size.value > 0:
            buf = ctypes.create_unicode_buffer(buf_size.value)
            if winspool.GetDefaultPrinterW(buf, ctypes.byref(buf_size)):
                return buf.value
    except Exception:
        pass
    return ""


def get_available_windows_printers():
    printers = []
    try:
        import win32print
        raw_list = win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS)
        for p in raw_list:
            name = p[2]
            if name and name not in printers:
                printers.append(name)
    except Exception:
        pass

    if not printers:
        try:
            import ctypes
            from ctypes import wintypes
            winspool = ctypes.WinDLL("winspool.drv", use_last_error=True)
            class PRINTER_INFO_4W(ctypes.Structure):
                _fields_ = [
                    ("pPrinterName", wintypes.LPWSTR),
                    ("pServerName", wintypes.LPWSTR),
                    ("Attributes", wintypes.DWORD),
                ]
            flags = 0x00000002 | 0x00000004
            needed = wintypes.DWORD(0)
            returned = wintypes.DWORD(0)
            winspool.EnumPrintersW(flags, None, 4, None, 0, ctypes.byref(needed), ctypes.byref(returned))
            if needed.value > 0:
                buffer = ctypes.create_string_buffer(needed.value)
                if winspool.EnumPrintersW(flags, None, 4, buffer, needed, ctypes.byref(needed), ctypes.byref(returned)):
                    printers_struct = ctypes.cast(buffer, ctypes.POINTER(PRINTER_INFO_4W * returned.value)).contents
                    for printer in printers_struct:
                        name = str(printer.pPrinterName or "").strip()
                        if name and name not in printers:
                            printers.append(name)
        except Exception:
            pass

    if not printers:
        try:
            import subprocess
            res = subprocess.run(
                ["powershell", "-NoProfile", "-Command", "Get-Printer | Select-Object -ExpandProperty Name"],
                capture_output=True,
                text=True,
                timeout=4,
            )
            for line in res.stdout.splitlines():
                line = line.strip()
                if line and line not in printers:
                    printers.append(line)
        except Exception:
            pass

    return sorted(printers, key=str.casefold)


def resolve_windows_printer_name(requested_name=None):
    printers = get_available_windows_printers()
    if not printers:
        return str(requested_name or "").strip()

    clean = str(requested_name or "").strip()
    if clean and clean.lower() not in {"", "default printer", "default windows printer", "loading windows printers..."}:
        for p in printers:
            if p == clean:
                return p
        for p in printers:
            if p.lower() == clean.lower():
                return p
        for p in printers:
            if clean.lower() in p.lower() or p.lower() in clean.lower():
                return p

    win_def = get_windows_default_printer()
    if win_def:
        for p in printers:
            if p.lower() == win_def.lower():
                return p
        return win_def

    return printers[0] if printers else clean


def _spool_raw_bytes(target_printer, data_bytes, doc_title):
    raw_bytes = bytes(data_bytes)
    try:
        import win32print
        hPrinter = win32print.OpenPrinter(target_printer)
        try:
            hJob = win32print.StartDocPrinter(hPrinter, 1, (doc_title, None, "RAW"))
            try:
                win32print.StartPagePrinter(hPrinter)
                win32print.WritePrinter(hPrinter, raw_bytes)
                win32print.EndPagePrinter(hPrinter)
            finally:
                win32print.EndDocPrinter(hPrinter)
        finally:
            win32print.ClosePrinter(hPrinter)
        return True, f"Print job sent to {target_printer}"
    except Exception as win32_err:
        try:
            import ctypes
            from ctypes import wintypes
            winspool = ctypes.WinDLL("winspool.drv", use_last_error=True)
            class DOC_INFO_1W(ctypes.Structure):
                _fields_ = [
                    ("pDocName", wintypes.LPWSTR),
                    ("pOutputFile", wintypes.LPWSTR),
                    ("pDatatype", wintypes.LPWSTR),
                ]
            h_printer = wintypes.HANDLE()
            if not winspool.OpenPrinterW(target_printer, ctypes.byref(h_printer), None):
                err = ctypes.get_last_error()
                return False, f"Failed to open printer '{target_printer}' (Error {err})"
            try:
                doc_info = DOC_INFO_1W(doc_title, None, "RAW")
                job_id = winspool.StartDocPrinterW(h_printer, 1, ctypes.byref(doc_info))
                if not job_id:
                    err = ctypes.get_last_error()
                    return False, f"Failed to start print doc on '{target_printer}' (Error {err})"
                try:
                    winspool.StartPagePrinter(h_printer)
                    bytes_written = wintypes.DWORD(0)
                    buf = (ctypes.c_char * len(raw_bytes)).from_buffer_copy(raw_bytes)
                    ok = winspool.WritePrinter(h_printer, buf, len(raw_bytes), ctypes.byref(bytes_written))
                    if not ok:
                        err = ctypes.get_last_error()
                        return False, f"Failed to write to printer '{target_printer}' (Error {err})"
                    winspool.EndPagePrinter(h_printer)
                finally:
                    winspool.EndDocPrinter(h_printer)
            finally:
                winspool.ClosePrinter(h_printer)
            return True, f"Print job sent to {target_printer}"
        except Exception as e:
            return False, str(e)


def spool_raw_data_to_printer(printer_name, data_bytes, doc_title="Weighbridge Slip"):
    """Spool raw byte payload directly to Windows printer with automatic name resolution and fallback."""
    target_printer = resolve_windows_printer_name(printer_name)
    if not target_printer:
        return False, "No valid Windows printer found on this system"

    success, message = _spool_raw_bytes(target_printer, data_bytes, doc_title)
    if not success and target_printer != get_windows_default_printer():
        # Fallback retry to system default
        def_printer = get_windows_default_printer()
        if def_printer and def_printer != target_printer:
            retry_ok, retry_msg = _spool_raw_bytes(def_printer, data_bytes, doc_title)
            if retry_ok:
                return True, retry_msg, def_printer

    return success, message, target_printer




def generate_dot_matrix_raw_lines(entry_data, layout=None, line_width=None, feed_mode=None, extra_lines=None, total_lines=None):
    """
    Generates exact monospace ASCII lines for Dot Matrix slip from weighment entry and layout.
    Page length (total_lines) is user-configurable in RAW Studio; defaults to layout's saved total lines or 40.
    """
    entry = entry_data or {}
    layout_obj = layout if isinstance(layout, dict) else {}

    resolved_total_lines = total_lines if total_lines is not None else (layout_obj.get("rawTotalLines") or layout_obj.get("totalLines") or DOT_MATRIX_RAW_GRID_SIZE)
    grid_size = max(10, min(DOT_MATRIX_RAW_MAX_LINES, int(resolved_total_lines)))

    resolved_line_width = line_width if line_width is not None else (layout_obj.get("rawLineWidth") or 80)
    width = max(40, min(136, int(resolved_line_width)))

    feed_mode = feed_mode if feed_mode is not None else (layout_obj.get("rawFeedMode") or "auto_40")
    extra_lines = extra_lines if extra_lines is not None else (layout_obj.get("rawExtraLines") or 2)

    raw_positions = layout_obj.get("rawBlockPositions") if isinstance(layout_obj.get("rawBlockPositions"), dict) else {}
    is_blank = (
        layout_obj.get("templateKind") == "blank_canvas"
        if isinstance(layout_obj, dict) else False
    )

    # These free-text blocks are owned entirely by RAW Studio (layout["rawHeaderText"]),
    # edited in place directly in the grid — never inherited from the Visual
    # Editor's elements, so nothing here ever shows hardcoded demo text.
    header_text = layout.get("rawHeaderText") if isinstance(layout, dict) and isinstance(layout.get("rawHeaderText"), dict) else {}
    company_name = str(header_text.get("companyName") or "")
    company_subtitle = str(header_text.get("companySubtitle") or "")
    company_contact = str(header_text.get("companyContact") or "")
    doc_title = str(header_text.get("docTitle") or "")
    remarks_text = str(header_text.get("remarksText") or "")
    left_sign = str(header_text.get("leftSign") or "")
    right_sign = str(header_text.get("rightSign") or "")

    # For non-blank templates without custom rawHeaderText, fall back to static text in elements
    if not is_blank and isinstance(layout, dict):
        elements_map = {}
        for el in layout.get("elements", []):
            if isinstance(el, dict) and el.get("id"):
                elements_map[el["id"]] = el.get("text", "")

        if not company_name:
            company_name = elements_map.get("dot-company-name", "")
        if not company_subtitle:
            company_subtitle = elements_map.get("dot-company-address", "")
        if not company_contact:
            company_contact = elements_map.get("dot-company-contact", "")
        if not doc_title:
            doc_title = elements_map.get("dot-ticket-title", "")
        if not remarks_text:
            remarks_text = elements_map.get("dot-footer-remarks", "")
        if not left_sign:
            left_sign = elements_map.get("dot-driver-sign", "")
        if not right_sign:
            right_sign = elements_map.get("dot-operator-sign", "")

    # Dividers, the weight box, and net-in-words are optional structural blocks:
    # unspecified (None) means "all on" — the regular default template's
    # long-standing look — but a blank-canvas template sets an explicit (often
    # empty) list, so nothing is forced onto a from-scratch ticket.
    structural_blocks = layout.get("rawStructuralBlocks") if isinstance(layout, dict) else None
    if structural_blocks is None and is_blank:
        structural_blocks = []

    def is_structural_enabled(block_id):
        return True if structural_blocks is None else block_id in structural_blocks

    # Blocks are built independently, keyed by id, so they can be freely positioned
    # anywhere on the 40-line ticket via layout["rawBlockPositions"] (drag-and-drop
    # in RAW Studio) — unplaced blocks fall back to default_order top-to-bottom.
    blocks = {}
    default_order = []

    def add_block(block_id, block_lines):
        blocks[block_id] = list(block_lines)
        default_order.append(block_id)

    # 1. Header — only add if non-empty OR explicitly positioned on grid
    if company_name.strip() or ("header-company-name" in raw_positions):
        add_block("header-company-name", [company_name.upper()[:width].center(width)])
    if company_subtitle.strip() or ("header-company-subtitle" in raw_positions):
        add_block("header-company-subtitle", [company_subtitle[:width].center(width)])
    if company_contact.strip() or ("header-company-contact" in raw_positions):
        add_block("header-company-contact", [company_contact[:width].center(width)])
    if is_structural_enabled("divider-top"):
        add_block("divider-top", ["-" * width])
    if doc_title.strip() or ("doc-title" in raw_positions):
        add_block("doc-title", [doc_title[:width].center(width)])
    if is_structural_enabled("divider-mid"):
        add_block("divider-mid", ["-" * width])

    # 2. Key-Value Info Fields (dynamic rows, mirrors the Visual Editor's field rows exactly)
    def resolve_field_source_value(source):
        source = str(source or "")
        if source.startswith("custom:"):
            custom_fields = entry.get("customFields") if isinstance(entry.get("customFields"), dict) else {}
            return custom_fields.get(source[len("custom:"):], "")
        return entry.get(source)

    def format_field_display_value(source, value):
        if value in (None, ""):
            return ""
        source = str(source or "")
        text = str(value).strip()
        if source.endswith("Date") and len(text) == 10 and text[4] == "-" and text[7] == "-":
            return f"{text[8:10]}-{text[5:7]}-{text[0:4]}"
        if source == "charges":
            try:
                return f"{float(text.replace(',', '')):.2f}"
            except (TypeError, ValueError):
                return text
        if source.endswith("Weight"):
            try:
                return f"{int(float(text.replace('kg', '').strip()))}"
            except (TypeError, ValueError):
                return text
        return text

    def collect_dot_matrix_field_rows(layout):
        # Each field row can live in its own managedSections entry (the Visual
        # Editor positions rows independently by y), so fieldRows alone (which is
        # only the first section) would silently drop any extra rows. An empty
        # list here is a real, intentional "no field rows" state (e.g. the blank
        # empty template) — it must NOT silently fall back to the hardcoded
        # defaults; only a genuinely absent layout does that.
        if isinstance(layout, dict):
            sections = layout.get("managedSections")
            if isinstance(sections, list):
                ordered_sections = sorted(
                    (section for section in sections if isinstance(section, dict)),
                    key=lambda section: float(section.get("y") or 0),
                )
                return [
                    row
                    for section in ordered_sections
                    for row in (section.get("rows") or [])
                    if isinstance(row, dict)
                ]
            field_rows = layout.get("fieldRows")
            if isinstance(field_rows, list):
                return field_rows
        return default_dot_matrix_field_rows()

    def compose_row_line(fields, width):
        # Each piece prints at its own explicit column (set by dragging it in RAW
        # Studio), so spacing between pieces on a line is entirely up to the user —
        # nothing here imposes an automatic gap. Pieces without an explicit column
        # fall back to equal-width slots purely so a freshly added field has a
        # sane starting position before the user drags it where they want it.
        chars = [" "] * width
        default_col_w = max(10, width // max(1, len(fields)))
        for index, field in enumerate(fields):
            if str(field.get("kind", "")) == "text":
                text = str(field.get("text", "")).strip()
            else:
                label = str(field.get("label", "")).strip()
                display_value = format_field_display_value(field.get("source"), resolve_field_source_value(field.get("source")))
                text = f"{label}: {display_value}" if label else display_value

            col = field.get("col")
            if isinstance(col, (int, float)) and not isinstance(col, bool):
                start = max(0, min(width - 1, int(col)))
            else:
                start = index * default_col_w

            for offset, ch in enumerate(text):
                pos = start + offset
                if pos >= width:
                    break
                chars[pos] = ch

        return "".join(chars)

    field_rows = collect_dot_matrix_field_rows(layout)
    for row_index, row in enumerate(field_rows):
        fields = row.get("fields") if isinstance(row, dict) else None
        if not fields:
            add_block(f"field-row-{row_index}", [])
            continue
        add_block(f"field-row-{row_index}", [compose_row_line(fields, width)])

    # 3. Weights Box — the label text is owned by RAW Studio (layout["rawHeaderText"]),
    # edited directly in the grid; no hardcoded demo labels/weights/times.
    weight_boxes = [
        {"label": str(header_text.get("grossLabel") or ""), "source": "grossWeight", "timeSource": "grossTime", "fallback": "", "fallbackTime": ""},
        {"label": str(header_text.get("tareLabel") or ""), "source": "tareWeight", "timeSource": "tareTime", "fallback": "", "fallbackTime": ""},
        {"label": str(header_text.get("netLabel") or ""), "source": "netWeight", "timeSource": "", "fallback": "", "fallbackTime": ""},
    ]
    if isinstance(layout, dict):
        elements_by_id = {
            str(el.get("id", "")): el
            for el in layout.get("elements", [])
            if isinstance(el, dict)
        }
        for index, box_id in enumerate(("weight-1", "weight-2", "weight-3")):
            el = elements_by_id.get(box_id)
            if not isinstance(el, dict):
                continue
            source = str(el.get("source", "")).strip()
            if source:
                weight_boxes[index]["source"] = source
            meta_sources = el.get("metaSources")
            weight_boxes[index]["timeSource"] = str(meta_sources[0]) if isinstance(meta_sources, list) and meta_sources else ""

    if is_structural_enabled("divider-pre-weight"):
        add_block("divider-pre-weight", ["-" * width])

    # 3 columns across line_width - 4 pipes
    col1_w = 25
    col2_w = 25
    col3_w = max(10, width - 4 - col1_w - col2_w)
    col_widths = [col1_w, col2_w, col3_w]

    header_cells = []
    value_cells = []
    time_cells = []
    net = ""
    for index, box in enumerate(weight_boxes):
        col_w = col_widths[index]
        header_cells.append(box["label"].upper()[:col_w].center(col_w))

        raw_value = entry.get(box["source"])
        weight_text = str(raw_value if raw_value not in (None, "") else box["fallback"]).replace("kg", "").strip()
        try:
            weight_fmt = str(int(float(weight_text))) if weight_text else ""
        except (TypeError, ValueError):
            weight_fmt = weight_text
        if box["source"] == "netWeight" or index == 2:
            net = weight_fmt
        value_cells.append((f"{weight_fmt} kg" if weight_fmt else "").center(col_w))

        if box["timeSource"]:
            time_value = str(entry.get(box["timeSource"]) or box["fallbackTime"])
            time_cells.append((f"Time: {time_value}" if time_value else "").center(col_w))
        else:
            time_cells.append("".center(col_w))

    if is_structural_enabled("weight-box"):
        add_block(
            "weight-box",
            [
                "|" + "|".join(header_cells) + "|",
                "|" + "|".join(value_cells) + "|",
                "|" + "|".join(time_cells) + "|",
            ],
        )
    if is_structural_enabled("divider-post-weight"):
        add_block("divider-post-weight", ["-" * width])

    # 4. Net in Words (computed from the net weight — not free text)
    if is_structural_enabled("net-in-words"):
        net_in_words = str(entry.get("netInWords") or entry.get("net_in_words") or "")
        if not net_in_words and net:
            net_in_words = number_to_words_inr(net)
        clean_words = ""
        if net_in_words:
            clean_words = f"({net_in_words.strip()})" if not net_in_words.strip().startswith("(") else net_in_words.strip()
        add_block("net-in-words", [clean_words[:width].center(width)])

    # 5. Remarks — only add if non-empty OR explicitly positioned on grid
    if remarks_text.strip() or ("remarks" in raw_positions):
        add_block("remarks", [remarks_text[:width]])

    # 6. Signatures — only add if non-empty OR explicitly positioned on grid
    if (left_sign.strip() or right_sign.strip()) or ("signatures" in raw_positions):
        sign_half = width // 2
        sign_line = f"{left_sign[:sign_half].ljust(sign_half)}{right_sign[:sign_half].rjust(sign_half)}"
        add_block("signatures", ["", "", sign_line])

    # 7. Place every block on the configurable-length grid (grid_size lines,
    # default 40). Blocks the user has dragged to a specific row
    # (layout["rawBlockPositions"]) land there — or at the nearest free run of
    # rows if that spot collides with something else — so gaps left on purpose
    # stay empty instead of being compacted away.
    raw_positions = layout.get("rawBlockPositions") if isinstance(layout, dict) and isinstance(layout.get("rawBlockPositions"), dict) else {}
    grid = [None] * grid_size
    owners = [None] * grid_size
    placed_lines = {}

    def place_block(block_id, requested_line=None):
        block_lines = blocks.get(block_id) or []
        height = len(block_lines)
        if height == 0 or height > grid_size:
            return
        start = 0
        if requested_line:
            start = max(0, min(grid_size - height, int(requested_line) - 1))
        idx = start
        while idx <= grid_size - height and any(grid[idx + offset] is not None for offset in range(height)):
            idx += 1
        if idx > grid_size - height:
            idx = start - 1
            while idx >= 0 and any(grid[idx + offset] is not None for offset in range(height)):
                idx -= 1
            if idx < 0:
                return
        for offset, text in enumerate(block_lines):
            grid[idx + offset] = text
            owners[idx + offset] = block_id
        placed_lines[block_id] = idx + 1

    explicit_ids = sorted(
        (block_id for block_id in raw_positions if blocks.get(block_id)),
        key=lambda block_id: (
            float(raw_positions[block_id]) if isinstance(raw_positions[block_id], (int, float)) else 999,
            default_order.index(block_id) if block_id in default_order else len(default_order),
        ),
    )
    for block_id in explicit_ids:
        place_block(block_id, raw_positions[block_id])

    remaining_order = [block_id for block_id in default_order if block_id not in placed_lines]
    remaining_order.extend(block_id for block_id in blocks if block_id not in placed_lines and block_id not in remaining_order)
    for block_id in remaining_order:
        place_block(block_id)

    occupied_indexes = [index for index, value in enumerate(grid) if value is not None]
    content_count = (max(occupied_indexes) + 1) if occupied_indexes else 0
    grid_lines = ["" if value is None else value for value in grid]

    mode = str(feed_mode or "auto_40").lower()
    if "36" in mode or mode == "auto_36":
        final_lines = grid_lines[:36]
        final_owners = owners[:36]
        content_count = min(content_count, 36)
    elif "stop" in mode or mode == "stop_0":
        final_lines = grid_lines[:content_count]
        final_owners = owners[:content_count]
    elif "extra" in mode or mode == "custom":
        extra_count = max(0, min(30, int(extra_lines or 2)))
        final_lines = grid_lines[:content_count] + [""] * extra_count
        final_owners = owners[:content_count] + [None] * extra_count
    else:
        final_lines = grid_lines
        final_owners = owners

    return content_count, final_lines, final_owners




def escp_font_select_command(layout):
    """Map the layout's chosen font family, weight, and size/CPI to ESC/P commands for the dot matrix printer."""
    cmd = bytearray()
    font_family = ""
    font_weight = 400
    cpi = 10

    if isinstance(layout, dict):
        defaults = layout.get("defaults")
        if isinstance(defaults, dict):
            font_family = str(defaults.get("fontFamily") or "").strip()
            font_weight = int(defaults.get("fontWeight") or 400)
            cpi = int(defaults.get("cpi") or 10)
        sections = layout.get("managedSections") or []
        for s in sections:
            rows = s.get("rows") or []
            for r in rows:
                if not font_family and r.get("fontFamily"):
                    font_family = str(r.get("fontFamily")).strip()
                if font_weight == 400 and r.get("fontWeight"):
                    font_weight = int(r.get("fontWeight"))
                if cpi == 10 and r.get("cpi"):
                    cpi = int(r.get("cpi"))
                for f in r.get("fields") or []:
                    if not font_family and f.get("fontFamily"):
                        font_family = str(f.get("fontFamily")).strip()
                    if font_weight == 400 and f.get("fontWeight"):
                        font_weight = int(f.get("fontWeight"))
                    if cpi == 10 and f.get("cpi"):
                        cpi = int(f.get("cpi"))

    is_draft = font_family in ("", "Dot Matrix Draft")
    # ESC x: Draft (0) vs NLQ (1)
    cmd.extend([0x1B, 0x78, 0x00 if is_draft else 0x01])

    # Font family selection via ESC k (0=Roman, 1=Sans, 2=Courier)
    if not is_draft:
        lower_fam = font_family.lower()
        if any(c in lower_fam for c in ("courier", "consolas", "lucida", "mono")):
            cmd.extend([0x1B, 0x6B, 0x02])  # Courier
        elif any(s in lower_fam for s in ("arial", "calibri", "verdana", "tahoma", "trebuchet", "sans", "blok")):
            cmd.extend([0x1B, 0x6B, 0x01])  # Sans Serif
        else:
            cmd.extend([0x1B, 0x6B, 0x00])  # Roman

    # Font Weight: ESC E (Emphasized/Bold ON) / ESC F (OFF) or ESC G (Double-strike)
    if font_weight >= 700:
        cmd.extend([0x1B, 0x45])  # ESC E (Emphasized ON)
        if font_weight >= 900:
            cmd.extend([0x1B, 0x47])  # ESC G (Double-strike ON)
    else:
        cmd.extend([0x1B, 0x46])  # ESC F (Emphasized OFF)
        cmd.extend([0x1B, 0x48])  # ESC H (Double-strike OFF)

    # Character Pitch (CPI):
    if cpi <= 5:
        cmd.extend([0x1B, 0x57, 0x01])  # ESC W 1 (Expanded / Double-Wide ON - 5 CPI)
        cmd.extend([0x1B, 0x50])        # ESC P (10 CPI base * 2 = 5 CPI)
    elif cpi == 6:
        cmd.extend([0x1B, 0x57, 0x01])  # ESC W 1 (Expanded ON - 6 CPI)
        cmd.extend([0x1B, 0x4D])        # ESC M (12 CPI base * 2 = 6 CPI)
    elif cpi == 7:
        cmd.extend([0x1B, 0x57, 0x01])  # ESC W 1 (Expanded ON - 7.5 CPI)
        cmd.extend([0x1B, 0x67])        # ESC g (15 CPI base * 2 = 7.5 CPI)
    elif cpi == 8:
        cmd.extend([0x1B, 0x57, 0x01])  # ESC W 1 (Expanded ON - 8.5 CPI)
        cmd.extend([0x0F])              # SI (17 CPI base * 2 = 8.5 CPI)
    elif cpi == 9:
        cmd.extend([0x1B, 0x57, 0x00])  # ESC W 0 (Expanded OFF)
        cmd.extend([0x1B, 0x20, 0x02])  # ESC SP 2 (Inter-character space)
        cmd.extend([0x1B, 0x50])        # ESC P (10 CPI base)
    elif cpi == 12:
        cmd.extend([0x1B, 0x57, 0x00])  # ESC W 0 (Expanded OFF)
        cmd.extend([0x1B, 0x4D])        # ESC M (12 CPI Elite)
    elif cpi == 15:
        cmd.extend([0x1B, 0x57, 0x00])  # ESC W 0 (Expanded OFF)
        cmd.extend([0x1B, 0x67])        # ESC g (15 CPI)
    elif cpi >= 17:
        cmd.extend([0x1B, 0x57, 0x00])  # ESC W 0 (Expanded OFF)
        cmd.extend([0x0F])              # SI (17/20 CPI Condensed)
    else:
        cmd.extend([0x1B, 0x57, 0x00])  # ESC W 0 (Expanded OFF)
        cmd.extend([0x12])              # DC2 (Cancel condensed)
        cmd.extend([0x1B, 0x50])        # ESC P (10 CPI Standard)

    return bytes(cmd)


