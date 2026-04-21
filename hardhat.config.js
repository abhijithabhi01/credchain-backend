require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.19",
  networks: {
    // Local development — run: npx hardhat node
    hardhat: {
      chainId: 31337
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337
    },
    // Free Sepolia testnet — for demo/submission
    // Get free ETH: https://sepoliafaucet.com
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org",
      accounts: process.env.ISSUER_PRIVATE_KEY ? [process.env.ISSUER_PRIVATE_KEY] : [],
      chainId: 11155111
    }
  },
  // Output ABI to src/artifacts so the Node.js backend can import it
  paths: {
    artifacts: "./src/artifacts"
  }
};
