import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { authPhoto } from '../data/photos';
import BrandMark from './BrandMark';
import PhotoBackdrop from './PhotoBackdrop';
import { riseOnMount } from './motion';

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
  const reduce = useReducedMotion();

  return (
    <div className="relative min-h-svh flex items-center justify-center px-4 py-10 overflow-hidden bg-lake-950">
      {/* A houseboat off a red-earth shore. No text sits on the photograph: the
          logo, heading and form are all on the white card. So the scrim only has
          to quieten the photo enough that the card reads as the subject: lighter
          than a header scrim, so the boat stays visible beside the card on wider
          screens, and densest at the foot where the card's shadow falls. */}
      <PhotoBackdrop photo={authPhoto} priority parallax="top" />
      <div aria-hidden className="absolute inset-0 bg-linear-to-b from-lake-950/55 via-lake-950/40 to-lake-950/70" />

      <motion.div
        {...riseOnMount(reduce)}
        className={`relative w-full ${wide ? 'max-w-lg' : 'max-w-md'} rounded-2xl bg-white p-6 sm:p-8 shadow-2xl`}
      >
        <Link to="/" className="flex items-center gap-2 justify-center">
          <BrandMark height={30} />
          <span className="font-display text-lg font-medium text-lake-950">Kariba Lake Connect</span>
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
