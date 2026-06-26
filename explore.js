const xlsx = require('xlsx');
try {
    const workbook = xlsx.readFile('2026-06-26.xls');
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet, {header: 1});
    
    // Find the header row (assume it's within the first 10 rows)
    for (let i = 0; i < Math.min(10, data.length); i++) {
        if (data[i] && data[i].length > 0) {
            console.log(`Row ${i} columns:`, data[i]);
        }
    }
} catch (e) {
    console.error(e);
}
