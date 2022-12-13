# Flyweight Lambda Oracle Nodes
This repo contains **NodeJS TypeScript** oracles that support Lambda hosts. These are leveraged by the Flyweight platform @ [flyweight.me](https://flyweight.me/).

- `/src/deposits-oracle-node` - oracle node that verifies on-chain token deposits. Has a dependency on the [Etherscan](https://etherscan.io/) API as an on-chain data feed
- `/src/triggers-oracle-node` - oracle node that triggers uniswap v3 swaps programatically. Has a dependency on [CoinMarketCap](https://coinmarketcap.com/) API as a token price feed

## Local setup
```bash
git clone git@github.com:0xmn1/flyweight-lambdas.git
cd 'flyweight-lambdas'
npm i
```

You can then compile an oracle, e.g.:
```bash
npm run compile:triggers-oracle-node
npm run compile:deposits-oracle-node
```

## Environment variables
To aid deployment to AWS lambdas, each oracle has a env file, as well as a root-level one.

### /.env
- `AWS_KMS_KEY_ID` - [Amazon Web Services Key Management Service](https://aws.amazon.com/kms/) Key ID. This is used to encrypt the environments files during & after deployment to AWS, i.e.: Encryption-At-Rest. The files are decrypted on demand.

### /src/deposits-oracle-node/env-secrets.json
- `oracleContractAddress` - an on-chain contract address for [the Flyweight oracle smart contract](https://github.com/0xmn1/flyweight-smart-contracts)
- `apiKeyAlchemy` - [Alchemy](https://dashboard.alchemy.com/) API key
- `apiKeyEtherscan` - [Etherscan](https://etherscan.io/) API key
- `privateKey` - oracle node private key. This can also be an [EOA](https://ethereum.org/en/developers/docs/accounts/) if you prefer. Used to sign transactions sent from the oracle node, to the oracle contract
- `etherscanApiBaseUrl` - [Etherscan](https://etherscan.io/) API base url (e.g.: can point to Goerli or Mainnet)
- `network` - Ethereum network name (e.g.: `goerli` or `mainnet`)

### /src/triggers-oracle-node/env-secrets.json
- `oracleContractAddress` - an on-chain contract address for [the Flyweight oracle smart contract](https://github.com/0xmn1/flyweight-smart-contracts)
- `apiKeyAlchemy` - [Alchemy](https://dashboard.alchemy.com/) API key
- `apiKeyCoinMarketCap` - [CoinMarketCap](https://coinmarketcap.com/) API key
- `apiBaseUrlCoinMarketCap` - [CoinMarketCap](https://coinmarketcap.com/) API base url (e.g.: can point to Goerli or Mainnet)
- `privateKey` - oracle node private key. This can also be an [EOA](https://ethereum.org/en/developers/docs/accounts/) if you prefer. Used to sign transactions sent from the oracle node, to the oracle contract
- `network` - Ethereum network name (e.g.: `goerli` or `mainnet`)

## Building & deploying
This repo comes with deployment scripts leveraging the npx child process in [build.js](https://github.com/0xmn1/flyweight-lambdas/blob/main/scripts/build.js) & [deploy.js](https://github.com/0xmn1/flyweight-lambdas/blob/main/scripts/deploy.js).

Building primarily involves:
1. Compiling typescript
1. Producing an encrypted secrets file
1. Creating the zip deploy artifact

Triggers oracle node:
```bash
npm run build:triggers-oracle-node && npm run deploy:triggers-oracle-node
```

Deposits oracle node:
```bash
npm run build:deposits-oracle-node && npm run deploy:deposits-oracle-node
```

## Contributing
Any open source developers are welcome to contribute by opening new PRs. Please set the PR's target branch to `staging-goerli`.
