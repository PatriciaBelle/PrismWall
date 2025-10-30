"use client";
import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { PrismWallABI } from "@/abi/PrismWallABI";
import { PrismWallAddresses } from "@/abi/PrismWallAddresses";
import { createFhevmInstance } from "@/fhevm/internal/fhevm";
import Navbar from "@/components/Navbar";
import { resolveUriToHttp } from "@/lib/ipfs";

type ArtworkItem = {
  tokenId: number;
  uri: string;
  author: string;
  owner: string;
  likesHandle: string;
};

type ReactionsDecrypted = { heart?: number; fire?: number; thumbs?: number; party?: number };

enum PulseKind { Heart = 0, Fire = 1, Thumbs = 2, Party = 3 }

export default function Home() {
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.JsonRpcSigner | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [instance, setInstance] = useState<any>(null);
  const [address, setAddress] = useState<string>("");
  const [fhevmStatus, setFhevmStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [artworks, setArtworks] = useState<ArtworkItem[]>([]);
  const [selectedArtwork, setSelectedArtwork] = useState<ArtworkItem | null>(null);
  const [decryptedLikes, setDecryptedLikes] = useState<Record<number, number>>({});
  const [reactionsMap, setReactionsMap] = useState<Record<number, ReactionsDecrypted>>({});
  const [loading, setLoading] = useState(false);
  const [tipValue, setTipValue] = useState<string>("0.001");
  const [commentInput, setCommentInput] = useState<string>("");
  const [comments, setComments] = useState<Record<number, { author: string; uri: string; encrypted: boolean; ts: number }[]>>({});

  useEffect(() => {
    const p = new ethers.BrowserProvider((window as any).ethereum);
    setProvider(p);
    p.getNetwork().then(n => setChainId(Number(n.chainId)));

    const autoConnect = async () => {
      const eth = (window as any).ethereum;
      if (!eth) return;
      const last = localStorage.getItem("gc:lastChainId");
      if (last === "31337") {
        try { await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x7A69" }] }); } catch {}
      }
      try {
        const accs: string[] = await eth.request({ method: "eth_accounts" });
        if (accs && accs.length > 0) {
          setFhevmStatus("loading");
          const _provider = new ethers.BrowserProvider(eth);
          setProvider(_provider);
          const s = await _provider.getSigner();
          setSigner(s);
          setAddress(await s.getAddress());
          const inst = await createFhevmInstance({ provider: eth });
          setInstance(inst);
          const net = await _provider.getNetwork();
          setChainId(Number(net.chainId));
          setFhevmStatus("ready");
        }
      } catch {}

      eth.on?.("accountsChanged", async (accs: string[]) => {
        if (accs && accs.length > 0) {
          const _provider = new ethers.BrowserProvider(eth);
          setProvider(_provider);
          const s = await _provider.getSigner();
          setSigner(s);
          setAddress(await s.getAddress());
        } else {
          setSigner(null); setAddress("");
        }
      });
      eth.on?.("chainChanged", async () => {
        const _provider = new ethers.BrowserProvider(eth);
        setProvider(_provider);
        const net = await _provider.getNetwork();
        setChainId(Number(net.chainId));
        try { const inst = await createFhevmInstance({ provider: eth }); setInstance(inst); setFhevmStatus("ready"); } catch { setFhevmStatus("error"); }
      });
    };
    autoConnect();
  }, []);

  const target = useMemo(() => {
    if (!chainId) return undefined;
    return PrismWallAddresses[String(chainId) as keyof typeof PrismWallAddresses];
  }, [chainId]);
  const isDeployed = !!target?.address && target.address !== ethers.ZeroAddress;

  const connect = async () => {
    if (!provider) return;
    setFhevmStatus("loading");
    try {
      const currentChainHex = await (window as any).ethereum.request({ method: "eth_chainId" });
      const currentChain = parseInt(currentChainHex, 16);
      if (currentChain !== 31337) {
        try {
          await (window as any).ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x7A69" }] });
        } catch (switchError: any) {
          if (switchError?.code === 4902) {
            await (window as any).ethereum.request({ method: "wallet_addEthereumChain", params: [{ chainId: "0x7A69", chainName: "Localhost 8545", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: ["http://127.0.0.1:8545"] }] });
            await (window as any).ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x7A69" }] });
          }
        }
      }
      localStorage.setItem("gc:lastChainId", "31337");
    } catch {}

    await provider.send("eth_requestAccounts", []);
    const s = await provider.getSigner();
    setSigner(s);
    setAddress(await s.getAddress());
    try {
      const inst = await createFhevmInstance({ provider: (window as any).ethereum });
      setInstance(inst);
      setFhevmStatus("ready");
      const n = await provider.getNetwork();
      setChainId(Number(n.chainId));
    } catch (e) { console.error(e); setFhevmStatus("error"); }
  };

  const loadArtworks = async () => {
    if (!provider || !target?.address || !isDeployed) return;
    setLoading(true);
    try {
      const code = await provider.send("eth_getCode", [target.address, "latest"]);
      if (!code || code === "0x") { setArtworks([]); return; }
      const c = new ethers.Contract(target.address, PrismWallABI.abi, provider);
      const total = await c.totalSupply();
      const items: ArtworkItem[] = [];
      for (let i = 1; i <= Number(total); i++) {
        try {
          const [uri, owner, author] = await c.artworkInfo(i);
          const likesHandle = await c.getEncryptedApplause(i);
          items.push({ tokenId: i, uri, author, owner, likesHandle });
        } catch (e) { console.error(`Failed to load token ${i}`, e); }
      }
      setArtworks(items);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const sendApplause = async (tokenId: number) => {
    if (!signer || !target?.address || !instance) return;
    const net = await signer.provider!.getNetwork();
    const currentChainId = Number(net.chainId);
    if (currentChainId !== (target.chainId ?? currentChainId)) return;
    const code = await signer.provider!.send("eth_getCode", [target.address, "latest"]);
    if (!code || code === "0x") return;

    const c = new ethers.Contract(target.address, PrismWallABI.abi, signer);
    const input = instance.createEncryptedInput(target.address, await signer.getAddress());
    input.add32(1);
    const enc = await input.encrypt();
    const tx = await c.sendApplause(enc.handles[0], enc.inputProof, tokenId);
    await tx.wait();
    loadArtworks();
  };

  const castReaction = async (tokenId: number, kind: PulseKind) => {
    if (!signer || !target?.address || !instance) return;
    const c = new ethers.Contract(target.address, PrismWallABI.abi, signer);
    const input = instance.createEncryptedInput(target.address, await signer.getAddress());
    input.add32(1);
    const enc = await input.encrypt();
    const tx = await c.castReaction(enc.handles[0], enc.inputProof, tokenId, kind);
    await tx.wait();
  };

  const decryptReactions = async (tokenId: number) => {
    if (!instance || !target?.address || !provider) return;
    const c = new ethers.Contract(target.address, PrismWallABI.abi, provider);
    const arr: string[] = await c.fetchCipherReactions(tokenId);

    if (typeof instance.userDecrypt === "function" && signer) {
      const userAddress = await signer.getAddress();
      const { publicKey, privateKey } = instance.generateKeypair ? instance.generateKeypair() : { publicKey: undefined, privateKey: undefined };
      const startTimestamp = Math.floor(Date.now() / 1000);
      const durationDays = 365;
      const eip712 = instance.createEIP712(publicKey, [target.address], startTimestamp, durationDays);
      const signature = await signer.signTypedData(
        eip712.domain,
        { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
        eip712.message
      );
      const inputs = arr.map((h) => ({ handle: h, contractAddress: target.address }));
      const res = await instance.userDecrypt(inputs, privateKey, publicKey, signature, [target.address], userAddress, startTimestamp, durationDays);
      const vals = arr.map(h => Number(res[h]));
      setReactionsMap(prev => ({ ...prev, [tokenId]: { heart: vals[0], fire: vals[1], thumbs: vals[2], party: vals[3] } }));
    }
  };

  const addNote = async (tokenId: number, text: string) => {
    if (!signer || !target?.address) return;
    // 简化：先把明文注入到 data: URL 模式，正式版会走 Pinata 上传
    const dataUri = `data:text/plain;base64,${btoa(unescape(encodeURIComponent(text)))}`;
    const c = new ethers.Contract(target.address, PrismWallABI.abi, signer);
    const tx = await c.postNote(tokenId, dataUri, false);
    await tx.wait();
    await loadNotes(tokenId);
    setCommentInput("");
  };

  const loadNotes = async (tokenId: number) => {
    if (!provider || !target?.address) return;
    const c = new ethers.Contract(target.address, PrismWallABI.abi, provider);
    const count: bigint = await c.notesCount(tokenId);
    const arr: { author: string; uri: string; encrypted: boolean; ts: number }[] = [];
    for (let i = 0; i < Number(count); i++) {
      const [author, uri, encrypted, ts] = await c.fetchNote(tokenId, i);
      arr.push({ author, uri, encrypted, ts: Number(ts) });
    }
    setComments(prev => ({ ...prev, [tokenId]: arr }));
  };

  const tipArtist = async (tokenId: number) => {
    if (!signer || !target?.address) return;
    const c = new ethers.Contract(target.address, PrismWallABI.abi, signer);
    const value = ethers.parseEther(tipValue || "0.001");
    const tx = await c.tipArtist(tokenId, { value });
    await tx.wait();
  };

  const decryptLikes = async (tokenId: number, handle: string) => {
    if (!instance || !target?.address) return;
    try {
      if (typeof instance.userDecrypt === "function" && signer) {
        const userAddress = await signer.getAddress();
        const { publicKey, privateKey } = instance.generateKeypair ? instance.generateKeypair() : { publicKey: undefined, privateKey: undefined };
        const startTimestamp = Math.floor(Date.now() / 1000);
        const durationDays = 365;
        const eip712 = instance.createEIP712(publicKey, [target.address], startTimestamp, durationDays);
        const signature = await signer.signTypedData(
          eip712.domain,
          { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
          eip712.message
        );
        const res = await instance.userDecrypt(
          [{ handle, contractAddress: target.address }],
          privateKey,
          publicKey,
          signature,
          [target.address],
          userAddress,
          startTimestamp,
          durationDays
        );
        const clear = res[handle];
        setDecryptedLikes(prev => ({ ...prev, [tokenId]: Number(clear) }));
        return;
      }
      if (typeof instance.decryptPublic === "function") {
        const clear = await instance.decryptPublic(target.address, handle);
        setDecryptedLikes(prev => ({ ...prev, [tokenId]: Number(clear) }));
        return;
      }
    } catch (e) { console.error("Decrypt failed", e); }
  };

  useEffect(() => { if (provider && isDeployed) { loadArtworks(); } }, [provider, isDeployed]);

  return (
    <>
      <Navbar address={address} onConnect={connect} fhevmStatus={fhevmStatus} chainId={chainId} />
      <main style={{ padding: "48px 36px", minHeight: "calc(100vh - 100px)" }}>
        <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
          <div style={{
            marginBottom: "48px",
            textAlign: "center",
            padding: "40px 20px",
            background: "rgba(255, 255, 255, 0.5)",
            backdropFilter: "blur(20px)",
            borderRadius: 32,
            border: "1px solid rgba(255, 255, 255, 0.6)",
            boxShadow: "0 8px 32px rgba(31, 38, 135, 0.12)",
          }}>
            <h1 style={{ marginBottom: "16px", fontWeight: 800, letterSpacing: "-0.03em", fontSize: "3.2rem" }}>✨ Discover Amazing Art</h1>
            <p style={{ color: "rgba(26, 26, 26, 0.6)", fontSize: "1.15rem", maxWidth: 680, margin: "0 auto", lineHeight: 1.7 }}>
              Explore on-chain digital masterpieces with encrypted reactions powered by FHEVM technology
            </p>
          </div>

          {loading && (
            <div style={{
              textAlign: "center",
              padding: "80px",
              background: "rgba(255, 255, 255, 0.5)",
              backdropFilter: "blur(20px)",
              borderRadius: 24,
              fontSize: "1.3rem",
              color: "#ea580c",
              fontWeight: 600,
            }}>
              <div style={{ fontSize: "3rem", marginBottom: 20 }}>⏳</div>
              Loading artworks from blockchain...
            </div>
          )}

          {!loading && !isDeployed && (
            <div className="card" style={{ textAlign: "center", padding: "60px" }}>
              <div style={{ fontSize: "4rem", marginBottom: 24 }}>🔗</div>
              <h3 style={{ marginBottom: "12px", fontSize: "1.8rem" }}>Contract Not Deployed</h3>
              <p style={{ color: "rgba(26, 26, 26, 0.6)", marginBottom: "28px", fontSize: "1.05rem" }}>
                Please connect to Localhost 31337 or deploy the contract first
              </p>
            </div>
          )}

          {!loading && isDeployed && artworks.length === 0 && (
            <div className="card" style={{ textAlign: "center", padding: "60px" }}>
              <div style={{ fontSize: "5rem", marginBottom: 24 }}>🎨</div>
              <h3 style={{ marginBottom: "12px", fontSize: "1.8rem" }}>No Artworks Yet!</h3>
              <p style={{ color: "rgba(26, 26, 26, 0.6)", marginBottom: "28px", fontSize: "1.05rem" }}>
                Be the first artist to create something magical on-chain
              </p>
              <button onClick={() => window.location.href = "/create"} style={{ fontSize: "1.05rem", padding: "14px 32px" }}>
                🚀 Start Creating
              </button>
            </div>
          )}

          <div className="artworks-grid">
            {artworks.map(g => (
              <div key={g.tokenId} className="art-card" onClick={() => { setSelectedArtwork(g); loadNotes(g.tokenId); }}>
                <div style={{
                  width: "100%",
                  height: 240,
                  background: "linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "3rem",
                  position: "relative",
                  overflow: "hidden",
                }}>
                  {g.uri ? (
                    <img src={resolveUriToHttp(g.uri)} alt={`Artwork ${g.tokenId}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <>🖼️</>
                  )}
                  <div style={{
                    position: "absolute",
                    top: 12,
                    right: 12,
                    background: "rgba(255, 255, 255, 0.9)",
                    backdropFilter: "blur(10px)",
                    padding: "6px 12px",
                    borderRadius: 50,
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: "#667eea",
                  }}>
                    #{g.tokenId}
                  </div>
                </div>
                <div style={{ padding: 18 }}>
                  <h3 style={{ marginBottom: 6, fontSize: "1.1rem", fontWeight: 700, color: "#1a1a1a" }}>Artwork #{g.tokenId}</h3>
                  <p style={{ fontSize: "0.85rem", color: "rgba(26, 26, 26, 0.5)", marginBottom: 14 }}>
                    by {g.author.slice(0, 6)}...{g.author.slice(-4)}
                  </p>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); castReaction(g.tokenId, PulseKind.Heart); }}
                      style={{
                        padding: "8px 14px",
                        background: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
                        border: "none",
                        borderRadius: 50,
                        fontSize: "1rem",
                        cursor: "pointer",
                        transition: "all 0.3s ease",
                        boxShadow: "0 4px 12px rgba(245, 87, 108, 0.25)",
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.15) rotate(-5deg)"}
                      onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
                    >
                      ❤️
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); castReaction(g.tokenId, PulseKind.Fire); }}
                      style={{
                        padding: "8px 14px",
                        background: "linear-gradient(135deg, #ff9a56 0%, #ff6a00 100%)",
                        border: "none",
                        borderRadius: 50,
                        fontSize: "1rem",
                        cursor: "pointer",
                        transition: "all 0.3s ease",
                        boxShadow: "0 4px 12px rgba(255, 106, 0, 0.25)",
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.15) rotate(5deg)"}
                      onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
                    >
                      🔥
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); castReaction(g.tokenId, PulseKind.Thumbs); }}
                      style={{
                        padding: "8px 14px",
                        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                        border: "none",
                        borderRadius: 50,
                        fontSize: "1rem",
                        cursor: "pointer",
                        transition: "all 0.3s ease",
                        boxShadow: "0 4px 12px rgba(102, 126, 234, 0.25)",
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.15) rotate(-5deg)"}
                      onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
                    >
                      👍
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); castReaction(g.tokenId, PulseKind.Party); }}
                      style={{
                        padding: "8px 14px",
                        background: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
                        border: "none",
                        borderRadius: 50,
                        fontSize: "1rem",
                        cursor: "pointer",
                        transition: "all 0.3s ease",
                        boxShadow: "0 4px 12px rgba(245, 158, 11, 0.25)",
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.15) rotate(5deg)"}
                      onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
                    >
                      🎉
                    </button>
                  </div>
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 14px",
                    background: "rgba(102, 126, 234, 0.08)",
                    borderRadius: 12,
                  }}>
                    <div style={{ fontSize: "0.85rem", color: "rgba(26, 26, 26, 0.7)", fontWeight: 600 }}>
                      {reactionsMap[g.tokenId]?.heart ?? "🔒"}❤️ {reactionsMap[g.tokenId]?.fire ?? "🔒"}🔥 {reactionsMap[g.tokenId]?.thumbs ?? "🔒"}👍 {reactionsMap[g.tokenId]?.party ?? "🔒"}🎉
                    </div>
                    <button
                      style={{
                        fontSize: "0.75rem",
                        padding: "6px 12px",
                        background: "rgba(102, 126, 234, 0.15)",
                        color: "#667eea",
                        fontWeight: 700,
                        border: "1px solid rgba(102, 126, 234, 0.3)",
                        borderRadius: 20,
                      }}
                      onClick={(e) => { e.stopPropagation(); decryptReactions(g.tokenId); }}
                    >
                      🔓
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {selectedArtwork && (
        <div className="modal-overlay" onClick={() => setSelectedArtwork(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "900px", background: "#ffffff", border: "1px solid #e2e8f0" }}>
            <h2 style={{ marginBottom: 16 }}>Artwork #{selectedArtwork.tokenId}</h2>
            <div style={{ width: "100%", height: 320, background: "#f1f5f9", borderRadius: 12, marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "4rem" }}>
              {selectedArtwork.uri ? (
                <img src={resolveUriToHttp(selectedArtwork.uri)} alt={`Artwork ${selectedArtwork.tokenId}`} style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 12 }} />
              ) : (
                <>🖼️</>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
              <div className="card">
                <h3 style={{ marginBottom: "12px" }}>Reactions</h3>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
                  <button className="like-btn" onClick={() => castReaction(selectedArtwork.tokenId, PulseKind.Heart)}>❤️</button>
                  <button className="like-btn" onClick={() => castReaction(selectedArtwork.tokenId, PulseKind.Fire)}>🔥</button>
                  <button className="like-btn" onClick={() => castReaction(selectedArtwork.tokenId, PulseKind.Thumbs)}>👍</button>
                  <button className="like-btn" onClick={() => castReaction(selectedArtwork.tokenId, PulseKind.Party)}>🎉</button>
                  <button onClick={() => decryptReactions(selectedArtwork.tokenId)}>🔓 Decrypt</button>
                </div>
                <div style={{ color: "#ccc" }}>
                  {reactionsMap[selectedArtwork.tokenId]?.heart ?? "?"} ❤️ · {reactionsMap[selectedArtwork.tokenId]?.fire ?? "?"} 🔥 · {reactionsMap[selectedArtwork.tokenId]?.thumbs ?? "?"} 👍 · {reactionsMap[selectedArtwork.tokenId]?.party ?? "?"} 🎉
                </div>
              </div>
              <div className="card">
                <h3 style={{ marginBottom: "12px" }}>Tip the artist</h3>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input type="text" value={tipValue} onChange={(e) => setTipValue(e.target.value)} placeholder="0.001" />
                  <button onClick={() => tipArtist(selectedArtwork.tokenId)}>💸 Tip</button>
                </div>
                <p style={{ color: "#999", marginTop: "8px" }}>Amount in ETH</p>
              </div>
              <div className="card" style={{ gridColumn: "1 / span 2" }}>
                <h3 style={{ marginBottom: "12px" }}>Notes</h3>
                <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                  <input type="text" value={commentInput} onChange={(e) => setCommentInput(e.target.value)} placeholder="Write a comment..." />
                  <button onClick={() => addNote(selectedArtwork.tokenId, commentInput)} disabled={!commentInput.trim()}>Send</button>
                </div>
                <div style={{ display: "grid", gap: "8px" }}>
                  {(comments[selectedArtwork.tokenId] ?? []).map((c, idx) => (
                    <div key={idx} className="card" style={{ padding: "12px" }}>
                      <div style={{ fontSize: "0.85rem", color: "#999", marginBottom: "6px" }}>{c.author.slice(0, 6)}...{c.author.slice(-4)} · {new Date(c.ts * 1000).toLocaleString()}</div>
                      <div style={{ wordBreak: "break-all" }}>{c.uri.startsWith("data:") ? decodeURIComponent(escape(atob(c.uri.split(",")[1]))) : c.uri}</div>
                      {c.encrypted && <div style={{ color: "#ffb300", fontSize: "0.85rem" }}>Encrypted off-chain</div>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ marginTop: "16px" }}>
              <button onClick={() => setSelectedArtwork(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
