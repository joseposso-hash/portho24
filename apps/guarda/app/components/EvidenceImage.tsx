'use client';

import { useEffect, useState } from 'react';
import { resolveEvidence } from '../lib/evidencias-client';

type Props = {
  src: string | null | undefined;
  alt: string;
  className?: string;
};

export default function EvidenceImage({ src, alt, className }: Props) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    let active = true;
    setUrl('');

    if (!src) return;

    resolveEvidence(src)
      .then(value => { if (active) setUrl(value); })
      .catch(error => console.error('No se pudo cargar evidencia:', error));

    return () => { active = false; };
  }, [src]);

  if (!src) return null;

  return url
    ? <img src={url} alt={alt} className={className} />
    : <div className={className} role="img" aria-label={`Cargando ${alt}`} />;
}
