declare module 'exceljs' {
  interface Border {
    style?: string;
    color?: { argb?: string };
  }
  interface CellBorder {
    top?: Border;
    left?: Border;
    bottom?: Border;
    right?: Border;
  }
  interface Font {
    bold?: boolean;
    name?: string;
    size?: number;
  }
  interface Column {
    width?: number;
  }
  interface Cell {
    value: unknown;
    border?: CellBorder;
    font?: Font;
    numFmt?: string;
  }
  interface Row {
    getCell(col: number): Cell;
  }
  interface Worksheet {
    getColumn(col: number): Column;
    getRow(row: number): Row;
  }
  interface WorkbookInstance {
    addWorksheet(
      name: string,
      options?: { views?: { showGridLines?: boolean }[] }
    ): Worksheet;
    xlsx: { writeBuffer(): Promise<ArrayBuffer | Buffer> };
  }
  const ExcelJS: {
    Workbook: new () => WorkbookInstance;
  };
  export = ExcelJS;
}
