import { type Browser, chromium } from "playwright";
import { UserError } from "./errors";

export async function htmlToPdf(html: string): Promise<Uint8Array> {
  let browser: Browser | undefined;

  try {
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "16mm", right: "14mm", bottom: "16mm", left: "14mm" },
    });
    return new Uint8Array(pdf);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/Executable doesn't exist|playwright install|browserType\.launch/i.test(message)) {
      throw new UserError("PDF output needs Chromium. Run: bunx playwright install chromium", 1, {
        cause: error,
      });
    }
    throw new UserError(`Could not render the PDF: ${message}`, 1, { cause: error });
  } finally {
    await browser?.close();
  }
}
