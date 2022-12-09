import { Contract, ethers } from 'ethers';

import { Config } from '../types/Config';
import { EtherscanErc20Tx } from '../types/EtherscanErc20Tx';
import OracleContractFactory from '../../common/utils/ContractFactory';
import { Order } from '../../common/types/Order';
import axios from 'axios';

export default class DepositOracleNode {
  constructor(
    private readonly _config: Config
  ) {
  }

  async runOracleNode(address: string) {
    const oracleContractFactory = new OracleContractFactory(
      this._config.network,
      this._config.oracleContractAddress,
      this._config.apiKeyAlchemy,
      this._config.privateKey
    );

    const contract = oracleContractFactory.createContractReadOnly();
    const pendingOrdersAllUsersRes = await contract.functions.getPendingDepositOrders();
    const pendingOrdersAllUsers: Array<Order> = pendingOrdersAllUsersRes[0];
    const orders = pendingOrdersAllUsers.filter(o => o.owner.toLowerCase() === address.toLowerCase());

    // Get earliest pending order for address (ordered by block #)
    const pendingOrder = await this.tryGetPendingOrder(contract, orders);
    if (!pendingOrder) {
      console.log(`A pending order (w/o a deposit yet) was not found in the contract for address ${address}`);
      return;
    }

    // Get deposits for user (ordered by block #)]
    const depositTx = await this.tryGetDepositTx(contract, pendingOrder);
    if (!depositTx) {
      console.log(`Deposit not found for order, id=${pendingOrder.id}, tokenIn=${pendingOrder.tokenIn}, tokenInAmount=${pendingOrder.tokenInAmount}, address searched for erc20 txns via etherscan=${address}`);
      return;
    }

    // If hasDeposited == true, update contract state (orderId, orderState, deposited block #)
    console.log(`Deposit detected (tx hash ${depositTx.hash}), updating contract state...`);
    const oracleContractWrite = oracleContractFactory.createContractWrite();
    await this.storeDepositTx(oracleContractWrite, pendingOrder, depositTx);

    const msg = `Oracle successfully ran. The deposit transaction was: ${JSON.stringify(depositTx)}`;
    console.log(msg);
    return {
      statusCode: 200,
      body: msg
    };
  }

  private async tryGetPendingOrder(contract: Contract, orders: Array<Order>): Promise<Order | null> {
    const ORDER_STATE_PENDING_DEPOSIT = 1;
    const DEFAULT_ADDRESS = '0x0000000000000000000000000000000000000000000000000000000000000000';
    for (let order of orders) {
      if (order.orderState === ORDER_STATE_PENDING_DEPOSIT) {
        console.log(`Found order with pending orderState, id=${order.id}. Checking if deposit already recorded in contract...`);

        const depositTxRes = await contract.functions.depositTxns(order.id);
        const depositTx = depositTxRes[0];
        const isOrderNotDepositedYet = depositTx === DEFAULT_ADDRESS;
        if (isOrderNotDepositedYet) {
          console.log('deposit not recorded yet.');
          return order;
        }
      }
    }

    return null;
  }

  private async tryGetDepositTx(contract: Contract, pendingOrder: Order): Promise<EtherscanErc20Tx | null> {
    console.log('Searching for deposit...');
    const ETHERSCAN_API_STATUS_CODE_OK = '1';
    const apiUrl = `https://api-goerli.etherscan.io/api?module=account&action=tokentx&address=${pendingOrder.owner}&page=1&offset=1000&startblock=${pendingOrder.blockNumber}&sort=desc&apikey=${this._config.apiKeyEtherscan}`;
    const res = await axios.get(apiUrl);
    if (res.status !== 200 || res.data.status !== ETHERSCAN_API_STATUS_CODE_OK) {
      console.error('Etherscan api call failed:');
      console.error(res);
      throw `Etherscan api call failed, status, http status: ${res.status}`;
    }

    const erc20Txns: Array<EtherscanErc20Tx> = res.data.result;
    const depositTxs = erc20Txns.filter(tx =>
      tx.to.toLowerCase() === this._config.oracleContractAddress.toLowerCase()  // Case insensitive, to handle addresses using checksums
      && parseInt(tx.confirmations) > 0
    );

    // hasDeposited = filter deposits by order.tokenInAmount == tx.amount
    let depositTx = null;
    for (let tx of depositTxs) {
      if (await this.isDepositMatchOrder(contract, pendingOrder, tx)) {
        return tx;
      }
    }

    return null;
  }

  private async isDepositMatchOrder(oracleContractReadOnly: Contract, order: Order, tx: EtherscanErc20Tx) {
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
  }

  private async storeDepositTx(contract: Contract, pendingOrder: Order, depositTx: EtherscanErc20Tx): Promise<void> {
    const storeDepositTx = await contract.functions.storeDepositTransactionsAndUpdateOrderStates([{
      orderId: pendingOrder.id,
      txHash: depositTx.hash
    }], {
      gasLimit: 5000000
    });

    const storeDepositTxReceipt = await storeDepositTx.wait();
    if (storeDepositTxReceipt.status !== 1) {
      throw storeDepositTxReceipt;
    }
  }
}
