const printerLayoutApiUrl = "/settings/api/printer-layout";
const printerLayoutActiveApiUrl = "/settings/api/printer-layout/active";
const printerAssetUploadApiUrl = "/settings/api/printer-layout/assets";
const printerLayoutTemplatesApiUrl = "/settings/api/printer-layout/templates";
const printerLayoutTemplateDeleteApiUrl = "/settings/api/printer-layout/templates";
const PRINTER_DRAFT_STORAGE_KEY = "weighman:printer-draft";
const PRINTER_DRAFT_LAYOUT_STORAGE_KEY = "weighman:printer-draft-layout";
const CURRENT_EDITOR_TEMPLATE_SOURCE = "__current__";
const BASE_TEMPLATE_REMOVABLE_FIELD_SOURCES = new Set(["entryDate", "entryTime"]);
const CSS_PIXELS_PER_MM = 96 / 25.4;
const DOT_MATRIX_DEFAULT_FONT_FAMILY = "Dot Matrix Draft";
const DOT_MATRIX_FONT_FAMILY_OPTIONS = [
  "Dot Matrix Draft",
  "FS Blok",
  "Times New Roman",
  "Arial",
  "Calibri",
  "Courier New",
  "Georgia",
  "Verdana",
  "Tahoma",
  "Trebuchet MS",
  "Garamond",
  "Consolas",
  "Lucida Console",
];

const printerControls = {
  editorCard: document.querySelector("#entryCard"),
  fullscreenButton: document.querySelector("#togglePrinterFullscreen"),
  fullscreenPreviewButton: document.querySelector("#previewPrinterFullscreen"),
  preview: document.querySelector("#printerLayoutPreview"),
  previewStage: document.querySelector("#printerSheetStage"),
  previewMeta: document.querySelector("#printerPreviewMeta"),
  printerTypeList: document.querySelector("#printerTypeList"),
  templateGrid: document.querySelector("#printerTemplateGrid"),
  templateStatus: document.querySelector("#printerTemplateStatus"),
  templateHint: document.querySelector("#printerTemplateHint"),
  createTemplateButton: document.querySelector("#createPrinterTemplate"),
  createTemplateModal: document.querySelector("#printerCreateTemplateModal"),
  createTemplateType: document.querySelector("#printerCreateTemplateType"),
  createTemplateHelp: document.querySelector("#printerCreateTemplateHelp"),
  templateSourceSelect: document.querySelector("#printerTemplateSource"),
  createTemplateNameInput: document.querySelector("#printerCreateTemplateName"),
  closeCreateTemplateButton: document.querySelector("#closePrinterCreateTemplate"),
  cancelCreateTemplateButton: document.querySelector("#cancelPrinterCreateTemplate"),
  confirmCreateTemplateButton: document.querySelector("#confirmPrinterCreateTemplate"),
  pageWidthMm: document.querySelector("#pageWidthMm"),
  pageHeightMm: document.querySelector("#pageHeightMm"),
  pageOrientation: document.querySelector("#pageOrientation"),
  pageBackgroundColor: document.querySelector("#pageBackgroundColor"),
  pageBorderColor: document.querySelector("#pageBorderColor"),
  pageBorderWidth: document.querySelector("#pageBorderWidth"),
  dotMatrixFontFamilyField: document.querySelector("#dotMatrixFontFamilyField"),
  dotMatrixFontFamily: document.querySelector("#dotMatrixFontFamily"),
  fieldRowsManager: document.querySelector("#printerFieldRowsManager"),
  addFieldRowButton: document.querySelector("#addPrinterFieldRow"),
  quickAddFieldSource: document.querySelector("#quickAddFieldSource"),
  quickAddPhotoSource: document.querySelector("#quickAddPhotoSource"),
  elementList: document.querySelector("#printerElementList"),
  inspector: document.querySelector("#printerElementInspector"),
  addButtons: Array.from(document.querySelectorAll("[data-add-kind]")),
  clearSelectionButton: document.querySelector("#clearPrinterSelection"),
  duplicateButton: document.querySelector("#duplicatePrinterElement"),
  deleteButton: document.querySelector("#deletePrinterElement"),
  resetButton: document.querySelector("#resetPrinterLayout"),
  openPreviewButton: document.querySelector("#openPrinterPreview"),
  deleteTemplateButton: document.querySelector("#deletePrinterTemplate"),
  saveButton: document.querySelector("#savePrinterLayout"),
  imageUpload: document.querySelector("#printerImageUpload"),
  inspectorTitle: document.querySelector("#printerInspectorTitle"),
  inspectorDescription: document.querySelector("#printerInspectorDescription"),
  inspectorDefaultMode: document.querySelector("#printerInspectorDefaultMode"),
  inspectorElementMode: document.querySelector("#printerInspectorElementMode"),
  tabVisualEditor: document.querySelector("#tabVisualEditor"),
  tabDotMatrixRaw: document.querySelector("#tabDotMatrixRaw"),
  dotMatrixRawStage: document.querySelector("#dotMatrixRawStage"),
  rawPrinterSelect: document.querySelector("#rawPrinterSelect"),
  rawLineWidth: document.querySelector("#rawLineWidth"),
  rawFeedMode: document.querySelector("#rawFeedMode"),
  rawExtraLinesField: document.querySelector("#rawExtraLinesField"),
  rawExtraLines: document.querySelector("#rawExtraLines"),
  rawSet6Inch: document.querySelector("#rawSet6Inch"),
  rawSendFf: document.querySelector("#rawSendFf"),
  rawDirectPrintBtn: document.querySelector("#rawDirectPrintBtn"),
  rawTotalLines: document.querySelector("#rawTotalLines"),
  rawPreviewGrid: document.querySelector("#rawPreviewGrid"),
  rawAddFieldSource: document.querySelector("#rawAddFieldSource"),
};

const printerState = {
  layout: null,
  defaultLayout: null,
  sampleEntry: null,
  fieldOptions: [],
  photoOptions: [],
  printerTypes: [],
  templates: [],
  activeLayoutName: "",
  currentLayoutName: "",
  currentPrinterType: "",
  selectedElementId: null,
  activeInteraction: null,
  activeManagedRowInteraction: null,
  dragAddKind: null,
  dropTarget: false,
};

let previewFitFrame = 0;

function applyPrinterFullscreenState(isFullscreen) {
  printerControls.editorCard?.classList.toggle("is-fullscreen", isFullscreen);
  document.body.classList.toggle("printer-editor-fullscreen", isFullscreen);
  if (printerControls.fullscreenButton) {
    printerControls.fullscreenButton.setAttribute("aria-label", isFullscreen
      ? "Close full-screen layout editor"
      : "Open full-screen layout editor");
    printerControls.fullscreenButton.title = isFullscreen ? "Exit full screen" : "Full screen";
    printerControls.fullscreenButton.setAttribute("aria-pressed", String(isFullscreen));
  }
  queuePreviewFit();
}

printerControls.fullscreenButton?.addEventListener("click", async () => {
  const editorCard = printerControls.editorCard;
  if (!editorCard) return;

  if (document.fullscreenElement === editorCard) {
    await document.exitFullscreen?.();
    return;
  }

  if (editorCard.requestFullscreen) {
    try {
      await editorCard.requestFullscreen();
      return;
    } catch (error) {
      // Fall back to the CSS full-screen view when browser full screen is unavailable.
    }
  }

  applyPrinterFullscreenState(!editorCard.classList.contains("is-fullscreen"));
});

document.addEventListener("fullscreenchange", () => {
  applyPrinterFullscreenState(document.fullscreenElement === printerControls.editorCard);
});

document.addEventListener("keydown", event => {
  if (
    event.key === "Escape" &&
    !document.fullscreenElement &&
    printerControls.editorCard?.classList.contains("is-fullscreen")
  ) {
    applyPrinterFullscreenState(false);
  }
});

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizePhotoOptions(options) {
  return (options || []).map(option => ({
    ...option,
    group: "Camera Photos",
  }));
}

function hasUnsavedLayoutChanges() {
  if (!printerState.layout || !printerState.defaultLayout) return false;
  return JSON.stringify(printerState.layout) !== JSON.stringify(printerState.defaultLayout);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function groupedOptions(options) {
  return options.reduce((groups, option) => {
    const group = option.group || "General";
    groups[group] = groups[group] || [];
    groups[group].push(option);
    return groups;
  }, {});
}

function populateSelect(select, options, selectedValue) {
  if (!select) return;
  select.innerHTML = "";
  const groups = groupedOptions(options);

  Object.entries(groups).forEach(([groupLabel, groupOptions]) => {
    const parent = groupLabel === "General" ? select : document.createElement("optgroup");
    if (groupLabel !== "General") parent.label = groupLabel;

    groupOptions.forEach(option => {
      const optionNode = document.createElement("option");
      optionNode.value = option.key;
      optionNode.textContent = option.label;
      optionNode.selected = option.key === selectedValue;
      parent.appendChild(optionNode);
    });

    if (groupLabel !== "General") select.appendChild(parent);
  });
}

function populateSimpleSelect(select, values, selectedValue) {
  if (!select) return;
  select.innerHTML = "";
  values.forEach(value => {
    const optionNode = document.createElement("option");
    optionNode.value = String(value);
    optionNode.textContent = String(value);
    optionNode.selected = String(value) === String(selectedValue);
    select.appendChild(optionNode);
  });
}

function optionLabelFor(options, key, fallback = "") {
  return options.find(option => option.key === key)?.label || fallback;
}

function nonBlankOptions(options) {
  return (options || []).filter(option => option.key);
}

function printerTypeOptions() {
  return printerState.printerTypes || [];
}

function printerTypeConfig(printerType) {
  const normalizedType = String(printerType || "").trim();
  return printerTypeOptions().find(option => option.key === normalizedType) || null;
}

function printerTypeLabel(printerType) {
  return printerTypeConfig(printerType)?.label || "Printer";
}

function currentPrinterType() {
  return (
    printerState.currentPrinterType ||
    printerState.layout?.printerType ||
    printerState.templates.find(template => template.name === printerState.currentLayoutName)?.printerType ||
    printerTypeOptions()[0]?.key ||
    "a4"
  );
}

function currentPrinterTypeLimits() {
  return printerTypeConfig(currentPrinterType())?.limits || {
    minWidthMm: 55,
    maxWidthMm: 320,
    minHeightMm: 90,
    maxHeightMm: 260,
  };
}

function templatesForPrinterType(printerType) {
  const normalizedType = String(printerType || "").trim();
  return (printerState.templates || []).filter(template => template.printerType === normalizedType);
}

function managedSections() {
  return Array.isArray(printerState.layout?.managedSections) ? printerState.layout.managedSections : [];
}

function totalManagedRowCount() {
  return managedSections().reduce((count, section) => {
    const rows = Array.isArray(section.rows) ? section.rows : [];
    return count + rows.length;
  }, 0);
}

function findFieldSection(sectionId) {
  return managedSections().find(section => section.id === sectionId) || null;
}

function currentTemplateRecord() {
  const currentName = printerState.currentLayoutName || printerState.activeLayoutName;
  return (printerState.templates || []).find(template => template.name === currentName) || null;
}

function templateIsLocked(template) {
  if (!template) return false;
  return false;
}

function currentTemplateIsLocked() {
  return templateIsLocked(currentTemplateRecord());
}

function currentTemplateAllowsEdits() {
  return !currentTemplateIsLocked();
}

function currentTemplateAllowsRestrictedEdits() {
  return currentTemplateIsLocked();
}

function canEditSelectedElementProperty(property, element = findSelectedElement()) {
  if (!element || !property) return false;
  if (currentTemplateAllowsEdits()) return true;
  if (!currentTemplateAllowsRestrictedEdits()) return false;

  if (property === "valueFontSize") {
    return element.kind === "field" || element.kind === "weight";
  }

  if (property === "metaFontSize") {
    return element.kind === "weight" && Array.isArray(element.metaSources) && element.metaSources.length > 0;
  }

  return false;
}

function canDeleteManagedField(field) {
  if (!field) return false;
  if (currentTemplateAllowsEdits()) return true;
  if (!currentTemplateAllowsRestrictedEdits()) return false;
  return BASE_TEMPLATE_REMOVABLE_FIELD_SOURCES.has(field.source);
}

function updateInspectorPanelMode() {
  const element = findSelectedElement();
  const hasElement = Boolean(element);

  if (printerControls.inspectorTitle) {
    printerControls.inspectorTitle.textContent = hasElement ? "Selected Element" : "Layout Settings";
  }

  if (printerControls.inspectorDescription) {
    printerControls.inspectorDescription.textContent = hasElement
      ? "Fine-tune the highlighted block or upload a logo image."
      : "Adjust page size, row groups, and add new content when nothing is selected.";
  }

  printerControls.inspectorDefaultMode?.classList.toggle("is-hidden", hasElement);
  printerControls.inspectorElementMode?.classList.toggle("is-hidden", !hasElement);
}

function createTemplateSourceOptions() {
  const resolvedPrinterType = currentPrinterType();
  const currentLayoutName = printerState.currentLayoutName || printerState.activeLayoutName || "Current Template";
  const sourceOptions = [];

  if (hasUnsavedLayoutChanges()) {
    sourceOptions.push({
      key: CURRENT_EDITOR_TEMPLATE_SOURCE,
      label: `Current editor (${currentLayoutName})`,
      group: "Current Layout",
    });
  }

  templatesForPrinterType(resolvedPrinterType).forEach(template => {
    sourceOptions.push({
      key: template.name,
      label: template.isBaseTemplate ? `${template.name} (Default)` : template.name,
      group: `${printerTypeLabel(resolvedPrinterType)} Templates`,
    });
  });

  return sourceOptions;
}

function nextFieldRowId() {
  let counter = 1;
  let nextId = `row-${counter}`;
  while (managedSections().some(section => (section.rows || []).some(row => row.id === nextId))) {
    counter += 1;
    nextId = `row-${counter}`;
  }
  return nextId;
}

function nextManagedSectionId() {
  let counter = 1;
  let nextId = `section-${counter}`;
  while (managedSections().some(section => section.id === nextId)) {
    counter += 1;
    nextId = `section-${counter}`;
  }
  return nextId;
}

function nextFieldRowFieldId(row) {
  let counter = 1;
  let nextId = `${row.id}-field-${counter}`;
  while ((row.fields || []).some(field => field.id === nextId)) {
    counter += 1;
    nextId = `${row.id}-field-${counter}`;
  }
  return nextId;
}

function createManagedRowField(row, source = null) {
  const resolvedSource = source || printerControls.quickAddFieldSource?.value || "serialNo";
  const defaultFontFamily = printerState.layout?.defaults?.fontFamily || DOT_MATRIX_DEFAULT_FONT_FAMILY;
  return {
    id: nextFieldRowFieldId(row),
    label: optionLabelFor(printerState.fieldOptions, resolvedSource, "Field"),
    source: resolvedSource,
    fontSize: 8,
    cpi: currentPrinterType() === "dot_matrix" ? 10 : 10,
    fontFamily: currentPrinterType() === "dot_matrix" ? defaultFontFamily : "",
    textColor: currentPrinterType() === "dot_matrix" ? "#000000" : "",
  };
}

function dotMatrixNextRowSectionY() {
  const sections = managedSections();
  if (!sections.length) return 8;

  const lowestBottom = sections.reduce((bottom, section) => {
    const y = Number(section?.y || 0);
    const rowHeight = Number(section?.rowHeight || 6.5);
    const rows = Array.isArray(section?.rows) ? section.rows.length : 0;
    const sectionHeight = rows > 0 ? Math.max(rowHeight, rows * rowHeight) : 0;
    return Math.max(bottom, y + sectionHeight);
  }, 0);

  return Number(clamp(lowestBottom > 0 ? lowestBottom + 2 : 0, 0, 92).toFixed(2));
}

function createDotMatrixRowSection(row) {
  const sectionNumber = managedSections().length + 1;
  return {
    id: nextManagedSectionId(),
    name: `Row ${sectionNumber}`,
    x: 0,
    y: dotMatrixNextRowSectionY(),
    w: 100,
    rowHeight: 7,
    baseRows: 1,
    shiftStartY: 100,
    rows: [row],
  };
}

function findFieldRow(sectionId, rowId) {
  const section = findFieldSection(sectionId);
  return (section?.rows || []).find(row => row.id === rowId) || null;
}

function findFieldRowField(sectionId, rowId, fieldId) {
  const section = findFieldSection(sectionId);
  const row = findFieldRow(sectionId, rowId);
  if (!section || !row) {
    return { section: null, row: null, field: null };
  }
  return {
    section,
    row,
    field: (row.fields || []).find(field => field.id === fieldId) || null,
  };
}

function findSelectedElement() {
  return (printerState.layout?.elements || []).find(
    element => element.id === printerState.selectedElementId
  ) || null;
}

function findElementById(elementId) {
  return (printerState.layout?.elements || []).find(element => element.id === elementId) || null;
}

function nextElementId(kind) {
  const slug = kind.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  let counter = 1;
  let nextId = `${slug}-${counter}`;
  while (findElementById(nextId)) {
    counter += 1;
    nextId = `${slug}-${counter}`;
  }
  return nextId;
}

function describeElementKind(kind) {
  switch (kind) {
    case "field":
      return "Field";
    case "weight":
      return "Weight Box";
    case "photo":
      return "Photo";
    case "image":
      return "Logo";
    case "printBreak":
      return "Print Break";
    default:
      return "Text";
  }
}

function createElementDefaults(kind) {
  const baseZ = (printerState.layout?.elements?.length || 0) + 1;
  const defaultFontFamily = currentPrinterType() === "dot_matrix"
    ? (printerState.layout?.defaults?.fontFamily || DOT_MATRIX_DEFAULT_FONT_FAMILY)
    : "";
  const basePosition = {
    x: 8 + ((baseZ - 1) % 5) * 3,
    y: 8 + ((baseZ - 1) % 4) * 3,
  };

  const defaults = {
    staticText: {
      kind: "staticText",
      name: "Text",
      text: "New Text",
      label: "",
      title: "",
      source: "",
      imageUrl: "",
      unit: "",
      w: 24,
      h: 7,
      fontSize: 14,
      valueFontSize: 18,
      fontWeight: 800,
      fontFamily: defaultFontFamily,
      textColor: "#102039",
      backgroundColor: "transparent",
      borderColor: "transparent",
      borderWidth: 0,
      radius: 0,
      padding: 2,
      align: "left",
      fit: "contain",
      z: baseZ,
    },
    printBreak: {
      kind: "printBreak",
      name: "Print Break",
      text: "PRINT BREAK",
      label: "",
      title: "",
      source: "",
      imageUrl: "",
      unit: "",
      w: 100,
      h: 2,
      fontSize: 10,
      valueFontSize: 10,
      fontWeight: 800,
      fontFamily: defaultFontFamily,
      textColor: "#C026D3",
      backgroundColor: "transparent",
      borderColor: "#C026D3",
      borderWidth: 1,
      radius: 0,
      padding: 0,
      align: "center",
      fit: "contain",
      z: baseZ,
    },
    field: {
      kind: "field",
      name: "Field",
      text: "",
      label: "New Field",
      title: "",
      source: "serialNo",
      imageUrl: "",
      unit: "",
      w: 26,
      h: 8,
      fontSize: 13,
      valueFontSize: 14,
      fontWeight: 800,
      fontFamily: defaultFontFamily,
      textColor: currentPrinterType() === "dot_matrix" ? "#000000" : "#24378C",
      backgroundColor: "transparent",
      borderColor: "transparent",
      borderWidth: 0,
      radius: 0,
      padding: 0,
      align: "left",
      fit: "contain",
      z: baseZ,
    },
    weight: {
      kind: "weight",
      name: "Weight Box",
      text: "",
      label: "Weight",
      title: "",
      source: "grossWeight",
      imageUrl: "",
      unit: "Kg",
      w: 24,
      h: 14,
      fontSize: 12,
      valueFontSize: 26,
      showWeightValue: true,
      fontWeight: 900,
      fontFamily: defaultFontFamily,
      textColor: currentPrinterType() === "dot_matrix" ? "#000000" : "#24378C",
      backgroundColor: "transparent",
      borderColor: "#2F3F95",
      borderWidth: 1,
      radius: 0,
      padding: 1,
      align: "center",
      fit: "contain",
      z: baseZ,
    },
    image: {
      kind: "image",
      name: "Logo",
      text: "",
      label: "",
      title: "",
      source: "",
      imageUrl: "",
      unit: "",
      w: 14,
      h: 14,
      fontSize: 14,
      valueFontSize: 14,
      fontWeight: 800,
      fontFamily: defaultFontFamily,
      textColor: currentPrinterType() === "dot_matrix" ? "#000000" : "#24378C",
      backgroundColor: "transparent",
      borderColor: "transparent",
      borderWidth: 0,
      radius: 4,
      padding: 2,
      align: "center",
      fit: "contain",
      z: baseZ,
    },
    photo: {
      kind: "photo",
      name: "Photo",
      text: "",
      label: "",
      title: "Camera Photo",
      source: "camera:1",
      imageUrl: "",
      unit: "",
      w: 28,
      h: 24,
      fontSize: 10,
      valueFontSize: 14,
      fontWeight: 800,
      fontFamily: defaultFontFamily,
      textColor: "#24378C",
      backgroundColor: "transparent",
      borderColor: "transparent",
      borderWidth: 0,
      radius: 0,
      padding: 1,
      align: "center",
      fit: "cover",
      z: baseZ,
    },
  };

  return {
    id: nextElementId(kind),
    x: basePosition.x,
    y: basePosition.y,
    ...defaults[kind],
  };
}

function defaultWeightMetaSources(source) {
  switch (source) {
    case "grossWeight":
      return ["grossDate", "grossTime"];
    case "tareWeight":
      return ["tareDate", "tareTime"];
    default:
      return [];
  }
}

function normalizeWeightSource(source) {
  return ["grossWeight", "tareWeight", "netWeight"].includes(source) ? source : "grossWeight";
}

function weightLabelForSource(source) {
  switch (source) {
    case "grossWeight":
      return "Gross Weight";
    case "tareWeight":
      return "Tare Weight";
    case "netWeight":
      return "Net Weight";
    default:
      return "Weight";
  }
}

function applyWeightSourceDefaults(element, requestedSource) {
  if (!element || element.kind !== "weight") return;
  const source = normalizeWeightSource(requestedSource || element.source);
  const label = weightLabelForSource(source);
  element.source = source;
  element.label = label;
  element.name = label;
  element.metaSources = defaultWeightMetaSources(source);
  if (!element.metaFontSize) {
    element.metaFontSize = 8;
  }
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function pageOrientationFromSize(page) {
  return Number(page?.heightMm || 0) > Number(page?.widthMm || 0) ? "portrait" : "landscape";
}

function normalizePageOrientation(page) {
  if (!page) return "landscape";
  const orientation = String(page.orientation || "").trim().toLowerCase();
  if (orientation === "portrait" || orientation === "landscape") return orientation;
  return pageOrientationFromSize(page);
}

function normalizePageOrientationForCurrentPrinter(page) {
  if (currentPrinterType() === "dot_matrix") {
    const orientation = String(page?.orientation || "").trim().toLowerCase();
    return orientation === "portrait" || orientation === "landscape" ? orientation : "landscape";
  }
  return normalizePageOrientation(page);
}

function setPageOrientation(page, orientation) {
  if (!page) return;
  const nextOrientation = orientation === "portrait" ? "portrait" : "landscape";
  if (currentPrinterType() === "dot_matrix") {
    page.orientation = nextOrientation;
    return;
  }
  if (currentPrinterType() === "a5") {
    page.orientation = nextOrientation;
    return;
  }
  const longSide = Math.max(Number(page.widthMm || 210), Number(page.heightMm || 148));
  const shortSide = Math.min(Number(page.widthMm || 210), Number(page.heightMm || 148));
  page.orientation = nextOrientation;
  page.widthMm = nextOrientation === "portrait" ? shortSide : longSide;
  page.heightMm = nextOrientation === "portrait" ? longSide : shortSide;
}

function renderPageControls() {
  const page = printerState.layout?.page;
  if (!page) return;
  const limits = currentPrinterTypeLimits();
  const isDotMatrix = currentPrinterType() === "dot_matrix";
  printerState.layout.defaults = printerState.layout.defaults || {};
  if (isDotMatrix && !printerState.layout.defaults.fontFamily) {
    printerState.layout.defaults.fontFamily = DOT_MATRIX_DEFAULT_FONT_FAMILY;
  }
  printerControls.pageWidthMm.min = String(limits.minWidthMm);
  printerControls.pageWidthMm.max = String(limits.maxWidthMm);
  printerControls.pageHeightMm.min = String(limits.minHeightMm);
  printerControls.pageHeightMm.max = String(limits.maxHeightMm);
  printerControls.pageWidthMm.value = page.widthMm;
  printerControls.pageHeightMm.value = page.heightMm;
  if (printerControls.pageOrientation) {
    page.orientation = normalizePageOrientationForCurrentPrinter(page);
    printerControls.pageOrientation.value = page.orientation;
  }
  printerControls.pageBackgroundColor.value = page.backgroundColor;
  printerControls.pageBorderColor.value = page.borderColor;
  printerControls.pageBorderWidth.value = page.borderWidth;
  if (printerControls.dotMatrixFontFamilyField) {
    printerControls.dotMatrixFontFamilyField.hidden = !isDotMatrix;
  }
  populateSimpleSelect(
    printerControls.dotMatrixFontFamily,
    DOT_MATRIX_FONT_FAMILY_OPTIONS,
    printerState.layout.defaults?.fontFamily || DOT_MATRIX_DEFAULT_FONT_FAMILY
  );

  const isLocked = currentTemplateIsLocked();
  [
    printerControls.pageWidthMm,
    printerControls.pageHeightMm,
    printerControls.pageOrientation,
    printerControls.pageBackgroundColor,
    printerControls.pageBorderColor,
    printerControls.pageBorderWidth,
    printerControls.dotMatrixFontFamily,
  ].forEach(control => {
    if (control) control.disabled = isLocked;
  });
}

function renderQuickAddControls() {
  const fieldOptions = nonBlankOptions(printerState.fieldOptions);
  const photoOptions = nonBlankOptions(printerState.photoOptions);
  const isDotMatrix = currentPrinterType() === "dot_matrix";
  populateSelect(
    printerControls.quickAddFieldSource,
    fieldOptions,
    printerControls.quickAddFieldSource?.value || fieldOptions[0]?.key || "serialNo"
  );
  populateSelect(
    printerControls.quickAddPhotoSource,
    photoOptions,
    printerControls.quickAddPhotoSource?.value || photoOptions[0]?.key || "camera:1"
  );
  populateSelect(
    printerControls.rawAddFieldSource,
    fieldOptions,
    printerControls.rawAddFieldSource?.value || fieldOptions[0]?.key || "serialNo"
  );

  const isLocked = currentTemplateIsLocked();
  if (printerControls.quickAddFieldSource) printerControls.quickAddFieldSource.disabled = isLocked;
  if (printerControls.quickAddPhotoSource) printerControls.quickAddPhotoSource.disabled = isLocked;
  printerControls.addButtons.forEach(button => {
    const isImageButton = button.dataset.addKind === "image";
    const isPrintBreakButton = button.dataset.addKind === "printBreak";
    const disableButton = isLocked || (isDotMatrix && isImageButton) || (!isDotMatrix && isPrintBreakButton);
    button.disabled = disableButton;
    button.draggable = !disableButton;
    button.hidden = Boolean((isDotMatrix && isImageButton) || (!isDotMatrix && isPrintBreakButton));
  });
}

function renderTemplateControls() {
  const resolvedPrinterType = currentPrinterType();
  printerState.currentPrinterType = resolvedPrinterType;
  const currentTypeLabel = printerTypeLabel(resolvedPrinterType);
  const visibleTemplates = templatesForPrinterType(resolvedPrinterType);
  const currentTemplate = currentTemplateRecord();
  const isBaseTemplate = Boolean(currentTemplate?.isBaseTemplate);
  const isLockedTemplate = templateIsLocked(currentTemplate);

  if (printerControls.printerTypeList) {
    printerControls.printerTypeList.innerHTML = "";
    printerTypeOptions().forEach(option => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "printer-type-card";
      button.dataset.printerType = option.key;
      if (option.key === resolvedPrinterType) {
        button.classList.add("is-selected");
      }

      const heading = document.createElement("strong");
      heading.textContent = option.label;

      const description = document.createElement("span");
      description.textContent = option.description;

      const range = document.createElement("span");
      range.className = "printer-type-card__range";
      range.textContent = `${option.pageDefaults.widthMm} x ${option.pageDefaults.heightMm} mm`;

      button.append(heading, description, range);
      printerControls.printerTypeList.appendChild(button);
    });
  }

  if (printerControls.templateGrid) {
    printerControls.templateGrid.innerHTML = "";

    if (!visibleTemplates.length) {
      printerControls.templateGrid.innerHTML = `<div class="printer-empty-state">No templates are available for ${escapeHtml(currentTypeLabel)} yet.</div>`;
    } else {
      visibleTemplates.forEach(template => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "printer-template-card";
        button.dataset.templateName = template.name;
        if (template.name === printerState.currentLayoutName) {
          button.classList.add("is-current");
        }

        const head = document.createElement("div");
        head.className = "printer-template-card__head";

        const title = document.createElement("strong");
        title.textContent = template.name;

        const badges = document.createElement("div");
        badges.className = "printer-template-card__badges";

        if (template.isBaseTemplate) {
          const chip = document.createElement("span");
          chip.className = "printer-chip printer-chip--base";
          chip.textContent = "Default";
          badges.appendChild(chip);
        }

        if (template.isBlankTemplate) {
          const chip = document.createElement("span");
          chip.className = "printer-chip printer-chip--base";
          chip.textContent = "Blank";
          badges.appendChild(chip);
        }

        if (template.isActive) {
          const chip = document.createElement("span");
          chip.className = "printer-chip printer-chip--active";
          chip.textContent = "Print";
          badges.appendChild(chip);
        }

        if (template.name === printerState.currentLayoutName) {
          const chip = document.createElement("span");
          chip.className = "printer-chip printer-chip--current";
          chip.textContent = "Open";
          badges.appendChild(chip);
        }

        head.append(title, badges);

        const meta = document.createElement("span");
        meta.className = "printer-template-card__meta";
        meta.textContent = template.isBlankTemplate
          ? `Empty ${currentTypeLabel} canvas`
          : template.isBaseTemplate
          ? `Starter layout for ${currentTypeLabel}`
          : `${currentTypeLabel} customer template`;

        button.append(head, meta);
        printerControls.templateGrid.appendChild(button);
      });
    }
  }

  if (printerControls.templateStatus) {
    const templateName = printerState.currentLayoutName || printerState.activeLayoutName || "Template";
    printerControls.templateStatus.textContent = `Current: ${currentTypeLabel} / ${templateName}${isBaseTemplate ? " (Default)" : ""}`;
  }

  if (printerControls.templateHint) {
    printerControls.templateHint.textContent = isLockedTemplate
      ? "Default templates allow only value size, date/time size, and removing the top date/time fields. Everything else stays locked."
      : "Click any template card to load it. Drag and drop fields anywhere, then save the template.";
  }

  if (printerControls.createTemplateButton) {
    printerControls.createTemplateButton.textContent = `Create ${currentTypeLabel} Template`;
  }

  if (printerControls.saveButton) {
    printerControls.saveButton.disabled = false;
    printerControls.saveButton.textContent = isLockedTemplate ? "Save Allowed Default Changes" : "Save Template";
    printerControls.saveButton.title = isLockedTemplate
      ? "Only value size, date/time size, and removing top date/time fields can be saved on default templates."
      : "Save changes to this template";
  }

  if (printerControls.deleteTemplateButton) {
    const deleteProtected = Boolean(currentTemplate?.isProtectedTemplate);
    printerControls.deleteTemplateButton.disabled = deleteProtected;
    printerControls.deleteTemplateButton.title = deleteProtected
      ? "Built-in templates cannot be deleted."
      : "Delete this created template";
  }

  const disableEditing = currentTemplateIsLocked();
  if (printerControls.createTemplateButton) {
    printerControls.createTemplateButton.disabled = false;
  }
  if (printerControls.addFieldRowButton) {
    printerControls.addFieldRowButton.disabled = disableEditing;
  }
  if (printerControls.duplicateButton) {
    printerControls.duplicateButton.disabled = disableEditing;
  }
  if (printerControls.deleteButton) {
    printerControls.deleteButton.disabled = disableEditing;
  }
}

function openCreateTemplateModal() {
  if (!printerState.layout || !printerControls.createTemplateModal) return;

  const resolvedPrinterType = currentPrinterType();
  const currentTypeLabel = printerTypeLabel(resolvedPrinterType);
  const sourceOptions = createTemplateSourceOptions();
  const defaultSourceValue = hasUnsavedLayoutChanges()
    ? CURRENT_EDITOR_TEMPLATE_SOURCE
    : (printerState.currentLayoutName || templatesForPrinterType(resolvedPrinterType)[0]?.name || "");

  if (printerControls.createTemplateType) {
    printerControls.createTemplateType.textContent = `${currentTypeLabel} Template`;
  }

  if (printerControls.createTemplateHelp) {
    printerControls.createTemplateHelp.textContent = hasUnsavedLayoutChanges()
      ? "Choose a saved template to copy, or use Current editor to include the changes you have not saved yet."
      : "Choose which saved template to copy. Default templates stay unchanged.";
  }

  populateSelect(printerControls.templateSourceSelect, sourceOptions, defaultSourceValue);

  if (printerControls.createTemplateNameInput) {
    printerControls.createTemplateNameInput.value = "";
    printerControls.createTemplateNameInput.placeholder = `${currentTypeLabel} customer layout`;
  }

  printerControls.createTemplateModal.classList.add("open");
  printerControls.createTemplateModal.setAttribute("aria-hidden", "false");
  window.setTimeout(() => {
    printerControls.createTemplateNameInput?.focus();
  }, 0);
}

function closeCreateTemplateModal() {
  if (!printerControls.createTemplateModal) return;
  printerControls.createTemplateModal.classList.remove("open");
  printerControls.createTemplateModal.setAttribute("aria-hidden", "true");
}

function renderFieldRowsManager() {
  const manager = printerControls.fieldRowsManager;
  if (!manager) return;
  const sections = managedSections();
  const isLocked = currentTemplateIsLocked();
  const isDotMatrix = currentPrinterType() === "dot_matrix";

  if (!sections.length) {
    manager.innerHTML = '<div class="printer-empty-state">No rows added yet. Use Add Row.</div>';
    if (printerControls.addFieldRowButton) {
      printerControls.addFieldRowButton.hidden = false;
      printerControls.addFieldRowButton.textContent = "Add Row";
      printerControls.addFieldRowButton.disabled = isLocked;
    }
    return;
  }

  if (printerControls.addFieldRowButton) {
    printerControls.addFieldRowButton.hidden = sections.length > 1 && !isDotMatrix;
    printerControls.addFieldRowButton.textContent = "Add Row";
    printerControls.addFieldRowButton.disabled = isLocked;
  }

  manager.innerHTML = "";
  sections.forEach(section => {
    const sectionWrap = document.createElement("section");
    sectionWrap.className = "printer-row-section";
    sectionWrap.innerHTML = `
      <div class="printer-sidebar-section__head">
        <h3>${escapeHtml(section.name || "Field Section")}</h3>
        <p>Rows in this area stay editable in the print template.</p>
      </div>
    `;

    const rows = Array.isArray(section.rows) ? section.rows : [];
    if (!rows.length) {
      const empty = document.createElement("div");
      empty.className = "printer-empty-state printer-empty-state--compact";
      empty.textContent = "No rows added yet. Use Add Row.";
      sectionWrap.appendChild(empty);
    }

    rows.forEach((row, rowIndex) => {
      const card = document.createElement("section");
      card.className = "printer-row-card";
      card.dataset.sectionId = section.id;
      card.dataset.rowId = row.id;

      const head = document.createElement("div");
      head.className = "printer-row-card__head";
      head.innerHTML = `
        <strong>Row ${rowIndex + 1}</strong>
        <div class="printer-row-card__actions">
          <button type="button" data-section-id="${section.id}" data-add-row-field="${row.id}" ${isLocked ? "disabled" : ""}>Add Field</button>
          <button type="button" class="primary" data-save-layout ${isLocked ? "disabled" : ""}>Save</button>
          <button type="button" class="danger" data-section-id="${section.id}" data-delete-row="${row.id}" ${isLocked ? "disabled" : ""}>Delete Row</button>
        </div>
      `;
      card.appendChild(head);

      const fieldsWrap = document.createElement("div");
      fieldsWrap.className = "printer-row-fields";

      if (!(row.fields || []).length) {
        const empty = document.createElement("div");
        empty.className = "printer-empty-state printer-empty-state--compact";
        empty.textContent = "No fields in this row. Use Add Field.";
        fieldsWrap.appendChild(empty);
      } else {
        row.fields.forEach(field => {
          const fieldCard = document.createElement("div");
          fieldCard.className = "printer-row-field-card";
          fieldCard.dataset.sectionId = section.id;
          fieldCard.dataset.rowId = row.id;
          fieldCard.dataset.fieldId = field.id;
          fieldCard.innerHTML = `
            <label class="printer-field">
              <span>Field Name</span>
              <input data-section-id="${section.id}" data-row-id="${row.id}" data-field-id="${field.id}" data-row-field-prop="label" value="${escapeHtml(field.label || "")}" autocomplete="off" ${isLocked ? "disabled" : ""}>
            </label>
            <label class="printer-field">
              <span>Value Source</span>
              <select data-section-id="${section.id}" data-row-id="${row.id}" data-field-id="${field.id}" data-row-field-prop="source" ${isLocked ? "disabled" : ""}></select>
            </label>
            ${isDotMatrix ? `
              <label class="printer-field">
                <span>CPI</span>
                <input type="number" min="5" max="20" step="1" data-section-id="${section.id}" data-row-id="${row.id}" data-field-id="${field.id}" data-row-field-prop="cpi" value="${escapeHtml(field.cpi ?? 10)}" ${isLocked ? "disabled" : ""}>
              </label>
              <label class="printer-field">
                <span>Font Family</span>
                <select data-section-id="${section.id}" data-row-id="${row.id}" data-field-id="${field.id}" data-row-field-prop="fontFamily" ${isLocked ? "disabled" : ""}></select>
              </label>
              <label class="printer-field">
                <span>Text Color</span>
                <input type="color" data-section-id="${section.id}" data-row-id="${row.id}" data-field-id="${field.id}" data-row-field-prop="textColor" value="${escapeHtml(field.textColor || "#000000")}" ${isLocked ? "disabled" : ""}>
              </label>
            ` : `
              <label class="printer-field">
                <span>Font Size</span>
                <input type="number" min="6" max="18" step="1" data-section-id="${section.id}" data-row-id="${row.id}" data-field-id="${field.id}" data-row-field-prop="fontSize" value="${escapeHtml(field.fontSize ?? 8)}" ${isLocked ? "disabled" : ""}>
              </label>
            `}
            <div class="printer-row-field-card__actions">
              <button type="button" class="primary" data-save-layout ${isLocked ? "disabled" : ""}>Save</button>
              <button type="button" class="danger printer-row-field-card__delete" data-section-id="${section.id}" data-delete-row-field="${row.id}:${field.id}" ${canDeleteManagedField(field) ? "" : "disabled"}>Delete</button>
            </div>
          `;
          populateSelect(
            fieldCard.querySelector('select[data-row-field-prop="source"]'),
            printerState.fieldOptions,
            field.source
          );
          populateSimpleSelect(
            fieldCard.querySelector('select[data-row-field-prop="fontFamily"]'),
            DOT_MATRIX_FONT_FAMILY_OPTIONS,
            field.fontFamily || DOT_MATRIX_DEFAULT_FONT_FAMILY
          );
          fieldsWrap.appendChild(fieldCard);
        });
      }

      card.appendChild(fieldsWrap);
      sectionWrap.appendChild(card);
    });

    const sectionActions = document.createElement("div");
    sectionActions.className = "printer-list-actions";
    sectionActions.innerHTML = `<button type="button" data-add-section-row="${section.id}" ${isLocked ? "disabled" : ""}>Add Row</button>`;
    sectionWrap.appendChild(sectionActions);
    manager.appendChild(sectionWrap);
  });
}

function renderPreviewMeta() {
  if (printerState.dragAddKind) {
    printerControls.previewMeta.textContent = `Drop the ${describeElementKind(printerState.dragAddKind).toLowerCase()} inside the print-safe border.`;
    return;
  }

  printerControls.previewMeta.textContent = currentTemplateIsLocked()
    ? "Default templates only allow value size, date/time size, and removing the top date/time fields."
    : "Drag tiles from the left to add blocks.";
}

function fitPreviewToStage() {
  const stage = printerControls.previewStage;
  const preview = printerControls.preview;
  const page = printerState.layout?.page;
  if (!stage || !preview || !page) return;

  const widthMm = Number(page.widthMm || 297);
  const heightMm = Number(page.heightMm || 210);
  const stageRect = stage.getBoundingClientRect();
  if (stageRect.width <= 0 || stageRect.height <= 0) return;

  const stageStyle = window.getComputedStyle(stage);
  const paddingX = parseFloat(stageStyle.paddingLeft || "0") + parseFloat(stageStyle.paddingRight || "0");
  const paddingY = parseFloat(stageStyle.paddingTop || "0") + parseFloat(stageStyle.paddingBottom || "0");
  const availableWidth = Math.max(stageRect.width - paddingX, 0);
  const availableHeight = Math.max(stageRect.height - paddingY, 0);
  if (availableWidth <= 0 || availableHeight <= 0) return;

  const basePixelsPerMm = CSS_PIXELS_PER_MM;
  const naturalWidth = Math.max(widthMm * basePixelsPerMm, 1);
  const naturalHeight = Math.max(heightMm * basePixelsPerMm, 1);
  const scale = Math.min(availableWidth / naturalWidth, availableHeight / naturalHeight, 1);
  const previewWidth = naturalWidth * scale;
  const previewHeight = naturalHeight * scale;

  preview.style.width = `${previewWidth}px`;
  preview.style.height = `${previewHeight}px`;
}

function queuePreviewFit() {
  window.cancelAnimationFrame(previewFitFrame);
  previewFitFrame = window.requestAnimationFrame(() => {
    fitPreviewToStage();
  });
}

let rawPreviewRefreshTimer = null;

function renderPreview() {
  renderPreviewMeta();
  window.PrinterLayoutRenderer?.render(
    printerControls.preview,
    printerState.layout,
    printerState.sampleEntry,
    {
      selectable: true,
      editable: currentTemplateAllowsEdits(),
      selectedElementId: printerState.selectedElementId,
      dropTarget: printerState.dropTarget,
    }
  );
  printerControls.preview?.classList.toggle("is-drop-target", printerState.dropTarget);
  queuePreviewFit();

  if (currentViewMode === "raw") {
    clearTimeout(rawPreviewRefreshTimer);
    rawPreviewRefreshTimer = setTimeout(refreshDotMatrixRawPreview, 250);
  }
}

function addFieldRow(sectionId = managedSections()[0]?.id) {
  if (!currentTemplateAllowsEdits()) return;
  if (!printerState.layout) return;

  if (totalManagedRowCount() >= 10) {
    showToast("Maximum 10 rows allowed");
    return;
  }

  const row = {
    id: nextFieldRowId(),
    fields: [],
  };
  row.fields.push(createManagedRowField(row));

  if (currentPrinterType() === "dot_matrix") {
    printerState.layout.managedSections = managedSections();
    printerState.layout.managedSections.push(createDotMatrixRowSection(row));
    renderFieldRowsManager();
    renderPreview();
    return;
  }

  if (sectionId && typeof sectionId !== "string") {
    sectionId = managedSections()[0]?.id;
  }
  if (!sectionId) return;
  const section = findFieldSection(sectionId);
  if (!section) return;
  section.rows = section.rows || [];
  section.rows.push(row);
  renderFieldRowsManager();
  renderPreview();
}

function deleteFieldRow(sectionId, rowId) {
  if (!currentTemplateAllowsEdits()) return;
  const section = findFieldSection(sectionId);
  const existingRow = findFieldRow(sectionId, rowId);
  if (!section || !existingRow) return;
  section.rows = (section.rows || []).filter(row => row.id !== rowId);
  if (currentPrinterType() === "dot_matrix" && section.rows.length === 0) {
    printerState.layout.managedSections = managedSections().filter(item => item.id !== sectionId);
  }
  renderFieldRowsManager();
  renderPreview();
  showToast("Row deleted");
}

function moveFieldRow(sectionId, rowId, direction) {
  if (!currentTemplateAllowsEdits()) return;
  const section = findFieldSection(sectionId);
  const rows = Array.isArray(section?.rows) ? section.rows : null;
  if (!rows?.length) return;

  const currentIndex = rows.findIndex(row => row.id === rowId);
  if (currentIndex < 0) return;

  const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (nextIndex < 0 || nextIndex >= rows.length) return;

  const [row] = rows.splice(currentIndex, 1);
  rows.splice(nextIndex, 0, row);
  renderFieldRowsManager();
  renderPreview();
}

function moveFieldRowToIndex(sectionId, rowId, targetIndex) {
  if (!currentTemplateAllowsEdits()) return false;
  const section = findFieldSection(sectionId);
  const rows = Array.isArray(section?.rows) ? section.rows : null;
  if (!rows?.length) return false;

  const currentIndex = rows.findIndex(row => row.id === rowId);
  if (currentIndex < 0) return false;

  const safeTargetIndex = clamp(Number(targetIndex), 0, rows.length - 1);
  if (safeTargetIndex === currentIndex) return false;

  const [row] = rows.splice(currentIndex, 1);
  rows.splice(safeTargetIndex, 0, row);
  renderFieldRowsManager();
  renderPreview();
  return true;
}

function managedSectionHeightPercent(section) {
  const rows = Array.isArray(section?.rows) ? section.rows : [];
  const rowHeight = Number(section?.rowHeight || 6.5);
  return clamp(rows.length * rowHeight, 2, 100);
}

function beginDotMatrixRowMove(managedRowNode, pageNode, event) {
  const section = findFieldSection(managedRowNode.dataset.sectionId);
  if (!section) return false;
  printerState.activeManagedRowInteraction = {
    mode: "move-section",
    sectionId: managedRowNode.dataset.sectionId,
    rowId: managedRowNode.dataset.rowId,
    pageNode,
    pageRect: pageNode.getBoundingClientRect(),
    startX: event.clientX,
    startY: event.clientY,
    startSectionX: Number(section.x || 0),
    startSectionY: Number(section.y || 0),
  };
  return true;
}

function addFieldToRow(sectionId, rowId) {
  if (!currentTemplateAllowsEdits()) return;
  const row = findFieldRow(sectionId, rowId);
  if (!row) return;

  row.fields = row.fields || [];
  if (row.fields.length >= 6) {
    showToast("Maximum 6 fields allowed in one row");
    return;
  }

  row.fields.push(createManagedRowField(row));
  renderFieldRowsManager();
  renderPreview();
}

function deleteFieldFromRow(sectionId, rowId, fieldId) {
  const { row, field } = findFieldRowField(sectionId, rowId, fieldId);
  if (!row || !field || !canDeleteManagedField(field)) return;

  row.fields = (row.fields || []).filter(item => item.id !== fieldId);
  renderFieldRowsManager();
  renderPreview();
  showToast("Field deleted");
}

function updateRowFieldProperty(sectionId, rowId, fieldId, property, value) {
  if (!currentTemplateAllowsEdits()) return false;
  const { field } = findFieldRowField(sectionId, rowId, fieldId);
  if (!field || !property) return false;

  if (property === "label") {
    field.label = value;
    return true;
  }

  if (property === "source") {
    field.source = value;
    return true;
  }

  if (property === "fontSize") {
    field.fontSize = clamp(Number(value || field.fontSize || 8), 6, 18);
    return true;
  }

  if (property === "cpi") {
    field.cpi = clamp(Number(value || field.cpi || 10), 5, 20);
    return true;
  }

  if (property === "textColor") {
    field.textColor = /^#[0-9a-fA-F]{6}$/.test(String(value || "").trim()) ? String(value).toUpperCase() : (field.textColor || "#000000");
    return true;
  }

  if (property === "fontFamily") {
    field.fontFamily = DOT_MATRIX_FONT_FAMILY_OPTIONS.includes(value)
      ? value
      : DOT_MATRIX_DEFAULT_FONT_FAMILY;
    return true;
  }

  return false;
}

function renderElementList() {
  if (!printerControls.elementList) return;
  printerControls.elementList.innerHTML = "";
  const elements = [...(printerState.layout?.elements || [])]
    .sort((left, right) => Number(left.z || 0) - Number(right.z || 0));

  if (!elements.length) {
    printerControls.elementList.innerHTML = '<div class="printer-empty-state">No elements added yet.</div>';
    return;
  }

  elements.forEach(element => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "printer-element-list__item";
    if (element.id === printerState.selectedElementId) button.classList.add("is-selected");
    button.dataset.selectId = element.id;
    const name = document.createElement("span");
    name.className = "printer-element-list__name";
    name.textContent = element.name || element.kind;
    const meta = document.createElement("span");
    meta.className = "printer-element-list__meta";
    meta.textContent = element.kind;
    button.append(name, meta);
    printerControls.elementList.appendChild(button);
  });
}

function renderInspector() {
  updateInspectorPanelMode();
  const element = findSelectedElement();
  if (!element) {
    printerControls.inspector.innerHTML = '<div class="printer-empty-state">Select an element from the canvas.</div>';
    return;
  }

  const showText = element.kind === "staticText";
  const showFieldSource = element.kind === "field" || element.kind === "weight";
  const showWeightUnit = element.kind === "weight";
  const showPhotoSource = element.kind === "photo";
  const showImageUpload = element.kind === "image" && currentPrinterType() !== "dot_matrix";
  const showTitle = element.kind === "photo";
  const showValueFont = element.kind === "field" || element.kind === "weight";
  const showMetaFont = element.kind === "weight" && Array.isArray(element.metaSources) && element.metaSources.length > 0;
  const showWeightMetaControls = element.kind === "weight" && element.source !== "netWeight";
  const showFit = element.kind === "image" || element.kind === "photo";
  const isLocked = currentTemplateIsLocked();
  const showFontFamily = currentPrinterType() === "dot_matrix";
  if (showFontFamily && !element.fontFamily) {
    element.fontFamily = DOT_MATRIX_DEFAULT_FONT_FAMILY;
  }

  printerControls.inspector.innerHTML = `
    <div class="printer-field-grid printer-field-grid--two">
      <label class="printer-field">
        <span>Name</span>
        <input data-prop="name" value="${escapeHtml(element.name || "")}" autocomplete="off">
      </label>
      <label class="printer-field">
        <span>Type</span>
        <input value="${element.kind}" disabled>
      </label>
    </div>

    ${showText ? `
      <label class="printer-field">
        <span>Text</span>
        <textarea data-prop="text" rows="3">${escapeHtml(element.text || "")}</textarea>
      </label>
    ` : ""}

    ${showFieldSource ? `
      <div class="printer-field-grid printer-field-grid--two">
        <label class="printer-field">
          <span>Label</span>
          <input data-prop="label" value="${escapeHtml(element.label || "")}" autocomplete="off">
        </label>
        <label class="printer-field">
          <span>Value Source</span>
          <select data-prop="source" data-select-type="field"></select>
        </label>
      </div>
    ` : ""}

  ${showWeightUnit ? `
      <label class="printer-field printer-checkbox-field">
        <span>Weight Value</span>
        <input data-prop="showWeightValue" type="checkbox" ${element.showWeightValue !== false ? "checked" : ""}>
      </label>
      <label class="printer-field">
        <span>Unit</span>
        <input data-prop="unit" value="${escapeHtml(element.unit || "")}" autocomplete="off">
      </label>
    ` : ""}

    ${showWeightMetaControls ? `
      <div class="printer-field-grid printer-field-grid--two">
        <label class="printer-field printer-checkbox-field">
          <span>Date</span>
          <input data-weight-meta-source="${element.source === "tareWeight" ? "tareDate" : "grossDate"}" type="checkbox" ${(element.metaSources || []).includes(element.source === "tareWeight" ? "tareDate" : "grossDate") ? "checked" : ""}>
        </label>
        <label class="printer-field printer-checkbox-field">
          <span>Time</span>
          <input data-weight-meta-source="${element.source === "tareWeight" ? "tareTime" : "grossTime"}" type="checkbox" ${(element.metaSources || []).includes(element.source === "tareWeight" ? "tareTime" : "grossTime") ? "checked" : ""}>
        </label>
      </div>
    ` : ""}

    ${showTitle ? `
      <label class="printer-field">
        <span>Photo Title</span>
        <input data-prop="title" value="${escapeHtml(element.title || "")}" autocomplete="off">
      </label>
      <label class="printer-field">
        <span>Photo Source</span>
        <select data-prop="source" data-select-type="photo"></select>
      </label>
    ` : ""}

    ${showImageUpload ? `
      <div class="printer-image-upload-card">
        <div class="printer-image-upload-card__meta">
          <strong>${element.imageUrl ? "Logo Uploaded" : "No Logo Uploaded"}</strong>
          <span>${escapeHtml(element.imageUrl || "PNG, JPG, JPEG, or WEBP")}</span>
        </div>
        <button type="button" id="uploadPrinterImageButton" ${isLocked ? "disabled" : ""}>Upload Logo</button>
      </div>
    ` : ""}

    <div class="printer-field-grid printer-field-grid--four">
      <label class="printer-field">
        <span>X %</span>
        <input data-prop="x" type="number" step="0.1" min="0" max="98" value="${element.x}">
      </label>
      <label class="printer-field">
        <span>Y %</span>
        <input data-prop="y" type="number" step="0.1" min="0" max="98" value="${element.y}">
      </label>
      <label class="printer-field">
        <span>Width %</span>
        <input data-prop="w" type="number" step="0.1" min="2" max="100" value="${element.w}">
      </label>
      <label class="printer-field">
        <span>Height %</span>
        <input data-prop="h" type="number" step="0.1" min="2" max="100" value="${element.h}">
      </label>
    </div>

    <div class="printer-field-grid printer-field-grid--four">
      <label class="printer-field">
        <span>Font Size</span>
        <input data-prop="fontSize" type="number" min="8" max="48" step="1" value="${element.fontSize}">
      </label>
      ${showValueFont ? `
        <label class="printer-field">
          <span>Value Size</span>
          <input data-prop="valueFontSize" type="number" min="8" max="72" step="1" value="${element.valueFontSize}">
        </label>
      ` : ""}
      ${showMetaFont ? `
        <label class="printer-field">
          <span>Date/Time Size</span>
          <input data-prop="metaFontSize" type="number" min="6" max="18" step="1" value="${element.metaFontSize || 8}">
        </label>
      ` : ""}
      <label class="printer-field">
        <span>Padding</span>
        <input data-prop="padding" type="number" min="0" max="20" step="1" value="${element.padding}">
      </label>
      <label class="printer-field">
        <span>Radius</span>
        <input data-prop="radius" type="number" min="0" max="24" step="1" value="${element.radius}">
      </label>
    </div>

    <div class="printer-field-grid printer-field-grid--two">
      ${showFontFamily ? `
        <label class="printer-field">
          <span>Font Family</span>
          <select data-prop="fontFamily" data-select-type="fontFamily"></select>
        </label>
      ` : ""}
      <label class="printer-field">
        <span>Font Weight</span>
        <select data-prop="fontWeight" data-select-type="fontWeight"></select>
      </label>
      <label class="printer-field">
        <span>Align</span>
        <select data-prop="align" data-select-type="align"></select>
      </label>
    </div>

    <div class="printer-field-grid printer-field-grid--four">
      <label class="printer-field">
        <span>Text</span>
        <input data-prop="textColor" type="color" value="${element.textColor}">
      </label>
      <label class="printer-field">
        <span>Background</span>
        <input data-prop="backgroundColor" type="color" value="${element.backgroundColor === "transparent" ? "#FFFFFF" : element.backgroundColor}">
      </label>
      <label class="printer-field">
        <span>Border</span>
        <input data-prop="borderColor" type="color" value="${element.borderColor === "transparent" ? "#FFFFFF" : element.borderColor}">
      </label>
      <label class="printer-field">
        <span>Border Width</span>
        <input data-prop="borderWidth" type="number" min="0" max="6" step="1" value="${element.borderWidth}">
      </label>
    </div>

    ${showFit ? `
      <label class="printer-field">
        <span>Image Fit</span>
        <select data-prop="fit" data-select-type="fit"></select>
      </label>
    ` : ""}
  `;

  populateSelect(
    printerControls.inspector.querySelector('[data-select-type="field"]'),
    printerState.fieldOptions,
    element.source
  );
  populateSelect(
    printerControls.inspector.querySelector('[data-select-type="photo"]'),
    printerState.photoOptions,
    element.source
  );
  populateSimpleSelect(
    printerControls.inspector.querySelector('[data-select-type="fontFamily"]'),
    DOT_MATRIX_FONT_FAMILY_OPTIONS,
    element.fontFamily || DOT_MATRIX_DEFAULT_FONT_FAMILY
  );
  populateSimpleSelect(
    printerControls.inspector.querySelector('[data-select-type="fontWeight"]'),
    [400, 500, 600, 700, 800, 900, 1000],
    element.fontWeight
  );
  populateSimpleSelect(
    printerControls.inspector.querySelector('[data-select-type="align"]'),
    ["left", "center", "right"],
    element.align
  );
  populateSimpleSelect(
    printerControls.inspector.querySelector('[data-select-type="fit"]'),
    ["contain", "cover"],
    element.fit
  );

  if (isLocked) {
    printerControls.inspector
      .querySelectorAll("input, textarea, select, button")
      .forEach(control => {
        control.disabled = !canEditSelectedElementProperty(control.dataset?.prop, element);
      });
  }
}

function selectElement(elementId) {
  printerState.selectedElementId = elementId;
  renderElementList();
  renderInspector();
  renderPreview();
}

function clearSelection() {
  if (!printerState.selectedElementId) return;
  printerState.selectedElementId = null;
  renderElementList();
  renderInspector();
  renderPreview();
}

function syncInspectorPositionValues() {
  const element = findSelectedElement();
  if (!element) return;
  ["x", "y", "w", "h"].forEach(property => {
    const input = printerControls.inspector.querySelector(`[data-prop="${property}"]`);
    if (input) input.value = element[property];
  });
}

function escapeSelectorValue(value) {
  const text = String(value || "");
  if (window.CSS?.escape) return window.CSS.escape(text);
  return text.replace(/["\\]/g, "\\$&");
}

function measureElementContentHeight(elementNode, contentNode) {
  const nodeStyle = window.getComputedStyle(elementNode);
  const paddingX = parseFloat(nodeStyle.paddingLeft || "0") + parseFloat(nodeStyle.paddingRight || "0");
  const contentWidth = Math.max(elementNode.clientWidth - paddingX, 0);
  if (contentWidth <= 0) return 0;

  const probe = document.createElement("div");
  const clone = contentNode.cloneNode(true);

  probe.style.position = "absolute";
  probe.style.left = "-99999px";
  probe.style.top = "0";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  probe.style.boxSizing = "border-box";
  probe.style.width = `${contentWidth}px`;
  probe.style.fontSize = nodeStyle.fontSize;
  probe.style.fontWeight = nodeStyle.fontWeight;
  probe.style.fontFamily = nodeStyle.fontFamily;
  probe.style.lineHeight = nodeStyle.lineHeight;
  probe.style.letterSpacing = nodeStyle.letterSpacing;
  probe.style.textTransform = nodeStyle.textTransform;

  clone.style.width = `${contentWidth}px`;
  clone.style.height = "auto";
  clone.style.maxHeight = "none";
  clone.style.overflow = "visible";

  probe.appendChild(clone);
  document.body.appendChild(probe);
  const height = Math.ceil(probe.getBoundingClientRect().height);
  document.body.removeChild(probe);
  return height;
}

function canAutoExpandSelectedElement(property) {
  return [
    "fontSize",
    "valueFontSize",
    "text",
    "label",
    "title",
    "unit",
    "source",
    "w",
    "padding",
    "borderWidth",
  ].includes(property);
}

function autoExpandSelectedElementHeight() {
  if (!currentTemplateAllowsEdits()) return false;
  const element = findSelectedElement();
  if (!element || !["staticText", "field", "weight"].includes(element.kind)) return false;

  const pageNode = printerControls.preview?.querySelector(".printer-page");
  const elementNode = printerControls.preview?.querySelector(
    `.printer-element[data-element-id="${escapeSelectorValue(element.id)}"]`
  );
  const contentNode = elementNode?.querySelector(
    ".printer-element__text, .printer-element__field, .printer-element__weight"
  );

  if (!pageNode || !elementNode || !contentNode) return false;

  const elementStyle = window.getComputedStyle(elementNode);
  const paddingY = parseFloat(elementStyle.paddingTop || "0") + parseFloat(elementStyle.paddingBottom || "0");
  const borderY = parseFloat(elementStyle.borderTopWidth || "0") + parseFloat(elementStyle.borderBottomWidth || "0");
  const requiredContentHeight = measureElementContentHeight(elementNode, contentNode);
  if (requiredContentHeight <= 0) return false;

  const requiredHeightPx = requiredContentHeight + paddingY + borderY + 2;
  const currentHeightPx = elementNode.getBoundingClientRect().height;
  if (requiredHeightPx <= currentHeightPx + 1) return false;

  const pageHeightPx = pageNode.getBoundingClientRect().height;
  if (pageHeightPx <= 0) return false;

  const maxHeight = Math.max(2, 100 - Number(element.y || 0));
  const nextHeight = Number(clamp((requiredHeightPx / pageHeightPx) * 100, Number(element.h || 2), maxHeight).toFixed(2));
  if (nextHeight <= Number(element.h || 0) + 0.05) return false;

  element.h = nextHeight;
  return true;
}

function getElementBounds(element) {
  const width = Number(element.w || 0);
  const height = Number(element.h || 0);
  return {
    left: Number(element.x || 0),
    top: Number(element.y || 0),
    right: Number(element.x || 0) + width,
    bottom: Number(element.y || 0) + height,
  };
}

function elementsOverlap(leftElement, rightElement, gap = 0.8) {
  const left = getElementBounds(leftElement);
  const right = getElementBounds(rightElement);
  return !(
    left.right <= right.left + gap ||
    left.left >= right.right - gap ||
    left.bottom <= right.top + gap ||
    left.top >= right.bottom - gap
  );
}

function overlapsExistingElements(element, ignoreId = "") {
  return (printerState.layout?.elements || []).some(existingElement => {
    if (existingElement.id === ignoreId) return false;
    return elementsOverlap(element, existingElement);
  });
}

function resolveElementPlacement(element, position = null, ignoreId = "") {
  if (!element) return;
  if (position) {
    placeElementAtPosition(element, position);
  }

  if (!overlapsExistingElements(element, ignoreId)) {
    return;
  }

  const width = Number(element.w || 0);
  const height = Number(element.h || 0);
  const maxX = Math.max(0, 100 - width);
  const maxY = Math.max(0, 100 - height);
  const startX = Number(element.x || 0);
  const startY = Number(element.y || 0);
  const candidates = [];

  for (let y = 0; y <= maxY; y += 2) {
    for (let x = 0; x <= maxX; x += 2) {
      candidates.push({
        x: Number(x.toFixed(2)),
        y: Number(y.toFixed(2)),
        distance: Math.abs(startX - x) + Math.abs(startY - y),
      });
    }
  }

  candidates.sort((left, right) => left.distance - right.distance);

  for (const candidate of candidates) {
    element.x = candidate.x;
    element.y = candidate.y;
    if (!overlapsExistingElements(element, ignoreId)) {
      return;
    }
  }

  element.x = Number(clamp(startX, 0, maxX).toFixed(2));
  element.y = Number(clamp(startY, 0, maxY).toFixed(2));
}

function buildElement(kind) {
  const element = createElementDefaults(kind);

  if (kind === "field" || kind === "weight") {
    const source = printerControls.quickAddFieldSource?.value || "serialNo";
    const label = optionLabelFor(printerState.fieldOptions, source, "Field");
    element.source = source;
    element.label = label;
    element.name = label;
    if (kind === "weight") {
      applyWeightSourceDefaults(element, source);
    }
  }

  if (kind === "photo") {
    const source = printerControls.quickAddPhotoSource?.value || "camera:1";
    const label = optionLabelFor(printerState.photoOptions, source, "Photo");
    element.source = source;
    element.title = label;
    element.name = label;
  }

  return element;
}

function placeElementAtPosition(element, position) {
  if (!element || !position) return;
  const width = Number(element.w || 0);
  const height = Number(element.h || 0);
  element.x = Number(clamp(position.x, 0, 100 - width).toFixed(2));
  element.y = Number(clamp(position.y, 0, 100 - height).toFixed(2));
}

function addElement(kind, position = null) {
  if (!currentTemplateAllowsEdits()) return;
  if (currentPrinterType() === "dot_matrix" && kind === "image") return;
  if (currentPrinterType() !== "dot_matrix" && kind === "printBreak") return;
  const element = buildElement(kind);
  resolveElementPlacement(element, position);
  printerState.layout.elements.push(element);
  selectElement(element.id);
}

function duplicateSelectedElement() {
  if (!currentTemplateAllowsEdits()) return;
  const element = findSelectedElement();
  if (!element) {
    showToast("Select an element to duplicate");
    return;
  }

  const duplicate = cloneData(element);
  duplicate.id = nextElementId(element.kind);
  duplicate.name = `${element.name} Copy`;
  duplicate.x = clamp(Number(element.x) + 2, 0, 100 - Number(element.w));
  duplicate.y = clamp(Number(element.y) + 2, 0, 100 - Number(element.h));
  duplicate.z = (printerState.layout.elements.length || 0) + 1;
  resolveElementPlacement(duplicate);
  printerState.layout.elements.push(duplicate);
  selectElement(duplicate.id);
}

function deleteElementById(elementId) {
  if (!currentTemplateAllowsEdits()) {
    showToast("Default templates are locked");
    return;
  }
  const element = findElementById(elementId);
  if (!element) {
    showToast("Select an element to delete");
    return;
  }

  printerState.layout.elements = printerState.layout.elements.filter(item => item.id !== element.id);
  printerState.selectedElementId = null;
  renderElementList();
  renderInspector();
  renderPreview();
  showToast(`${element.name} deleted`);
}

function deleteSelectedElement() {
  deleteElementById(printerState.selectedElementId);
}

function updatePageState(target) {
  if (!currentTemplateAllowsEdits()) return false;
  const page = printerState.layout?.page;
  if (!page) return false;
  const limits = currentPrinterTypeLimits();

  switch (target) {
    case printerControls.pageWidthMm:
      page.widthMm = clamp(Number(target.value || page.widthMm), limits.minWidthMm, limits.maxWidthMm);
      if (currentPrinterType() === "a4") {
        page.orientation = pageOrientationFromSize(page);
      }
      target.value = page.widthMm;
      return true;
    case printerControls.pageHeightMm:
      page.heightMm = clamp(Number(target.value || page.heightMm), limits.minHeightMm, limits.maxHeightMm);
      if (currentPrinterType() === "a4") {
        page.orientation = pageOrientationFromSize(page);
      }
      target.value = page.heightMm;
      return true;
    case printerControls.pageOrientation:
      setPageOrientation(page, target.value);
      renderPageControls();
      return true;
    case printerControls.pageBackgroundColor:
      page.backgroundColor = target.value;
      return true;
    case printerControls.pageBorderColor:
      page.borderColor = target.value;
      return true;
    case printerControls.pageBorderWidth:
      page.borderWidth = clamp(Number(target.value || page.borderWidth), 0, 6);
      return true;
    case printerControls.dotMatrixFontFamily: {
      const fontFamily = DOT_MATRIX_FONT_FAMILY_OPTIONS.includes(target.value)
        ? target.value
        : DOT_MATRIX_DEFAULT_FONT_FAMILY;
      printerState.layout.defaults = printerState.layout.defaults || {};
      printerState.layout.defaults.fontFamily = fontFamily;
      (printerState.layout.elements || []).forEach(element => {
        element.fontFamily = fontFamily;
      });
      managedSections().forEach(section => {
        (section.rows || []).forEach(row => {
          (row.fields || []).forEach(field => {
            field.fontFamily = fontFamily;
          });
        });
      });
      renderFieldRowsManager();
      renderInspector();
      return true;
    }
    default:
      return false;
  }
}

function updateSelectedElementProperty(target) {
  const element = findSelectedElement();
  if (!element) return false;
  const property = target.dataset.prop;
  if (!property || !canEditSelectedElementProperty(property, element)) return false;

  const numeric = Number(target.value);

  if (property === "x") {
    element.x = Number(clamp(numeric, 0, 100 - Number(element.w || 0)).toFixed(2));
    target.value = element.x;
    return true;
  }
  if (property === "y") {
    element.y = Number(clamp(numeric, 0, 100 - Number(element.h || 0)).toFixed(2));
    target.value = element.y;
    return true;
  }
  if (property === "w") {
    element.w = Number(clamp(numeric, 2, 100 - Number(element.x || 0)).toFixed(2));
    target.value = element.w;
    return true;
  }
  if (property === "h") {
    element.h = Number(clamp(numeric, 2, 100 - Number(element.y || 0)).toFixed(2));
    target.value = element.h;
    return true;
  }
  if (property === "fontSize") {
    element.fontSize = clamp(numeric, 8, 48);
    target.value = element.fontSize;
    return true;
  }
  if (property === "valueFontSize") {
    element.valueFontSize = clamp(numeric, 8, 72);
    target.value = element.valueFontSize;
    return true;
  }
  if (property === "metaFontSize") {
    element.metaFontSize = clamp(numeric, 6, 18);
    target.value = element.metaFontSize;
    return true;
  }
  if (property === "padding") {
    element.padding = clamp(numeric, 0, 20);
    target.value = element.padding;
    return true;
  }
  if (property === "radius") {
    element.radius = clamp(numeric, 0, 24);
    target.value = element.radius;
    return true;
  }
  if (property === "borderWidth") {
    element.borderWidth = clamp(numeric, 0, 6);
    target.value = element.borderWidth;
    return true;
  }
  if (property === "fontWeight") {
    element.fontWeight = numeric;
    return true;
  }
  if (property === "fontFamily") {
    element.fontFamily = DOT_MATRIX_FONT_FAMILY_OPTIONS.includes(target.value)
      ? target.value
      : DOT_MATRIX_DEFAULT_FONT_FAMILY;
    return true;
  }
  if (property === "showWeightValue") {
    element.showWeightValue = target.checked;
    return true;
  }
  if (property === "backgroundColor" && element.backgroundColor === "transparent") {
    element.backgroundColor = target.value;
    return true;
  }
  if (property === "borderColor" && element.borderColor === "transparent") {
    element.borderColor = target.value;
    return true;
  }

  if (property === "source" && element.kind === "weight") {
    applyWeightSourceDefaults(element, target.value);
    renderInspector();
    renderElementList();
    return true;
  }

  element[property] = target.value;
  return true;
}

function updateSelectedWeightMetaSource(target) {
  const element = findSelectedElement();
  if (!element || element.kind !== "weight") return false;
  const source = target.dataset.weightMetaSource;
  if (!source) return false;

  const allowedSources = defaultWeightMetaSources(element.source);
  if (!allowedSources.includes(source)) return false;

  const nextSources = new Set(Array.isArray(element.metaSources) ? element.metaSources : []);
  if (target.checked) {
    nextSources.add(source);
  } else {
    nextSources.delete(source);
  }
  element.metaSources = allowedSources.filter(item => nextSources.has(item));
  return true;
}

async function uploadSelectedImage(file) {
  if (!currentTemplateAllowsEdits()) {
    showToast("Default templates are locked");
    return;
  }
  const element = findSelectedElement();
  if (!element || element.kind !== "image") {
    showToast("Select a logo or image element first");
    return;
  }

  const formData = new FormData();
  formData.append("image", file);

  try {
    const response = await fetch(printerAssetUploadApiUrl, {
      method: "POST",
      body: formData,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.message || "Failed to upload logo");
    }

    element.imageUrl = result.imageUrl;
    renderInspector();
    renderPreview();
    showToast(result.message || "Logo uploaded");
  } catch (error) {
    showToast(error.message || "Failed to upload logo");
  } finally {
    printerControls.imageUpload.value = "";
  }
}

function setPreviewDropState(isActive) {
  printerState.dropTarget = Boolean(isActive && printerState.dragAddKind);
  printerControls.preview?.classList.toggle("is-drop-target", printerState.dropTarget);
  renderPreviewMeta();
}

function clearAddTileDragState() {
  printerState.dragAddKind = null;
  printerControls.addButtons.forEach(button => button.classList.remove("dragging"));
  setPreviewDropState(false);
}

function getPreviewDropPosition(event) {
  const pageNode = printerControls.preview?.querySelector(".printer-page");
  if (!pageNode) return null;

  const pageRect = pageNode.getBoundingClientRect();
  if (pageRect.width <= 0 || pageRect.height <= 0) return null;
  if (
    event.clientX < pageRect.left ||
    event.clientX > pageRect.right ||
    event.clientY < pageRect.top ||
    event.clientY > pageRect.bottom
  ) {
    return null;
  }

  const rawX = ((event.clientX - pageRect.left) / pageRect.width) * 100;
  const rawY = ((event.clientY - pageRect.top) / pageRect.height) * 100;

  return {
    x: clamp(rawX, 0, 100),
    y: clamp(rawY, 0, 100),
  };
}

function handleAddTileDragStart(event) {
  if (!currentTemplateAllowsEdits()) return;
  const button = event.currentTarget;
  const kind = button?.dataset?.addKind;
  if (!kind) return;

  printerState.dragAddKind = kind;
  button.classList.add("dragging");
  event.dataTransfer?.setData("text/plain", kind);
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "copy";
  }
  setPreviewDropState(true);
}

function handleAddTileDragEnd() {
  clearAddTileDragState();
}

function handlePreviewDragOver(event) {
  if (!currentTemplateAllowsEdits()) return;
  if (!printerState.dragAddKind) return;
  const position = getPreviewDropPosition(event);
  if (!position) return;
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "copy";
  }
  setPreviewDropState(true);
}

function handlePreviewDrop(event) {
  if (!currentTemplateAllowsEdits()) return;
  if (!printerState.dragAddKind || !printerState.layout) return;
  const position = getPreviewDropPosition(event);
  if (!position) return;

  const kind = printerState.dragAddKind;
  event.preventDefault();
  addElement(kind, position);
  clearAddTileDragState();
}

function handlePreviewMouseDown(event) {
  if (event.button !== 0) return;
  if (event.target.closest("[data-delete-handle]")) {
    event.preventDefault();
    return;
  }

  const managedRowNode = event.target.closest(".printer-managed-row[data-row-id]");
  if (managedRowNode && currentTemplateAllowsEdits() && ["thermal", "dot_matrix"].includes(currentPrinterType())) {
    const pageNode = printerControls.preview?.querySelector(".printer-page");
    if (!pageNode) return;
    if (currentPrinterType() === "dot_matrix") {
      if (!beginDotMatrixRowMove(managedRowNode, pageNode, event)) return;
      event.preventDefault();
      return;
    }
    printerState.activeManagedRowInteraction = {
      mode: "reorder",
      sectionId: managedRowNode.dataset.sectionId,
      rowId: managedRowNode.dataset.rowId,
      pageNode,
    };
    event.preventDefault();
    return;
  }

  const elementNode = event.target.closest(".printer-element--interactive");
  if (!elementNode) {
    if (event.target.closest(".printer-page")) {
      clearSelection();
    }
    return;
  }

  const elementId = elementNode.dataset.elementId;
  const element = findElementById(elementId);
  if (!element) return;

  if (printerState.selectedElementId !== elementId) {
    selectElement(elementId);
  }

  if (!currentTemplateAllowsEdits()) return;

  const pageNode = printerControls.preview.querySelector(".printer-page");
  if (!pageNode) return;
  const pageRect = pageNode.getBoundingClientRect();
  const mode = event.target.closest("[data-resize-handle]") ? "resize" : "drag";

  printerState.activeInteraction = {
    mode,
    elementId,
    startX: event.clientX,
    startY: event.clientY,
    pageRect,
    startElement: cloneData(element),
  };
  event.preventDefault();
}

function handlePreviewMouseMove(event) {
  const managedInteraction = printerState.activeManagedRowInteraction;
  if (managedInteraction) {
    const sectionId = managedInteraction.sectionId;
    const rowId = managedInteraction.rowId;
    if (managedInteraction.mode === "move-section") {
      const section = findFieldSection(sectionId);
      if (!section || !managedInteraction.pageRect) return;
      const dxPercent = ((event.clientX - managedInteraction.startX) / managedInteraction.pageRect.width) * 100;
      const dyPercent = ((event.clientY - managedInteraction.startY) / managedInteraction.pageRect.height) * 100;
      const sectionWidth = clamp(Number(section.w || 100), 2, 100);
      const sectionHeight = managedSectionHeightPercent(section);
      section.x = Number(clamp(managedInteraction.startSectionX + dxPercent, 0, Math.max(0, 100 - sectionWidth)).toFixed(2));
      section.y = Number(clamp(managedInteraction.startSectionY + dyPercent, 0, Math.max(0, 100 - sectionHeight)).toFixed(2));
      renderPreview();
      return;
    }
    const rowNodes = Array.from(
      printerControls.preview?.querySelectorAll(`.printer-managed-row[data-section-id="${escapeSelectorValue(sectionId)}"]`) || []
    );
    if (!rowNodes.length) return;

    let targetIndex = rowNodes.length - 1;
    for (let index = 0; index < rowNodes.length; index += 1) {
      const rect = rowNodes[index].getBoundingClientRect();
      const midpoint = rect.top + (rect.height / 2);
      if (event.clientY < midpoint) {
        targetIndex = index;
        break;
      }
    }

    moveFieldRowToIndex(sectionId, rowId, targetIndex);
    return;
  }

  const interaction = printerState.activeInteraction;
  if (!interaction) return;

  const element = findElementById(interaction.elementId);
  if (!element) return;

  const visualDxPercent = ((event.clientX - interaction.startX) / interaction.pageRect.width) * 100;
  const visualDyPercent = ((event.clientY - interaction.startY) / interaction.pageRect.height) * 100;
  const dxPercent = visualDxPercent;
  const dyPercent = visualDyPercent;

  if (interaction.mode === "drag") {
    element.x = Number(clamp(interaction.startElement.x + dxPercent, 0, 100 - interaction.startElement.w).toFixed(2));
    element.y = Number(clamp(interaction.startElement.y + dyPercent, 0, 100 - interaction.startElement.h).toFixed(2));
  } else {
    element.w = Number(clamp(interaction.startElement.w + dxPercent, 2, 100 - interaction.startElement.x).toFixed(2));
    element.h = Number(clamp(interaction.startElement.h + dyPercent, 2, 100 - interaction.startElement.y).toFixed(2));
  }

  renderPreview();
  syncInspectorPositionValues();
}

function handlePreviewMouseUp() {
  if (printerState.activeManagedRowInteraction) {
    printerState.activeManagedRowInteraction = null;
  }
  if (!printerState.activeInteraction) return;
  printerState.activeInteraction = null;
}

function handlePreviewClick(event) {
  if (!currentTemplateAllowsEdits()) return;
  const deleteHandle = event.target.closest("[data-delete-handle]");
  if (!deleteHandle) return;
  const elementNode = deleteHandle.closest(".printer-element");
  const elementId = elementNode?.dataset?.elementId;
  if (!elementId) return;
  event.preventDefault();
  deleteElementById(elementId);
}

function isTypingTarget(target) {
  return target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target?.isContentEditable;
}

function applyPrinterLayoutResponse(result) {
  const previousSelectionId = printerState.selectedElementId;
  printerState.layout = result.layout;
  printerState.defaultLayout = cloneData(result.defaultLayout || result.layout);
  printerState.sampleEntry = result.sampleEntry || printerState.sampleEntry;
  printerState.fieldOptions = result.fieldOptions || printerState.fieldOptions || [];
  printerState.photoOptions = result.photoOptions ? normalizePhotoOptions(result.photoOptions) : (printerState.photoOptions || []);
  printerState.printerTypes = result.printerTypes || printerState.printerTypes || [];
  printerState.templates = result.templates || printerState.templates || [];
  printerState.activeLayoutName = result.activeLayoutName || printerState.activeLayoutName || "";
  printerState.currentLayoutName = result.currentLayoutName || printerState.activeLayoutName || printerState.currentLayoutName || "";
  printerState.currentPrinterType = result.currentPrinterType || result.layout?.printerType || printerState.currentPrinterType || "";

  if ((printerState.layout?.elements || []).some(element => element.id === previousSelectionId)) {
    printerState.selectedElementId = previousSelectionId;
  } else {
    printerState.selectedElementId = null;
  }

  const isDotMatrix = currentPrinterType() === "dot_matrix";
  if (printerControls.tabDotMatrixRaw) {
    printerControls.tabDotMatrixRaw.style.display = isDotMatrix ? "inline-block" : "none";
  }
  if (!isDotMatrix && currentViewMode === "raw") {
    setViewMode("visual");
  }

  renderTemplateControls();
  renderPageControls();
  renderQuickAddControls();
  renderFieldRowsManager();
  renderElementList();
  renderInspector();
  renderPreview();

  if (currentViewMode === "raw") {
    refreshDotMatrixRawPreview();
  }
}

let currentViewMode = "visual";
let rawPrintersLoaded = false;

function setViewMode(mode) {
  currentViewMode = mode;
  const isRaw = mode === "raw";

  printerControls.tabVisualEditor?.classList.toggle("is-active", !isRaw);
  printerControls.tabDotMatrixRaw?.classList.toggle("is-active", isRaw);

  if (printerControls.previewStage) {
    printerControls.previewStage.classList.toggle("is-hidden", isRaw);
  }
  if (printerControls.dotMatrixRawStage) {
    printerControls.dotMatrixRawStage.classList.toggle("is-hidden", !isRaw);
  }

  if (isRaw) {
    if (!rawPrintersLoaded) {
      loadWindowsPrintersList();
    }
    refreshDotMatrixRawPreview();
  }
}

async function loadWindowsPrintersList() {
  try {
    const response = await fetch("/settings/api/printer/windows-printers");
    const data = await response.json();
    if (!response.ok || !printerControls.rawPrinterSelect) return;

    printerControls.rawPrinterSelect.innerHTML = "";
    const printers = data.printers || [];
    const defaultPrinter = data.defaultPrinter || "";

    if (!printers.length) {
      const opt = document.createElement("option");
      opt.value = defaultPrinter || "Default Windows Printer";
      opt.textContent = defaultPrinter ? `${defaultPrinter} (Configured)` : "Default Windows Printer";
      printerControls.rawPrinterSelect.appendChild(opt);
    } else {
      printers.forEach(printerName => {
        const opt = document.createElement("option");
        opt.value = printerName;
        opt.textContent = printerName === defaultPrinter ? `${printerName} (Default)` : printerName;
        if (printerName === defaultPrinter) {
          opt.selected = true;
        }
        printerControls.rawPrinterSelect.appendChild(opt);
      });
    }
    rawPrintersLoaded = true;
  } catch (err) {
    console.error("Failed to load Windows printers", err);
  }
}

let rawGridDragBlockId = null;
let rawPaletteDragKind = null;
let rawChipDragFieldId = null;
let rawChipDragBlockId = null;

function flattenedDotMatrixFieldRows() {
  const sections = [...managedSections()].sort((a, b) => Number(a.y || 0) - Number(b.y || 0));
  const result = [];
  sections.forEach(section => {
    (section.rows || []).forEach(row => result.push({ section, row }));
  });
  return result;
}

function fieldRowAtBlockId(blockId) {
  const match = /^field-row-(\d+)$/.exec(blockId || "");
  if (!match) return null;
  return flattenedDotMatrixFieldRows()[Number(match[1])] || null;
}

function sampleFieldDisplayValue(source) {
  // Quick-glance hint on the chip itself so you can tell what's bound where
  // while editing. The actual line preview/print below always uses real
  // ticket data (or blank) — this sample value never reaches the printed line.
  if (!source) return "…";
  const entry = printerState.sampleEntry || {};
  const raw = source.startsWith("custom:") ? entry.customFields?.[source.slice(7)] : entry[source];
  return raw === undefined || raw === null || raw === "" ? "…" : String(raw);
}

function createManagedTextField(row, text = "") {
  const defaultFontFamily = printerState.layout?.defaults?.fontFamily || DOT_MATRIX_DEFAULT_FONT_FAMILY;
  return {
    id: nextFieldRowFieldId(row),
    kind: "text",
    text,
    fontSize: 8,
    cpi: 10,
    fontFamily: defaultFontFamily,
    textColor: "#000000",
  };
}

const RAW_HEADER_TEXT_BLOCK_KEYS = {
  "header-company-name": "companyName",
  "header-company-subtitle": "companySubtitle",
  "header-company-contact": "companyContact",
  "doc-title": "docTitle",
  "remarks": "remarksText",
};

const RAW_DIVIDER_BLOCK_IDS = ["divider-top", "divider-mid", "divider-pre-weight", "divider-post-weight"];
const RAW_OPTIONAL_STRUCTURAL_BLOCK_IDS = [...RAW_DIVIDER_BLOCK_IDS, "weight-box", "net-in-words"];

function renderRawPreviewGrid(lines, lineBlocks) {
  const grid = printerControls.rawPreviewGrid;
  if (!grid) return;

  grid.innerHTML = "";
  const blockLineCounters = {};
  (lines || []).forEach((text, index) => {
    const blockId = (lineBlocks || [])[index] || null;
    const blockLineIndex = blockId ? (blockLineCounters[blockId] || 0) : 0;
    if (blockId) blockLineCounters[blockId] = blockLineIndex + 1;

    const row = document.createElement("div");
    row.className = "raw-grid-row";
    row.dataset.line = String(index + 1);
    row.dataset.blockId = blockId || "";

    const num = document.createElement("span");
    num.className = "raw-grid-row__num";
    num.textContent = String(index + 1).padStart(2, "0");
    row.appendChild(num);

    const content = document.createElement("div");
    let isFieldRow = false;
    if (blockId && blockId.startsWith("field-row-")) {
      isFieldRow = true;
      content.className = "raw-grid-row__content raw-grid-row__content--chips";
      renderFieldRowChips(content, blockId);
    } else if (blockId && RAW_HEADER_TEXT_BLOCK_KEYS[blockId]) {
      content.className = "raw-grid-row__content raw-grid-row__content--editable-line";
      renderEditableHeaderLine(content, blockId);
    } else if (blockId === "signatures" && blockLineIndex === 2) {
      content.className = "raw-grid-row__content raw-grid-row__content--editable-line";
      renderEditableSignatureLine(content);
    } else if (blockId === "weight-box" && blockLineIndex === 0) {
      content.className = "raw-grid-row__content raw-grid-row__content--editable-line";
      renderEditableWeightBoxHeader(content);
    } else if (blockId && text.trim()) {
      content.className = "raw-grid-row__content";
      content.dataset.blockId = blockId;
      content.draggable = true;
      content.textContent = text;
      content.addEventListener("dragstart", handleRawGridDragStart);
      content.addEventListener("dragend", handleRawGridDragEnd);
    } else if (blockId) {
      // Occupied by a block (e.g. weight box, net-in-words) with nothing to
      // show yet — still draggable to relocate, but reads the same as a
      // genuinely free slot so the whole preview looks consistently empty.
      content.className = "raw-grid-row__content raw-grid-row__content--empty";
      content.dataset.blockId = blockId;
      content.draggable = true;
      content.textContent = "· empty — drop here ·";
      content.addEventListener("dragstart", handleRawGridDragStart);
      content.addEventListener("dragend", handleRawGridDragEnd);
    } else {
      content.className = "raw-grid-row__content raw-grid-row__content--empty";
      content.textContent = "· empty — drop here ·";
    }
    row.appendChild(content);

    const isHeaderTextBlock = blockId && RAW_HEADER_TEXT_BLOCK_KEYS[blockId];
    const isSignatureBlock = blockId === "signatures" && (blockLineIndex === 0 || blockLineIndex === 2);
    const isRemovableStructuralBlock = blockId && RAW_OPTIONAL_STRUCTURAL_BLOCK_IDS.includes(blockId) && blockLineIndex === 0;
    if (isFieldRow || isRemovableStructuralBlock || isHeaderTextBlock || isSignatureBlock) {
      const removeLine = document.createElement("button");
      removeLine.type = "button";
      removeLine.className = "raw-grid-row__remove-line";
      removeLine.textContent = "🗑";
      removeLine.title = "Remove this entire line";
      removeLine.addEventListener("click", event => {
        event.stopPropagation();
        if (isFieldRow) {
          removeFieldRowEntirely(blockId);
        } else if (isHeaderTextBlock) {
          removeRawHeaderTextBlock(blockId);
        } else if (isSignatureBlock) {
          removeRawSignatureBlock();
        } else {
          removeStructuralBlock(blockId);
        }
      });
      row.appendChild(removeLine);
    }

    row.addEventListener("dragover", handleRawGridDragOver);
    row.addEventListener("dragleave", handleRawGridDragLeave);
    row.addEventListener("drop", handleRawGridDrop);
    grid.appendChild(row);
  });
}

function removeRawHeaderTextBlock(blockId) {
  const key = RAW_HEADER_TEXT_BLOCK_KEYS[blockId];
  if (key && printerState.layout?.rawHeaderText) {
    printerState.layout.rawHeaderText[key] = "";
  }
  if (printerState.layout?.rawBlockPositions) {
    delete printerState.layout.rawBlockPositions[blockId];
  }
  refreshDotMatrixRawPreview();
}

function removeRawSignatureBlock() {
  if (printerState.layout?.rawHeaderText) {
    printerState.layout.rawHeaderText.leftSign = "";
    printerState.layout.rawHeaderText.rightSign = "";
  }
  if (printerState.layout?.rawBlockPositions) {
    delete printerState.layout.rawBlockPositions["signatures"];
  }
  refreshDotMatrixRawPreview();
}

function ensureRawHeaderText() {
  if (!printerState.layout) return {};
  printerState.layout.rawHeaderText = printerState.layout.rawHeaderText || {};
  return printerState.layout.rawHeaderText;
}

function ensureRawStructuralBlocks() {
  if (!printerState.layout) return [];
  if (!Array.isArray(printerState.layout.rawStructuralBlocks)) {
    if (printerState.layout.templateKind === "blank_canvas") {
      printerState.layout.rawStructuralBlocks = [];
    } else {
      // Was unspecified (meaning "everything on") — materialize the full set so
      // adding/removing one block doesn't silently change the others.
      printerState.layout.rawStructuralBlocks = [...RAW_OPTIONAL_STRUCTURAL_BLOCK_IDS];
    }
  }
  return printerState.layout.rawStructuralBlocks;
}

function addStructuralBlockAt(kind, targetLine) {
  if (!printerState.layout) return;
  const blocks = ensureRawStructuralBlocks();
  printerState.layout.rawBlockPositions = printerState.layout.rawBlockPositions || {};

  if (kind === "weightBox") {
    ["weight-box", "net-in-words"].forEach(id => {
      if (!blocks.includes(id)) blocks.push(id);
    });
    printerState.layout.rawBlockPositions["weight-box"] = targetLine;
  } else {
    const nextDivider = RAW_DIVIDER_BLOCK_IDS.find(id => !blocks.includes(id));
    if (!nextDivider) {
      showToast("All divider lines are already on the ticket");
      return;
    }
    blocks.push(nextDivider);
    printerState.layout.rawBlockPositions[nextDivider] = targetLine;
  }
}

function removeStructuralBlock(blockId) {
  if (!printerState.layout) return;
  const blocks = ensureRawStructuralBlocks();
  const index = blocks.indexOf(blockId);
  if (index !== -1) blocks.splice(index, 1);
  if (blockId === "weight-box") {
    const netIndex = blocks.indexOf("net-in-words");
    if (netIndex !== -1) blocks.splice(netIndex, 1);
  }
  if (printerState.layout.rawBlockPositions) {
    delete printerState.layout.rawBlockPositions[blockId];
  }
  refreshDotMatrixRawPreview();
}

function renderEditableHeaderLine(container, blockId) {
  const key = RAW_HEADER_TEXT_BLOCK_KEYS[blockId];
  const headerText = ensureRawHeaderText();
  container.classList.toggle("raw-grid-row__content--empty", !(headerText[key] || "").trim());

  const handle = document.createElement("span");
  handle.className = "raw-line-handle";
  handle.draggable = true;
  handle.textContent = "⠿";
  handle.title = "Drag to move this line elsewhere on the ticket";
  handle.dataset.blockId = blockId;
  handle.addEventListener("dragstart", handleRawGridDragStart);
  handle.addEventListener("dragend", handleRawGridDragEnd);
  container.appendChild(handle);

  const text = document.createElement("span");
  text.className = "raw-line-text";
  text.textContent = headerText[key] || "";
  text.contentEditable = "true";
  text.dataset.placeholder = "· empty — drop here ·";
  text.title = "Click to edit";
  text.addEventListener("blur", () => {
    const value = text.textContent.trim();
    if (headerText[key] !== value) {
      headerText[key] = value;
      refreshDotMatrixRawPreview();
    }
  });
  container.appendChild(text);
}

function renderEditableSignatureLine(container) {
  const headerText = ensureRawHeaderText();
  container.classList.toggle("raw-grid-row__content--empty", !(headerText.leftSign || "").trim() && !(headerText.rightSign || "").trim());

  const handle = document.createElement("span");
  handle.className = "raw-line-handle";
  handle.draggable = true;
  handle.textContent = "⠿";
  handle.title = "Drag to move the signature line elsewhere on the ticket";
  handle.dataset.blockId = "signatures";
  handle.addEventListener("dragstart", handleRawGridDragStart);
  handle.addEventListener("dragend", handleRawGridDragEnd);
  container.appendChild(handle);

  const left = document.createElement("span");
  left.className = "raw-line-text";
  left.textContent = headerText.leftSign || "";
  left.contentEditable = "true";
  left.dataset.placeholder = "· empty — drop here ·";
  left.title = "Click to edit";
  left.addEventListener("blur", () => {
    const value = left.textContent.trim();
    if (headerText.leftSign !== value) {
      headerText.leftSign = value;
      refreshDotMatrixRawPreview();
    }
  });
  container.appendChild(left);

  const right = document.createElement("span");
  right.className = "raw-line-text raw-line-text--right";
  right.textContent = headerText.rightSign || "";
  right.contentEditable = "true";
  right.dataset.placeholder = "· empty — drop here ·";
  right.title = "Click to edit";
  right.addEventListener("blur", () => {
    const value = right.textContent.trim();
    if (headerText.rightSign !== value) {
      headerText.rightSign = value;
      refreshDotMatrixRawPreview();
    }
  });
  container.appendChild(right);
}

function renderEditableWeightBoxHeader(container) {
  const headerText = ensureRawHeaderText();
  const isBlank = !(headerText.grossLabel || "").trim() && !(headerText.tareLabel || "").trim() && !(headerText.netLabel || "").trim();
  container.classList.toggle("raw-grid-row__content--empty", isBlank);

  const handle = document.createElement("span");
  handle.className = "raw-line-handle";
  handle.draggable = true;
  handle.textContent = "⠿";
  handle.title = "Drag to move the weight box elsewhere on the ticket";
  handle.dataset.blockId = "weight-box";
  handle.addEventListener("dragstart", handleRawGridDragStart);
  handle.addEventListener("dragend", handleRawGridDragEnd);
  container.appendChild(handle);

  [
    { key: "grossLabel", extraClass: "" },
    { key: "tareLabel", extraClass: "" },
    { key: "netLabel", extraClass: "" },
  ].forEach(({ key, extraClass }) => {
    const span = document.createElement("span");
    span.className = `raw-line-text raw-line-text--weight${extraClass ? ` ${extraClass}` : ""}`;
    span.textContent = headerText[key] || "";
    span.contentEditable = "true";
    span.dataset.placeholder = "· empty — drop here ·";
    span.title = "Click to edit";
    span.addEventListener("blur", () => {
      const value = span.textContent.trim();
      if (headerText[key] !== value) {
        headerText[key] = value;
        refreshDotMatrixRawPreview();
      }
    });
    container.appendChild(span);
  });
}

function resolvedFieldColumn(field, index, totalFields, lineWidth) {
  if (Number.isFinite(field.col)) return field.col;
  const defaultColWidth = Math.max(10, Math.floor(lineWidth / Math.max(1, totalFields)));
  return index * defaultColWidth;
}

function renderFieldRowChips(container, blockId) {
  const target = fieldRowAtBlockId(blockId);
  const fields = target?.row?.fields || [];
  const lineWidth = Number(printerControls.rawLineWidth?.value || 80);

  container.innerHTML = "";
  container.dataset.blockId = blockId;
  container.style.width = `${lineWidth}ch`;
  fields.forEach((field, index) => {
    const chip = document.createElement("span");
    chip.className = "raw-field-chip";
    chip.style.left = `${resolvedFieldColumn(field, index, fields.length, lineWidth)}ch`;
    chip.dataset.blockId = blockId;
    chip.dataset.fieldId = field.id;

    if (field.kind === "text") {
      const text = document.createElement("span");
      text.className = "raw-field-chip__text";
      text.textContent = field.text || "";
      text.contentEditable = "true";
      text.draggable = false;
      text.dataset.placeholder = "type text…";
      text.title = "Click to edit this text";
      text.addEventListener("blur", () => commitFieldChipText(blockId, field.id, text.textContent));
      chip.appendChild(text);
    } else {
      const label = document.createElement("span");
      label.className = "raw-field-chip__label";
      label.textContent = field.label || "";
      label.contentEditable = "true";
      label.draggable = false;
      label.title = "Click to rename this field (clear it to print the value alone)";
      label.addEventListener("blur", () => commitFieldChipLabel(blockId, field.id, label.textContent));
      chip.appendChild(label);

      const value = document.createElement("span");
      value.className = "raw-field-chip__value";
      value.textContent = sampleFieldDisplayValue(field.source);
      chip.appendChild(value);
    }

    const handle = document.createElement("span");
    handle.className = "raw-field-chip__handle";
    handle.draggable = true;
    handle.textContent = "⠿";
    handle.title = "Drag to adjust spacing around this field";
    handle.dataset.blockId = blockId;
    handle.dataset.fieldId = field.id;
    handle.addEventListener("dragstart", handleFieldChipDragStart);
    handle.addEventListener("dragend", handleFieldChipDragEnd);
    chip.appendChild(handle);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "raw-field-chip__remove";
    remove.textContent = "×";
    remove.title = "Remove";
    remove.addEventListener("click", event => {
      event.stopPropagation();
      removeFieldRowPiece(blockId, field.id);
    });
    chip.appendChild(remove);

    container.appendChild(chip);
  });

  container.addEventListener("dragover", handleFieldChipContainerDragOver);
  container.addEventListener("drop", handleFieldChipContainerDrop);
}

function columnFromClientX(referenceEl, clientX) {
  const rect = referenceEl.getBoundingClientRect();
  const totalChars = Number(printerControls.rawLineWidth?.value || 80);
  if (!rect.width) return 0;
  const ratio = (clientX - rect.left) / rect.width;
  return Math.max(0, Math.min(totalChars - 1, Math.round(ratio * totalChars)));
}

function commitFieldChipText(blockId, fieldId, text) {
  const target = fieldRowAtBlockId(blockId);
  const field = (target?.row?.fields || []).find(item => item.id === fieldId);
  if (field && field.text !== text.trim()) {
    field.text = text.trim();
    refreshDotMatrixRawPreview();
  }
}

function commitFieldChipLabel(blockId, fieldId, label) {
  const target = fieldRowAtBlockId(blockId);
  const field = (target?.row?.fields || []).find(item => item.id === fieldId);
  if (field && field.label !== label.trim()) {
    field.label = label.trim();
    refreshDotMatrixRawPreview();
  }
}

function deleteDotMatrixFieldRow(rowIndex) {
  const target = flattenedDotMatrixFieldRows()[rowIndex];
  if (!target || !printerState.layout) return;

  target.section.rows = (target.section.rows || []).filter(row => row.id !== target.row.id);
  if (target.section.rows.length === 0) {
    printerState.layout.managedSections = managedSections().filter(section => section.id !== target.section.id);
  }
  reindexRawFieldRowPositions(rowIndex);

  renderFieldRowsManager();
  refreshDotMatrixRawPreview();
}

function removeFieldRowEntirely(blockId) {
  const match = /^field-row-(\d+)$/.exec(blockId || "");
  if (!match) return;
  deleteDotMatrixFieldRow(Number(match[1]));
}

function removeFieldRowPiece(blockId, fieldId) {
  const match = /^field-row-(\d+)$/.exec(blockId || "");
  if (!match || !printerState.layout) return;
  const rowIndex = Number(match[1]);
  const target = flattenedDotMatrixFieldRows()[rowIndex];
  if (!target) return;

  target.row.fields = (target.row.fields || []).filter(field => field.id !== fieldId);

  if (target.row.fields.length === 0) {
    deleteDotMatrixFieldRow(rowIndex);
    return;
  }

  renderFieldRowsManager();
  refreshDotMatrixRawPreview();
}

function reindexRawFieldRowPositions(removedIndex) {
  const positions = printerState.layout?.rawBlockPositions;
  if (!positions) return;
  const updated = {};
  Object.entries(positions).forEach(([key, value]) => {
    const match = /^field-row-(\d+)$/.exec(key);
    if (!match) {
      updated[key] = value;
      return;
    }
    const index = Number(match[1]);
    if (index === removedIndex) return;
    updated[`field-row-${index > removedIndex ? index - 1 : index}`] = value;
  });
  printerState.layout.rawBlockPositions = updated;
}

function handleFieldChipDragStart(event) {
  event.stopPropagation();
  rawGridDragBlockId = null;
  rawPaletteDragKind = null;
  rawChipDragFieldId = event.currentTarget.dataset.fieldId;
  rawChipDragBlockId = event.currentTarget.dataset.blockId;
  event.currentTarget.closest(".raw-field-chip")?.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "move";
  try {
    event.dataTransfer.setData("text/plain", rawChipDragFieldId);
  } catch (err) {
    // Some browsers restrict setData outside real drag gestures; ignore.
  }
}

function handleFieldChipDragEnd(event) {
  event.currentTarget.closest(".raw-field-chip")?.classList.remove("is-dragging");
  printerControls.rawPreviewGrid?.querySelectorAll(".raw-grid-row__content--chips.is-drop-target").forEach(node => {
    node.classList.remove("is-drop-target");
  });
  rawChipDragFieldId = null;
  rawChipDragBlockId = null;
}

function handleFieldChipContainerDragOver(event) {
  if (!rawChipDragFieldId || event.currentTarget.dataset.blockId !== rawChipDragBlockId) return;
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.classList.add("is-drop-target");
}

function handleFieldChipContainerDrop(event) {
  if (!rawChipDragFieldId || event.currentTarget.dataset.blockId !== rawChipDragBlockId) return;
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.classList.remove("is-drop-target");

  const target = fieldRowAtBlockId(rawChipDragBlockId);
  const field = (target?.row?.fields || []).find(item => item.id === rawChipDragFieldId);
  if (!field) return;

  field.col = columnFromClientX(event.currentTarget, event.clientX);

  renderFieldRowsManager();
  refreshDotMatrixRawPreview();
}

function handleRawGridDragStart(event) {
  rawPaletteDragKind = null;
  rawGridDragBlockId = event.currentTarget.dataset.blockId;
  event.dataTransfer.effectAllowed = "move";
  printerControls.rawPreviewGrid?.querySelectorAll(`[data-block-id="${rawGridDragBlockId}"]`).forEach(node => {
    node.closest(".raw-grid-row")?.classList.add("is-dragging");
  });
  try {
    event.dataTransfer.setData("text/plain", rawGridDragBlockId);
  } catch (err) {
    // Some browsers restrict setData outside real drag gestures; ignore.
  }
}

function handleRawGridDragEnd() {
  printerControls.rawPreviewGrid?.querySelectorAll(".raw-grid-row").forEach(node => {
    node.classList.remove("is-dragging", "is-drop-target");
  });
  rawGridDragBlockId = null;
}

function handleRawGridDragOver(event) {
  if (rawChipDragFieldId) return;
  if (!rawGridDragBlockId && !rawPaletteDragKind) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = rawPaletteDragKind ? "copy" : "move";
  event.currentTarget.classList.add("is-drop-target");
}

function handleRawGridDragLeave(event) {
  event.currentTarget.classList.remove("is-drop-target");
}

function handleRawGridDrop(event) {
  if (rawChipDragFieldId) return;
  event.preventDefault();
  event.currentTarget.classList.remove("is-drop-target");

  const targetLine = Number(event.currentTarget.dataset.line);
  if (!printerState.layout || !targetLine) return;

  printerState.layout.rawBlockPositions = printerState.layout.rawBlockPositions || {};
  const existingBlockId = event.currentTarget.dataset.blockId || "";

  if (rawGridDragBlockId) {
    printerState.layout.rawBlockPositions[rawGridDragBlockId] = targetLine;
  } else if (rawPaletteDragKind === "field" || rawPaletteDragKind === "text") {
    if (existingBlockId.startsWith("field-row-")) {
      const contentEl = event.currentTarget.querySelector(".raw-grid-row__content");
      const dropCol = contentEl ? columnFromClientX(contentEl, event.clientX) : undefined;
      addPieceToFieldRow(existingBlockId, rawPaletteDragKind, dropCol);
    } else {
      addRawFieldBlockAt(targetLine, rawPaletteDragKind);
    }
  } else if (rawPaletteDragKind === "divider" || rawPaletteDragKind === "weightBox") {
    addStructuralBlockAt(rawPaletteDragKind, targetLine);
  } else {
    return;
  }

  rawGridDragBlockId = null;
  rawPaletteDragKind = null;
  refreshDotMatrixRawPreview();
}

function dotMatrixFieldRowCount() {
  return managedSections().reduce(
    (count, section) => count + (Array.isArray(section.rows) ? section.rows.length : 0),
    0
  );
}

function addPieceToFieldRow(blockId, kind, col) {
  const target = fieldRowAtBlockId(blockId);
  if (!target) return;
  target.row.fields = target.row.fields || [];
  if (target.row.fields.length >= 6) {
    showToast("Maximum 6 items per line");
    return;
  }
  const field = kind === "text"
    ? createManagedTextField(target.row)
    : createManagedRowField(target.row, printerControls.rawAddFieldSource?.value || printerState.fieldOptions?.[0]?.key || "serialNo");
  if (Number.isFinite(col)) field.col = col;
  target.row.fields.push(field);
  renderFieldRowsManager();
}

function addRawFieldBlockAt(targetLine, kind) {
  if (!printerState.layout) return;
  const row = { id: nextFieldRowId(), fields: [] };
  if (kind === "text") {
    row.fields.push(createManagedTextField(row));
  } else {
    const source = printerControls.rawAddFieldSource?.value || printerState.fieldOptions?.[0]?.key || "serialNo";
    row.fields.push(createManagedRowField(row, source));
  }

  printerState.layout.managedSections = managedSections();
  printerState.layout.managedSections.push(createDotMatrixRowSection(row));

  const rowIndex = dotMatrixFieldRowCount() - 1;
  printerState.layout.rawBlockPositions[`field-row-${rowIndex}`] = targetLine;

  renderFieldRowsManager();
}

function handleRawPaletteDragStart(event) {
  rawGridDragBlockId = null;
  rawPaletteDragKind = event.currentTarget.dataset.rawPaletteKind;
  event.currentTarget.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "copy";
  try {
    event.dataTransfer.setData("text/plain", rawPaletteDragKind);
  } catch (err) {
    // Some browsers restrict setData outside real drag gestures; ignore.
  }
}

function handleRawPaletteDragEnd(event) {
  event.currentTarget.classList.remove("is-dragging");
  rawPaletteDragKind = null;
}

async function refreshDotMatrixRawPreview() {
  if (!printerControls.rawPreviewGrid) return;
  const feedMode = printerControls.rawFeedMode?.value || "auto_40";
  const extraLines = Number(printerControls.rawExtraLines?.value || 2);
  const lineWidth = Number(printerControls.rawLineWidth?.value || 80);
  const totalLines = Number(printerControls.rawTotalLines?.value || 40);

  if (printerControls.rawExtraLinesField) {
    printerControls.rawExtraLinesField.style.display = feedMode === "custom" ? "block" : "none";
  }

  try {
    const payload = {
      // RAW Studio is a design surface, not a live ticket — preview with a blank
      // entry so nothing shown here is ever fabricated demo data. Direct print
      // (performDirectRawPrint) still uses the real entry when one is loaded.
      entry: {},
      layout: printerState.layout || null,
      layoutName: printerState.currentLayoutName || printerState.activeLayoutName || "",
      feedMode,
      extraLines,
      lineWidth,
      totalLines,
    };

    const response = await fetch("/settings/api/printer/preview-raw-lines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();

    if (response.ok && data.success) {
      renderRawPreviewGrid(data.lines, data.lineBlocks);
    }
  } catch (err) {
    console.error("Failed to preview raw lines", err);
  }
}

async function performDirectRawPrint() {
  const printerName = printerControls.rawPrinterSelect?.value || "";
  const feedMode = printerControls.rawFeedMode?.value || "auto_40";
  const extraLines = Number(printerControls.rawExtraLines?.value || 2);
  const lineWidth = Number(printerControls.rawLineWidth?.value || 80);
  const totalLines = Number(printerControls.rawTotalLines?.value || 40);
  const sendEscpInit = printerControls.rawSet6Inch?.checked !== false;
  const sendFormFeed = printerControls.rawSendFf?.checked === true;

  if (printerControls.rawDirectPrintBtn) {
    printerControls.rawDirectPrintBtn.disabled = true;
    printerControls.rawDirectPrintBtn.textContent = "Printing...";
  }

  try {
    const payload = {
      // No entry is loaded from this design screen, so print with a blank
      // ticket rather than fabricated demo data landing on real paper.
      entry: {},
      layoutName: printerState.currentLayoutName || printerState.activeLayoutName || "",
      printerName,
      feedMode,
      extraLines,
      lineWidth,
      totalLines,
      sendEscpInit,
      sendFormFeed,
    };

    const response = await fetch("/settings/api/printer/direct-raw-print", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();

    if (data.success) {
      showToast(`Print job sent to ${data.printerName} (${data.totalLines} lines)`, "success");
    } else {
      showToast(data.message || "Direct RAW print failed", "warning");
    }
  } catch (err) {
    showToast(err.message || "Failed to connect to printer spooler", "error");
  } finally {
    if (printerControls.rawDirectPrintBtn) {
      printerControls.rawDirectPrintBtn.disabled = false;
      printerControls.rawDirectPrintBtn.textContent = "🖨️ Direct RAW Line Print";
    }
  }
}

function buildPrinterPreviewUrl(entryId = 0, options = {}) {
  const searchParams = new URLSearchParams();
  if (options.autoprint) {
    searchParams.set("autoprint", "1");
  }
  if (options.nodisplay) {
    searchParams.set("nodisplay", "1");
  }

  const templateName = printerState.currentLayoutName || printerState.activeLayoutName;
  if (templateName) {
    searchParams.set("template", templateName);
  }

  const path = options.isDraft
    ? "/settings/printer-preview-draft"
    : `/settings/printer-preview/${entryId}`;
  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}

async function switchPrinterType(printerType) {
  const nextPrinterType = String(printerType || "").trim();
  if (!nextPrinterType || nextPrinterType === currentPrinterType()) {
    renderTemplateControls();
    return;
  }

  const availableTemplates = templatesForPrinterType(nextPrinterType);
  const nextTemplate = nextPrinterType === "dot_matrix"
    ? (availableTemplates.find(template => template.isBlankTemplate) || availableTemplates.find(template => template.isBaseTemplate) || availableTemplates[0])
    : (availableTemplates.find(template => template.isBaseTemplate) || availableTemplates[0]);
  if (!nextTemplate) {
    showToast(`No templates found for ${printerTypeLabel(nextPrinterType)}`);
    return;
  }

  await switchPrinterTemplate(nextTemplate.name);
}

async function switchPrinterTemplate(layoutName) {
  const nextLayoutName = String(layoutName || "").trim();
  if (!nextLayoutName || nextLayoutName === printerState.currentLayoutName) {
    renderTemplateControls();
    return;
  }

  if (hasUnsavedLayoutChanges()) {
    const shouldContinue = window.confirm(
      "Unsaved changes in the current template will be lost. Continue switching templates?"
    );
    if (!shouldContinue) {
      renderTemplateControls();
      return;
    }
  }

  try {
    const response = await fetch(printerLayoutActiveApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        layoutName: nextLayoutName,
      }),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.message || "Failed to switch template");
    }

    applyPrinterLayoutResponse(result);
    showToast(result.message || "Template switched");
  } catch (error) {
    renderTemplateControls();
    showToast(error.message || "Failed to switch template");
  }
}

async function createPrinterTemplate() {
  if (!printerState.layout) return;
  const layoutName = String(printerControls.createTemplateNameInput?.value || "").trim();
  const sourceLayoutName = printerControls.templateSourceSelect?.value || "";
  if (!layoutName) {
    showToast("Template name is required");
    printerControls.createTemplateNameInput?.focus();
    return;
  }

  const payload = {
    layoutName,
    printerType: currentPrinterType(),
  };

  if (sourceLayoutName && sourceLayoutName !== CURRENT_EDITOR_TEMPLATE_SOURCE) {
    payload.sourceLayoutName = sourceLayoutName;
  } else {
    payload.layout = cloneData(printerState.layout);
  }

  try {
    if (printerControls.confirmCreateTemplateButton) {
      printerControls.confirmCreateTemplateButton.disabled = true;
      printerControls.confirmCreateTemplateButton.textContent = "Creating...";
    }
    const response = await fetch(printerLayoutTemplatesApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.message || "Failed to create template");
    }

    if (printerControls.createTemplateNameInput) {
      printerControls.createTemplateNameInput.value = "";
    }
    closeCreateTemplateModal();
    applyPrinterLayoutResponse(result);
    showToast(result.message || "Template created");
  } catch (error) {
    showToast(error.message || "Failed to create template");
  } finally {
    if (printerControls.confirmCreateTemplateButton) {
      printerControls.confirmCreateTemplateButton.disabled = false;
      printerControls.confirmCreateTemplateButton.textContent = "Create Template";
    }
  }
}

async function loadPrinterLayout() {
  const response = await fetch(printerLayoutApiUrl);
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.message || "Failed to load printer layout");
  }

  applyPrinterLayoutResponse(result);
}

async function savePrinterLayout() {
  if (!printerState.layout) return;

  try {
    const response = await fetch(printerLayoutApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        layoutName: printerState.currentLayoutName || printerState.activeLayoutName,
        printerType: currentPrinterType(),
        layout: printerState.layout,
      }),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.message || "Failed to save printer layout");
    }

    applyPrinterLayoutResponse(result);
    showToast(result.message || "Printer layout saved");
  } catch (error) {
    showToast(error.message || "Failed to save printer layout");
  }
}

async function deletePrinterTemplate() {
  const currentTemplate = currentTemplateRecord();
  if (!currentTemplate) return;

  if (currentTemplate.isProtectedTemplate) {
    showToast("Built-in templates cannot be deleted.");
    return;
  }

  const shouldDelete = window.confirm(
    `Delete template ${currentTemplate.name}? This cannot be undone.`
  );
  if (!shouldDelete) {
    return;
  }

  try {
    const response = await fetch(printerLayoutTemplateDeleteApiUrl, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        layoutName: currentTemplate.name,
      }),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.message || "Failed to delete template");
    }

    applyPrinterLayoutResponse(result);
    showToast(result.message || "Template deleted");
  } catch (error) {
    showToast(error.message || "Failed to delete template");
  }
}

printerControls.addButtons.forEach(button => {
  button.addEventListener("click", () => {
    if (!printerState.layout) return;
    addElement(button.dataset.addKind);
  });
  button.addEventListener("dragstart", handleAddTileDragStart);
  button.addEventListener("dragend", handleAddTileDragEnd);
});

printerControls.duplicateButton?.addEventListener("click", duplicateSelectedElement);
printerControls.deleteButton?.addEventListener("click", deleteSelectedElement);

printerControls.resetButton?.addEventListener("click", () => {
  if (!printerState.defaultLayout) return;
  printerState.layout = cloneData(printerState.defaultLayout);
  printerState.currentPrinterType = printerState.layout?.printerType || printerState.currentPrinterType;
  printerState.selectedElementId = null;
  renderTemplateControls();
  renderPageControls();
  renderQuickAddControls();
  renderFieldRowsManager();
  renderElementList();
  renderInspector();
  renderPreview();
  showToast("Template reset to last saved version");
});

function openPrinterSamplePreview() {
  window.sessionStorage.setItem(
    PRINTER_DRAFT_STORAGE_KEY,
    JSON.stringify(printerState.sampleEntry || {})
  );
  window.sessionStorage.setItem(
    PRINTER_DRAFT_LAYOUT_STORAGE_KEY,
    JSON.stringify(printerState.layout || {})
  );

  const isDotMatrix = currentPrinterType() === "dot_matrix";
  const previewWindow = window.open(
    buildPrinterPreviewUrl(0, { isDraft: true, autoprint: true, nodisplay: isDotMatrix }),
    "_blank"
  );
  if (!previewWindow) {
    showToast("Please allow popups to open the print view");
  }
}

printerControls.clearSelectionButton?.addEventListener("click", clearSelection);
printerControls.openPreviewButton?.addEventListener("click", openPrinterSamplePreview);
printerControls.fullscreenPreviewButton?.addEventListener("click", openPrinterSamplePreview);

printerControls.deleteTemplateButton?.addEventListener("click", deletePrinterTemplate);
printerControls.saveButton?.addEventListener("click", savePrinterLayout);
document.addEventListener("click", event => {
  const saveBlockButton = event.target.closest("[data-save-layout]");
  if (!saveBlockButton || saveBlockButton.disabled) return;
  savePrinterLayout();
});
printerControls.createTemplateButton?.addEventListener("click", openCreateTemplateModal);
printerControls.confirmCreateTemplateButton?.addEventListener("click", createPrinterTemplate);
printerControls.closeCreateTemplateButton?.addEventListener("click", closeCreateTemplateModal);
printerControls.cancelCreateTemplateButton?.addEventListener("click", closeCreateTemplateModal);
printerControls.createTemplateModal?.addEventListener("click", event => {
  if (event.target === printerControls.createTemplateModal) {
    closeCreateTemplateModal();
  }
});
printerControls.createTemplateNameInput?.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    createPrinterTemplate();
  }
});
printerControls.printerTypeList?.addEventListener("click", event => {
  const button = event.target.closest("[data-printer-type]");
  if (!button) return;
  switchPrinterType(button.dataset.printerType);
});
printerControls.templateGrid?.addEventListener("click", event => {
  const button = event.target.closest("[data-template-name]");
  if (!button) return;
  switchPrinterTemplate(button.dataset.templateName);
});

[
  printerControls.pageWidthMm,
  printerControls.pageHeightMm,
  printerControls.pageOrientation,
  printerControls.pageBackgroundColor,
  printerControls.pageBorderColor,
  printerControls.pageBorderWidth,
  printerControls.dotMatrixFontFamily,
].forEach(control => {
  const handlePageControlChange = event => {
    if (!printerState.layout) return;
    if (updatePageState(event.target)) {
      renderPageControls();
      renderPreview();
      if (event.target === printerControls.dotMatrixFontFamily && event.type === "change") {
        savePrinterLayout();
      }
    }
  };
  control?.addEventListener("input", handlePageControlChange);
  control?.addEventListener("change", handlePageControlChange);
});

printerControls.elementList?.addEventListener("click", event => {
  const button = event.target.closest("[data-select-id]");
  if (!button) return;
  selectElement(button.dataset.selectId);
});

printerControls.addFieldRowButton?.addEventListener("click", () => addFieldRow());

printerControls.fieldRowsManager?.addEventListener("click", event => {
  const addSectionRowButton = event.target.closest("[data-add-section-row]");
  if (addSectionRowButton) {
    addFieldRow(addSectionRowButton.dataset.addSectionRow);
    return;
  }

  const addFieldButton = event.target.closest("[data-add-row-field]");
  if (addFieldButton) {
    addFieldToRow(addFieldButton.dataset.sectionId, addFieldButton.dataset.addRowField);
    return;
  }

  const deleteRowButton = event.target.closest("[data-delete-row]");
  if (deleteRowButton) {
    deleteFieldRow(deleteRowButton.dataset.sectionId, deleteRowButton.dataset.deleteRow);
    return;
  }

  const deleteFieldButton = event.target.closest("[data-delete-row-field]");
  if (deleteFieldButton) {
    const [rowId, fieldId] = String(deleteFieldButton.dataset.deleteRowField || "").split(":");
    if (rowId && fieldId) {
      deleteFieldFromRow(deleteFieldButton.dataset.sectionId, rowId, fieldId);
    }
  }
});

printerControls.fieldRowsManager?.addEventListener("input", event => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
  const property = target.dataset.rowFieldProp;
  const sectionId = target.dataset.sectionId;
  const rowId = target.dataset.rowId;
  const fieldId = target.dataset.fieldId;
  if (!sectionId || !rowId || !fieldId || !property) return;
  if (!updateRowFieldProperty(sectionId, rowId, fieldId, property, target.value)) return;
  renderPreview();
});

printerControls.fieldRowsManager?.addEventListener("change", event => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
  const property = target.dataset.rowFieldProp;
  const sectionId = target.dataset.sectionId;
  const rowId = target.dataset.rowId;
  const fieldId = target.dataset.fieldId;
  if (!sectionId || !rowId || !fieldId || !property) return;
  if (!updateRowFieldProperty(sectionId, rowId, fieldId, property, target.value)) return;
  renderPreview();
});

printerControls.inspector?.addEventListener("input", event => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
  if (target.dataset.weightMetaSource) {
    if (!updateSelectedWeightMetaSource(target)) return;
    renderInspector();
    renderPreview();
    return;
  }
  if (!updateSelectedElementProperty(target)) return;

  if (target.dataset.prop === "name") {
    renderElementList();
  }
  renderPreview();
  if (canAutoExpandSelectedElement(target.dataset.prop) && autoExpandSelectedElementHeight()) {
    renderPreview();
    syncInspectorPositionValues();
  }
});

printerControls.inspector?.addEventListener("change", event => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
  if (target.dataset.weightMetaSource) {
    if (!updateSelectedWeightMetaSource(target)) return;
    renderInspector();
    renderPreview();
    return;
  }
  if (!updateSelectedElementProperty(target)) return;

  if (target.dataset.prop === "name") {
    renderElementList();
  }
  renderPreview();
  if (canAutoExpandSelectedElement(target.dataset.prop) && autoExpandSelectedElementHeight()) {
    renderPreview();
    syncInspectorPositionValues();
  }
});

printerControls.inspector?.addEventListener("click", event => {
  const button = event.target.closest("#uploadPrinterImageButton");
  if (!button) return;
  printerControls.imageUpload?.click();
});

printerControls.imageUpload?.addEventListener("change", event => {
  const file = event.target.files?.[0];
  if (!file) return;
  uploadSelectedImage(file);
});

printerControls.preview?.addEventListener("mousedown", handlePreviewMouseDown);
printerControls.preview?.addEventListener("click", handlePreviewClick);
printerControls.preview?.addEventListener("dragover", handlePreviewDragOver);
printerControls.preview?.addEventListener("drop", handlePreviewDrop);
window.addEventListener("mousemove", handlePreviewMouseMove);
window.addEventListener("mouseup", handlePreviewMouseUp);
window.addEventListener("resize", queuePreviewFit);

if (typeof ResizeObserver !== "undefined" && printerControls.previewStage) {
  const previewStageResizeObserver = new ResizeObserver(() => {
    queuePreviewFit();
  });
  previewStageResizeObserver.observe(printerControls.previewStage);
}

window.addEventListener("keydown", event => {
  if ((event.key === "Delete" || event.key === "Backspace") && printerState.selectedElementId && !isTypingTarget(event.target)) {
    event.preventDefault();
    deleteSelectedElement();
    return;
  }
  if (event.key === "Escape") {
    if (printerControls.createTemplateModal?.classList.contains("open")) {
      closeCreateTemplateModal();
      return;
    }
    clearSelection();
    clearAddTileDragState();
  }
});

printerControls.tabVisualEditor?.addEventListener("click", () => setViewMode("visual"));
printerControls.tabDotMatrixRaw?.addEventListener("click", () => setViewMode("raw"));
printerControls.rawFeedMode?.addEventListener("change", refreshDotMatrixRawPreview);
printerControls.rawExtraLines?.addEventListener("input", refreshDotMatrixRawPreview);
printerControls.rawLineWidth?.addEventListener("input", refreshDotMatrixRawPreview);
printerControls.rawTotalLines?.addEventListener("input", refreshDotMatrixRawPreview);
printerControls.rawDirectPrintBtn?.addEventListener("click", performDirectRawPrint);

document.querySelectorAll(".raw-palette-tile[data-raw-palette-kind]").forEach(tile => {
  tile.addEventListener("dragstart", handleRawPaletteDragStart);
  tile.addEventListener("dragend", handleRawPaletteDragEnd);
});

loadPrinterLayout().catch(error => {
  showToast(error.message || "Failed to load printer layout");
});
