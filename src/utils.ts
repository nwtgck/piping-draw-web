export async function getBodyBytesFromResponse(res: Response): Promise<Uint8Array> {
  if (res.body === null) {
    return new Uint8Array();
  }
  const reader = res.body.getReader();
  const arrays = [];
  let totalLen = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) { break; }
    totalLen += value.byteLength;
    arrays.push(value);
  }
  // (from: https://qiita.com/hbjpn/items/dc4fbb925987d284f491)
  const allArray = new Uint8Array(totalLen);
  let pos = 0;
  for (const arr of arrays) {
    allArray.set(arr, pos);
    pos += arr.byteLength;
  }
  return allArray;
}
