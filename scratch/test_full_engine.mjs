import fs from 'fs';
import path from 'path';

async function testUpload() {
  const filePath = path.join(process.cwd(), 'scratch', 'test_data.csv');
  const buffer = fs.readFileSync(filePath);
  
  // We need to import handleUpload
  // Since it's a TS file and we are in mjs, we might have issues or need to use the API directly.
  // Let's use the local API via fetch (the dev server is running)
  
  const formData = new FormData();
  const file = new Blob([buffer], { type: 'text/csv' });
  formData.append('file', file, 'test_data.csv');

  console.log('📤 Uploading test_data.csv to http://localhost:3000/api/upload ...');
  
  try {
    const res = await fetch('http://localhost:3000/api/upload', {
      method: 'POST',
      body: formData
    });
    
    const result = await res.json();
    console.log('✅ Upload Result:', JSON.stringify(result, null, 2));
    
    if (result.uploadId) {
       console.log(`🧠 Triggering synthesis for ${result.uploadId} ...`);
       const insightsRes = await fetch(`http://localhost:3000/api/insights?uploadId=${result.uploadId}`);
       const insights = await insightsRes.json();
       console.log(`✨ Generated ${insights.length} insights.`);
    }
  } catch (e) {
    console.error('❌ Test failed:', e.message);
  }
}

testUpload();
