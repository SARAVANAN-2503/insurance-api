const ExcelJS = require('exceljs');

function cellText(value) {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function createImportReport(filename) {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ filename, useStyles: true });
  const sheet = workbook.addWorksheet('Import issues', { views: [{ state: 'frozen', ySplit: 1 }] });
  let headerWritten = false;

  function headers(values = []) {
    if (headerWritten) return;
    const columns = ['Row', 'Severity', 'Type', 'Issue', ...values.map(cellText), 'Extra values'];
    sheet.columns = columns.map((header, index) => ({ header, width: index === 3 ? 65 : 24 }));
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).commit();
    headerWritten = true;
  }

  function add(row, type, issue, values = [], sourceWidth = values.length) {
    headers();
    const original = Array.from({ length: sourceWidth }, (_, i) => cellText(values[i]));
    // Explicit strings keep uploaded formulas as text in the downloadable workbook.
    sheet.addRow([row, type === 'duplicate' ? 'Warning' : 'Error', type, issue,
      ...original, values.length > sourceWidth ? JSON.stringify(values.slice(sourceWidth)) : '']).commit();
  }

  async function finish(counts) {
    headers();
    const summary = workbook.addWorksheet('Summary');
    summary.columns = [{ header: 'Result', width: 25 }, { header: 'Count', width: 15 }];
    for (const [name, count] of Object.entries(counts)) summary.addRow([name, count]).commit();
    await workbook.commit();
  }

  return { headers, add, finish };
}

module.exports = { createImportReport };
