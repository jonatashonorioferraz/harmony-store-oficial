import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const [receipts,bills,styles,index,worker,webReceipts,webBills,webStyles]=await Promise.all([
  readFile(new URL('internal-supplies.js',root),'utf8'),
  readFile(new URL('bills.js',root),'utf8'),
  readFile(new URL('document-capture.css',root),'utf8'),
  readFile(new URL('index.html',root),'utf8'),
  readFile(new URL('service-worker.js',root),'utf8'),
  readFile(new URL('web/internal-supplies.js',root),'utf8'),
  readFile(new URL('web/bills.js',root),'utf8'),
  readFile(new URL('web/document-capture.css',root),'utf8'),
]);

test('receipt reader offers independent camera and gallery actions',()=>{
  assert.match(receipts,/id="receiptCamera"[^>]*accept="image\/\*"[^>]*capture="environment"/);
  assert.match(receipts,/id="receiptGallery"[^>]*accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(receipts,/Tirar foto agora/);
  assert.match(receipts,/Escolher da galeria/);
  assert.match(receipts,/selectedReceiptFile=file/);
  assert.match(receipts,/file=selectedReceiptFile/);
});

test('bill reader offers camera plus gallery or saved PDF',()=>{
  const enhanced=bills.slice(bills.lastIndexOf('uploadModal=function'));
  assert.match(enhanced,/id="billCamera"[^>]*accept="image\/\*"[^>]*capture="environment"/);
  assert.match(enhanced,/id="billGallery"[^>]*accept="application\/pdf,image\/jpeg,image\/png,image\/webp"/);
  assert.match(enhanced,/Galeria ou arquivo/);
  assert.match(enhanced,/selectedBillFile=file/);
  assert.match(enhanced,/file=selectedBillFile/);
});

test('capture interface is responsive, versioned, offline and mirrored',()=>{
  assert.match(styles,/\.capture-choice-grid/);
  assert.match(styles,/@media\(max-width:620px\)/);
  assert.match(styles,/@media\(max-width:380px\)/);
  assert.match(index,/document-capture\.css\?v=25\.49/);
  assert.match(index,/bills\.js\?v=25\.66/);
  assert.match(index,/internal-supplies\.js\?v=25\.66/);
  assert.match(worker,/document-capture\.css\?v=25\.49/);
  assert.match(worker,/harmony-store-v25-78/);
  assert.equal(webReceipts,receipts);
  assert.equal(webBills,bills);
  assert.equal(webStyles,styles);
});
