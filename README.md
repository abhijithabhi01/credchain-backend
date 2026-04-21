# CredChain Backend

Blockchain-powered academic certificate management system for Kerala Technological University (KTU).

## Tech Stack (all free)

| Layer | Tool | Purpose |
|-------|------|---------|
| Runtime | Node.js + Express | REST API |
| Database | MongoDB Atlas (free M0) | User accounts, cert metadata |
| Blockchain | Hardhat (local) / Sepolia testnet | Certificate registry on-chain |
| Storage | Pinata (free 1 GB) | Certificate PDFs on IPFS |
| Auth | JWT + bcrypt | Authentication |
| Blockchain SDK | Ethers.js v6 | Sign & call smart contract |

---

## Folder Structure

```
credchain-backend/
├── contracts/
│   └── CertificateRegistry.sol   ← Solidity smart contract
├── scripts/
│   └── deploy.js                 ← Deploy contract
├── hardhat.config.js
├── package.json
└── src/
    ├── server.js                 ← Entry point (node src/server.js)
    ├── app.js                    ← Express app, routes, middleware
    ├── config/
    │   ├── db.js                 ← MongoDB connection
    │   └── web3.js               ← Ethers.js contract connection
    ├── models/
    │   ├── User.js               ← student / employer / issuer / admin
    │   ├── Certificate.js        ← Certificate metadata + blockchain refs
    │   └── ActivityLog.js        ← Audit log
    ├── middleware/
    │   └── auth.js               ← JWT protect + role authorize
    ├── routes/
    │   ├── auth.js               ← /api/auth/*
    │   ├── admin.js              ← /api/admin/*
    │   ├── issuer.js             ← /api/issuer/*
    │   └── public.js             ← /api/public/*
    └── utils/
        ├── pinata.js             ← IPFS upload helpers
        ├── logger.js             ← Activity log writer
        └── seedAdmin.js          ← Create admin + KTU accounts
```

---

## First-Time Setup (Follow In Order)

### 1. Install dependencies
```bash
cd credchain-backend
npm install
```

### 2. Create your .env file
```bash
cp .env.example .env
```
Then open `.env` and fill in each value (instructions are in the file).

### 3. MongoDB Atlas — free cloud database
1. Go to [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas) and create a free account
2. Create a **free M0 cluster**
3. Under **Database Access** — create a DB user with username + password
4. Under **Network Access** — add `0.0.0.0/0` to allow all IPs
5. Click **Connect** → **Drivers** → copy the URI string
6. Paste into `.env` as `MONGO_URI` (replace `<username>` and `<password>`)

### 4. Pinata IPFS — free PDF storage
1. Go to [pinata.cloud](https://www.pinata.cloud) and create a free account (1 GB free)
2. Go to **API Keys** → **New Key**
3. Enable **pinFileToIPFS** and **pinJSONToIPFS** permissions
4. Copy the **API Key** and **Secret API Key** into `.env`

### 5. Start local blockchain (Hardhat)
```bash
# Terminal 1 — keep this running
npm run chain
```
This prints 20 test wallet addresses + private keys. **Copy any one private key** and paste it as `ISSUER_PRIVATE_KEY` in your `.env`.

### 6. Compile and deploy the smart contract
```bash
# Terminal 2
npm run compile
npm run deploy:local
```
This prints `CONTRACT_ADDRESS=0x...` — copy that into your `.env`.

### 7. Seed the admin and KTU issuer accounts
```bash
npm run seed
```
Creates:
- **Admin**: `admin@credchain.gov.in` / `Admin@1234`
- **KTU Issuer**: `ktu@credchain.in` / `KTU@1234`

### 8. Start the backend
```bash
npm run dev     # development (auto-reload)
npm start       # production
```

Visit `http://localhost:5000/health` — you should see `"CredChain API is running"`.

---

## API Endpoints

### Auth — `/api/auth`
| Method | Endpoint | Auth | Who |
|--------|----------|------|-----|
| POST | `/register` | ❌ | Student / Employer |
| POST | `/login` | ❌ | All roles |
| GET | `/me` | ✅ JWT | Logged-in user |
| PUT | `/profile` | ✅ JWT | Logged-in user |

### Admin — `/api/admin` (requires admin JWT)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/stats` | Dashboard counts |
| GET | `/issuers` | List all issuers |
| POST | `/issuers` | Add new issuer |
| DELETE | `/issuers/:id` | Remove issuer |
| GET | `/certificates` | All certs (paginated, filterable) |
| GET | `/logs` | Activity audit log |

### Issuer — `/api/issuer` (requires issuer JWT)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/stats` | Issuer dashboard |
| POST | `/upload` | Upload PDF → Pinata IPFS |
| POST | `/issue` | Write cert to blockchain |
| GET | `/certificates` | Own issued certs |
| POST | `/revoke/:certId` | Revoke on blockchain |

### Public — `/api/public`
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/verify/:certId` | ❌ | Verify cert (blockchain + DB) |
| GET | `/certificate/:certId` | ❌ | Full cert details |
| POST | `/link-certificate` | ✅ student | Link cert to student account |

---

## Certificate Issuance Flow

```
1. KTU Issuer logs in  →  POST /api/auth/login

2. Upload PDF          →  POST /api/issuer/upload
                           ← returns: { certId, ipfsHash, ipfsUrl }

3. Issue certificate   →  POST /api/issuer/issue
                           body: { certId, ipfsHash, studentEmail,
                                   courseName, yearOfCompletion, ... }
                           ← writes to blockchain, saves to MongoDB
                           ← returns: { certificate, txHash }

4. Student registers   →  POST /api/auth/register
   Student links cert  →  POST /api/public/link-certificate  { certId }
                           ← cert appears in student's profile

5. Anyone verifies     →  GET /api/public/verify/:certId
                           ← checks blockchain + MongoDB
                           ← returns: { verified: true/false, certificate, blockchain }
```

---

## For Project Submission — Use Sepolia Testnet

Instead of running a local blockchain node, deploy to the free Sepolia testnet so the contract is live on the real Ethereum network.

1. Create a MetaMask wallet → export the private key → paste as `ISSUER_PRIVATE_KEY`
2. Get free Sepolia ETH from [sepoliafaucet.com](https://sepoliafaucet.com) (paste your wallet address)
3. In `.env`, change `BLOCKCHAIN_RPC_URL` to:
   ```
   BLOCKCHAIN_RPC_URL=https://rpc.sepolia.org
   ```
4. Deploy:
   ```bash
   npm run deploy:sepolia
   ```
5. Copy the printed `CONTRACT_ADDRESS` into `.env`
6. Restart the backend — everything else stays the same.

Your certificates are now verifiable on the public Ethereum Sepolia testnet. Anyone can look up the transaction on [sepolia.etherscan.io](https://sepolia.etherscan.io).

---

## Frontend Connection

In your frontend `constants.js`, set:
```js
export const API_BASE_URL = "http://localhost:5000/api";
```
