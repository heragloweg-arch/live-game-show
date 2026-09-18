import { type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../utils/cn';

interface Props {
  children: ReactNode;
  className?: string;
  orbs?: boolean;
}

export function ScreenShell({ children, className, orbs = true }: Props) {
  return (
    <div className={cn('relative min-h-screen overflow-hidden screen-pad', className)}>
      {orbs && (
        <>
          <div className="ambient-orb -left-20 top-10 h-56 w-56 bg-violet-600/20" />
          <div className="ambient-orb -right-16 bottom-24 h-48 w-48 bg-fuchsia-500/10" />
          <div className="ambient-orb left-1/3 top-1/2 h-40 w-40 -translate-y-1/2 bg-amber-400/5" />
        </>
      )}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10"
      >
        {children}
      </motion.div>
    </div>
  );
}
