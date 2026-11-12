import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import {
  authorizePackageUser,
  supabaseAdmin,
} from '../../paquetes/_lib';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_BODY_BYTES = 6 * 1024 * 1024;

const TYPES = {
  paquete: 'paquetes',
  visitante: 'visitantes',
  conductor: 'conductores',
  vehiculo: 'vehiculos',
} as const;

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

function validFile(bytes: Buffer, mime: string) {
  if (mime === 'image/jpeg') {
    return bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff;
  }

  if (mime === 'image/png') {
    return bytes.length >= 8 &&
      bytes.subarray(0, 8).equals(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
      );
  }

  if (mime === 'image/webp') {
    return bytes.length >= 12 &&
      bytes.toString('ascii', 0, 4) === 'RIFF' &&
      bytes.toString('ascii', 8, 12) === 'WEBP';
  }

  return false;
}

async function readLimitedMultipart(request: NextRequest): Promise<FormData> {
  const contentType = request.headers.get('content-type') ?? '';

  if (!/^multipart\/form-data;\s*boundary=/i.test(contentType)) {
    throw new Error('INVALID_MULTIPART');
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0);

  if (contentLength > MAX_BODY_BYTES) {
    throw new Error('BODY_TOO_LARGE');
  }

  if (!request.body) throw new Error('INVALID_BODY');

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      total += value.byteLength;

      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new Error('BODY_TOO_LARGE');
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new Response(bytes, {
    headers: { 'Content-Type': contentType },
  }).formData();
}

export async function POST(request: NextRequest) {
  try {
    const access = await authorizePackageUser(request);

    if (!access.ok) return response({ error: access.error }, access.status);

    if (!['admin', 'guard'].includes(access.profile.role)) {
      return response({ error: 'No tienes permisos para cargar evidencias.' }, 403);
    }

    const form = await readLimitedMultipart(request);
    const file = form.get('file');
    const type = String(form.get('type') ?? '') as keyof typeof TYPES;

    if (!(file instanceof File) || !TYPES[type]) {
      return response({ error: 'Archivo o tipo de evidencia no válido.' }, 400);
    }

    if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
      return response({ error: 'La fotografía debe pesar máximo 5 MB.' }, 400);
    }

    const mime = file.type.toLowerCase();
    const ext =
      mime === 'image/jpeg' ? 'jpg' :
      mime === 'image/png' ? 'png' :
      mime === 'image/webp' ? 'webp' : '';

    if (!ext) {
      return response({ error: 'Formato no permitido. Usa JPG, PNG o WebP.' }, 400);
    }

    const bytes = Buffer.from(await file.arrayBuffer());

    if (!validFile(bytes, mime)) {
      return response({ error: 'El contenido del archivo no coincide con su formato.' }, 400);
    }

    const tenantId = access.profile.tenant_id;
    const path = `${tenantId}/${TYPES[type]}/${randomUUID()}.${ext}`;

    const { error } = await supabaseAdmin.storage
      .from('evidences-private')
      .upload(path, bytes, {
        contentType: mime,
        upsert: false,
      });

    if (error) {
      console.error('Error Storage evidencias:', error);
      return response(
        { error: 'No fue posible guardar la fotografía. Verifica la configuración del almacenamiento privado.' },
        500
      );
    }

    return response({
      success: true,
      ref: `storage://evidences-private/${path}`,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'BODY_TOO_LARGE') {
      return response({ error: 'La solicitud supera el tamaño permitido.' }, 413);
    }

    if (
      error instanceof Error &&
      ['INVALID_MULTIPART', 'INVALID_BODY'].includes(error.message)
    ) {
      return response({ error: 'Solicitud de archivo no válida.' }, 400);
    }

    console.error('Error API evidencias/upload:', error);
    return response({ error: 'Error interno al cargar la evidencia.' }, 500);
  }
}
