import { NextResponse } from 'next/server';
import { MARKETS } from '@/lib/data';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  
  if (query) {
    const filtered = MARKETS.filter(m => m.toLowerCase().includes(query.toLowerCase())).slice(0, 8);
    return NextResponse.json(filtered);
  }
  
  return NextResponse.json(MARKETS);
}
