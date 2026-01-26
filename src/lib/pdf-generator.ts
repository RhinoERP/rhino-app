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

    // Get the body element from iframe
    const iframeBody = iframeDoc.body;
    if (!iframeBody) {
      throw new Error("No se pudo acceder al contenido del iframe");
    }

    // Convert iframe content to canvas
    const canvas = await html2canvas(iframeBody, {
      scale: 2, // Higher quality
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: iframe.offsetWidth,
      windowHeight: iframe.offsetHeight,
    });

    // Calculate PDF dimensions
    const imgWidth = 210; // A4 width in mm
    const pageHeight = 297; // A4 height in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    // Create PDF
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const imgData = canvas.toDataURL("image/png");

    // Handle multi-page PDFs if content exceeds one page
    let heightLeft = imgHeight;
    let position = 0;

    // Add first page
    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    // Add additional pages if needed
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
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
