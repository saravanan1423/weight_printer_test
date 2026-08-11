(function () {
  window.PrintTicketTypeHandlers = window.PrintTicketTypeHandlers || {};

  window.PrintTicketTypeHandlers.a4 = {
    className: "print-mode-a4",
    getConfig({ widthMm, heightMm }) {
      return {
        pageWidthMm: widthMm,
        pageHeightMm: heightMm,
        contentWidthMm: widthMm,
        contentHeightMm: heightMm,
        pageRule: `@page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }`,
        variables: {},
      };
    },
  };
})();
