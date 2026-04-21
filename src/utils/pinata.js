const axios    = require("axios");
const FormData = require("form-data");

const BASE_URL = "https://api.pinata.cloud";

const authHeaders = () => ({
  pinata_api_key:        process.env.PINATA_API_KEY,
  pinata_secret_api_key: process.env.PINATA_SECRET_KEY  // FIXED: was PINATA_SECRET_KEY
});

/**
 * Upload a file Buffer to Pinata IPFS.
 * @param {Buffer} fileBuffer  - PDF file contents
 * @param {string} fileName    - e.g. "cert-<uuid>.pdf"
 * @param {string} certId      - used for Pinata metadata tag
 * @returns {{ ipfsHash: string, ipfsUrl: string }}
 */
const uploadFileToPinata = async (fileBuffer, fileName, certId) => {
  const form = new FormData();
  form.append("file", fileBuffer, { filename: fileName });

  form.append(
    "pinataMetadata",
    JSON.stringify({
      name:      `CredChain-${certId}`,
      keyvalues: { certId, app: "CredChain", university: "KTU" }
    })
  );
  form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

  const res = await axios.post(`${BASE_URL}/pinning/pinFileToIPFS`, form, {
    maxBodyLength: Infinity,
    headers: {
      ...form.getHeaders(),
      ...authHeaders()
    }
  });

  const ipfsHash = res.data.IpfsHash;
  return {
    ipfsHash,
    ipfsUrl: `https://gateway.pinata.cloud/ipfs/${ipfsHash}`
  };
};

/**
 * Upload a JSON object to Pinata IPFS.
 * Useful for storing structured certificate metadata.
 * @returns {{ ipfsHash: string, ipfsUrl: string }}
 */
const uploadJsonToPinata = async (jsonData, certId) => {
  const res = await axios.post(
    `${BASE_URL}/pinning/pinJSONToIPFS`,
    {
      pinataMetadata: { name: `CredChain-Meta-${certId}` },
      pinataContent:  jsonData
    },
    { headers: authHeaders() }
  );

  const ipfsHash = res.data.IpfsHash;
  return {
    ipfsHash,
    ipfsUrl: `https://gateway.pinata.cloud/ipfs/${ipfsHash}`
  };
};

/**
 * Test Pinata credentials — call on server start to verify keys are valid.
 */
const testPinataAuth = async () => {
  const res = await axios.get(`${BASE_URL}/data/testAuthentication`, {
    headers: authHeaders()
  });
  return res.data;
};

module.exports = { uploadFileToPinata, uploadJsonToPinata, testPinataAuth };