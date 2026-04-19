import { NextResponse } from 'next/server';
import { ID } from '@/lib/data';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const bucket = searchParams.get('bucket');
  
  if (bucket && ID[bucket]) {
    return NextResponse.json(ID[bucket]);
  }
  
  return NextResponse.json(ID);
}
