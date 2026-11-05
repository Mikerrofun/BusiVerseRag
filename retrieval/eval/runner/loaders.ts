import * as fs from 'fs';
import { EvalQuestion } from './runner.types';

export function loadQuestions(filepath: string): EvalQuestion[] {
  const content = fs.readFileSync(filepath, 'utf-8');
  const lines = content.trim().split('\n');
  return lines.map(line => JSON.parse(line) as EvalQuestion);
}
