import { NextRequest, NextResponse } from 'next/server';
import { handleUpload } from '@/lib/uploads/handler';

export const POST = async (req: NextRequest) => {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const summary = await handleUpload(buffer, (file as File).name);
    
    return NextResponse.json(summary);
  } catch (error: any) {
    console.error('Upload Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};
