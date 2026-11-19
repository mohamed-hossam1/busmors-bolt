export async function poll<T>(read: () => Promise<T>, accept: (value: T) => boolean, timeoutMs = 90_000, intervalMs = 1_000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  let value = await read()
  while (!accept(value) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, intervalMs))
    value = await read()
  }
  return value
}
