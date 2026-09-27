const fs = require('node:fs');
const { parse } = require('csv-parse');
const ExcelJS = require('exceljs');

function cellValue(cell) {
  const value = cell.value;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    if (value.richText) return value.richText.map((part) => part.text).join('');
    if (value.text !== undefined) return value.text;
    // Formula and error cells are rejected by row validation rather than evaluated.
    return value;
  }
  if (typeof value === 'number' && /^0+$/.test(cell.numFmt || '')) {
    return String(value).padStart(cell.numFmt.length, '0');
  }
  return value;
}

async function* readRows(filePath, extension) {
  const input = fs.createReadStream(filePath);
  if (extension === '.csv') {
    const parser = parse({ bom: true, skip_empty_lines: false, max_record_size: 1024 * 1024,
      relax_column_count: true });
    input.on('error', (err) => parser.destroy(err));
    input.pipe(parser);
    try {
      for await (const values of parser) yield values;
    } finally {
      input.destroy();
      parser.destroy();
    }
    return;
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.read(input);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new Error('XLSX has no readable worksheets');
    for (let index = 1; index <= worksheet.rowCount; index += 1) {
      const row = worksheet.getRow(index);
      yield Array.from({ length: row.cellCount }, (_, column) => cellValue(row.getCell(column + 1)));
    }
  } finally {
    input.destroy();
  }
}

module.exports = { readRows };
