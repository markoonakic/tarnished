import type { ComponentProps } from 'react';
import InterviewRecording from './InterviewRecording';

export default function RoundCard(
  props: ComponentProps<typeof InterviewRecording>
) {
  return <InterviewRecording {...props} showRoundHeader />;
}
