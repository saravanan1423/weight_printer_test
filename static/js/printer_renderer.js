(function attachPrinterLayoutRenderer() {
  function createElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function alignToJustifyContent(align) {
    if (align === "center") return "center";
    if (align === "right") return "flex-end";
    return "flex-start";
  }

  function hasValue(value) {
    return value !== "" && value !== null && value !== undefined;
  }

  function formatDateValue(value) {
    if (!hasValue(value)) return "";
    const text = String(value).trim();
    const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      return `${isoMatch[3]}-${isoMatch[2]}-${isoMatch[1]}`;
    }
    return text;
  }

  function formatNumberValue(value, fractionDigits = 0, useGrouping = true) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return "";
    return numericValue.toLocaleString("en-IN", {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
      useGrouping,
    });
  }

  function cpiToFontSize(cpi, fallback = 8) {
    const numeric = Number(cpi);
    if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
    return Math.max(8, Math.min(28, Math.round(180 / numeric)));
  }

  function isDotMatrixLayout(layout) {
    return String(layout?.printerType || "").trim() === "dot_matrix";
  }

  function dotMatrixSize(value, minimum = 12, maximum = 28) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return minimum;
    return Math.max(minimum, Math.min(maximum, Math.round(numeric * 1.8)));
  }

  function dotMatrixFontFamily(value) {
    const family = String(value || "").trim();
    if (!family || family === "Dot Matrix Draft") {
      return '"DotMatrixUploaded", "Courier New", "Lucida Console", Consolas, monospace';
    }
    if (family === "FS Blok") {
      return '"FS Blok", "DotMatrixUploaded", "Courier New", "Lucida Console", Consolas, monospace';
    }
    return family;
  }

  function isThermalLayout(layout) {
    return String(layout?.printerType || "").trim() === "thermal";
  }

  function thermalFontSize(value, scale = 1) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return value;
    return Math.round(numeric * scale * 10) / 10;
  }

  function getFieldValue(entry, source) {
    if (!source) return "";
    if (source.startsWith("custom:")) {
      const key = source.slice("custom:".length);
      return entry?.customFields?.[key] ?? "";
    }
    return entry?.[source] ?? "";
  }

  function formatFieldValue(source, value, layout = null) {
    if (!hasValue(value)) return "";
    if (source.endsWith("Date")) return formatDateValue(value);
    if (source === "charges") return formatNumberValue(value, 2);
    if (source.endsWith("Weight")) return formatNumberValue(value, 0, !isDotMatrixLayout(layout));
    return String(value);
  }

  function getPhotoUrl(entry, source) {
    if (!source || !source.startsWith("camera:")) return "";
    const cameraNo = Number(source.split(":")[1]);
    const photo = (entry?.cameraImages || []).find(item => Number(item.cameraNo) === cameraNo);
    return photo?.url || "";
  }

  function sortElements(elements) {
    return [...(elements || [])].sort((left, right) => {
      const zDiff = Number(left.z || 0) - Number(right.z || 0);
      if (zDiff !== 0) return zDiff;
      return String(left.id || "").localeCompare(String(right.id || ""));
    });
  }

  function clampPercent(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function getFieldRowsSettings(layout) {
    const defaults = {
      x: 0,
      y: 22.8,
      w: 100,
      rowHeight: 6.5,
      baseRows: 2,
      shiftStartY: 38,
    };
    const settings = layout?.fieldRowsSettings || {};

    return {
      x: Number.isFinite(Number(settings.x)) ? Number(settings.x) : defaults.x,
      y: Number.isFinite(Number(settings.y)) ? Number(settings.y) : defaults.y,
      w: Number.isFinite(Number(settings.w)) ? Number(settings.w) : defaults.w,
      rowHeight: Number.isFinite(Number(settings.rowHeight)) ? Number(settings.rowHeight) : defaults.rowHeight,
      baseRows: Number.isFinite(Number(settings.baseRows)) ? Number(settings.baseRows) : defaults.baseRows,
      shiftStartY: Number.isFinite(Number(settings.shiftStartY)) ? Number(settings.shiftStartY) : defaults.shiftStartY,
    };
  }

  function getManagedSections(layout) {
    if (Array.isArray(layout?.managedSections) && layout.managedSections.length) {
      return layout.managedSections;
    }

    const rows = Array.isArray(layout?.fieldRows) ? layout.fieldRows : [];
    if (!rows.length) return [];
    const settings = getFieldRowsSettings(layout);
    return [
      {
        id: "main-field-rows",
        name: "Field Rows",
        ...settings,
        rows,
      },
    ];
  }

  function getManagedSectionSettings(section) {
    const defaults = {
      x: 0,
      y: 22.8,
      w: 100,
      rowHeight: 6.5,
      baseRows: 2,
      shiftStartY: 38,
    };

    return {
      x: Number.isFinite(Number(section?.x)) ? Number(section.x) : defaults.x,
      y: Number.isFinite(Number(section?.y)) ? Number(section.y) : defaults.y,
      w: Number.isFinite(Number(section?.w)) ? Number(section.w) : defaults.w,
      rowHeight: Number.isFinite(Number(section?.rowHeight)) ? Number(section.rowHeight) : defaults.rowHeight,
      baseRows: Number.isFinite(Number(section?.baseRows)) ? Number(section.baseRows) : defaults.baseRows,
      shiftStartY: Number.isFinite(Number(section?.shiftStartY)) ? Number(section.shiftStartY) : defaults.shiftStartY,
    };
  }

  function getManagedSectionGroupKey(section) {
    return String(section?.groupId || section?.id || "");
  }

  function getManagedSectionHeight(section) {
    const settings = getManagedSectionSettings(section);
    const rows = Array.isArray(section?.rows) ? section.rows : [];
    return rows.length * settings.rowHeight;
  }

  function getManagedSectionsShift(baseTop, layout) {
    const bandShifts = new Map();

    getManagedSections(layout).forEach(section => {
      const settings = getManagedSectionSettings(section);
      const rowDelta = getManagedSectionHeight(section) - (settings.baseRows * settings.rowHeight);
      if (rowDelta <= 0 || baseTop < settings.shiftStartY) return;

      const bandKey = String(settings.shiftStartY);
      const groupKey = getManagedSectionGroupKey(section);
      const bandGroups = bandShifts.get(bandKey) || new Map();
      const current = bandGroups.get(groupKey) || 0;
      bandGroups.set(groupKey, Math.max(current, rowDelta));
      bandShifts.set(bandKey, bandGroups);
    });

    return Array.from(bandShifts.values()).reduce((total, groups) => {
      return total + Array.from(groups.values()).reduce((bandTotal, value) => bandTotal + value, 0);
    }, 0);
  }

  function getShiftedTop(element, layout) {
    const baseTop = Number(element.y || 0);
    const height = clampPercent(Number(element.h || 0), 2, 100);
    const shiftedTop = baseTop + getManagedSectionsShift(baseTop, layout);
    return clampPercent(shiftedTop, 0, Math.max(0, 100 - height));
  }

  function applyElementStyle(node, element, layout) {
    const isBlankCanvas = String(layout?.templateKind || "").trim() === "blank_canvas";
    const width = clampPercent(Number(element.w || 0), 2, 100);
    const height = clampPercent(Number(element.h || 0), 2, 100);
    const left = clampPercent(Number(element.x || 0), 0, Math.max(0, 100 - width));
    const top = getShiftedTop({ ...element, h: height }, layout);
    const requestedFontWeight = Number(element.fontWeight || 700);
    let fontWeight = requestedFontWeight;
    if (isThermalLayout(layout)) {
      fontWeight = element?.id === "thermal-company-name"
        ? Math.min(requestedFontWeight, 500)
        : Math.min(requestedFontWeight, 400);
    }

    node.style.left = `${left}%`;
    node.style.top = `${top}%`;
    node.style.width = `${width}%`;
    node.style.height = `${height}%`;
    node.style.zIndex = String(element.z || 1);
    const isUserAddedField = element.kind === "field" && /^field-\d+$/i.test(String(element.id || ""));
    const isUserAddedWeight = element.kind === "weight" && /^weight-\d+$/i.test(String(element.id || ""));
    const hideBlankFieldBox = (isBlankCanvas && element.kind === "field") || isUserAddedField;
    const borderWidth = isUserAddedWeight
      ? Math.max(1, Number(element.borderWidth || 0))
      : (element.borderWidth || 0);
    const borderColor = isUserAddedWeight
      ? (element.borderColor && element.borderColor !== "transparent" ? element.borderColor : "#2F3F95")
      : (element.borderColor || "transparent");
    node.style.padding = `${hideBlankFieldBox ? 0 : (element.padding || 0)}px`;
    node.style.borderWidth = `${hideBlankFieldBox ? 0 : borderWidth}px`;
    node.style.borderColor = hideBlankFieldBox ? "transparent" : borderColor;
    node.style.borderRadius = `${element.radius || 0}px`;
    node.style.backgroundColor = element.backgroundColor || "transparent";
    node.style.color = element.textColor || "#0F172A";
    node.style.fontSize = isDotMatrixLayout(layout)
      ? `${dotMatrixSize(element.fontSize || 14, 14, 36)}px`
      : isThermalLayout(layout)
        ? `${thermalFontSize(element.fontSize || 14)}px`
        : `${element.fontSize || 14}px`;
    node.style.fontWeight = String(fontWeight);
    node.style.fontFamily = isDotMatrixLayout(layout)
      ? dotMatrixFontFamily(element.fontFamily || layout?.defaults?.fontFamily)
      : (element.fontFamily || "");
    node.style.textAlign = element.align || "left";
    if (isDotMatrixLayout(layout)) {
      node.style.letterSpacing = "0.08em";
      node.style.fontWeight = "600";
      node.style.textShadow = "0.018em 0 0 currentColor";
      node.style.setProperty("-webkit-text-stroke", "0");
      node.style.setProperty("-webkit-font-smoothing", "none");
      node.style.setProperty("font-smooth", "never");
      return;
    }

    if (!isThermalLayout(layout) && fontWeight >= 1000) {
      node.style.textShadow = "0.015em 0 0 currentColor, -0.015em 0 0 currentColor";
      node.style.setProperty("-webkit-text-stroke", "0.012em currentColor");
    } else {
      node.style.textShadow = "none";
      node.style.setProperty("-webkit-text-stroke", "0");
    }
  }

  function createStaticTextContent(element) {
    const content = createElement("div", "printer-element__text", element.text || "");
    content.style.justifyContent = alignToJustifyContent(element.align || "left");
    content.style.textAlign = element.align || "left";
    return content;
  }

  function createFieldContent(element, entry, layout) {
    const content = createElement("div", "printer-element__field");
    const label = createElement("div", "printer-element__field-label", element.label ? `${element.label} :` : "");
    const value = createElement(
      "div",
      "printer-element__field-value",
      formatFieldValue(element.source || "", getFieldValue(entry, element.source || ""), layout) || " "
    );
    value.style.fontSize = isThermalLayout(layout)
      ? `${thermalFontSize(element.valueFontSize || element.fontSize || 14)}px`
      : `${element.valueFontSize || element.fontSize || 14}px`;
    content.append(label, value);
    return content;
  }

  function createWeightContent(element, entry, layout) {
    const content = createElement("div", "printer-element__weight");
    const label = createElement("div", "printer-element__weight-label", element.label || "Weight");
    const valueWrap = createElement("div", "printer-element__weight-body");
    if (element.showWeightValue !== false) {
      const valueRow = createElement("div", "printer-element__weight-value-row");
      const value = createElement(
        "div",
        "printer-element__weight-value",
        formatFieldValue(element.source || "", getFieldValue(entry, element.source || ""), layout) || "--"
      );
      value.style.fontSize = isThermalLayout(layout)
        ? `${thermalFontSize(element.valueFontSize || 24)}px`
        : `${element.valueFontSize || 24}px`;
      const unit = createElement("div", "printer-element__weight-unit", element.unit || "");
      valueRow.append(value, unit);
      valueWrap.appendChild(valueRow);
    }

    const metaSources = Array.isArray(element.metaSources) ? element.metaSources.filter(Boolean) : [];
    const metaText = metaSources
      .map(source => formatFieldValue(source, getFieldValue(entry, source)))
      .filter(Boolean)
      .join("  ");
    if (metaText) {
      const meta = createElement("div", "printer-element__weight-meta", metaText);
      meta.style.fontSize = isThermalLayout(layout)
        ? `${thermalFontSize(element.metaFontSize || 8)}px`
        : `${element.metaFontSize || 8}px`;
      valueWrap.appendChild(meta);
    }

    content.append(label, valueWrap);
    return content;
  }

  function buildImagePlaceholder(element) {
    const placeholder = createElement("div", "printer-element__image-placeholder");
    placeholder.appendChild(
      createElement(
        "div",
        "printer-element__image-placeholder-text",
        element.kind === "photo" ? "Photo not available" : "Upload logo"
      )
    );
    return placeholder;
  }

  function createImageContent(element, imageUrl) {
    const content = createElement("div", "printer-element__image");
    if (element.kind === "photo" && element.title) {
      content.appendChild(createElement("div", "printer-element__photo-title", element.title));
    }

    const body = createElement("div", "printer-element__image-body");
    if (imageUrl) {
      const image = createElement("img", "printer-element__image-tag");
      image.src = imageUrl;
      image.alt = element.name || element.title || "Printer image";
      image.style.objectFit = element.fit || "contain";
      image.draggable = false;
      body.appendChild(image);
    } else {
      body.appendChild(buildImagePlaceholder(element));
    }

    content.appendChild(body);
    return content;
  }

  function createElementContent(element, entry, layout) {
    if (element.kind === "printBreak") {
      const content = createElement("div", "printer-element__print-break");
      content.appendChild(createElement("span", "", "PRINT BREAK"));
      return content;
    }
    if (element.kind === "field") return createFieldContent(element, entry, layout);
    if (element.kind === "weight") return createWeightContent(element, entry, layout);
    if (element.kind === "image") return createImageContent(element, element.imageUrl || "");
    if (element.kind === "photo") return createImageContent(element, getPhotoUrl(entry, element.source || ""));
    return createStaticTextContent(element);
  }

  function createManagedFieldCell(field, entry, layout) {
    const cell = createElement("div", "printer-managed-field");
    if (isDotMatrixLayout(layout)) {
      cell.style.fontFamily = dotMatrixFontFamily(field?.fontFamily || layout?.defaults?.fontFamily);
      cell.style.letterSpacing = "0.08em";
      cell.style.fontWeight = "600";
      cell.style.textShadow = "0.018em 0 0 currentColor";
      cell.style.setProperty("-webkit-font-smoothing", "none");
      cell.style.setProperty("font-smooth", "never");
    }
    if (isDotMatrixLayout(layout) && field?.textColor) {
      cell.style.color = field.textColor;
    }
    if (field?.cpi) {
      cell.style.fontSize = `${cpiToFontSize(field.cpi, field?.fontSize || 8)}px`;
    } else if (field?.fontSize) {
      cell.style.fontSize = isDotMatrixLayout(layout)
        ? `${dotMatrixSize(field.fontSize, 14, 28)}px`
        : isThermalLayout(layout)
          ? `${thermalFontSize(field.fontSize)}px`
          : `${field.fontSize}px`;
    }
    const label = createElement(
      "div",
      "printer-managed-field__label",
      field.label ? `${field.label} :` : ""
    );
    const value = createElement(
      "div",
      "printer-managed-field__value",
      formatFieldValue(field.source || "", getFieldValue(entry, field.source || ""), layout) || " "
    );
    cell.append(label, value);
    return cell;
  }

  function createManagedRows(layout, entry, options) {
    const sections = getManagedSections(layout);
    if (!sections.length) return [];

    return sections.map(sectionConfig => {
      const rows = Array.isArray(sectionConfig?.rows) ? sectionConfig.rows : [];
      const firstWeightRowIndex = rows.findIndex(row => {
        const fields = Array.isArray(row?.fields) ? row.fields : [];
        return fields.some(field => String(field?.source || "").endsWith("Weight"));
      });
      const detailsEndIndex = firstWeightRowIndex > 0 ? firstWeightRowIndex - 1 : -1;
      const finalRowIndex = rows.length - 1;
      const settings = getManagedSectionSettings(sectionConfig);
      const width = clampPercent(Number(settings.w || 0), 20, 100);
      const section = createElement("div", "printer-managed-rows");
      section.dataset.sectionId = String(sectionConfig?.id || "");
      const totalHeight = clampPercent(
        getManagedSectionHeight(sectionConfig),
        0,
        Math.max(0, 100 - Number(settings.y || 0))
      );
      const top = clampPercent(Number(settings.y || 0), 0, Math.max(0, 100 - totalHeight));
      const left = clampPercent(Number(settings.x || 0), 0, Math.max(0, 100 - width));

      section.style.left = `${left}%`;
      section.style.top = `${top}%`;
      section.style.width = `${width}%`;
      section.style.height = `${totalHeight}%`;

      rows.forEach((row, rowIndex) => {
        const rowNode = createElement("div", "printer-managed-row");
        rowNode.dataset.sectionId = String(sectionConfig?.id || "");
        rowNode.dataset.rowId = String(row?.id || "");
        if (options?.editable && ["thermal", "dot_matrix"].includes(layout?.printerType)) {
          rowNode.classList.add("printer-managed-row--draggable");
        }
        if (isThermalLayout(layout) && rowIndex === detailsEndIndex) {
          rowNode.classList.add("printer-managed-row--thermal-details-end");
        }
        if (isThermalLayout(layout) && rowIndex === finalRowIndex) {
          rowNode.classList.add("printer-managed-row--thermal-final");
        }
        const fields = Array.isArray(row.fields) ? row.fields : [];

        if (!fields.length) {
          const placeholder = createElement("div", "printer-managed-row__placeholder");
          placeholder.textContent = options?.editable ? "Empty Row" : "";
          rowNode.appendChild(placeholder);
        } else {
          fields.forEach(field => {
            rowNode.appendChild(createManagedFieldCell(field, entry, layout));
          });
        }

        section.appendChild(rowNode);
      });

      return section;
    });
  }

  function createPageGuide() {
    const guide = createElement("div", "printer-page__guide");
    guide.append(
      createElement("strong", "", "Print-safe border"),
      createElement("span", "", "Drop and arrange blocks inside this frame")
    );
    return guide;
  }

  function createRenderedElement(element, entry, options, layout) {
    const node = createElement("div", `printer-element printer-element--${element.kind}`);
    node.dataset.elementId = element.id || "";
    if (layout?.printerType === "dot_matrix" && /(?:strip|divider)/i.test(String(element.id || ""))) {
      node.classList.add("printer-element--dot-strip");
    }
    if (layout?.printerType === "dot_matrix" && Number(element.x || 0) >= 60) {
      node.classList.add("printer-element--right-side");
    }
    applyElementStyle(node, element, layout);

    if (options?.selectable) {
      node.classList.add("printer-element--interactive");
      if (options.selectedElementId === element.id) {
        node.classList.add("is-selected");
      }
    }

    const content = createElementContent(element, entry, layout);
    node.appendChild(content);

    if (options?.editable) {
      if (options.selectedElementId === element.id) {
        const deleteHandle = createElement("button", "printer-element__delete", "x");
        deleteHandle.type = "button";
        deleteHandle.tabIndex = -1;
        deleteHandle.setAttribute("aria-hidden", "true");
        deleteHandle.dataset.deleteHandle = "true";
        node.appendChild(deleteHandle);
      }

      const resizeHandle = createElement("button", "printer-element__resize", "");
      resizeHandle.type = "button";
      resizeHandle.tabIndex = -1;
      resizeHandle.setAttribute("aria-hidden", "true");
      resizeHandle.dataset.resizeHandle = "true";
      node.appendChild(resizeHandle);
    }

    return node;
  }

  function shrinkTextToFit(node, minimumFontSize = 7) {
    if (!node) return;

    const computedStyle = window.getComputedStyle(node);
    const initialSize = Number.parseFloat(computedStyle.fontSize);
    if (!Number.isFinite(initialSize)) return;

    node.style.whiteSpace = "nowrap";
    let currentSize = initialSize;

    while (
      currentSize > minimumFontSize &&
      (node.scrollWidth > node.clientWidth || node.scrollHeight > node.clientHeight)
    ) {
      currentSize -= 0.5;
      node.style.fontSize = `${currentSize}px`;
    }
  }

  function shrinkContainerToFit(node, minimumFontSize = 6) {
    if (!node) return;

    const computedStyle = window.getComputedStyle(node);
    const initialSize = Number.parseFloat(computedStyle.fontSize);
    if (!Number.isFinite(initialSize)) return;

    let currentSize = initialSize;

    while (
      currentSize > minimumFontSize &&
      (node.scrollWidth > node.clientWidth || node.scrollHeight > node.clientHeight)
    ) {
      currentSize -= 0.5;
      node.style.fontSize = `${currentSize}px`;
    }
  }

  function fitThermalText(pageNode) {
    if (!pageNode?.classList.contains("printer-page--thermal")) return;

    pageNode.querySelectorAll(".printer-element__text").forEach(node => {
      shrinkTextToFit(node, 6);
    });

    pageNode.querySelectorAll(".printer-element__field").forEach(node => {
      shrinkContainerToFit(node, 6);
    });

    pageNode.querySelectorAll(".printer-element__field-value").forEach(node => {
      shrinkTextToFit(node, 6);
    });

    pageNode.querySelectorAll(".printer-managed-field").forEach(node => {
      shrinkContainerToFit(node, 5);
    });

    pageNode.querySelectorAll(".printer-managed-field__value").forEach(node => {
      shrinkTextToFit(node, 5);
    });
  }

  function render(container, layout, entry, options = {}) {
    if (!container) return;
    const page = layout?.page || {};
    const widthMm = Number(page.widthMm || 297);
    const heightMm = Number(page.heightMm || 210);
    container.innerHTML = "";
    container.classList.toggle("is-drop-target", Boolean(options.dropTarget));
    container.style.setProperty("--sheet-ratio", `${widthMm} / ${heightMm}`);
    container.style.setProperty("--sheet-width-mm", `${widthMm}mm`);
    container.style.setProperty("--sheet-height-mm", `${heightMm}mm`);

    const pageNode = createElement("div", "printer-page");
    const printerType = String(layout?.printerType || "").trim();
    const isBlankCanvas = String(layout?.templateKind || "").trim() === "blank_canvas";
    if (printerType) {
      pageNode.classList.add(`printer-page--${printerType.replace(/_/g, "-")}`);
    }
    const pageBorderWidth = isBlankCanvas ? 0 : Math.max(0, Number(page.borderWidth || 0));
    pageNode.style.backgroundColor = page.backgroundColor || "#FFFFFF";
    pageNode.style.setProperty("--printer-accent-color", printerType === "dot_matrix" ? "#000000" : "#24378C");
    pageNode.style.setProperty("--printer-border-color", page.borderColor || "#2F3F95");
    pageNode.style.setProperty("--printer-page-border-color", isBlankCanvas ? "transparent" : (page.borderColor || "#2F3F95"));
    pageNode.style.setProperty("--printer-page-border-width", `${pageBorderWidth}px`);
    pageNode.style.setProperty("--printer-page-safe-margin", "0mm");

    if (options?.editable) {
      pageNode.classList.add("printer-page--interactive");
    }

    const sortedLayoutElements = sortElements(layout?.elements);
    const dotMatrixPrintBreak = printerType === "dot_matrix"
      ? sortedLayoutElements.find(element => element?.kind === "printBreak")
      : null;
    const dotMatrixPrintBreakTop = dotMatrixPrintBreak
      ? clampPercent(Number(dotMatrixPrintBreak.y || 0), 0, 100)
      : null;
    if (dotMatrixPrintBreak) {
      pageNode.classList.add("printer-page--has-print-break");
      pageNode.style.setProperty("--dot-matrix-print-break-top", `${dotMatrixPrintBreakTop}%`);
      pageNode.style.setProperty("--dot-matrix-print-break-height", `${(heightMm * dotMatrixPrintBreakTop) / 100}mm`);
    }

    createManagedRows(layout, entry, options).forEach(sectionNode => {
      if (!options?.editable && dotMatrixPrintBreakTop !== null) {
        const sectionTop = Number.parseFloat(sectionNode.style.top || "0");
        if (Number.isFinite(sectionTop) && sectionTop >= dotMatrixPrintBreakTop) return;
      }
      pageNode.appendChild(sectionNode);
    });

    sortedLayoutElements.forEach(element => {
      if (!options?.editable && dotMatrixPrintBreakTop !== null) {
        if (element?.kind === "printBreak") return;
        if (Number(element?.y || 0) >= dotMatrixPrintBreakTop) return;
      }
      pageNode.appendChild(createRenderedElement(element, entry, options, layout));
    });

    container.appendChild(pageNode);
    fitThermalText(pageNode);
  }

  window.PrinterLayoutRenderer = {
    render,
    getFieldValue,
    formatFieldValue,
    getPhotoUrl,
  };
})();
