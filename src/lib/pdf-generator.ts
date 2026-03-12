import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

/**
 * Generates a PDF from HTML content and triggers download
 * Uses an isolated iframe to avoid CSS inheritance issues from Tailwind v4
 * Then converts to canvas and PDF
 * @param html - The HTML string to convert to PDF
 * @param filename - The filename for the downloaded PDF
 */
export async function generatePDFFromHTML(
  html: string,
  filename: string
): Promise<void> {
  const imgWidth = 210; // A4 width in mm
  const pageHeight = 297; // A4 height in mm

  const addCanvasToPdf = (
    pdf: jsPDF,
    canvas: HTMLCanvasElement,
    addPageBefore = false
  ) => {
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const imgData = canvas.toDataURL("image/png");

    if (addPageBefore) {
      pdf.addPage();
    }

    let heightLeft = imgHeight;
    let position = 0;
    const pageOverflowTolerance = 0.5; // Avoid blank pages caused by tiny float rounding

    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > pageOverflowTolerance) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }
  };

  // Create an isolated iframe to avoid CSS conflicts
  const iframe = document.createElement("iframe");
  iframe.style.position = "absolute";
  iframe.style.left = "-9999px";
  iframe.style.top = "0";
  iframe.style.width = "210mm"; // A4 width
  iframe.style.height = "297mm"; // A4 height
  iframe.style.border = "none";

  document.body.appendChild(iframe);

  try {
    // Write HTML to iframe
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) {
      throw new Error("No se pudo acceder al documento del iframe");
    }

    iframeDoc.open();
    iframeDoc.write(html);
    iframeDoc.close();

    // Remove any external stylesheets or scripts that might have been injected
    const externalLinks = iframeDoc.querySelectorAll(
      'link[rel="stylesheet"], script[src]'
    );
    for (const link of externalLinks) {
      link.remove();
    }

    // Wait for content to load
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Create PDF
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const documentCopies = Array.from(
      iframeDoc.querySelectorAll<HTMLElement>(".document-copy")
    );

    if (documentCopies.length > 0) {
      for (const [index, copy] of documentCopies.entries()) {
        const canvas = await html2canvas(copy, {
          scale: 2, // Higher quality
          useCORS: true,
          backgroundColor: "#ffffff",
          logging: false,
          windowWidth: copy.scrollWidth || iframe.offsetWidth,
          windowHeight: copy.scrollHeight || iframe.offsetHeight,
        });
        addCanvasToPdf(pdf, canvas, index > 0);
      }
    } else {
      // Fallback for documents that don't define explicit page copies
      const iframeBody = iframeDoc.body;
      if (!iframeBody) {
        throw new Error("No se pudo acceder al contenido del iframe");
      }

      const canvas = await html2canvas(iframeBody, {
        scale: 2, // Higher quality
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        windowWidth: iframe.offsetWidth,
        windowHeight: iframe.offsetHeight,
      });
      addCanvasToPdf(pdf, canvas);
    }

    // Trigger download
    pdf.save(filename);
  } catch (error) {
    throw new Error(
      `Error al generar el PDF: ${error instanceof Error ? error.message : "Error desconocido"}`
    );
  } finally {
    // Clean up
    document.body.removeChild(iframe);
  }
}
