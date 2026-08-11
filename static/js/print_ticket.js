const printLayoutPreview = document.querySelector("#printerLayoutPreview");
const printPreviewCanvas = document.querySelector(".print-preview-canvas");
const printPreviewTitle = document.querySelector("#printPreviewTitle");
const printPreviewSubtitle = document.querySelector("#printPreviewSubtitle");
const searchParams = new URLSearchParams(window.location.search);
const shouldAutoPrint = searchParams.get("autoprint") === "1";
const hideNoDisplayUI = searchParams.get("nodisplay") === "1";

if (hideNoDisplayUI) {
  document.documentElement.classList.add("no-preview-ui");
  window.addEventListener("DOMContentLoaded", () => {
    const toolbar = document.querySelector(".print-preview-toolbar");
    if (toolbar) toolbar.style.display = "none";
  });
}
const isDraftPreview = window.location.pathname.endsWith("/printer-preview-draft");
const PRINTER_DRAFT_STORAGE_KEY = "weighman:printer-draft";
const PRINTER_DRAFT_LAYOUT_STORAGE_KEY = "weighman:printer-draft-layout";
const PRINT_PAGE_STYLE_ID = "dynamicPrintPageSize";
let titleBeforePrint = document.title;

function applyPrintPageSize(layout) {
  const page = layout?.page || {};
  const widthMm = Number(page.widthMm || 210);
  const heightMm = Number(page.heightMm || 148);
  const printerType = String(layout?.printerType || "").trim();
  const handlers = window.PrintTicketTypeHandlers || {};
  const handler = handlers[printerType] || handlers.a4;
  const config = handler?.getConfig
    ? handler.getConfig({ layout, page, widthMm, heightMm, printerType })
    : {
      pageWidthMm: widthMm,
      pageHeightMm: heightMm,
      contentWidthMm: widthMm,
      contentHeightMm: heightMm,
      pageRule: `@page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }`,
      variables: {},
    };

  Object.values(handlers).forEach(typeHandler => {
    if (typeHandler?.className) {
      document.documentElement.classList.remove(typeHandler.className);
    }
  });
  if (handler?.className) {
    document.documentElement.classList.add(handler.className);
  }

  document.documentElement.style.setProperty("--print-page-width", `${config.pageWidthMm}mm`);
  document.documentElement.style.setProperty("--print-page-height", `${config.pageHeightMm}mm`);
  document.documentElement.style.setProperty("--print-content-width", `${config.contentWidthMm}mm`);
  document.documentElement.style.setProperty("--print-content-height", `${config.contentHeightMm}mm`);
  Object.entries(config.variables || {}).forEach(([key, value]) => {
    document.documentElement.style.setProperty(key, value);
  });

  let styleNode = document.querySelector(`#${PRINT_PAGE_STYLE_ID}`);
  if (!styleNode) {
    styleNode = document.createElement("style");
    styleNode.id = PRINT_PAGE_STYLE_ID;
    document.head.appendChild(styleNode);
  }
  styleNode.textContent = config.pageRule;
}

function loadPreviewEntry() {
  if (!isDraftPreview) {
    return window.PRINTER_ENTRY_DATA || {};
  }

  try {
    const raw = window.sessionStorage.getItem(PRINTER_DRAFT_STORAGE_KEY);
    if (!raw) return {};
    const entry = JSON.parse(raw) || {};
    window.sessionStorage.removeItem(PRINTER_DRAFT_STORAGE_KEY);
    return entry;
  } catch (error) {
    return {};
  }
}

function loadPreviewLayout() {
  if (!isDraftPreview) {
    return window.PRINTER_LAYOUT_DATA || {};
  }

  try {
    const raw = window.sessionStorage.getItem(PRINTER_DRAFT_LAYOUT_STORAGE_KEY);
    if (!raw) return window.PRINTER_LAYOUT_DATA || {};
    const layout = JSON.parse(raw) || {};
    window.sessionStorage.removeItem(PRINTER_DRAFT_LAYOUT_STORAGE_KEY);
    return layout;
  } catch (error) {
    return window.PRINTER_LAYOUT_DATA || {};
  }
}

function updatePreviewToolbar(entry) {
  if (printPreviewTitle) {
    printPreviewTitle.textContent = `Ticket ${entry?.serialNo || "Draft"}`;
  }
  if (printPreviewSubtitle) {
    printPreviewSubtitle.textContent = entry?.vehicleNo || "Current Form Values";
  }
  if (entry?.serialNo) {
    document.title = `Print Ticket ${entry.serialNo}`;
  }
}

function fitPrintPreviewToViewport() {
  if (!printLayoutPreview || !printPreviewCanvas || window.matchMedia("print").matches) return;

  printLayoutPreview.style.setProperty("--preview-zoom", "1");
  const availableWidth = Math.max(printPreviewCanvas.clientWidth - 24, 320);
  const availableHeight = Math.max(printPreviewCanvas.clientHeight - 24, 240);
  const naturalWidth = printLayoutPreview.offsetWidth;
  const naturalHeight = printLayoutPreview.offsetHeight;

  if (!naturalWidth || !naturalHeight) return;

  const zoom = Math.min(availableWidth / naturalWidth, availableHeight / naturalHeight, 1);
  printLayoutPreview.style.setProperty("--preview-zoom", String(zoom));
}

function renderPreview() {
  if (!printLayoutPreview || !window.PrinterLayoutRenderer) return;
  applyPrintPageSize(previewLayout);
  window.PrinterLayoutRenderer.render(
    printLayoutPreview,
    previewLayout,
    previewEntry
  );
}

const previewLayout = loadPreviewLayout();
const previewEntry = loadPreviewEntry();
updatePreviewToolbar(previewEntry);

function refreshPreview() {
  renderPreview();
  fitPrintPreviewToViewport();
}

function hideBrowserPrintHeaderTitle() {
  titleBeforePrint = document.title;
  document.title = " ";
}

function restoreBrowserPrintHeaderTitle() {
  document.title = titleBeforePrint || " ";
}

refreshPreview();
window.addEventListener("load", refreshPreview);
window.addEventListener("resize", refreshPreview);
window.addEventListener("beforeprint", () => {
  renderPreview();
  hideBrowserPrintHeaderTitle();
});
window.addEventListener("afterprint", restoreBrowserPrintHeaderTitle);

if (document.fonts?.ready) {
  document.fonts.ready.then(refreshPreview).catch(() => {});
}

if (shouldAutoPrint) {
  const renderImages = Array.from(printLayoutPreview?.querySelectorAll("img") || []);
  let hasPrinted = false;

  function triggerPrint() {
    if (hasPrinted) return;
    hasPrinted = true;
    renderPreview();
    window.print();
  }

  if (!renderImages.length) {
    window.setTimeout(triggerPrint, hideNoDisplayUI ? 100 : 350);
  } else {
    let completedImages = 0;
    const finish = () => {
      completedImages += 1;
      if (completedImages === renderImages.length) {
        window.setTimeout(triggerPrint, 250);
      }
    };

    renderImages.forEach(image => {
      if (image.complete) {
        finish();
        return;
      }
      image.addEventListener("load", finish, { once: true });
      image.addEventListener("error", finish, { once: true });
    });

    window.setTimeout(triggerPrint, 1200);
  }

  window.addEventListener("afterprint", () => {
    window.setTimeout(() => window.close(), 200);
  }, { once: true });
}
