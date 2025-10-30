"use client";
import { useRouter, usePathname } from "next/navigation";

export default function Navbar({
  address,
  onConnect,
  fhevmStatus,
  chainId,
}: {
  address: string;
  onConnect: () => void;
  fhevmStatus: "idle" | "loading" | "ready" | "error";
  chainId: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const getStatusClass = () => {
    if (fhevmStatus === "ready") return "status-ready";
    if (fhevmStatus === "loading") return "status-loading";
    if (fhevmStatus === "error") return "status-error";
    return "";
  };

  const getChainName = () => {
    if (chainId === 11155111) return "Sepolia";
    if (chainId === 31337) return "Localhost";
    return chainId ? `Chain ${chainId}` : "Unknown";
  };

  return (
    <nav style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "20px 36px",
      background: "rgba(255, 255, 255, 0.7)",
      backdropFilter: "blur(20px) saturate(180%)",
      WebkitBackdropFilter: "blur(20px) saturate(180%)",
      borderBottom: "1px solid rgba(255, 255, 255, 0.5)",
      position: "sticky",
      top: 0,
      zIndex: 100,
      boxShadow: "0 4px 20px rgba(31, 38, 135, 0.1)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
        <h2 style={{
          fontSize: "1.5rem",
          fontWeight: 800,
          letterSpacing: "-0.03em",
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          backgroundClip: "text",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}>
          ✨ Prism Wall
        </h2>
        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={() => router.push("/")}
            style={{
              background: pathname === "/" ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" : "rgba(255, 255, 255, 0.8)",
              color: pathname === "/" ? "#ffffff" : "#1a1a1a",
              padding: "10px 20px",
              borderRadius: 50,
              fontSize: "0.9rem",
              border: pathname === "/" ? "none" : "1px solid rgba(102, 126, 234, 0.2)",
              boxShadow: pathname === "/" ? "0 4px 16px rgba(102, 126, 234, 0.3)" : "none",
            }}
          >
            🏠 Gallery
          </button>
          <button
            onClick={() => router.push("/create")}
            style={{
              background: pathname === "/create" ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" : "rgba(255, 255, 255, 0.8)",
              color: pathname === "/create" ? "#ffffff" : "#1a1a1a",
              padding: "10px 20px",
              borderRadius: 50,
              fontSize: "0.9rem",
              border: pathname === "/create" ? "none" : "1px solid rgba(102, 126, 234, 0.2)",
              boxShadow: pathname === "/create" ? "0 4px 16px rgba(102, 126, 234, 0.3)" : "none",
            }}
          >
            🎨 Create
          </button>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {chainId && (
          <div style={{
            padding: "8px 14px",
            background: "rgba(102, 126, 234, 0.1)",
            backdropFilter: "blur(10px)",
            border: "1px solid rgba(102, 126, 234, 0.3)",
            borderRadius: 50,
            color: "#667eea",
            fontSize: "0.8rem",
            fontWeight: 700,
          }}>
            🔗 {getChainName()}
          </div>
        )}
        <div className={`status-badge ${getStatusClass()}`}>
          {fhevmStatus === "ready" ? "🟢" : fhevmStatus === "loading" ? "🟡" : "🔴"} FHEVM
        </div>
        {address ? (
          <div style={{
            padding: "10px 18px",
            background: "linear-gradient(135deg, #34d399 0%, #10b981 100%)",
            borderRadius: 50,
            color: "#ffffff",
            fontWeight: 700,
            fontSize: "0.85rem",
            boxShadow: "0 4px 16px rgba(16, 185, 129, 0.3)",
          }}>
            💎 {address.slice(0, 6)}...{address.slice(-4)}
          </div>
        ) : (
          <button onClick={onConnect} style={{
            padding: "12px 24px",
            background: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
            color: "#fff",
            borderRadius: 50,
            fontSize: "0.95rem",
            fontWeight: 600,
            boxShadow: "0 6px 20px rgba(245, 87, 108, 0.35)",
          }}>
            🔌 Connect Wallet
          </button>
        )}
      </div>
    </nav>
  );
}

