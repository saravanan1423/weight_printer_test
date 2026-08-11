"""
PDF Text Configurator & Direct Print Utility
A standalone Tkinter application to configure custom text, header layout,
key-value data fields, paper sizing, and print/render to PDF and Dot Matrix RAW printer.
"""

import os
import sys
import json
import subprocess
from datetime import datetime
import tkinter as tk
from tkinter import ttk, messagebox, filedialog

# Try importing ttkbootstrap for modern UI styling, fallback to standard ttk
try:
    import ttkbootstrap as bstrap
    USE_BOOTSTRAP = True
except ImportError:
    USE_BOOTSTRAP = False

# Try importing win32print for listing Windows printers & RAW spooling
try:
    import win32print
    import win32api
    HAS_WIN32PRINT = True
except ImportError:
    HAS_WIN32PRINT = False

# Try importing ReportLab for high quality PDF generation
try:
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import A4, A5, LETTER, LEGAL, landscape
    from reportlab.lib.units import inch, mm
    from reportlab.lib.utils import simpleSplit
    HAS_REPORTLAB = True
except ImportError:
    HAS_REPORTLAB = False


# Default configuration preset
DEFAULT_CONFIG = {
    "paper": {
        "size": "6-Inch Continuous (8.5 x 6 in / Weighbridge Fanfold)",
        "orientation": "Horizontal (0° - Normal Left-to-Right)",
        "driver_orientation": "Landscape",
        "custom_width_mm": 216,
        "custom_height_mm": 152,
        "margin_mm": 10
    },
    "header": {
        "company_name": "ABC WEIGHBRIDGE & LOGISTICS",
        "company_subtitle": "Industrial Area, Phase-II, Highway Road",
        "company_contact": "Phone: +91 98765 43210 | GSTIN: 33AAAAA0000A1Z5",
        "doc_title": "WEIGHMENT SLIP / RECEIPT",
        "align": "Center",
        "font_family": "Helvetica",
        "header_font_size": 14,
        "title_font_size": 12,
        "show_separator": True
    },
    "layout_columns": 2,
    "fields": [
        {"key": "serial_no", "label": "Slip / Bill No", "value": "WB-2026-0042", "bold": True, "span_full": False},
        {"key": "date_time", "label": "Date & Time", "value": datetime.now().strftime("%d-%m-%Y %H:%M:%S"), "bold": False, "span_full": False},
        {"key": "vehicle_no", "label": "Vehicle Number", "value": "TN 38 BX 9876", "bold": True, "span_full": False},
        {"key": "customer", "label": "Customer Name", "value": "Kaveri Traders Pvt Ltd", "bold": False, "span_full": False},
        {"key": "material", "label": "Material Name", "value": "Iron Scrap Grade-A", "bold": False, "span_full": False},
        {"key": "charges", "label": "Charges (Rs.)", "value": "150.00", "bold": False, "span_full": False},
    ],
    "weights": {
        "enabled": True,
        "gross_weight": "32,450 kg",
        "gross_time": "10:15 AM",
        "tare_weight": "12,200 kg",
        "tare_time": "11:45 AM",
        "net_weight": "20,250 kg",
        "net_in_words": "TWENTY THOUSAND TWO HUNDRED FIFTY KILOGRAMS ONLY"
    },
    "footer": {
        "remarks": "Goods received in good condition. Subject to local jurisdiction.",
        "show_signatures": True,
        "left_sign": "Left Thumb / Driver Sign",
        "right_sign": "Authorized Signatory"
    }
}


class PDFTextConfiguratorApp:
    def __init__(self, root):
        self.root = root
        self.root.title("PDF Text Configurator & Print Studio")
        self.root.geometry("1120x800")
        self.root.minsize(980, 680)

        self.config = json.loads(json.dumps(DEFAULT_CONFIG))
        self.output_pdf_path = os.path.abspath("generated_document.pdf")

        self._init_variables()
        self._build_ui()
        self._load_config_to_ui()

    def _init_variables(self):
        # Header Variables
        self.company_name_var = tk.StringVar()
        self.company_subtitle_var = tk.StringVar()
        self.company_contact_var = tk.StringVar()
        self.doc_title_var = tk.StringVar()
        self.header_align_var = tk.StringVar(value="Center")
        self.font_family_var = tk.StringVar(value="Helvetica")
        self.header_font_size_var = tk.IntVar(value=14)
        self.title_font_size_var = tk.IntVar(value=12)
        self.show_separator_var = tk.BooleanVar(value=True)

        # Paper & Layout Variables
        self.paper_size_var = tk.StringVar(value="6-Inch Continuous (8.5 x 6 in / Weighbridge Fanfold)")
        self.orientation_var = tk.StringVar(value="Horizontal (0° - Normal Left-to-Right)")
        self.driver_orient_var = tk.StringVar(value="Landscape")
        self.custom_w_var = tk.IntVar(value=216)
        self.custom_h_var = tk.IntVar(value=150)
        self.margin_var = tk.IntVar(value=8)
        self.layout_cols_var = tk.IntVar(value=2)
        self.only_page_1_var = tk.BooleanVar(value=True)

        # Weights Box Variables
        self.weights_enabled_var = tk.BooleanVar(value=True)
        self.gross_wt_var = tk.StringVar()
        self.gross_time_var = tk.StringVar()
        self.tare_wt_var = tk.StringVar()
        self.tare_time_var = tk.StringVar()
        self.net_wt_var = tk.StringVar()
        self.net_words_var = tk.StringVar()

        # Footer Variables
        self.remarks_var = tk.StringVar(value="Goods received in good condition.")
        self.show_signs_var = tk.BooleanVar(value=True)
        self.left_sign_var = tk.StringVar(value="Left Thumb / Driver Sign")
        self.right_sign_var = tk.StringVar(value="Authorized Signatory")

        # Dot Matrix RAW Line-by-Line Variables
        self.raw_feed_mode_var = tk.StringVar(value="Auto-Pad to 40 Lines (19 Content + 21 Blank Lines - Default)")
        self.raw_custom_extra_lines_var = tk.IntVar(value=2)
        self.raw_set_6inch_var = tk.BooleanVar(value=True)
        self.raw_send_ff_var = tk.BooleanVar(value=False)
        self.raw_line_width_var = tk.IntVar(value=80)
        self.raw_lines_count_lbl = tk.StringVar(value="Total Lines: 40 lines")

        # Print / Output Variables
        self.printer_var = tk.StringVar()
        self.status_var = tk.StringVar(value="Ready to configure and generate PDF.")

    def _build_ui(self):
        main_frame = ttk.Frame(self.root, padding=10)
        main_frame.pack(fill=tk.BOTH, expand=True)

        # Top Title Bar
        title_bar = ttk.Frame(main_frame)
        title_bar.pack(fill=tk.X, pady=(0, 10))

        title_lbl = ttk.Label(
            title_bar,
            text="📄 PDF & Dot Matrix RAW Print Studio",
            font=("Segoe UI", 15, "bold")
        )
        title_lbl.pack(side=tk.LEFT)

        # Quick action buttons in top bar
        ttk.Button(title_bar, text="📁 Load Preset", command=self._load_preset_file).pack(side=tk.RIGHT, padx=3)
        ttk.Button(title_bar, text="💾 Save Preset", command=self._save_preset_file).pack(side=tk.RIGHT, padx=3)
        ttk.Button(title_bar, text="🔄 Reset Default", command=self._reset_defaults).pack(side=tk.RIGHT, padx=3)

        # Notebook Tabs
        notebook = ttk.Notebook(main_frame)
        notebook.pack(fill=tk.BOTH, expand=True)

        self.tab_header = ttk.Frame(notebook, padding=12)
        self.tab_fields = ttk.Frame(notebook, padding=12)
        self.tab_weights = ttk.Frame(notebook, padding=12)
        self.tab_footer = ttk.Frame(notebook, padding=12)
        self.tab_dotmatrix = ttk.Frame(notebook, padding=12)
        self.tab_preview = ttk.Frame(notebook, padding=12)

        notebook.add(self.tab_header, text="  1. Header & Page  ")
        notebook.add(self.tab_fields, text="  2. Data Fields  ")
        notebook.add(self.tab_weights, text="  3. Weight Summary Box  ")
        notebook.add(self.tab_footer, text="  4. Footer & Remarks  ")
        notebook.add(self.tab_dotmatrix, text="  5. 🖨️ Dot Matrix RAW (Line-by-Line)  ")
        notebook.add(self.tab_preview, text="  6. 📄 PDF Studio & Print  ")

        self._build_header_tab()
        self._build_fields_tab()
        self._build_weights_tab()
        self._build_footer_tab()
        self._build_dotmatrix_tab()
        self._build_preview_tab()

        # Bottom Status Bar
        status_bar = ttk.Frame(main_frame, padding=(5, 5, 5, 0))
        status_bar.pack(fill=tk.X, side=tk.BOTTOM)
        ttk.Label(status_bar, textvariable=self.status_var, font=("Segoe UI", 9, "italic")).pack(side=tk.LEFT)

    # --------------------------------------------------------------------------
    # TAB 1: HEADER & PAGE CONFIGURATION
    # --------------------------------------------------------------------------
    def _build_header_tab(self):
        frame = self.tab_header

        # Paper & Sizing Frame
        paper_box = ttk.LabelFrame(frame, text="Page & Paper Sizing Settings (Orientation & Size)", padding=10)
        paper_box.pack(fill=tk.X, pady=(0, 10))

        row1 = ttk.Frame(paper_box)
        row1.pack(fill=tk.X, pady=4)
        ttk.Label(row1, text="Paper Preset:", width=14, font=("Segoe UI", 9, "bold")).pack(side=tk.LEFT)
        paper_sizes = [
            "6-Inch Continuous (8.5 x 6 in / Weighbridge Fanfold)",
            "A5 Landscape / Half-A4 (210 x 148 mm)",
            "A5 Portrait (148 x 210 mm)",
            "A4 Portrait (210 x 297 mm)",
            "A4 Landscape (297 x 210 mm)",
            "Letter (8.5 x 11 in)",
            "Custom Dimensions (mm)"
        ]
        self.paper_combo = ttk.Combobox(row1, textvariable=self.paper_size_var, values=paper_sizes, state="readonly", width=42)
        self.paper_combo.pack(side=tk.LEFT, padx=5)
        self.paper_combo.bind("<<ComboboxSelected>>", self._on_paper_preset_change)

        ttk.Label(row1, text="Margin (mm):", width=12).pack(side=tk.LEFT, padx=(15, 0))
        ttk.Spinbox(row1, from_=2, to=40, textvariable=self.margin_var, width=6).pack(side=tk.LEFT, padx=5)

        ttk.Label(row1, text="Columns:", width=8).pack(side=tk.LEFT, padx=(15, 0))
        ttk.Spinbox(row1, from_=1, to=3, textvariable=self.layout_cols_var, width=5).pack(side=tk.LEFT, padx=5)

        # Orientation / Direction Row
        row_orient = ttk.Frame(paper_box)
        row_orient.pack(fill=tk.X, pady=4)
        ttk.Label(row_orient, text="Text Orientation:", width=14, font=("Segoe UI", 9, "bold")).pack(side=tk.LEFT)
        orientations = [
            "Horizontal (0° - Normal Left-to-Right)",
            "Rotated 90° Clockwise (Fix Top-to-Bottom Sideways Printing)",
            "Rotated 270° Counter-Clockwise (Fix Reverse Sideways Printing)",
            "Inverted (180° Upside-Down)"
        ]
        ttk.Combobox(row_orient, textvariable=self.orientation_var, values=orientations, state="readonly", width=52).pack(side=tk.LEFT, padx=5)

        # Custom dimensions row
        self.custom_dim_frame = ttk.Frame(paper_box)
        self.custom_dim_frame.pack(fill=tk.X, pady=4)
        ttk.Label(self.custom_dim_frame, text="Custom Width (mm):", width=18).pack(side=tk.LEFT)
        ttk.Spinbox(self.custom_dim_frame, from_=50, to=500, textvariable=self.custom_w_var, width=8).pack(side=tk.LEFT, padx=5)
        ttk.Label(self.custom_dim_frame, text="Custom Height (mm):", width=18).pack(side=tk.LEFT, padx=(15, 0))
        ttk.Spinbox(self.custom_dim_frame, from_=50, to=500, textvariable=self.custom_h_var, width=8).pack(side=tk.LEFT, padx=5)
        ttk.Label(self.custom_dim_frame, text="💡 If your printer prints top-to-bottom, select 'Rotated 90° Clockwise' above!", font=("Segoe UI", 8, "italic"), foreground="#007acc").pack(side=tk.LEFT, padx=10)

        # Header Text Box
        head_box = ttk.LabelFrame(frame, text="Header & Company Details", padding=10)
        head_box.pack(fill=tk.BOTH, expand=True)

        self._add_text_entry(head_box, "Company Name:", self.company_name_var)
        self._add_text_entry(head_box, "Address / Subtitle:", self.company_subtitle_var)
        self._add_text_entry(head_box, "Contact / GSTIN:", self.company_contact_var)
        self._add_text_entry(head_box, "Document Title:", self.doc_title_var)

        # Header Typography & Alignment
        opt_frame = ttk.Frame(head_box)
        opt_frame.pack(fill=tk.X, pady=8)

        ttk.Label(opt_frame, text="Font Family:", width=15).pack(side=tk.LEFT)
        fonts = ["Helvetica", "Courier", "Times-Roman"]
        ttk.Combobox(opt_frame, textvariable=self.font_family_var, values=fonts, state="readonly", width=16).pack(side=tk.LEFT, padx=5)

        ttk.Label(opt_frame, text="Header Size:", width=12).pack(side=tk.LEFT, padx=(15, 0))
        ttk.Spinbox(opt_frame, from_=10, to=30, textvariable=self.header_font_size_var, width=6).pack(side=tk.LEFT, padx=5)

        ttk.Label(opt_frame, text="Title Size:", width=10).pack(side=tk.LEFT, padx=(15, 0))
        ttk.Spinbox(opt_frame, from_=8, to=24, textvariable=self.title_font_size_var, width=6).pack(side=tk.LEFT, padx=5)

        ttk.Label(opt_frame, text="Align:", width=8).pack(side=tk.LEFT, padx=(15, 0))
        ttk.Combobox(opt_frame, textvariable=self.header_align_var, values=["Center", "Left", "Right"], state="readonly", width=10).pack(side=tk.LEFT, padx=5)

        ttk.Checkbutton(head_box, text="Draw horizontal divider line under header", variable=self.show_separator_var).pack(anchor="w", pady=6)

    # --------------------------------------------------------------------------
    # TAB 2: DATA FIELDS (DYNAMIC LIST)
    # --------------------------------------------------------------------------
    def _build_fields_tab(self):
        frame = self.tab_fields

        btn_toolbar = ttk.Frame(frame)
        btn_toolbar.pack(fill=tk.X, pady=(0, 8))

        ttk.Button(btn_toolbar, text="➕ Add Field", command=self._add_field_dialog).pack(side=tk.LEFT, padx=3)
        ttk.Button(btn_toolbar, text="✏️ Edit Field", command=self._edit_field_dialog).pack(side=tk.LEFT, padx=3)
        ttk.Button(btn_toolbar, text="❌ Delete Field", command=self._delete_field).pack(side=tk.LEFT, padx=3)
        ttk.Button(btn_toolbar, text="⬆️ Move Up", command=lambda: self._move_field(-1)).pack(side=tk.LEFT, padx=3)
        ttk.Button(btn_toolbar, text="⬇️ Move Down", command=lambda: self._move_field(1)).pack(side=tk.LEFT, padx=3)

        # Treeview for fields
        tree_frame = ttk.Frame(frame)
        tree_frame.pack(fill=tk.BOTH, expand=True)

        columns = ("label", "value", "bold", "span_full")
        self.fields_tree = ttk.Treeview(tree_frame, columns=columns, show="headings", selectmode="browse")
        self.fields_tree.heading("label", text="Field Label")
        self.fields_tree.heading("value", text="Field Value / Text")
        self.fields_tree.heading("bold", text="Bold")
        self.fields_tree.heading("span_full", text="Full Width Row")

        self.fields_tree.column("label", width=220, anchor="w")
        self.fields_tree.column("value", width=400, anchor="w")
        self.fields_tree.column("bold", width=80, anchor="center")
        self.fields_tree.column("span_full", width=120, anchor="center")

        v_scroll = ttk.Scrollbar(tree_frame, orient="vertical", command=self.fields_tree.yview)
        self.fields_tree.configure(yscrollcommand=v_scroll.set)

        self.fields_tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        v_scroll.pack(side=tk.RIGHT, fill=tk.Y)

        self.fields_tree.bind("<Double-1>", lambda e: self._edit_field_dialog())

    # --------------------------------------------------------------------------
    # TAB 3: WEIGHT SUMMARY BOX
    # --------------------------------------------------------------------------
    def _build_weights_tab(self):
        frame = self.tab_weights

        enable_chk = ttk.Checkbutton(
            frame,
            text="Enable Highlighted Weight Summary Box (Gross / Tare / Net)",
            variable=self.weights_enabled_var
        )
        enable_chk.pack(anchor="w", pady=(0, 10))

        box = ttk.LabelFrame(frame, text="Weight Data Values", padding=15)
        box.pack(fill=tk.BOTH, expand=True)

        # Gross Weight Row
        g_frame = ttk.Frame(box)
        g_frame.pack(fill=tk.X, pady=5)
        ttk.Label(g_frame, text="Gross Weight:", width=18, font=("Segoe UI", 9, "bold")).pack(side=tk.LEFT)
        ttk.Entry(g_frame, textvariable=self.gross_wt_var, width=20).pack(side=tk.LEFT, padx=5)
        ttk.Label(g_frame, text="Gross Time:", width=12).pack(side=tk.LEFT, padx=(20, 0))
        ttk.Entry(g_frame, textvariable=self.gross_time_var, width=15).pack(side=tk.LEFT, padx=5)

        # Tare Weight Row
        t_frame = ttk.Frame(box)
        t_frame.pack(fill=tk.X, pady=5)
        ttk.Label(t_frame, text="Tare Weight:", width=18, font=("Segoe UI", 9, "bold")).pack(side=tk.LEFT)
        ttk.Entry(t_frame, textvariable=self.tare_wt_var, width=20).pack(side=tk.LEFT, padx=5)
        ttk.Label(t_frame, text="Tare Time:", width=12).pack(side=tk.LEFT, padx=(20, 0))
        ttk.Entry(t_frame, textvariable=self.tare_time_var, width=15).pack(side=tk.LEFT, padx=5)

        # Net Weight Row
        n_frame = ttk.Frame(box)
        n_frame.pack(fill=tk.X, pady=5)
        ttk.Label(n_frame, text="Net Weight:", width=18, font=("Segoe UI", 9, "bold")).pack(side=tk.LEFT)
        ttk.Entry(n_frame, textvariable=self.net_wt_var, width=20).pack(side=tk.LEFT, padx=5)

        # Net in Words Row
        w_frame = ttk.Frame(box)
        w_frame.pack(fill=tk.X, pady=5)
        ttk.Label(w_frame, text="Net Weight In Words:", width=18).pack(side=tk.LEFT)
        ttk.Entry(w_frame, textvariable=self.net_words_var).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)

    # --------------------------------------------------------------------------
    # TAB 4: FOOTER & REMARKS
    # --------------------------------------------------------------------------
    def _build_footer_tab(self):
        frame = self.tab_footer

        foot_box = ttk.LabelFrame(frame, text="Remarks & Signature Block (Strictly Fitted on 1 Page)", padding=15)
        foot_box.pack(fill=tk.BOTH, expand=True)

        ttk.Label(foot_box, text="Footer Remarks / Notes Text:").pack(anchor="w", pady=(0, 4))
        ttk.Entry(foot_box, textvariable=self.remarks_var).pack(fill=tk.X, pady=(0, 15))

        # Signatures Frame
        sign_box = ttk.LabelFrame(foot_box, text="Signatures & Thumb Impression (Placed tightly below Remarks)", padding=12)
        sign_box.pack(fill=tk.X, pady=(0, 10))

        ttk.Checkbutton(
            sign_box,
            text="✍️ Enable Signatures & Left Thumb Impression",
            variable=self.show_signs_var
        ).pack(anchor="w", pady=(0, 10))

        row_s1 = ttk.Frame(sign_box)
        row_s1.pack(fill=tk.X, pady=4)
        ttk.Label(row_s1, text="Left Side Label (e.g. Thumb / Driver):", width=30).pack(side=tk.LEFT)
        ttk.Entry(row_s1, textvariable=self.left_sign_var, width=32).pack(side=tk.LEFT, padx=5)

        row_s2 = ttk.Frame(sign_box)
        row_s2.pack(fill=tk.X, pady=4)
        ttk.Label(row_s2, text="Right Side Label (e.g. Authorized Sign):", width=30).pack(side=tk.LEFT)
        ttk.Entry(row_s2, textvariable=self.right_sign_var, width=32).pack(side=tk.LEFT, padx=5)

    # --------------------------------------------------------------------------
    # TAB 5: DOT MATRIX RAW LINE-BY-LINE MODE
    # --------------------------------------------------------------------------
    def _build_dotmatrix_tab(self):
        frame = self.tab_dotmatrix

        # Top Control Box
        top_ctrl = ttk.LabelFrame(frame, text="Dot Matrix Hardware & Line-by-Line Controls", padding=10)
        top_ctrl.pack(fill=tk.X, pady=(0, 10))

        # Row 1: Printer & Width
        r1 = ttk.Frame(top_ctrl)
        r1.pack(fill=tk.X, pady=3)
        ttk.Label(r1, text="Dot Matrix Printer:", width=18, font=("Segoe UI", 9, "bold")).pack(side=tk.LEFT)
        printers = self._get_available_printers()
        self.raw_printer_combo = ttk.Combobox(r1, textvariable=self.printer_var, values=printers, state="readonly", width=34)
        self.raw_printer_combo.pack(side=tk.LEFT, padx=5)

        ttk.Label(r1, text="Line Width (Cols):", width=16).pack(side=tk.LEFT, padx=(15, 0))
        ttk.Spinbox(r1, from_=40, to=136, textvariable=self.raw_line_width_var, width=6).pack(side=tk.LEFT, padx=5)
        ttk.Label(r1, text="(80 cols standard)", font=("Segoe UI", 8, "italic")).pack(side=tk.LEFT, padx=5)

        # Row 2: Stop & Feed Behavior
        r2 = ttk.Frame(top_ctrl)
        r2.pack(fill=tk.X, pady=4)
        ttk.Label(r2, text="Printer Stop Mode:", width=18, font=("Segoe UI", 9, "bold")).pack(side=tk.LEFT)
        feed_modes = [
            "Auto-Pad to 40 Lines (19 Content + 21 Blank Lines - Default)",
            "Stop Immediately After Last Line (0 Extra Lines)",
            "Auto-Pad to 36 Lines (6-Inch Perforation)",
            "Feed Custom Extra Blank Lines"
        ]
        self.raw_feed_combo = ttk.Combobox(r2, textvariable=self.raw_feed_mode_var, values=feed_modes, state="readonly", width=48)
        self.raw_feed_combo.pack(side=tk.LEFT, padx=5)
        self.raw_feed_combo.bind("<<ComboboxSelected>>", lambda e: self.refresh_raw_preview())

        ttk.Label(r2, text="Extra Blank Lines:", width=16).pack(side=tk.LEFT, padx=(10, 0))
        ttk.Spinbox(r2, from_=0, to=15, textvariable=self.raw_custom_extra_lines_var, width=5).pack(side=tk.LEFT, padx=5)

        # Row 3: Hardware ESC/P Options
        r3 = ttk.Frame(top_ctrl)
        r3.pack(fill=tk.X, pady=4)
        ttk.Checkbutton(
            r3,
            text="ESC C 0 6 (Set 6-Inch Page Length)",
            variable=self.raw_set_6inch_var
        ).pack(side=tk.LEFT, padx=(0, 15))

        ttk.Checkbutton(
            r3,
            text="Send Form Feed (FF \\x0C) at End",
            variable=self.raw_send_ff_var
        ).pack(side=tk.LEFT, padx=10)

        # Row 4: Action Buttons
        btn_row = ttk.Frame(top_ctrl)
        btn_row.pack(fill=tk.X, pady=(10, 0))

        ttk.Button(btn_row, text="⚡ 1. Preview & Refresh Lines", command=self.refresh_raw_preview, width=22).pack(side=tk.LEFT, padx=4)
        ttk.Button(btn_row, text="🖨️ 2. Direct RAW Line Print", command=self.print_raw_dot_matrix, width=24).pack(side=tk.LEFT, padx=4)
        ttk.Button(btn_row, text="📄 3. Advance to Perforation", command=self.advance_paper_perforation, width=24).pack(side=tk.LEFT, padx=4)

        # Banner for line count
        self.line_count_banner = ttk.Label(
            top_ctrl,
            textvariable=self.raw_lines_count_lbl,
            font=("Segoe UI", 10, "bold"),
            foreground="#007acc"
        )
        self.line_count_banner.pack(side=tk.RIGHT, padx=10)

        # Preview Frame with Line Numbers
        p_frame = ttk.LabelFrame(frame, text="Live Dot Matrix Slip Preview (Exact Line-by-Line Numbering)", padding=8)
        p_frame.pack(fill=tk.BOTH, expand=True)

        self.raw_preview_text = tk.Text(p_frame, wrap="none", font=("Consolas", 10), bg="#1e1e1e", fg="#d4d4d4", insertbackground="white")
        raw_scroll_y = ttk.Scrollbar(p_frame, orient="vertical", command=self.raw_preview_text.yview)
        raw_scroll_x = ttk.Scrollbar(p_frame, orient="horizontal", command=self.raw_preview_text.xview)
        self.raw_preview_text.config(xscrollcommand=raw_scroll_x.set, yscrollcommand=raw_scroll_y.set)

        raw_scroll_y.pack(side=tk.RIGHT, fill=tk.Y)
        raw_scroll_x.pack(side=tk.BOTTOM, fill=tk.X)
        self.raw_preview_text.pack(fill=tk.BOTH, expand=True)

    # --------------------------------------------------------------------------
    # TAB 6: GENERATE & PRINT (PDF MODE)
    # --------------------------------------------------------------------------
    def _build_preview_tab(self):
        frame = self.tab_preview

        top_ctrl = ttk.LabelFrame(frame, text="Printer & Output Actions", padding=12)
        top_ctrl.pack(fill=tk.X, pady=(0, 10))

        # Printer selector row
        p_row = ttk.Frame(top_ctrl)
        p_row.pack(fill=tk.X, pady=4)
        ttk.Label(p_row, text="Target Printer:", width=15, font=("Segoe UI", 9, "bold")).pack(side=tk.LEFT)

        printers = self._get_available_printers()
        default_printer = printers[0] if printers else "Default Windows Printer"
        self.printer_var.set(default_printer)

        ttk.Combobox(p_row, textvariable=self.printer_var, values=printers, state="readonly", width=38).pack(side=tk.LEFT, padx=5)

        # Blank page prevention toggle & orientation
        opt_row = ttk.Frame(top_ctrl)
        opt_row.pack(fill=tk.X, pady=(6, 0))
        ttk.Checkbutton(
            opt_row,
            text="🛡️ Force Print Page 1 Only",
            variable=self.only_page_1_var
        ).pack(side=tk.LEFT, padx=5)

        ttk.Label(opt_row, text="Driver Spooler Orientation:", font=("Segoe UI", 9, "bold")).pack(side=tk.LEFT, padx=(15, 5))
        ttk.Combobox(opt_row, textvariable=self.driver_orient_var, values=["Landscape", "Portrait", "Auto"], state="readonly", width=12).pack(side=tk.LEFT, padx=5)

        # Action buttons
        btn_row = ttk.Frame(top_ctrl)
        btn_row.pack(fill=tk.X, pady=(12, 0))

        ttk.Button(btn_row, text="⚡ 1. Generate PDF", command=self.generate_pdf, width=18).pack(side=tk.LEFT, padx=5)
        ttk.Button(btn_row, text="👁️ 2. Open PDF", command=self.open_generated_pdf, width=18).pack(side=tk.LEFT, padx=5)
        ttk.Button(btn_row, text="🖨️ 3. Direct Print", command=self.print_pdf_to_printer, width=18).pack(side=tk.LEFT, padx=5)

        # Preview summary log box
        log_box = ttk.LabelFrame(frame, text="Document & Print Settings Summary", padding=10)
        log_box.pack(fill=tk.BOTH, expand=True, pady=(10, 0))

        self.log_text = tk.Text(log_box, wrap="word", font=("Consolas", 10))
        self.log_text.pack(fill=tk.BOTH, expand=True)

    def _on_paper_preset_change(self, event=None):
        preset = self.paper_size_var.get()
        if "6-Inch" in preset:
            self.custom_w_var.set(216)
            self.custom_h_var.set(152)
            self.margin_var.set(8)
            self.orientation_var.set("Horizontal (0° - Normal Left-to-Right)")
            self.driver_orient_var.set("Landscape")
        elif "A5 Landscape" in preset:
            self.custom_w_var.set(210)
            self.custom_h_var.set(148)
            self.margin_var.set(8)
            self.orientation_var.set("Horizontal (0° - Normal Left-to-Right)")
            self.driver_orient_var.set("Landscape")
        elif "A5 Portrait" in preset:
            self.custom_w_var.set(148)
            self.custom_h_var.set(210)
            self.margin_var.set(10)
            self.orientation_var.set("Horizontal (0° - Normal Left-to-Right)")
            self.driver_orient_var.set("Portrait")
        elif "A4 Portrait" in preset:
            self.custom_w_var.set(210)
            self.custom_h_var.set(297)
            self.margin_var.set(15)
            self.orientation_var.set("Horizontal (0° - Normal Left-to-Right)")
            self.driver_orient_var.set("Portrait")
        elif "A4 Landscape" in preset:
            self.custom_w_var.set(297)
            self.custom_h_var.set(210)
            self.margin_var.set(12)
            self.orientation_var.set("Horizontal (0° - Normal Left-to-Right)")
            self.driver_orient_var.set("Landscape")
        elif "Letter" in preset:
            self.custom_w_var.set(216)
            self.custom_h_var.set(279)
            self.margin_var.set(15)

    # --------------------------------------------------------------------------
    # HELPER UI BUILDERS & FIELD OPERATIONS
    # --------------------------------------------------------------------------
    def _add_text_entry(self, parent, label_text, text_var):
        row = ttk.Frame(parent)
        row.pack(fill=tk.X, pady=3)
        ttk.Label(row, text=label_text, width=18).pack(side=tk.LEFT)
        ttk.Entry(row, textvariable=text_var).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)

    def _load_config_to_ui(self):
        # Header
        h = self.config.get("header", {})
        self.company_name_var.set(h.get("company_name", ""))
        self.company_subtitle_var.set(h.get("company_subtitle", ""))
        self.company_contact_var.set(h.get("company_contact", ""))
        self.doc_title_var.set(h.get("doc_title", ""))
        self.header_align_var.set(h.get("align", "Center"))
        self.font_family_var.set(h.get("font_family", "Helvetica"))
        self.header_font_size_var.set(h.get("header_font_size", 14))
        self.title_font_size_var.set(h.get("title_font_size", 12))
        self.show_separator_var.set(h.get("show_separator", True))

        # Paper
        p = self.config.get("paper", {})
        self.paper_size_var.set(p.get("size", "6-Inch Continuous (8.5 x 6 in / Weighbridge Fanfold)"))
        self.orientation_var.set(p.get("orientation", "Horizontal (0° - Normal Left-to-Right)"))
        self.driver_orient_var.set(p.get("driver_orientation", "Landscape"))
        self.custom_w_var.set(p.get("custom_width_mm", 216))
        self.custom_h_var.set(p.get("custom_height_mm", 152))
        self.margin_var.set(p.get("margin_mm", 10))
        self.layout_cols_var.set(self.config.get("layout_columns", 2))

        # Weights
        w = self.config.get("weights", {})
        self.weights_enabled_var.set(w.get("enabled", True))
        self.gross_wt_var.set(w.get("gross_weight", ""))
        self.gross_time_var.set(w.get("gross_time", ""))
        self.tare_wt_var.set(w.get("tare_weight", ""))
        self.tare_time_var.set(w.get("tare_time", ""))
        self.net_wt_var.set(w.get("net_weight", ""))
        self.net_words_var.set(w.get("net_in_words", ""))

        # Footer
        f = self.config.get("footer", {})
        self.remarks_var.set(f.get("remarks", ""))
        self.show_signs_var.set(f.get("show_signatures", True))
        self.left_sign_var.set(f.get("left_sign", "Left Thumb / Driver Sign"))
        self.right_sign_var.set(f.get("right_sign", "Authorized Signatory"))

        # Fields Tree
        self._refresh_fields_tree()
        self.refresh_raw_preview()

    def _sync_ui_to_config(self):
        self.config["header"] = {
            "company_name": self.company_name_var.get(),
            "company_subtitle": self.company_subtitle_var.get(),
            "company_contact": self.company_contact_var.get(),
            "doc_title": self.doc_title_var.get(),
            "align": self.header_align_var.get(),
            "font_family": self.font_family_var.get(),
            "header_font_size": self.header_font_size_var.get(),
            "title_font_size": self.title_font_size_var.get(),
            "show_separator": self.show_separator_var.get()
        }
        self.config["paper"] = {
            "size": self.paper_size_var.get(),
            "orientation": self.orientation_var.get(),
            "driver_orientation": self.driver_orient_var.get(),
            "custom_width_mm": self.custom_w_var.get(),
            "custom_height_mm": self.custom_h_var.get(),
            "margin_mm": self.margin_var.get()
        }
        self.config["layout_columns"] = self.layout_cols_var.get()
        self.config["weights"] = {
            "enabled": self.weights_enabled_var.get(),
            "gross_weight": self.gross_wt_var.get(),
            "gross_time": self.gross_time_var.get(),
            "tare_weight": self.tare_wt_var.get(),
            "tare_time": self.tare_time_var.get(),
            "net_weight": self.net_wt_var.get(),
            "net_in_words": self.net_words_var.get()
        }
        self.config["footer"] = {
            "remarks": self.remarks_var.get(),
            "show_signatures": self.show_signs_var.get(),
            "left_sign": self.left_sign_var.get(),
            "right_sign": self.right_sign_var.get()
        }

    def _refresh_fields_tree(self):
        for item in self.fields_tree.get_children():
            self.fields_tree.delete(item)
        for field in self.config.get("fields", []):
            self.fields_tree.insert(
                "", tk.END,
                values=(
                    field.get("label", ""),
                    field.get("value", ""),
                    "Yes" if field.get("bold") else "No",
                    "Yes" if field.get("span_full") else "No"
                )
            )

    def _add_field_dialog(self):
        self._show_field_edit_popup(title="Add Field", initial_data=None)

    def _edit_field_dialog(self):
        selected = self.fields_tree.selection()
        if not selected:
            messagebox.showwarning("Warning", "Please select a field to edit.")
            return
        idx = self.fields_tree.index(selected[0])
        field_data = self.config["fields"][idx]
        self._show_field_edit_popup(title="Edit Field", initial_data=field_data, index=idx)

    def _show_field_edit_popup(self, title, initial_data=None, index=None):
        dlg = tk.Toplevel(self.root)
        dlg.title(title)
        dlg.geometry("450x260")
        dlg.transient(self.root)
        dlg.grab_set()

        lbl_var = tk.StringVar(value=initial_data.get("label", "") if initial_data else "")
        val_var = tk.StringVar(value=initial_data.get("value", "") if initial_data else "")
        bold_var = tk.BooleanVar(value=initial_data.get("bold", False) if initial_data else False)
        span_var = tk.BooleanVar(value=initial_data.get("span_full", False) if initial_data else False)

        frame = ttk.Frame(dlg, padding=15)
        frame.pack(fill=tk.BOTH, expand=True)

        self._add_text_entry(frame, "Field Label:", lbl_var)
        self._add_text_entry(frame, "Field Value:", val_var)

        ttk.Checkbutton(frame, text="Display in Bold text", variable=bold_var).pack(anchor="w", pady=5)
        ttk.Checkbutton(frame, text="Span full row width", variable=span_var).pack(anchor="w", pady=5)

        def save_and_close():
            label = lbl_var.get().strip()
            if not label:
                messagebox.showerror("Error", "Field label cannot be empty.", parent=dlg)
                return
            new_item = {
                "key": label.lower().replace(" ", "_"),
                "label": label,
                "value": val_var.get(),
                "bold": bold_var.get(),
                "span_full": span_var.get()
            }
            if index is not None:
                self.config["fields"][index] = new_item
            else:
                self.config["fields"].append(new_item)
            self._refresh_fields_tree()
            self.refresh_raw_preview()
            dlg.destroy()

        btn_box = ttk.Frame(frame)
        btn_box.pack(fill=tk.X, pady=(15, 0))
        ttk.Button(btn_box, text="Save", command=save_and_close).pack(side=tk.RIGHT, padx=5)
        ttk.Button(btn_box, text="Cancel", command=dlg.destroy).pack(side=tk.RIGHT)

    def _delete_field(self):
        selected = self.fields_tree.selection()
        if not selected:
            return
        idx = self.fields_tree.index(selected[0])
        del self.config["fields"][idx]
        self._refresh_fields_tree()
        self.refresh_raw_preview()

    def _move_field(self, direction):
        selected = self.fields_tree.selection()
        if not selected:
            return
        idx = self.fields_tree.index(selected[0])
        new_idx = idx + direction
        if 0 <= new_idx < len(self.config["fields"]):
            self.config["fields"][idx], self.config["fields"][new_idx] = self.config["fields"][new_idx], self.config["fields"][idx]
            self._refresh_fields_tree()
            self.fields_tree.selection_set(self.fields_tree.get_children()[new_idx])
            self.refresh_raw_preview()

    # --------------------------------------------------------------------------
    # PRESETS (LOAD / SAVE)
    # --------------------------------------------------------------------------
    def _save_preset_file(self):
        self._sync_ui_to_config()
        path = filedialog.asksaveasfilename(defaultextension=".json", filetypes=[("JSON Files", "*.json")])
        if path:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(self.config, f, indent=2)
            self.status_var.set(f"Preset saved to {os.path.basename(path)}")

    def _load_preset_file(self):
        path = filedialog.askopenfilename(filetypes=[("JSON Files", "*.json")])
        if path and os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                self.config = json.load(f)
            self._load_config_to_ui()
            self.status_var.set(f"Preset loaded from {os.path.basename(path)}")

    def _reset_defaults(self):
        if messagebox.askyesno("Confirm", "Reset all settings to default?"):
            self.config = json.loads(json.dumps(DEFAULT_CONFIG))
            self._load_config_to_ui()
            self.status_var.set("Reset to default configuration.")

    def _get_available_printers(self):
        if HAS_WIN32PRINT:
            try:
                printers = [p[2] for p in win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS)]
                if printers:
                    return printers
            except Exception:
                pass
        return ["Default Windows Printer"]

    # --------------------------------------------------------------------------
    # PDF GENERATOR (REPORTLAB ENGINE - GUARANTEED SINGLE PAGE)
    # --------------------------------------------------------------------------
    def generate_pdf(self) -> bool:
        if not HAS_REPORTLAB:
            messagebox.showerror("Error", "ReportLab is not installed.\nInstall it using: pip install reportlab")
            return False

        self._sync_ui_to_config()
        pdf_path = self.output_pdf_path

        # Determine exact page dimensions in points
        preset = self.config["paper"]["size"]
        if "6-Inch" in preset:
            w_logical = 215.9 * mm  # Exact 8.5 x 6 inch (weighbridge fanfold)
            h_logical = 152.4 * mm
        elif "A5 Landscape" in preset:
            w_logical = 210 * mm
            h_logical = 148 * mm
        elif "A5 Portrait" in preset:
            w_logical = 148 * mm
            h_logical = 210 * mm
        elif "A4 Portrait" in preset:
            w_logical = 210 * mm
            h_logical = 297 * mm
        elif "A4 Landscape" in preset:
            w_logical = 297 * mm
            h_logical = 210 * mm
        elif "Letter" in preset:
            w_logical = 215.9 * mm
            h_logical = 279.4 * mm
        else:
            # Custom dimensions
            w_logical = self.config["paper"].get("custom_width_mm", 216) * mm
            h_logical = self.config["paper"].get("custom_height_mm", 152) * mm

        orient = self.orientation_var.get()
        if "90° Clockwise" in orient:
            # Physical sheet enters printer in portrait orientation; rotate canvas 90° so text prints left-to-right
            c = canvas.Canvas(pdf_path, pagesize=(h_logical, w_logical))
            c.translate(h_logical, 0)
            c.rotate(90)
            width, height = w_logical, h_logical
        elif "270°" in orient:
            c = canvas.Canvas(pdf_path, pagesize=(h_logical, w_logical))
            c.translate(0, w_logical)
            c.rotate(270)
            width, height = w_logical, h_logical
        elif "180°" in orient:
            c = canvas.Canvas(pdf_path, pagesize=(w_logical, h_logical))
            c.translate(w_logical, h_logical)
            c.rotate(180)
            width, height = w_logical, h_logical
        else:
            # Default 0° Horizontal
            c = canvas.Canvas(pdf_path, pagesize=(w_logical, h_logical))
            width, height = w_logical, h_logical

        margin = self.config["paper"]["margin_mm"] * mm
        is_compact = (height <= 165 * mm)  # e.g. 6-inch or A5 landscape

        if is_compact:
            margin = min(margin, 8 * mm)

        current_y = height - margin

        font_fam = self.config["header"]["font_family"]
        base_font = font_fam
        bold_font = f"{font_fam}-Bold"

        # 1. Draw Company Header
        h = self.config["header"]
        align = h.get("align", "Center")
        head_size = min(h.get("header_font_size", 14), 13 if is_compact else 18)
        title_size = min(h.get("title_font_size", 12), 11 if is_compact else 14)

        def draw_aligned_text(text, y_pos, font_name, font_sz):
            c.setFont(font_name, font_sz)
            if align == "Center":
                c.drawCentredString(width / 2, y_pos, text)
            elif align == "Right":
                c.drawRightString(width - margin, y_pos, text)
            else:
                c.drawString(margin, y_pos, text)

        if h.get("company_name"):
            draw_aligned_text(h["company_name"].upper(), current_y, bold_font, head_size)
            current_y -= (head_size + (2 if is_compact else 4))

        if h.get("company_subtitle"):
            draw_aligned_text(h["company_subtitle"], current_y, base_font, 8 if is_compact else 9)
            current_y -= (10 if is_compact else 12)

        if h.get("company_contact"):
            draw_aligned_text(h["company_contact"], current_y, base_font, 7 if is_compact else 8)
            current_y -= (10 if is_compact else 12)

        if h.get("show_separator"):
            current_y -= 2
            c.setLineWidth(1)
            c.line(margin, current_y, width - margin, current_y)
            current_y -= (10 if is_compact else 13)

        if h.get("doc_title"):
            draw_aligned_text(h["doc_title"], current_y, bold_font, title_size)
            current_y -= (title_size + (4 if is_compact else 6))

        # 2. Draw Data Fields Table
        cols = max(1, self.config.get("layout_columns", 2))
        col_width = (width - 2 * margin) / cols
        fields = self.config.get("fields", [])

        idx = 0
        field_font_size = 9 if is_compact else 10
        row_step = 13 if is_compact else 17

        while idx < len(fields):
            field = fields[idx]
            if field.get("span_full"):
                c.setFont(bold_font if field.get("bold") else base_font, field_font_size)
                c.drawString(margin, current_y, f"{field['label']}: {field['value']}")
                current_y -= row_step
                idx += 1
            else:
                for c_idx in range(cols):
                    if idx < len(fields):
                        f_curr = fields[idx]
                        col_x = margin + (c_idx * col_width)
                        c.setFont(base_font, field_font_size)
                        c.drawString(col_x, current_y, f"{f_curr['label']}:")
                        val_font = bold_font if f_curr.get("bold") else base_font
                        c.setFont(val_font, field_font_size)
                        offset = 80 if is_compact else 95
                        c.drawString(col_x + offset, current_y, str(f_curr.get("value", "")))
                        idx += 1
                current_y -= row_step

        # 3. Draw Weight Box (if enabled)
        w = self.config.get("weights", {})
        if w.get("enabled"):
            current_y -= (4 if is_compact else 8)
            box_height = 42 if is_compact else 52
            box_bottom = current_y - box_height
            c.setLineWidth(1)
            c.rect(margin, box_bottom, width - 2 * margin, box_height)

            w_col = (width - 2 * margin) / 3
            # Dividers
            c.line(margin + w_col, box_bottom, margin + w_col, current_y)
            c.line(margin + 2 * w_col, box_bottom, margin + 2 * w_col, current_y)
            c.line(margin, current_y - (14 if is_compact else 18), width - margin, current_y - (14 if is_compact else 18))

            # Titles
            c.setFont(bold_font, 8 if is_compact else 9)
            c.drawCentredString(margin + w_col * 0.5, current_y - (10 if is_compact else 13), "GROSS WEIGHT")
            c.drawCentredString(margin + w_col * 1.5, current_y - (10 if is_compact else 13), "TARE WEIGHT")
            c.drawCentredString(margin + w_col * 2.5, current_y - (10 if is_compact else 13), "NET WEIGHT")

            # Values
            c.setFont(bold_font, 11 if is_compact else 13)
            c.drawCentredString(margin + w_col * 0.5, current_y - (26 if is_compact else 33), str(w.get("gross_weight", "")))
            c.drawCentredString(margin + w_col * 1.5, current_y - (26 if is_compact else 33), str(w.get("tare_weight", "")))
            c.drawCentredString(margin + w_col * 2.5, current_y - (26 if is_compact else 33), str(w.get("net_weight", "")))

            # Time Subtext
            c.setFont(base_font, 6 if is_compact else 7)
            if w.get("gross_time"):
                c.drawCentredString(margin + w_col * 0.5, current_y - (36 if is_compact else 46), f"Time: {w['gross_time']}")
            if w.get("tare_time"):
                c.drawCentredString(margin + w_col * 1.5, current_y - (36 if is_compact else 46), f"Time: {w['tare_time']}")

            current_y = box_bottom - (10 if is_compact else 14)

            # Net weight in words
            if w.get("net_in_words"):
                c.setFont(f"{font_fam}-Oblique", 7 if is_compact else 9)
                c.drawCentredString(width / 2, current_y, f"({w['net_in_words']})")
                current_y -= (12 if is_compact else 16)

        # 4. Draw Footer & Remarks
        f_cfg = self.config.get("footer", {})
        if f_cfg.get("remarks"):
            c.setFont(base_font, 7 if is_compact else 8)
            wrapped_remarks = simpleSplit(f"Remarks: {f_cfg['remarks']}", base_font, 7 if is_compact else 8, width - 2 * margin)
            for line in wrapped_remarks:
                c.drawString(margin, current_y, line)
                current_y -= (9 if is_compact else 11)

        # 5. Draw Signatures & Left Thumb directly below Remarks (tightly positioned)
        if f_cfg.get("show_signatures", True):
            current_y -= (4 if is_compact else 8)
            left_lbl = f_cfg.get("left_sign", "Left Thumb / Driver Sign")
            right_lbl = f_cfg.get("right_sign", "Authorized Signatory")
            sign_sz = 7 if is_compact else 8

            c.setFont(bold_font, sign_sz)
            # Left thumb impression / Driver sign
            c.drawString(margin, current_y, left_lbl)
            c.setLineWidth(0.5)
            c.line(margin, current_y + 8, margin + 95, current_y + 8)

            # Authorized Signatory on right
            c.drawRightString(width - margin, current_y, right_lbl)
            c.line(width - margin - 95, current_y + 8, width - margin, current_y + 8)

        c.save()

        # Update log
        self._log_preview_summary(width, height)
        self.status_var.set(f"✅ 1-Page PDF generated: {self.config['paper']['size']}")
        return True

    def _log_preview_summary(self, w_pt=None, h_pt=None):
        self.log_text.delete("1.0", tk.END)
        w_mm = f"{(w_pt/mm):.1f} mm" if w_pt else "-"
        h_mm = f"{(h_pt/mm):.1f} mm" if h_pt else "-"
        log = [
            f"=== 📄 PDF GENERATION SUMMARY (1 PAGE STRICT) ===",
            f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            f"Selected Paper Preset: {self.config['paper']['size']}",
            f"Exact PDF Dimensions: {w_mm} x {h_mm}",
            f"Margin: {self.config['paper']['margin_mm']} mm",
            f"Company: {self.config['header']['company_name']}",
            f"Doc Title: {self.config['header']['doc_title']}",
            f"Configured Fields: {len(self.config.get('fields', []))}",
            f"Weight Box: {'Enabled' if self.config['weights']['enabled'] else 'Disabled'}",
            f"Target Printer: {self.printer_var.get()}",
            f"Force 1-Page Print: {'YES (Prevents Blank Page Eject)' if self.only_page_1_var.get() else 'NO'}",
            "================================================\n",
            "💡 If printing on continuous 6-inch paper:",
            "1. Keep Paper Preset set to '6-Inch Continuous (8.5 x 6 in)'",
            "2. Keep 'Force Print Page 1 Only' checked",
            "3. Click '🖨️ Direct Print' to send directly to your printer."
        ]
        self.log_text.insert(tk.END, "\n".join(log))

    def open_generated_pdf(self):
        if not os.path.exists(self.output_pdf_path):
            if not self.generate_pdf():
                return
        try:
            if sys.platform.startswith("win"):
                os.startfile(self.output_pdf_path)
            elif sys.platform.startswith("darwin"):
                subprocess.Popen(["open", self.output_pdf_path])
            else:
                subprocess.Popen(["xdg-open", self.output_pdf_path])
            self.status_var.set(f"Opened PDF: {os.path.basename(self.output_pdf_path)}")
        except Exception as e:
            messagebox.showerror("Error", f"Failed to open PDF: {e}")

    def print_pdf_to_printer(self):
        if not os.path.exists(self.output_pdf_path):
            if not self.generate_pdf():
                return

        printer = self.printer_var.get().strip()
        if not printer or printer == "Default Windows Printer":
            if HAS_WIN32PRINT:
                try:
                    printer = win32print.GetDefaultPrinter()
                except Exception:
                    printer = None

        if not sys.platform.startswith("win"):
            messagebox.showwarning("Platform Notice", "Direct spooling via Windows API is only supported on Windows.")
            return

        try:
            if HAS_WIN32PRINT and printer and printer != "Default Windows Printer":
                win32api.ShellExecute(0, "printto", self.output_pdf_path, f'"{printer}"', ".", 0)
                self.status_var.set(f"Sent PDF to printer: {printer}")
                messagebox.showinfo("Success", f"Print job dispatched to printer:\n{printer}")
            else:
                win32api.ShellExecute(0, "print", self.output_pdf_path, None, ".", 0)
                self.status_var.set("Sent PDF to default printer.")
                messagebox.showinfo("Success", "Print job dispatched to default Windows printer.")
        except Exception as e:
            messagebox.showerror("Print Error", f"Failed to send PDF to printer:\n{e}")

    # --------------------------------------------------------------------------
    # DOT MATRIX RAW FORMATTER & PRINT ENGINE
    # --------------------------------------------------------------------------
    def _generate_raw_lines(self) -> tuple:
        """Generates plain ASCII lines formatted for Dot Matrix character grid."""
        self._sync_ui_to_config()
        width = max(40, min(136, self.raw_line_width_var.get()))
        lines = []

        h = self.config.get("header", {})
        align = h.get("align", "Center")

        def fmt_line(text: str) -> str:
            t = text[:width]
            if align == "Center":
                return t.center(width)
            elif align == "Right":
                return t.rjust(width)
            else:
                return t.ljust(width)

        # 1. Header
        if h.get("company_name"):
            lines.append(fmt_line(h["company_name"].upper()))
        if h.get("company_subtitle"):
            lines.append(fmt_line(h["company_subtitle"]))
        if h.get("company_contact"):
            lines.append(fmt_line(h["company_contact"]))
        if h.get("show_separator"):
            lines.append("=" * width)
        if h.get("doc_title"):
            lines.append(fmt_line(h["doc_title"]))
            lines.append("-" * width)

        # 2. Key-Value Fields (2-Column or 1-Column)
        fields = self.config.get("fields", [])
        col_w = (width - 2) // 2
        idx = 0
        while idx < len(fields):
            f = fields[idx]
            if f.get("span_full"):
                line_txt = f"{f.get('label', '')}: {f.get('value', '')}"
                lines.append(line_txt[:width].ljust(width))
                idx += 1
            else:
                f1 = fields[idx]
                col1 = f"{f1.get('label', '')}: {f1.get('value', '')}"[:col_w].ljust(col_w)
                col2 = ""
                if idx + 1 < len(fields) and not fields[idx + 1].get("span_full"):
                    f2 = fields[idx + 1]
                    col2 = f"{f2.get('label', '')}: {f2.get('value', '')}"[:col_w].ljust(col_w)
                    idx += 2
                else:
                    idx += 1
                lines.append(f"{col1}  {col2}".rstrip())

        # 3. Weights Box
        w = self.config.get("weights", {})
        if w.get("enabled"):
            lines.append("-" * width)
            w_col = (width - 4) // 3
            # Table Header
            hdr_g = "GROSS WT".center(w_col)
            hdr_t = "TARE WT".center(w_col)
            hdr_n = "NET WT".center(w_col)
            lines.append(f"|{hdr_g}|{hdr_t}|{hdr_n}|")

            # Values
            val_g = str(w.get("gross_weight", "")).center(w_col)
            val_t = str(w.get("tare_weight", "")).center(w_col)
            val_n = str(w.get("net_weight", "")).center(w_col)
            lines.append(f"|{val_g}|{val_t}|{val_n}|")

            # Times
            gt = f"Time: {w.get('gross_time', '')}" if w.get("gross_time") else ""
            tt = f"Time: {w.get('tare_time', '')}" if w.get("tare_time") else ""
            lines.append(f"|{gt.center(w_col)}|{tt.center(w_col)}|{''.center(w_col)}|")
            lines.append("-" * width)

            if w.get("net_in_words"):
                lines.append(f"({w['net_in_words']})".center(width))

        # 4. Remarks
        f_cfg = self.config.get("footer", {})
        if f_cfg.get("remarks"):
            lines.append(f"Remarks: {f_cfg['remarks']}"[:width])

        # 5. Signatures
        if f_cfg.get("show_signatures", True):
            lines.append("")
            left_lbl = f_cfg.get("left_sign", "Left Thumb / Driver Sign")
            right_lbl = f_cfg.get("right_sign", "Authorized Signatory")
            sign_col_w = (width - 4) // 2
            sign_line = f"{left_lbl[:sign_col_w].ljust(sign_col_w)}  {right_lbl[:sign_col_w].rjust(sign_col_w)}"
            lines.append(sign_line)

        # 6. Apply Feeding & Padding Mode
        content_line_count = len(lines)
        feed_mode = self.raw_feed_mode_var.get()
        final_lines = list(lines)

        if "Auto-Pad to 40 Lines" in feed_mode:
            target_lines = 40
            if len(final_lines) < target_lines:
                final_lines.extend([""] * (target_lines - len(final_lines)))
        elif "Auto-Pad to 36 Lines" in feed_mode:
            target_lines = 36
            if len(final_lines) < target_lines:
                final_lines.extend([""] * (target_lines - len(final_lines)))
        elif "Feed Custom Extra" in feed_mode:
            extra = max(0, self.raw_custom_extra_lines_var.get())
            final_lines.extend([""] * extra)
        # "Stop Immediately After Last Line" leaves final_lines as is

        return content_line_count, final_lines

    def refresh_raw_preview(self):
        content_count, lines = self._generate_raw_lines()
        total_count = len(lines)

        self.raw_lines_count_lbl.set(f"Total Lines: {total_count} ({content_count} content + {total_count - content_count} pad)")

        self.raw_preview_text.delete("1.0", tk.END)
        numbered_preview = []
        for i, line in enumerate(lines, 1):
            numbered_preview.append(f"{i:02d} | {line}")

        self.raw_preview_text.insert(tk.END, "\n".join(numbered_preview))
        self.status_var.set(f"Raw preview refreshed: {total_count} lines formatted.")

    def print_raw_dot_matrix(self):
        content_count, lines = self._generate_raw_lines()
        payload = bytearray()

        # ESC/P Hardware command: Set 6-inch page length if checked
        if self.raw_set_6inch_var.get():
            # ESC C 0 6 -> \x1b\x43\x00\x06 (Set page length in inches to 6)
            payload.extend(b"\x1b\x43\x00\x06")

        # Encode text lines with standard DOS / Dot-Matrix CR LF
        for line in lines:
            payload.extend(line.encode("latin-1", errors="replace") + b"\r\n")

        # Optional Form Feed
        if self.raw_send_ff_var.get():
            payload.extend(b"\x0c")

        printer_name = self.printer_var.get().strip()
        if not printer_name or printer_name == "Default Windows Printer":
            if HAS_WIN32PRINT:
                try:
                    printer_name = win32print.GetDefaultPrinter()
                except Exception:
                    printer_name = None

        if not sys.platform.startswith("win") or not HAS_WIN32PRINT:
            messagebox.showwarning("Notice", "RAW Dot Matrix spooling requires Windows and pywin32.")
            return

        if not printer_name:
            messagebox.showerror("Error", "No valid printer selected or found.")
            return

        try:
            h_printer = win32print.OpenPrinter(printer_name)
            try:
                h_job = win32print.StartDocPrinter(h_printer, 1, ("Weighbridge Dot Matrix Slip", None, "RAW"))
                try:
                    win32print.StartPagePrinter(h_printer)
                    win32print.WritePrinter(h_printer, bytes(payload))
                    win32print.EndPagePrinter(h_printer)
                finally:
                    win32print.EndDocPrinter(h_printer)
            finally:
                win32print.ClosePrinter(h_printer)

            self.status_var.set(f"✅ Dispatched {len(lines)} RAW lines to {printer_name}")
            messagebox.showinfo("Success", f"Direct RAW data successfully sent to:\n{printer_name}\n({len(lines)} lines)")
        except Exception as e:
            messagebox.showerror("Dot Matrix Print Error", f"Failed to send RAW data to printer:\n{e}")

    def advance_paper_perforation(self):
        """Sends a form-feed character to advance continuous tractor paper to the next page."""
        printer_name = self.printer_var.get().strip()
        if not printer_name or printer_name == "Default Windows Printer":
            if HAS_WIN32PRINT:
                try:
                    printer_name = win32print.GetDefaultPrinter()
                except Exception:
                    printer_name = None

        if not sys.platform.startswith("win") or not HAS_WIN32PRINT:
            messagebox.showwarning("Notice", "Paper advance requires Windows and pywin32.")
            return

        try:
            h_printer = win32print.OpenPrinter(printer_name)
            try:
                h_job = win32print.StartDocPrinter(h_printer, 1, ("Advance Perforation", None, "RAW"))
                try:
                    win32print.StartPagePrinter(h_printer)
                    win32print.WritePrinter(h_printer, b"\x0c")  # Form Feed
                    win32print.EndPagePrinter(h_printer)
                finally:
                    win32print.EndDocPrinter(h_printer)
            finally:
                win32print.ClosePrinter(h_printer)

            self.status_var.set("Form feed (FF \\x0C) sent to printer.")
            messagebox.showinfo("Paper Feed", "Paper advanced to the next perforation.")
        except Exception as e:
            messagebox.showerror("Feed Error", f"Failed to advance paper:\n{e}")


def main():
    if USE_BOOTSTRAP:
        root = bstrap.Window(themename="cosmo")
    else:
        root = tk.Tk()
    app = PDFTextConfiguratorApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
