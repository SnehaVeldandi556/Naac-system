// scripts/debugRawExtract.ts
import fs from 'fs';
import { extractText } from '../lib/naac/documents/extractText';

async function main() {
  const filePath = process.argv[2]; // pass PDF path as CLI arg
  const buffer = fs.readFileSync(filePath);
  const result = await extractText(buffer, 'pdf');
  console.log(result.raw_text);
}

main();