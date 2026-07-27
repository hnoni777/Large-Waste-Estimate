const XLSX = require('xlsx');
const fs = require('fs');

console.log('Reading excel...');
const wb = XLSX.readFile('2026-07-23 (2).xls', { type: 'binary', cellDates: true });
const wsname = wb.SheetNames[0];
const ws = wb.Sheets[wsname];
console.log('Parsing to JSON...');
const parsedData = XLSX.utils.sheet_to_json(ws);

const enrichedData = [];
parsedData.forEach(row => {
  let d = row['신청일자'] || row['신청일'] || row['신철일'];
  if (typeof d === 'string' || typeof d === 'number') {
    const parsed = new Date(d);
    if (!isNaN(parsed.getTime())) d = parsed;
  }
  if (d instanceof Date && !isNaN(d)) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const dateStr = yyyy + '-' + mm + '-' + dd;
    
    const minimalRow = {};
    const keepFields = [
      '신청자', '성명', '신청인', '이름', '성명(법인명)',
      '휴대폰', '연락처', '전화번호',
      '주소', '도로명주소', '도로명',
      '상세위치', '상세주소',
      '신청일자', '신청일', '신철일',
      '배출일자', '배출일',
      '배출동', '배출메모', '베출메모',
      '품목명', '품목', '규격',
      '신청수량', '수량',
      '합계', '단가', '결제금액',
      '배출번호', '예약번호', '주문번호'
    ];
    keepFields.forEach(field => {
      if (row[field] !== undefined) {
        minimalRow[field] = row[field];
      }
    });
    
    enrichedData.push({ ...minimalRow, _dateStr: dateStr, source: '여기로' });
  }
});

const maxDate = new Date(Math.max(...enrichedData.map(r => new Date(r._dateStr).getTime())));
const fiveMonthsAgo = new Date(maxDate);
fiveMonthsAgo.setMonth(fiveMonthsAgo.getMonth() - 5);

const filteredData = enrichedData.filter(r => new Date(r._dateStr) >= fiveMonthsAgo);

console.log('Original records:', enrichedData.length);
console.log('Filtered (recent 5 months) records:', filteredData.length);
console.log('Writing to public/old_data.json...');
fs.writeFileSync('public/old_data.json', JSON.stringify(filteredData));
console.log('Done!');
