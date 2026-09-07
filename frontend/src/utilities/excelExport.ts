export type ExcelCellValue = string | number | boolean | Date | null | undefined;

export type ExcelColumn<T> = {
  header: string;
  value: (row: T) => ExcelCellValue;
  width?: number;
};

type WorkbookOptions<T> = {
  sheetName: string;
  columns: ExcelColumn<T>[];
  rows: T[];
};

type ZipSource = {
  path: string;
  content: string;
};

const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const ZIP_UTF8_FLAG = 0x0800;
const ZIP_STORE_METHOD = 0;

export function downloadExcelSheet<T>({ fileName, ...options }: WorkbookOptions<T> & { fileName: string }) {
  const workbook = buildXlsxWorkbook(options);
  const buffer = workbook.buffer.slice(workbook.byteOffset, workbook.byteOffset + workbook.byteLength);
  const blob = new Blob([buffer], { type: XLSX_MIME_TYPE });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = normaliseExcelFileName(fileName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function buildXlsxWorkbook<T>({ sheetName, columns, rows }: WorkbookOptions<T>) {
  const safeSheetName = normaliseSheetName(sheetName);
  const worksheet = buildWorksheetXml({ sheetName: safeSheetName, columns, rows });

  return createZip([
    { path: "[Content_Types].xml", content: contentTypesXml() },
    { path: "_rels/.rels", content: rootRelationshipsXml() },
    { path: "docProps/app.xml", content: appPropertiesXml(safeSheetName) },
    { path: "docProps/core.xml", content: corePropertiesXml() },
    { path: "xl/workbook.xml", content: workbookXml(safeSheetName) },
    { path: "xl/_rels/workbook.xml.rels", content: workbookRelationshipsXml() },
    { path: "xl/styles.xml", content: stylesXml() },
    { path: "xl/worksheets/sheet1.xml", content: worksheet }
  ]);
}

function buildWorksheetXml<T>({ columns, rows }: WorkbookOptions<T> & { sheetName: string }) {
  const lastColumn = columnName(Math.max(columns.length, 1));
  const lastRow = Math.max(rows.length + 1, 1);
  const dimension = `A1:${lastColumn}${lastRow}`;
  const columnWidths = columns
    .map((column, index) => `<col min="${index + 1}" max="${index + 1}" width="${column.width ?? 18}" customWidth="1"/>`)
    .join("");
  const headerCells = columns.map((column, index) => cellXml(columnName(index + 1), 1, column.header, 1)).join("");
  const dataRows = rows
    .map((row, rowIndex) => {
      const excelRow = rowIndex + 2;
      const cells = columns.map((column, columnIndex) => cellXml(columnName(columnIndex + 1), excelRow, column.value(row))).join("");
      return `<row r="${excelRow}">${cells}</row>`;
    })
    .join("");

  return xmlDeclaration(
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<dimension ref="${dimension}"/>` +
      `<sheetViews><sheetView workbookViewId="0"/></sheetViews>` +
      `<sheetFormatPr defaultRowHeight="15"/>` +
      `<cols>${columnWidths}</cols>` +
      `<sheetData><row r="1">${headerCells}</row>${dataRows}</sheetData>` +
      `<autoFilter ref="${dimension}"/>` +
      `</worksheet>`
  );
}

function cellXml(column: string, row: number, value: ExcelCellValue, styleId = 0) {
  const reference = `${column}${row}`;
  const style = styleId ? ` s="${styleId}"` : "";

  if (value === null || value === undefined || value === "") {
    return `<c r="${reference}"${style}/>`;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${reference}"${style}><v>${value}</v></c>`;
  }

  if (typeof value === "boolean") {
    return `<c r="${reference}"${style} t="b"><v>${value ? 1 : 0}</v></c>`;
  }

  const stringValue = value instanceof Date ? value.toISOString() : String(value);
  return `<c r="${reference}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(stringValue)}</t></is></c>`;
}

function contentTypesXml() {
  return xmlDeclaration(
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
      `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
      `</Types>`
  );
}

function rootRelationshipsXml() {
  return xmlDeclaration(
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
      `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
      `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>` +
      `</Relationships>`
  );
}

function workbookXml(sheetName: string) {
  return xmlDeclaration(
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets>` +
      `</workbook>`
  );
}

function workbookRelationshipsXml() {
  return xmlDeclaration(
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
      `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `</Relationships>`
  );
}

function stylesXml() {
  return xmlDeclaration(
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
      `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
      `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
      `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
      `<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>` +
      `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
      `</styleSheet>`
  );
}

function appPropertiesXml(sheetName: string) {
  return xmlDeclaration(
    `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">` +
      `<Application>HR Roster</Application>` +
      `<TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>${escapeXml(sheetName)}</vt:lpstr></vt:vector></TitlesOfParts>` +
      `</Properties>`
  );
}

function corePropertiesXml() {
  const now = new Date().toISOString();

  return xmlDeclaration(
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
      `<dc:creator>HR Roster</dc:creator>` +
      `<cp:lastModifiedBy>HR Roster</cp:lastModifiedBy>` +
      `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>` +
      `<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>` +
      `</cp:coreProperties>`
  );
}

function createZip(files: ZipSource[]) {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  const entryRecords: Array<{ name: Uint8Array; data: Uint8Array; crc: number; offset: number }> = [];
  const { dosTime, dosDate } = dosDateTime(new Date());
  let offset = 0;

  files.forEach((file) => {
    const name = encoder.encode(file.path);
    const data = encoder.encode(file.content);
    const crc = crc32(data);
    const localHeader = localFileHeader(name, data, crc, dosTime, dosDate);

    localParts.push(localHeader, data);
    entryRecords.push({ name, data, crc, offset });
    offset += localHeader.length + data.length;
  });

  const centralDirectoryOffset = offset;
  entryRecords.forEach((entry) => {
    const centralHeader = centralDirectoryHeader(entry.name, entry.data, entry.crc, entry.offset, dosTime, dosDate);
    centralParts.push(centralHeader);
    offset += centralHeader.length;
  });

  const centralDirectorySize = offset - centralDirectoryOffset;
  const endRecord = endOfCentralDirectoryRecord(entryRecords.length, centralDirectorySize, centralDirectoryOffset);

  return concatUint8Arrays([...localParts, ...centralParts, endRecord]);
}

function localFileHeader(name: Uint8Array, data: Uint8Array, crc: number, dosTime: number, dosDate: number) {
  const header = new Uint8Array(30 + name.length);
  const view = new DataView(header.buffer);

  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, ZIP_UTF8_FLAG, true);
  view.setUint16(8, ZIP_STORE_METHOD, true);
  view.setUint16(10, dosTime, true);
  view.setUint16(12, dosDate, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, data.length, true);
  view.setUint32(22, data.length, true);
  view.setUint16(26, name.length, true);
  view.setUint16(28, 0, true);
  header.set(name, 30);

  return header;
}

function centralDirectoryHeader(name: Uint8Array, data: Uint8Array, crc: number, localHeaderOffset: number, dosTime: number, dosDate: number) {
  const header = new Uint8Array(46 + name.length);
  const view = new DataView(header.buffer);

  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, ZIP_UTF8_FLAG, true);
  view.setUint16(10, ZIP_STORE_METHOD, true);
  view.setUint16(12, dosTime, true);
  view.setUint16(14, dosDate, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, data.length, true);
  view.setUint32(24, data.length, true);
  view.setUint16(28, name.length, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, localHeaderOffset, true);
  header.set(name, 46);

  return header;
}

function endOfCentralDirectoryRecord(entryCount: number, centralDirectorySize: number, centralDirectoryOffset: number) {
  const record = new Uint8Array(22);
  const view = new DataView(record.buffer);

  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, entryCount, true);
  view.setUint16(10, entryCount, true);
  view.setUint32(12, centralDirectorySize, true);
  view.setUint32(16, centralDirectoryOffset, true);
  view.setUint16(20, 0, true);

  return record;
}

function concatUint8Arrays(parts: Uint8Array[]) {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });

  return output;
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;

  data.forEach((byte) => {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  });

  return (crc ^ 0xffffffff) >>> 0;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;

  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }

  return value >>> 0;
});

function dosDateTime(date: Date) {
  const year = Math.max(date.getFullYear(), 1980);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);

  return { dosDate, dosTime };
}

function columnName(index: number) {
  let name = "";
  let value = index;

  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }

  return name;
}

function normaliseSheetName(name: string) {
  const safe = name.replace(/[\\/?*[\]:]/g, " ").trim();

  return (safe || "Sheet1").slice(0, 31);
}

function normaliseExcelFileName(fileName: string) {
  const safeName = fileName.replace(/[\\/:*?"<>|]/g, "-").trim() || "export.xlsx";

  return safeName.toLowerCase().endsWith(".xlsx") ? safeName : `${safeName}.xlsx`;
}

function escapeXml(value: string) {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function xmlDeclaration(content: string) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${content}`;
}
