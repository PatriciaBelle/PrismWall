export async function uploadDataUrlToPinata(dataUrl: string, jwt: string): Promise<{ cid: string; uri: string; gateway: string }> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const file = new File([blob], `graffiti-${Date.now()}.png`, { type: "image/png" });

  const form = new FormData();
  form.append("file", file);

  const r = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
  });

  if (!r.ok) {
    throw new Error(`Pinata upload failed: ${r.status} ${r.statusText}`);
  }
  const json = await r.json();
  const cid: string = json.IpfsHash || json.Hash || json.cid || json.IpfsCid || "";
  if (!cid) throw new Error("Pinata response missing CID");
  const uri = `ipfs://${cid}`;
  const gateway = `https://gateway.pinata.cloud/ipfs/${cid}`;
  return { cid, uri, gateway };
}

export function resolveUriToHttp(uri: string): string {
  if (!uri) return "";
  if (uri.startsWith("ipfs://")) {
    const cid = uri.replace("ipfs://", "");
    return `https://gateway.pinata.cloud/ipfs/${cid}`;
  }
  return uri;
}
