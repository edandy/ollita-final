/** True the first time a kitchen is seen on a day, so the panel logs its use once (G9). */
export function shouldLogActivity(seen: Set<string>, comedorId: string, day: string) {
  if (!comedorId) return false;
  const key = `${comedorId}|${day}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}
