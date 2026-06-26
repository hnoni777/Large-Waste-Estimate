const xlsx = require('xlsx');
const fs = require('fs');

try {
    const workbook = xlsx.readFile('정리본_품목별정렬.xlsx');
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);
    
    fs.writeFileSync('data.json', JSON.stringify(data, null, 2), 'utf-8');
    console.log('Successfully created data.json');
} catch (e) {
    console.error(e);
}
