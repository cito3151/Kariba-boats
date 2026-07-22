import { useEffect, useState } from 'react';
import { listCurrentDocuments, type LegalDocument, type LegalDocType } from '../../services/legal.service';

export function useCurrentDocuments() {
  const [docs, setDocs] = useState<Record<string, LegalDocument>>({});
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    listCurrentDocuments()
      .then((list) => { if (live) setDocs(Object.fromEntries(list.map((d) => [d.docType, d]))); })
      .catch(() => { if (live) setDocs({}); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);
  const get = (t: LegalDocType) => docs[t];
  return { docs, get, loading };
}
