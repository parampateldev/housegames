import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function QR({ url, size = 180 }: { url: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, { width: size, margin: 1, color: { dark: '#1a1511', light: '#fffaf3' } })
      .then((d) => { if (!cancelled) setDataUrl(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [url, size]);

  if (!dataUrl) return null;
  return <img src={dataUrl} width={size} height={size} alt="Room QR code" style={{ borderRadius: 12 }} />;
}
