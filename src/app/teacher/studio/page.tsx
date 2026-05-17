'use client';

import { TeacherStudio } from '@/components/teacher/TeacherStudio';
import { useState } from 'react';

type Stage = 'single' | 'group' | 'render' | 'animation';

export default function TeacherStudioPage() {
  const [currentStage, setCurrentStage] = useState<Stage>('single');
  return (
    <TeacherStudio currentStage={currentStage} onStageChange={setCurrentStage} />
  );
}
