const { ethers, network } = require("hardhat");
const fs   = require("fs");
const path = require("path");

async function main() {
  console.log(`\nDeploying CertificateRegistry to: ${network.name}`);

  const [deployer] = await ethers.getSigners();
  const balance = await deployer.provider.getBalance(deployer.address);
  console.log("Deployer address :", deployer.address);
  console.log("Deployer balance :", ethers.formatEther(balance), "ETH");

  const Factory  = await ethers.getContractFactory("CertificateRegistry");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  console.log("\n✅ CertificateRegistry deployed to:", contractAddress);

  // Save deployment info so the backend can read it
  const info = {
    address:    contractAddress,
    network:    network.name,
    deployedAt: new Date().toISOString(),
    deployer:   deployer.address
  };

  const outPath = path.join(__dirname, "../src/config/deployed.json");
  fs.writeFileSync(outPath, JSON.stringify(info, null, 2));
  console.log("Saved to src/config/deployed.json");

  console.log("\n👉 Add this line to your .env file:");
  console.log(`CONTRACT_ADDRESS=${contractAddress}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
