declare module 'pdf-parse' {
  export class PDFParse {
    constructor(options?: { data?: Buffer });
    getText(): Promise<{ pages: Array<{ text: string }>; total?: number }>;
    getTable(): Promise<{ pages: Array<{ tables: Array<any> }> }>;
    destroy(): Promise<void> | void;
  }

  export interface PDFData {
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: Record<string, unknown> | null;
    version: string;
    text: string;
  }

  function pdfParse(
    buffer: Buffer,
    options?: Record<string, unknown>
  ): Promise<PDFData>;

  export default pdfParse;
}