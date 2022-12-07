const axios = require('axios');
const Web3 = require('web3');
const fs = require('fs');
const path = require('path');
const aws = require('aws-sdk');
const { ethers, Contract } = require('ethers');

const getDecryptedConfig = async () => {
  try {
    const kms = new aws.KMS({ 'region': 'ap-northeast-1' });
    const params = {
      CiphertextBlob: fs.readFileSync('env-secrets-encrypted.json')
    };

    const data = await kms.decrypt(params).promise();
    return JSON.parse(data['Plaintext'].toString());
  } catch (Error) {
    console.error(Error, Error.stack);
    return {
      statusCode: 500,
      body: JSON.stringify('Sorry, something went wrong'),
    };
  }
};

const getOracleContract = (address, signerOrProvider) => {
  const oracleContractAbi = JSON.parse(fs.readFileSync('oracle-smart-contract-abi.json', 'utf8'));
  return new ethers.Contract(address, oracleContractAbi, signerOrProvider);
};

const getOracleContractReadOnly = (address, apiKey) => {
  const provider = new ethers.providers.AlchemyProvider("goerli", apiKey);
  return getOracleContract(address, provider);
};

const getOracleContractWrite = (address, apiKey, privateKey) => {
  const provider = new ethers.providers.AlchemyProvider("goerli", apiKey);
  const signer = new ethers.Wallet(privateKey, provider);
  return getOracleContract(address, signer);
};

const isDepositMatchOrder = async (oracleContractReadOnly, order, tx) => {
  const expectedTxValue = BigInt(order.tokenInAmount).toString(10);  // Etherscan returns token amounts in decimal format, as a string 
  const isMatch = tx.from.toLowerCase() === order.owner.toLowerCase()
    && tx.to.toLowerCase() === oracleContractReadOnly.address.toLowerCase()
    && tx.tokenSymbol.toLowerCase() === order.tokenIn.toLowerCase() // Done in addition to checking the contract address, just to be safe
    && BigInt(tx.blockNumber) >= BigInt(order.blockNumber)  // Deposits can be done in blocks after the order is created in the smart contract
    && tx.value === expectedTxValue;

  if (isMatch) {
    // Verify that the tx contract address.
    // This is a necessary defensive measure - multiple erc20 tokens can have the same symbol but different addresses.
    const tokenSymbolSanitized = tx.tokenSymbol.trim().toUpperCase();
    const whitelistedTokenAddressRes = await oracleContractReadOnly.functions.tryGetTokenAddress(tokenSymbolSanitized);
    const whitelistedTokenAddress = whitelistedTokenAddressRes[0];

    console.log(`Match found. Verifying against the token contract address - erc20 contract is ${tx.contractAddress}, oracle contract whitelisted address is ${whitelistedTokenAddress}`);
    return whitelistedTokenAddress && tx.contractAddress.toLowerCase() === whitelistedTokenAddress.toLowerCase();
  }

  return false;
};

const runOracleNode = async address => {
  const config = await getDecryptedConfig();
  const oracleContractReadOnly = getOracleContractReadOnly(config.oracleContractAddress, config.apiKeyAlchemy);

  console.log(`Fetching order ids for address, address=${address}`);
  const pendingOrdersAllUsersRes = await oracleContractReadOnly.functions.getPendingDepositOrders();
  const pendingOrdersAllUsers = pendingOrdersAllUsersRes[0];
  const orders = pendingOrdersAllUsers.filter(o => o.owner.toLowerCase() === address.toLowerCase());

  // Get earliest pending order for address (ordered by block #)
  const ORDER_STATE_PENDING_DEPOSIT = 1;
  const DEFAULT_ADDRESS = '0x0000000000000000000000000000000000000000000000000000000000000000';
  let pendingOrder = null;
  for (let order of orders) {
    if (order.orderState === ORDER_STATE_PENDING_DEPOSIT) {
      console.log(`Found order with pending orderState, id=${order.id}. Checking if deposit already recorded in contract...`);

      const depositTxRes = await oracleContractReadOnly.functions.depositTxns(order.id);
      const depositTx = depositTxRes[0];
      const isOrderNotDepositedYet = depositTx === DEFAULT_ADDRESS;
      if (isOrderNotDepositedYet) {
        console.log('deposit not recorded yet.');
        pendingOrder = order;
        break;
      }
    }
  }

  if (!pendingOrder) {
    console.log(`A pending order (w/o a deposit yet) was not found in the contract for address ${address}`);
    return;
  }

  // Get deposits for user (ordered by block #)]
  console.log('Searching for deposit...');
  const ETHERSCAN_API_STATUS_CODE_OK = '1';
  const apiUrl = `https://api-goerli.etherscan.io/api?module=account&action=tokentx&address=${pendingOrder.owner}&page=1&offset=1000&startblock=${pendingOrder.blockNumber}&sort=desc&apikey=${config.apiKeyEtherscan}`;
  const res = await axios.get(apiUrl);
  if (res.status !== 200 || res.data.status !== ETHERSCAN_API_STATUS_CODE_OK) {
    console.error('Etherscan api call failed:');
    console.error(res);
    throw `Etherscan api call failed, status, http status: ${res.status}`;
  }

  const erc20Txns = res.data.result;
  const depositTxs = erc20Txns.filter(tx =>
    tx.to.toLowerCase() === config.oracleContractAddress.toLowerCase()  // Case insensitive, to handle addresses using checksums
    && parseInt(tx.confirmations) > 0
  );

  // hasDeposited = filter deposits by order.tokenInAmount == tx.amount
  let depositTx = null;
  for (let tx of depositTxs) {
    if (await isDepositMatchOrder(oracleContractReadOnly, pendingOrder, tx)) {
      depositTx = tx;
      break;
    }
  }

  if (!depositTx) {
    console.log(`Deposit not found for order, id=${pendingOrder.id}, tokenIn=${pendingOrder.tokenIn}, tokenInAmount=${pendingOrder.tokenInAmount}, address searched for erc20 txns via etherscan=${address}`);
    return;
  }

  // If hasDeposited == true, update contract state (orderId, orderState, deposited block #)
  console.log(`Deposit detected (tx hash ${depositTx.hash}), updating contract state...`);
  const oracleContractWrite = getOracleContractWrite(config.oracleContractAddress, config.apiKeyAlchemy, config.privateKey);
  const storeDepositTx = await oracleContractWrite.functions.storeDepositTransactionsAndUpdateOrderStates([{
    orderId: pendingOrder.id,
    txHash: depositTx.hash
  }], {
    gasLimit: 5000000
  });

  const storeDepositTxReceipt = await storeDepositTx.wait();
  if (storeDepositTxReceipt.status !== 1) {
    throw storeDepositTxReceipt;
  }

  const msg = `Oracle successfully ran. The deposit transaction was: ${JSON.stringify(depositTx)}`;
  console.log(msg);
  return {
    statusCode: 200,
    body: msg
  };
};

exports.handler = async (event) => {
  const address = event.headers['X-Address'] || event.headers['x-address'];
  if (!address) {
    return {
      statusCode: 400,
      body: `Invalid address header, address=${address}`
    };
  }

  try {
    await runOracleNode(address);
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: `Something went wrong, address=${address}`
    };
  }

  return {
    statusCode: 200
  };
};
