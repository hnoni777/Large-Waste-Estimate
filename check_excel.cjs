const xlsx = require('xlsx');

try {
    const workbook = xlsx.readFile('2026-06-27.xls', { cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    const dataObj = xlsx.utils.sheet_to_json(sheet);
    const dateVal = dataObj[0]['신청일자'];
    console.log("Raw Date Type:", typeof dateVal);
    console.log("Raw Date Instance:", dateVal instanceof Date);
    console.log("Raw Date Value:", dateVal);
    
    // Test conversion
    if (dateVal instanceof Date) {
        // Adjust for timezone offset if necessary
        const dt = new Date(dateVal.getTime());
        const yyyy = dt.getFullYear();
        const mm = String(dt.getMonth() + 1).padStart(2, '0');
        const dd = String(dt.getDate()).padStart(2, '0');
        console.log(`Converted: ${yyyy}-${mm}-${dd}`);
    }
} catch (e) {
    console.error(e);
}
