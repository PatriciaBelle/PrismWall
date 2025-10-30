"use client";
import { useEffect, useRef, useState } from "react";
import { ethers } from "ethers";
import { useRouter } from "next/navigation";
import { PrismWallABI } from "@/abi/PrismWallABI";
import { PrismWallAddresses } from "@/abi/PrismWallAddresses";
import { createFhevmInstance } from "@/fhevm/internal/fhevm";
import Navbar from "@/components/Navbar";
import { uploadDataUrlToPinata } from "@/lib/ipfs";

export default function CreatePage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.JsonRpcSigner | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [instance, setInstance] = useState<any>(null);
  const [address, setAddress] = useState<string>("");
  const [fhevmStatus, setFhevmStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState("#667eea");
  const [brushSize, setBrushSize] = useState(8);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [minting, setMinting] = useState(false);
  const [tool, setTool] = useState<"brush" | "eraser">("brush");
  const [canvasBg, setCanvasBg] = useState("#ffffff");
  const [history, setHistory] = useState<ImageData[]>([]);

  useEffect(() => {
    const p = new ethers.BrowserProvider((window as any).ethereum);
    setProvider(p);
    p.getNetwork().then(n => setChainId(Number(n.chainId)));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // 初始化时填充背景
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  const changeBg = (newBg: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    // 创建临时画布保存当前绘制的内容
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;
    
    // 复制当前内容到临时画布
    tempCtx.drawImage(canvas, 0, 0);
    
    // 清空并填充新背景
    ctx.fillStyle = newBg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 将临时画布内容绘制回来（这会保留原有绘制内容）
    ctx.drawImage(tempCanvas, 0, 0);
    
    setCanvasBg(newBg);
  };

  const target = chainId ? PrismWallAddresses[String(chainId) as keyof typeof PrismWallAddresses] : undefined;

  const connect = async () => {
    if (!provider) return;
    setFhevmStatus("loading");
    await provider.send("eth_requestAccounts", []);
    const s = await provider.getSigner();
    setSigner(s);
    setAddress(await s.getAddress());
    try {
      const inst = await createFhevmInstance({ provider: (window as any).ethereum });
      setInstance(inst);
      setFhevmStatus("ready");
    } catch (e) { console.error(e); setFhevmStatus("error"); }
  };

  const saveHistory = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory(prev => [...prev.slice(-10), imageData]); // Keep last 10 states
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    saveHistory();
    draw(e);
  };

  const stopDrawing = () => { setIsDrawing(false); };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing && e.type !== "mousedown") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    if (tool === "brush") {
      ctx.fillStyle = color;
      ctx.globalCompositeOperation = "source-over";
    } else {
      ctx.globalCompositeOperation = "destination-out";
    }
    ctx.beginPath();
    ctx.arc(x, y, brushSize, 0, Math.PI * 2);
    ctx.fill();
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    saveHistory();
    ctx.fillStyle = canvasBg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const undo = () => {
    if (history.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const lastState = history[history.length - 1];
    ctx.putImageData(lastState, 0, 0);
    setHistory(prev => prev.slice(0, -1));
  };

  // Optimize canvas image to a smaller data URL to avoid huge calldata costs
  const getOptimizedDataUrl = async (
    canvas: HTMLCanvasElement,
    opts?: { maxWidth?: number; maxHeight?: number; quality?: number; mime?: string }
  ): Promise<string> => {
    const maxWidth = opts?.maxWidth ?? 640;
    const maxHeight = opts?.maxHeight ?? 640;
    const mime = opts?.mime ?? "image/jpeg";
    let quality = opts?.quality ?? 0.72;

    const w = canvas.width;
    const h = canvas.height;
    const scale = Math.min(1, maxWidth / w, maxHeight / h);

    const off = document.createElement("canvas");
    off.width = Math.floor(w * scale);
    off.height = Math.floor(h * scale);
    const octx = off.getContext("2d");
    if (!octx) return canvas.toDataURL();
    octx.fillStyle = canvasBg;
    octx.fillRect(0, 0, off.width, off.height);
    octx.drawImage(canvas, 0, 0, off.width, off.height);

    // Try progressively lower qualities if still large
    let dataUrl = off.toDataURL(mime, quality);
    const MAX_LEN = 180_000; // ~180KB string length, good for calldata on HH
    while (dataUrl.length > MAX_LEN && quality > 0.35) {
      quality -= 0.1;
      dataUrl = off.toDataURL(mime, quality);
    }
    return dataUrl;
  };

  const mintNFT = async () => {
    if (!signer || !target?.address || !canvasRef.current) return;
    setMinting(true);
    try {
      const canvas = canvasRef.current;
      const dataUrl = await getOptimizedDataUrl(canvas, { maxWidth: 640, maxHeight: 640, quality: 0.72, mime: "image/jpeg" });

      // Use Pinata JWT from env if provided; for demo it may be undefined
      const jwt = process.env.NEXT_PUBLIC_PINATA_JWT || "";
      let uri = "";
      try {
        if (jwt) {
          const { uri: ipfsUri } = await uploadDataUrlToPinata(dataUrl, jwt);
          uri = ipfsUri;
        } else {
          // fallback to data URI (not recommended for production)
          uri = dataUrl;
        }
      } catch (e) {
        console.error("Pinata upload failed, fallback to data URI", e);
        uri = dataUrl;
      }

      const c = new ethers.Contract(target.address, PrismWallABI.abi, signer);
      const tx = await c.forgeArtworkNFT(uri, title || "Untitled");
      await tx.wait();
      router.push("/");
    } catch (e) { console.error(e); alert("❌ Mint failed"); } finally { setMinting(false); }
  };

  return (
    <>
      <Navbar address={address} onConnect={connect} fhevmStatus={fhevmStatus} chainId={chainId} />
      <main style={{ padding: "24px", minHeight: "calc(100vh - 100px)" }}>
        <div style={{ maxWidth: "1600px", margin: "0 auto" }}>
          {/* Header */}
          <div style={{ marginBottom: "32px", textAlign: "center" }}>
            <h1 style={{ marginBottom: "8px", fontWeight: 800, fontSize: "2.5rem" }}>🎨 Art Studio</h1>
            <p style={{ color: "rgba(26, 26, 26, 0.6)", fontSize: "1rem" }}>
              Create your digital masterpiece with our advanced drawing tools
            </p>
          </div>

          <div style={{ display: "flex", gap: "24px" }}>
            {/* Left Sidebar - Tools */}
            <div style={{
              width: "200px",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}>
              {/* Tool Selection */}
              <div className="card" style={{ padding: "20px" }}>
                <h4 style={{ marginBottom: "14px", fontSize: "0.95rem", fontWeight: 700 }}>🛠️ Tools</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <button
                    onClick={() => setTool("brush")}
                    style={{
                      padding: "12px",
                      background: tool === "brush" ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" : "rgba(255, 255, 255, 0.8)",
                      color: tool === "brush" ? "#ffffff" : "#1a1a1a",
                      border: tool === "brush" ? "none" : "1px solid rgba(102, 126, 234, 0.2)",
                      fontWeight: 600,
                      fontSize: "0.9rem",
                    }}
                  >
                    🖌️ Brush
                  </button>
                  <button
                    onClick={() => setTool("eraser")}
                    style={{
                      padding: "12px",
                      background: tool === "eraser" ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" : "rgba(255, 255, 255, 0.8)",
                      color: tool === "eraser" ? "#ffffff" : "#1a1a1a",
                      border: tool === "eraser" ? "none" : "1px solid rgba(102, 126, 234, 0.2)",
                      fontWeight: 600,
                      fontSize: "0.9rem",
                    }}
                  >
                    🧹 Eraser
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="card" style={{ padding: "20px" }}>
                <h4 style={{ marginBottom: "14px", fontSize: "0.95rem", fontWeight: 700 }}>⚡ Actions</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <button
                    onClick={undo}
                    disabled={history.length === 0}
                    style={{
                      padding: "12px",
                      background: "rgba(251, 146, 60, 0.1)",
                      color: "#ea580c",
                      border: "1px solid rgba(251, 146, 60, 0.3)",
                      fontWeight: 600,
                      fontSize: "0.9rem",
                    }}
                  >
                    ↶ Undo
                  </button>
                  <button
                    onClick={clearCanvas}
                    style={{
                      padding: "12px",
                      background: "rgba(239, 68, 68, 0.1)",
                      color: "#dc2626",
                      border: "1px solid rgba(239, 68, 68, 0.3)",
                      fontWeight: 600,
                      fontSize: "0.9rem",
                    }}
                  >
                    🗑️ Clear
                  </button>
                </div>
              </div>

              {/* Background */}
              <div className="card" style={{ padding: "20px" }}>
                <h4 style={{ marginBottom: "14px", fontSize: "0.95rem", fontWeight: 700 }}>🎨 Background</h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  {["#ffffff", "#ffecd2", "#e0f2fe", "#f3e8ff", "#1a1a1a"].map(bg => (
                    <button
                      key={bg}
                      onClick={() => changeBg(bg)}
                      style={{
                        width: "100%",
                        height: "40px",
                        background: bg,
                        border: canvasBg === bg ? "3px solid #667eea" : "2px solid rgba(255,255,255,0.5)",
                        borderRadius: "8px",
                        cursor: "pointer",
                        boxShadow: canvasBg === bg ? "0 4px 12px rgba(102, 126, 234, 0.3)" : "0 2px 8px rgba(0,0,0,0.1)",
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Center - Canvas */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "20px" }}>
              <div className="card" style={{ padding: "24px" }}>
                <canvas
                  ref={canvasRef}
                  width={1000}
                  height={700}
                  onMouseDown={startDrawing}
                  onMouseUp={stopDrawing}
                  onMouseMove={draw}
                  onMouseLeave={stopDrawing}
                  style={{
                    width: "100%",
                    height: "auto",
                    borderRadius: 16,
                    boxShadow: "0 8px 32px rgba(31, 38, 135, 0.15)",
                  }}
                />
              </div>

              {/* Bottom Toolbar */}
              <div className="card" style={{ padding: "20px" }}>
                <div style={{ display: "flex", gap: "24px", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", marginBottom: "10px", fontWeight: 600, fontSize: "0.9rem" }}>
                      🎨 Colors
                    </label>
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      {["#667eea", "#f5576c", "#f093fb", "#34d399", "#fbbf24", "#10b981", "#06b6d4", "#8b5cf6", "#ec4899", "#1a1a1a", "#ffffff"].map(c => (
                        <button
                          key={c}
                          onClick={() => setColor(c)}
                          style={{
                            width: "42px",
                            height: "42px",
                            background: c,
                            border: color === c ? "3px solid #667eea" : "2px solid rgba(255,255,255,0.5)",
                            borderRadius: "50%",
                            padding: 0,
                            cursor: "pointer",
                            transition: "all 0.3s ease",
                            boxShadow: color === c ? "0 4px 16px rgba(102, 126, 234, 0.4)" : "0 2px 8px rgba(0,0,0,0.1)",
                            transform: color === c ? "scale(1.15)" : "scale(1)",
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  <div style={{ width: "250px" }}>
                    <label style={{ display: "block", marginBottom: "10px", fontWeight: 600, fontSize: "0.9rem" }}>
                      🖊️ Size: {brushSize}px
                    </label>
                    <input
                      type="range"
                      min="2"
                      max="50"
                      value={brushSize}
                      onChange={(e) => setBrushSize(Number(e.target.value))}
                      style={{
                        width: "100%",
                        height: "8px",
                        borderRadius: "50px",
                        cursor: "pointer",
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Right Sidebar - Metadata & Actions */}
            <div style={{ width: "320px" }}>
              <div className="card" style={{ padding: "24px" }}>
                <h3 style={{ marginBottom: "20px", fontSize: "1.2rem", fontWeight: 700 }}>📝 Artwork Info</h3>
                <div style={{ marginBottom: "18px" }}>
                  <label style={{ display: "block", marginBottom: "10px", fontWeight: 600, fontSize: "0.9rem" }}>
                    Title *
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="My Amazing Artwork"
                  />
                </div>
                <div style={{ marginBottom: "28px" }}>
                  <label style={{ display: "block", marginBottom: "10px", fontWeight: 600, fontSize: "0.9rem" }}>
                    Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Tell us about your creation..."
                    rows={6}
                    style={{ resize: "vertical" }}
                  />
                </div>

                <div style={{
                  padding: "16px",
                  background: "rgba(102, 126, 234, 0.05)",
                  borderRadius: 12,
                  marginBottom: "20px",
                }}>
                  <div style={{ fontSize: "0.85rem", color: "rgba(26, 26, 26, 0.6)", marginBottom: 8 }}>
                    📊 Canvas: 1000x700px
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "rgba(26, 26, 26, 0.6)" }}>
                    🎨 Tool: {tool === "brush" ? "Brush" : "Eraser"}
                  </div>
                </div>

                <button
                  onClick={mintNFT}
                  disabled={!signer || !target?.address || minting}
                  style={{
                    width: "100%",
                    marginBottom: "12px",
                    fontSize: "1.05rem",
                    padding: "16px",
                    background: minting ? "rgba(102, 126, 234, 0.5)" : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                  }}
                >
                  {minting ? "⏳ Minting..." : "🚀 Mint on Blockchain"}
                </button>
                <button
                  onClick={() => router.push("/")}
                  style={{
                    width: "100%",
                    background: "rgba(255, 255, 255, 0.8)",
                    color: "#1a1a1a",
                    border: "1px solid rgba(102, 126, 234, 0.2)",
                    fontWeight: 600,
                  }}
                >
                  ← Back to Gallery
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

