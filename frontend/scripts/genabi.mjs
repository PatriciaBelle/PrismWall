import * as fs from "fs";
import * as path from "path";

const CONTRACT_NAME = "PrismWall";
const hardhatDir = path.resolve("../fhevm-hardhat-template");
const deploymentsDir = path.join(hardhatDir, "deployments");
const outdir = path.resolve("./abi");

if (!fs.existsSync(outdir)) fs.mkdirSync(outdir, { recursive: true });

function readDeployment(chainName, chainId, optional) {
  const chainDeploymentDir = path.join(deploymentsDir, chainName);
  if (!fs.existsSync(chainDeploymentDir)) {
    if (!optional) {
      console.error(`Missing deployments for ${chainName}. Run: npx hardhat deploy --network ${chainName}`);
      process.exit(1);
    }
    return undefined;
  }
  const file = path.join(chainDeploymentDir, `${CONTRACT_NAME}.json`);
  if (!fs.existsSync(file)) {
    if (!optional) {
      console.error(`Missing deployment file ${file}`);
      process.exit(1);
    }
    return undefined;
  }
  const obj = JSON.parse(fs.readFileSync(file, "utf-8"));
  obj.chainId = chainId;
  return obj;
}

const localhost = readDeployment("localhost", 31337, true);
const sepolia = readDeployment("sepolia", 11155111, true);

if (!localhost && !sepolia) {
  console.error("No deployments found. Deploy to localhost or sepolia first.");
  process.exit(1);
}

const abi = (localhost?.abi ?? sepolia?.abi);
const addresses = {
  "11155111": { address: sepolia?.address ?? "0x0000000000000000000000000000000000000000", chainId: 11155111, chainName: "sepolia" },
  "31337": { address: localhost?.address ?? "0x0000000000000000000000000000000000000000", chainId: 31337, chainName: "hardhat" },
};

const tsABI = `export const ${CONTRACT_NAME}ABI = ${JSON.stringify({ abi }, null, 2)} as const;\n`;
const tsAddrs = `export const ${CONTRACT_NAME}Addresses = ${JSON.stringify(addresses, null, 2)} as const;\n`;

fs.mkdirSync(outdir, { recursive: true });
fs.writeFileSync(path.join(outdir, `${CONTRACT_NAME}ABI.ts`), tsABI, "utf-8");
fs.writeFileSync(path.join(outdir, `${CONTRACT_NAME}Addresses.ts`), tsAddrs, "utf-8");
console.log("ABI and addresses generated.");


