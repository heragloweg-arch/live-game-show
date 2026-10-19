interface ChallengeVisualProps {
  challenge?: { imageUrl?: string | null; imageAssetPath?: string | null; prompt?: string };
}

export function ChallengeVisual({ challenge }: ChallengeVisualProps) {
  const src = challenge?.imageAssetPath || challenge?.imageUrl;
  if (!src) return null;
  return (
    <figure className="mb-4 flex flex-col items-center gap-2" aria-label="صورة السؤال">
      <div className="flex w-full max-w-[min(22rem,90vw)] items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white p-2 shadow-lg shadow-black/20">
        <img
          src={src}
          alt="علم الدولة في السؤال"
          className="block aspect-[3/2] h-auto w-full object-contain"
          loading="eager"
          decoding="async"
          draggable={false}
        />
      </div>
      <figcaption className="sr-only">علم الدولة المطلوب التعرف عليه</figcaption>
    </figure>
  );
}
