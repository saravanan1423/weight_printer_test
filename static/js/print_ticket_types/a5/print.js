(function () {
  window.PrintTicketTypeHandlers = window.PrintTicketTypeHandlers || {};

  function pageOrientation(page, widthMm, heightMm) {
    const savedOrientation = String(page?.orientation || "").trim().toLowerCase();
    if (savedOrientation === "portrait" || savedOrientation === "landscape") {
      return savedOrientation;
    }
    return widthMm > heightMm ? "landscape" : "portrait";
  }

  window.PrintTicketTypeHandlers.a5 = {
    className: "print-mode-a5",
    getConfig({ page, widthMm, heightMm }) {
      const orientation = pageOrientation(page, widthMm, heightMm);
      const rotateLandscape = orientation === "landscape";
      const pageWidthMm = 148;
      const pageHeightMm = 210;
      const layoutWidthMm = widthMm;
      const layoutHeightMm = heightMm;
      const scale = Math.min(
        (rotateLandscape ? pageHeightMm : pageWidthMm) / Math.max(layoutWidthMm, 1),
        (rotateLandscape ? pageWidthMm : pageHeightMm) / Math.max(layoutHeightMm, 1),
        1
      );
      const printTransform = rotateLandscape
        ? `translateX(${pageWidthMm}mm) rotate(90deg) translateX(3mm) scale(${scale})`
        : `translateX(3mm) scale(${scale})`;
      return {
        pageWidthMm,
        pageHeightMm,
        contentWidthMm: layoutWidthMm,
        contentHeightMm: layoutHeightMm,
        // Use exact A5 dimensions instead of "A5 landscape/portrait".
        // Chrome/printer drivers can auto-rotate named landscape pages, which
        // makes the ticket print sideways even when the editor layout is right.
        pageRule: `@page { size: ${pageWidthMm}mm ${pageHeightMm}mm; margin: 0; }`,
        variables: {
          "--a5-print-scale": String(scale),
          "--a5-print-transform": printTransform,
          "--a5-scaled-width": `${layoutWidthMm * scale}mm`,
          "--a5-scaled-height": `${layoutHeightMm * scale}mm`,
        },
      };
    },
  };
})();
