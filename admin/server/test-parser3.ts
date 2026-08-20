import fs from 'node:fs';
import XLSX from 'xlsx';
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet([['Sheet1-A1','Sheet1-B1'],['Sheet1-A2','Sheet1-B2']]);
XLSX.utils.book_append_sheet(wb, ws, '测试Sheet');
const path = '/tmp/test-parser.xlsx';
XLSX.writeFile(wb, path);

async function main() {
  const X2 = await import('xlsx');
  const wb2 = X2.readFile(path);
  console.log('sheetnames:', wb2.SheetNames);
  for (const name of wb2.SheetNames) {
    const sheet = wb2.Sheets[name];
    console.log('sheet ref:', sheet['!ref']);
    console.log('csv:', X2.utils.sheet_to_csv(sheet));
  }
}
main().finally(() => fs.rmSync(path));
