import { JsonRpcProvider, ethers } from "ethers";
import type { Eip1193Provider } from "ethers";

declare global {
  interface Window {
    relayerSDK: any & { __initialized__?: boolean };
  }
}

function isRelayerLoaded(): boolean {
  return typeof window !== "undefined" && typeof window.relayerSDK !== "undefined";
}

async function loadRelayerSDK(): Promise<void> {
  if (isRelayerLoaded()) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.zama.ai/relayer-sdk-js/0.2.0/relayer-sdk-js.umd.cjs";
    script.type = "text/javascript";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load relayer sdk"));
    document.head.appendChild(script);
  });
}

async function ensureInitialized(): Promise<void> {
  if (!isRelayerLoaded()) throw new Error("relayer sdk not loaded");
  if (window.relayerSDK.__initialized__) return;
  const ok = await window.relayerSDK.initSDK();
  if (!ok) throw new Error("initSDK failed");
  window.relayerSDK.__initialized__ = true;
}

async function getChainId(providerOrUrl: Eip1193Provider | string): Promise<number> {
  if (typeof providerOrUrl === "string") {
    const p = new JsonRpcProvider(providerOrUrl);
    return Number((await p.getNetwork()).chainId);
  }
  const hex = await providerOrUrl.request({ method: "eth_chainId" });
  return Number.parseInt(hex as string, 16);
}

async function getWeb3ClientVersion(rpcUrl: string): Promise<string | undefined> {
  try {
    const p = new JsonRpcProvider(rpcUrl);
    const v = await p.send("web3_clientVersion", []);
    return typeof v === "string" ? v : undefined;
  } catch {
    return undefined;
  }
}

async function getFhevmRelayerMetadata(rpcUrl: string): Promise<
  | {
      ACLAddress: `0x${string}`;
      InputVerifierAddress: `0x${string}`;
      KMSVerifierAddress: `0x${string}`;
    }
  | undefined
> {
  try {
    const p = new JsonRpcProvider(rpcUrl);
    const res = await p.send("fhevm_relayer_metadata", []);
    if (
      res &&
      typeof res === "object" &&
      typeof res.ACLAddress === "string" &&
      typeof res.InputVerifierAddress === "string" &&
      typeof res.KMSVerifierAddress === "string"
    ) {
      return res as any;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export type FhevmInstance = any;

export async function createFhevmInstance(params: {
  provider: Eip1193Provider | string;
  mockChains?: Record<number, string>;
}): Promise<FhevmInstance> {
  const chainId = await getChainId(params.provider);
  const isLocal = chainId === 31337;

  if (isLocal) {
    const url = typeof params.provider === "string" ? params.provider : "http://localhost:8545";
    const version = await getWeb3ClientVersion(url);
    if (version && version.toLowerCase().includes("hardhat")) {
      const metadata = await getFhevmRelayerMetadata(url);
      const { MockFhevmInstance } = await import("@fhevm/mock-utils");
      const provider = new JsonRpcProvider(url);
      // Fallback to known dev addresses if metadata is not available
      const ACL = (metadata?.ACLAddress as `0x${string}`) ?? ("0x50157CFfD6bBFA2DECe204a89ec419c23ef5755d" as `0x${string}`);
      const INPUTV = (metadata?.InputVerifierAddress as `0x${string}`) ?? ("0x901F8942346f7AB3a01F6D7613119Bca447Bb030" as `0x${string}`);
      const KMS = (metadata?.KMSVerifierAddress as `0x${string}`) ?? ("0x1364cBBf2cDF5032C47d8226a6f6FBD2AFCDacAC" as `0x${string}`);
      return await MockFhevmInstance.create(provider, provider, {
        chainId: 31337,
        gatewayChainId: 55815,
        aclContractAddress: ACL,
        inputVerifierContractAddress: INPUTV,
        kmsContractAddress: KMS,
        verifyingContractAddressDecryption: ("0x5ffdaAB0373E62E2ea2944776209aEf29E631A64" as `0x${string}`),
        verifyingContractAddressInputVerification: ("0x812b06e1CDCE800494b79fFE4f925A504a9A9810" as `0x${string}`),
      });
    }
  }

  await loadRelayerSDK();
  await ensureInitialized();

  const relayer = window.relayerSDK;
  const config = {
    ...relayer.SepoliaConfig,
    network: params.provider,
  };
  const instance = await relayer.createInstance(config);
  return instance;
}


