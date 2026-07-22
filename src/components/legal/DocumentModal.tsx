import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { getCurrentDocument, type LegalDocType, type LegalDocument } from '../../services/legal.service';

export default function DocumentModal({ docType, onClose }: { docType: LegalDocType; onClose: () => void }) {
  const [doc, setDoc] = useState<LegalDocument | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    getCurrentDocument(docType)
      .then((d) => { if (live) setDoc(d); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [docType]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-lake-100 px-5 py-3">
          <h3 className="font-semibold text-lake-950">{doc?.title ?? 'Document'}</h3>
          <button onClick={onClose} className="text-lake-400 hover:text-lake-700"><X size={18} /></button>
        </div>
        <div className="max-h-[64vh] overflow-y-auto px-5 py-4 text-sm text-lake-700 whitespace-pre-wrap">
          {loading ? 'Loading...' : doc ? doc.body : 'This document is not available yet.'}
        </div>
      </div>
    </div>
  );
}
