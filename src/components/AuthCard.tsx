import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Anchor } from 'lucide-react';
import type { ReactNode } from 'react';
import { heroImage } from '../data/photos';

export default function AuthCard({
  title,
  subtitle,
  children,
  wide = false,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="relative min-h-svh flex items-center justify-center px-4 py-10 overflow-hidden">
      <img src={heroImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-b from-lake-950/90 via-lake-950/75 to-lake-950/90" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className={`relative w-full ${wide ? 'max-w-lg' : 'max-w-md'} rounded-2xl bg-white p-6 sm:p-8 shadow-2xl`}
      >
        <Link to="/" className="flex items-center gap-2 justify-center">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-lake-700 text-white">
            <Anchor size={18} />
          </span>
          <span className="font-display text-lg font-medium text-lake-950">Kariba Lake Access</span>
        </Link>

        <div className="mt-6 text-center">
          <h1 className="font-display text-2xl font-medium text-lake-950">{title}</h1>
          <p className="mt-1 text-sm text-lake-500">{subtitle}</p>
        </div>

        <div className="mt-6">{children}</div>
      </motion.div>
    </div>
  );
}
