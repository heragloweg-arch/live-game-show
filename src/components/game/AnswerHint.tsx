import { Hash } from 'lucide-react';
import { answerHint, type ChallengeContractView } from '../../utils/challengeContract';

export function AnswerHint({ challenge }: { challenge: ChallengeContractView }) {
  return <div className="answer-hint" aria-label="تلميح طول الإجابة"><Hash size={14} /><span>{answerHint(challenge)}</span></div>;
}
