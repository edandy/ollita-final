export const SUPABASE_PAGE_SIZE = 1000;

type Page<T> = { data: T[] | null; error: { message: string } | null };

/** PostgREST caps each response at 1000 rows; this pages through `.range(from, to)` until the end. */
export async function fetchAllRows<T>(page: (from: number, to: number) => PromiseLike<Page<T>>) {
  const rows: T[] = [];
  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const { data, error } = await page(from, from + SUPABASE_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < SUPABASE_PAGE_SIZE) return rows;
  }
}
