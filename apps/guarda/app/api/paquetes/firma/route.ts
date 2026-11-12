import { NextRequest, NextResponse } from 'next/server';
import { authorizePackageUser, supabaseAdmin } from '../_lib';

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, private, max-age=0',
      Pragma: 'no-cache',
      Vary: 'Authorization',
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    const access = await authorizePackageUser(request);

    if (!access.ok) return response({ error: access.error }, access.status);

    if (!['guard', 'admin'].includes(access.profile.role)) {
      return response({ error: 'No autorizado.' }, 403);
    }

    const id = request.nextUrl.searchParams.get('id');
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!id || !uuidPattern.test(id)) {
      return response({ error: 'Paquete no válido.' }, 400);
    }

    const tenantId = access.profile.tenant_id;

    if (!uuidPattern.test(tenantId)) {
      return response({ error: 'Conjunto no válido.' }, 403);
    }

    const { data: pack, error } = await supabaseAdmin
      .from('packages')
      .select('signature_url')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      console.error('Error consultando firma:', error);
      return response({ error: 'No fue posible consultar la firma.' }, 500);
    }

    if (!pack?.signature_url) {
      return response({ error: 'Firma no encontrada.' }, 404);
    }

    const pathPattern = new RegExp(
      `^${tenantId}/firmas/${uuidPattern.source.slice(1, -1)}\\.png$`,
      'i'
    );

    if (!pathPattern.test(pack.signature_url)) {
      return response({ error: 'Ruta de firma no válida.' }, 403);
    }

    const { data, error: signError } = await supabaseAdmin.storage
      .from('package-signatures')
      .createSignedUrl(pack.signature_url, 60);

    if (signError || !data?.signedUrl) {
      console.error('Error generando enlace de firma:', signError);
      return response({ error: 'No fue posible consultar la firma.' }, 500);
    }

    return response({ url: data.signedUrl });
  } catch (error) {
    console.error('Error API firma:', error);
    return response({ error: 'Error interno al consultar la firma.' }, 500);
  }
}
