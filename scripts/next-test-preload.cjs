// Test-process transport only: no external request may escape the fixture server.
const nativeFetch = global.fetch
global.fetch = async (input, init) => {
 const request = new Request(input, init)
 const url = new URL(request.url)
 if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return nativeFetch(request)
 return nativeFetch(process.env.BUSMORA_TEST_PROXY, {
  method: request.method, headers: { ...Object.fromEntries(request.headers), 'x-fixture-url': request.url },
  body: ['GET','HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
  signal: request.signal,
 })
}
