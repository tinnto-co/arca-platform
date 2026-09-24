declare module 'xlsx' {
  export type WorkSheet = Record<string, unknown>;
  export interface WorkBook {
    SheetNames: string[];
    Sheets: Record<string, WorkSheet>;
  }
  export const utils: {
    aoa_to_sheet: (data: unknown[][]) => WorkSheet;
    book_new: () => WorkBook;
    book_append_sheet: (wb: WorkBook, ws: WorkSheet, name: string) => void;
    sheet_to_json: <T = unknown>(
      sheet: WorkSheet,
      opts?: { header?: 1; raw?: boolean; defval?: unknown; blankrows?: boolean }
    ) => T[];
  };
  export function read(
    data: unknown,
    opts?: {
      type?: 'array' | 'base64' | 'binary' | 'buffer' | 'file' | 'string';
      cellDates?: boolean;
      raw?: boolean;
    }
  ): WorkBook;
  export function readFile(path: string): WorkBook;
  export function writeFile(wb: WorkBook, filename: string): void;
}
