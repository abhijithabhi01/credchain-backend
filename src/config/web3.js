const { ethers } = require("ethers");
const fs   = require("fs");
const path = require("path");

// Load the compiled contract ABI
const getABI = () => {
  const artifactPath = path.join(
    __dirname,
    "../artifacts/contracts/CertificateRegistry.sol/CertificateRegistry.json"
  );
  if (!fs.existsSync(artifactPath)) {
    throw new Error(
      "Contract ABI not found. Run:\n  npx hardhat compile\n  npx hardhat run scripts/deploy.js --network localhost"
    );
  }
  return JSON.parse(fs.readFileSync(artifactPath, "utf8")).abi;
};

const getContractAddress = () => {
  const addr = process.env.CONTRACT_ADDRESS;
  if (!addr) throw new Error("CONTRACT_ADDRESS not set in .env");
  return addr;
};

const getRpcUrl = () => process.env.BLOCKCHAIN_RPC_URL || "http://127.0.0.1:8545";

/**
 * Returns a contract instance signed by the ISSUER wallet.
 * Used for write operations: issueCertificate, revokeCertificate.
 */
let _contract = null;
const getContract = () => {
  if (_contract) return _contract;

  const provider = new ethers.JsonRpcProvider(getRpcUrl());

  if (!process.env.ISSUER_PRIVATE_KEY) {
    throw new Error("ISSUER_PRIVATE_KEY not set in .env");
  }
  const wallet = new ethers.Wallet(process.env.ISSUER_PRIVATE_KEY, provider);

  _contract = new ethers.Contract(getContractAddress(), getABI(), wallet);
  console.log("✅ Blockchain connected | Contract:", getContractAddress());
  return _contract;
};

/**
 * Returns a read-only contract instance (no wallet needed).
 * Used for verify operations — no gas cost.
 */
const getReadOnlyContract = () => {
  const provider = new ethers.JsonRpcProvider(getRpcUrl());
  return new ethers.Contract(getContractAddress(), getABI(), provider);
};

module.exports = { getContract, getReadOnlyContract };
