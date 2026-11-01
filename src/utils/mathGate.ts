export interface MathQuestion { text: string; answer: number }

/** Random single-digit addition or multiplication, hard enough to stop a 3-6 year old. */
export function makeQuestion(random: () => number = Math.random): MathQuestion {
  const digit = () => 2 + Math.floor(random() * 8); // 2..9
  const a = digit();
  const b = digit();
  return random() < 0.5
    ? { text: `${a} + ${b} = ?`, answer: a + b }
    : { text: `${a} × ${b} = ?`, answer: a * b };
}
