/** A text field from FormData (files and missing fields become ''). */
export function formText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}
