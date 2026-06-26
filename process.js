const xlsx = require('xlsx');

try {
    const workbook = xlsx.readFile('2026-06-26.xls');
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);
    
    const seen = new Set();
    const result = [];
    
    for (const row of data) {
        const item = row['품목'];
        const spec = row['규격'];
        
        const key = `${item}|${spec}`;
        
        if (item && !seen.has(key)) {
            seen.add(key);
            result.push({
                '품목': item,
                '규격': spec,
                '비용': row['비용']
            });
        }
    }
    
    // Sort the result by '품목' (Item) first, then by '규격' (Specification)
    result.sort((a, b) => {
        if (a['품목'] < b['품목']) return -1;
        if (a['품목'] > b['품목']) return 1;
        
        if (a['규격'] < b['규격']) return -1;
        if (a['규격'] > b['규격']) return 1;
        
        return 0;
    });
    
    const newSheet = xlsx.utils.json_to_sheet(result);
    const newWorkbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(newWorkbook, newSheet, '정리본');
    
    // Write to a new file in case the old one is open
    xlsx.writeFile(newWorkbook, '정리본_품목별정렬.xlsx');
    console.log('Successfully created 정리본_품목별정렬.xlsx sorted by 품목.');
} catch (e) {
    console.error(e);
}
