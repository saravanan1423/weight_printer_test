(function () {
  window.PrintTicketTypeHandlers = window.PrintTicketTypeHandlers || {};

  window.PrintTicketTypeHandlers.dot_matrix = {
    className: "print-mode-dot-matrix",
    getConfig({ layout, widthMm, heightMm }) {
      const contentWidthMm = Number(widthMm) || 254;
      const contentHeightMm = Number(heightMm) || 140;

      const elements = Array.isArray(layout && layout.elements) ? layout.elements : [];
      const printBreakEl = elements.find(function (el) { return el && el.kind === "printBreak"; });
      const hasPrintBreak = Boolean(printBreakEl);
      const breakTopPercent = hasPrintBreak
        ? Math.max(0, Math.min(100, Number(printBreakEl.y) || 0))
        : null;

      let effectiveHeightMm = contentHeightMm;
      let effectiveHeightPercent = 100;

      if (breakTopPercent !== null) {
        // Stop printing at the exact vertical position where the print break is placed
        effectiveHeightPercent = breakTopPercent;
        effectiveHeightMm = Math.max(10, Math.round(((contentHeightMm * breakTopPercent) / 100) * 10) / 10);
      } else {
        // Auto-determine height according to the lowest element if no printBreak is set
        let maxBottom = 0;
        elements.forEach(function (el) {
          if (!el || el.kind === "printBreak") return;
          const bottom = (Number(el.y) || 0) + (Number(el.h) || 0);
          if (bottom > maxBottom) maxBottom = bottom;
        });

        const managedSections = Array.isArray(layout && layout.managedSections) ? layout.managedSections : [];
        managedSections.forEach(function (sec) {
          const secY = Number(sec.y) || 0;
          const rows = Array.isArray(sec.rows) ? sec.rows.length : 0;
          const rowHeight = Number(sec.rowHeight) || 6.5;
          const secBottom = secY + (rows * rowHeight);
          if (secBottom > maxBottom) maxBottom = secBottom;
        });

        if (maxBottom > 0 && maxBottom < 96) {
          const autoPercent = Math.min(100, Math.ceil(maxBottom + 3));
          effectiveHeightPercent = autoPercent;
          effectiveHeightMm = Math.max(20, Math.round(((contentHeightMm * autoPercent) / 100) * 10) / 10);
        }
      }

      const pageWidthMm = contentWidthMm;
      const pageHeightMm = effectiveHeightMm;

      return {
        pageWidthMm,
        pageHeightMm,
        contentWidthMm,
        contentHeightMm,
        pageRule: `
          @page { size: ${pageWidthMm}mm ${pageHeightMm}mm; margin: 0; }
          @page :first { size: ${pageWidthMm}mm ${pageHeightMm}mm; margin: 0; }
        `,
        variables: {
          "--dot-matrix-print-transform": "none",
          "--dot-matrix-print-scale": "1",
          "--dot-matrix-ticket-height": `${contentHeightMm}mm`,
          "--dot-matrix-print-break-height": `${effectiveHeightMm}mm`,
          "--dot-matrix-print-break-top": `${effectiveHeightPercent}%`,
        },
      };
    },
  };
})();
