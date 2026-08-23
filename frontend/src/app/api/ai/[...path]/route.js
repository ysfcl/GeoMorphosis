import { NextResponse } from 'next/server';

// AI Engine'e sunucu tarafi proxy. next.config.js'teki rewrites bu adresi
// BUILD aninda sabitler; Railway'de NEXT_PUBLIC_AI_ENGINE_URL sonradan
// duzeltildiginde eski build bos rewrite ile 404 uretiyordu. Bu handler
// adresi RUNTIME'da okudugu icin deploy arasindaki uyumsuzluk ortadan kalkar.
const aiEngineBase = () =>
  (process.env.NEXT_PUBLIC_AI_ENGINE_URL || '').replace(/\/+$/, '');

async function proxy(request, { params }) {
  const base = aiEngineBase();
  if (!base) {
    return NextResponse.json(
      { detail: 'NEXT_PUBLIC_AI_ENGINE_URL yapilandirilmamis' },
      { status: 503 }
    );
  }

  const target = `${base}/${params.path.join('/')}${request.nextUrl.search}`;

  try {
    const upstream = await fetch(target, {
      headers: { accept: request.headers.get('accept') ?? '*/*' },
      cache: 'no-store',
    });

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: {
        'content-type':
          upstream.headers.get('content-type') ?? 'application/octet-stream',
        'cache-control': upstream.headers.get('cache-control') ?? 'no-store',
      },
    });
  } catch {
    return NextResponse.json({ detail: 'AI engine ulasilamadi' }, { status: 502 });
  }
}

export async function GET(request, ctx) {
  return proxy(request, ctx);
}
