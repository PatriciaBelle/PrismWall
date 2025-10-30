import { task } from "hardhat/config";
import { ethers } from "hardhat";

task("graffiti:like", "Like a token with encrypted +1 via Relayer SDK-compatible input")
  .addParam("tokenId", "Token id")
  .setAction(async (args, hre) => {
    const { deployments } = hre;
    const d = await deployments.get("GraffitiChain");
    const signers = await ethers.getSigners();
    const user = signers[0];
    const contract = await ethers.getContractAt("GraffitiChain", d.address, user);

    // For demo purpose only: encrypt +1 using trivial encryption (on-chain FHE.asEuint32)
    // Production should use Relayer SDK input buffer. Here we pass a zero-handle and empty proof,
    // and contract will reject; this task is only a placeholder to show the workflow.
    try {
      const tx = await contract.likeGraffiti(
        ethers.ZeroHash,
        "0x",
        Number(args.tokenId)
      );
      console.log("tx=", tx.hash);
    } catch (e) {
      console.log("This placeholder requires frontend Relayer SDK for proper handles.");
    }
  });


