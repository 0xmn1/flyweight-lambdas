import { Contract, ethers } from 'ethers';
import { EtherscanApiResponse, EtherscanTokenTx } from '../types/EtherscanApiResponse';

import { Config } from '../types/Config';
import DepositTx from './DepositTx';
import EtherscanTransactionProvider from './EtherscanTransactionProvider';
import OracleContractFactory from '../../common/utils/ContractFactory';
import { Order } from '../../common/types/Order';
import { OrderState } from '../../common/types/OrderState';
import axios from 'axios';
import gasLimits from '../gas-limits.json';
import path from 'path';

/*
 * Oracle node to verify on-chain deposits to the oracle smart contract.
 * Supports both event-based (e.g.: webhook) & periodic triggers (e.g.: cron), & both
 * should always be enabled.
 * @remarks
 * Periodic triggers are supported (in addition to event-based triggers) because Etherscan
 * API indexes blocks w/ 1 confirmation, & thereby introducing a lag between on-chain confirmations
 * & transactions being returned by their API (0xmn1 has confirmed this undocumented quirky behaviour with
 * the Etherscan support team).
 */
export default class DepositOracleNode {
  private static readonly DEFAULT_ADDRESS = '0x0000000000000000000000000000000000000000000000000000000000000000';

  constructor(
    private readonly _config: Config
  ) {
  }

  /*
   * Entry point for the oracle node.
   * Gets orders in "pending" {@link OrderState} and searches for a matching on-chain token transaction.
   * @param address - must be an Externally Owned Account (EOA), & is enforced at the smart contract level.
   * @remarks
   * Links 1 pending order at a time.
   * This "1 pending order only" rule is enforced at the smart contract level & is done to minimise risk.
   */
  async runOracleNode(targetAddress: string | undefined | null) {
    const oracleContractAbiPath = path.resolve(__dirname, '..', 'oracle-smart-contract-abi.json');
    const oracleContractFactory = new OracleContractFactory(
      this._config.network,
      this._config.oracleContractAddress,
      this._config.apiKeyAlchemy,
      this._config.privateKey,
      oracleContractAbiPath,
    );

    const contract = oracleContractFactory.createContractReadOnly();
    const pendingOrdersAllUsersRes = await contract.functions.getPendingDepositOrders();
    const pendingOrdersAllUsers: Order[] = pendingOrdersAllUsersRes[0];

    let addressesToCheck = targetAddress
      ? [targetAddress]
      : pendingOrdersAllUsers
        .filter(o => o.owner !== '0x0000000000000000000000000000000000000000')
        .map(o => o.owner);

    // Try mark pending orders as "deposited"
    const verifiedDepositTxns: DepositTx[] = [];
    for (let address of addressesToCheck) {
      const addressOrders = [...pendingOrdersAllUsers]
        .filter(o => o.owner.toLowerCase() === address.toLowerCase())
        .sort((o1, o2) => o1.id - o2.id);

      const depositTx = await this.tryGetDepositTxForAddress(contract, address, addressOrders);
      if (depositTx) {
        // Mark pending order as "deposited"
        verifiedDepositTxns.push(depositTx);
      }
    }

    if (verifiedDepositTxns.length) {
      console.log('verified deposit txns:');
      console.log(verifiedDepositTxns);
      console.log(`sending new verified deposit txns to contract...`);
      const oracleContractWrite = oracleContractFactory.createContractWrite();
      await this.storeDepositTx(oracleContractWrite, verifiedDepositTxns);
      console.log('sent');
    }

    const msg = 'oracle successfully ran';
    console.log(msg);
    return {
      statusCode: 200,
      body: msg
    };
  }

  // Given an address, tries to find the deposit tx for their pending order
  private async tryGetDepositTxForAddress(
    contract: Contract,
    address: string,
    addressOrders: Order[],
  ): Promise<DepositTx | null> {
    console.log(`checking deposit for address, address=${address}`);

    // Try get pending order
    const pendingOrder = await this.tryGetPendingOrder(contract, addressOrders);
    if (!pendingOrder) {
      console.log('a pending order (w/o a deposit yet) was not found in the contract for this address');
      return null;
    }

    // Try get the order's token deposit
    const depositTx = await this.tryGetDepositTx(contract, pendingOrder);
    if (!depositTx) {
      console.log(`deposit tx not found, orderId=${pendingOrder.id}, tokenIn=${pendingOrder.tokenIn}, tokenInAmount=${pendingOrder.tokenInAmount}`);
      return null;
    }

    console.log('deposit tx found');
    return new DepositTx(pendingOrder.id, depositTx.hash);
  }

  private async tryGetPendingOrder(contract: Contract, orders: Order[]): Promise<Order | null> {
    for (let order of orders) {
      if (order.orderState === OrderState.PENDING_DEPOSIT) {
        console.log(`found pending order, id=${order.id}. Checking if deposit already recorded in contract...`);

        const depositTxRes = await contract.functions.depositTxns(order.id);
        const depositTx = depositTxRes[0];
        const isOrderNotDepositedYet = depositTx === DepositOracleNode.DEFAULT_ADDRESS;
        if (isOrderNotDepositedYet) {
          console.log('deposit not recorded yet.');
          return order;
        }
      }
    }

    return null;
  }

  // @returns null if matching tx is not found
  private async tryGetDepositTx(contract: Contract, pendingOrder: Order): Promise<EtherscanTokenTx | null> {
    console.log('searching for on-chain deposit tx...');
    const provider = new EtherscanTransactionProvider(this._config.apiKeyEtherscan, this._config.etherscanApiBaseUrl);
    const tokenTxns = await provider.getTokenTransactions(pendingOrder.owner, pendingOrder.blockNumber);
    const depositTxs = tokenTxns.filter(tx =>
      tx.to.toLowerCase() === this._config.oracleContractAddress.toLowerCase()  // Case insensitive, to handle addresses using checksums
      && parseInt(tx.confirmations) > 0
    );

    for (let tx of depositTxs) {
      if (await this.isDepositMatchOrder(contract, pendingOrder, tx)) {
        return tx;
      }
    }

    return null;
  }

  /*
   * Checks if a on-chain token transaction was for a specific Flyweight order.
   * @remarks
   * The criteria used to "match" smart contract orders to token transactions, must remain overly strict to maximise product safety.
   * The logic used in this oracle method has a strong responsibility in minimising financial risk for the flyweight platform, hence the verbosity.
   */
  private async isDepositMatchOrder(oracleContractReadOnly: Contract, order: Order, tx: EtherscanTokenTx) {
    const expectedTxValue = BigInt(order.tokenInAmount).toString(10);  // Etherscan returns token amounts in decimal format, as a string 
    const isMatch = tx.from.toLowerCase() === order.owner.toLowerCase()
      && tx.to.toLowerCase() === oracleContractReadOnly.address.toLowerCase()
      && tx.tokenSymbol.toLowerCase() === order.tokenIn.toLowerCase() // Done in addition to checking the contract address, just to be safe
      && BigInt(tx.blockNumber) >= BigInt(order.blockNumber)  // Deposits can be done in blocks after the order is created in the smart contract
      && tx.value === expectedTxValue;

    if (isMatch) {
      // Verify that the tx contract address.
      // This is a necessary measure (multiple tokens can have the same symbol but different addresses).
      const tokenSymbolSanitized = tx.tokenSymbol.trim().toUpperCase();
      const whitelistedTokenAddressRes = await oracleContractReadOnly.functions.tryGetTokenAddress(tokenSymbolSanitized);
      const whitelistedTokenAddress = whitelistedTokenAddressRes[0];

      console.log(`match found. Verifying against the token contract address - token contract is ${tx.contractAddress}, oracle contract whitelisted address is ${whitelistedTokenAddress}`);
      return whitelistedTokenAddress && tx.contractAddress.toLowerCase() === whitelistedTokenAddress.toLowerCase();
    }

    return false;
  }

  private async storeDepositTx(contract: Contract, verifiedDepositTxns: DepositTx[]): Promise<void> {
    const storeDepositTx = await contract.functions.storeDepositTransactionsAndUpdateOrderStates(verifiedDepositTxns, {
      gasLimit: gasLimits.STORE_DEPOSIT_TX,
    });

    const storeDepositTxReceipt = await storeDepositTx.wait();
    if (storeDepositTxReceipt.status !== 1) {
      throw storeDepositTxReceipt;
    }
  }
}
