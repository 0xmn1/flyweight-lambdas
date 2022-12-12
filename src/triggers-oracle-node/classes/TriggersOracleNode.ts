import CoinmarketcapPriceProxy from './CoinmarketcapPriceProxy';
import { Config } from '../types/Config';
import { Contract } from 'ethers';
import ITriggersOracleNode from '../interfaces/ITriggersOracleNode';
import OracleContractFactory from '../../common/utils/ContractFactory';
import { Order } from '../../common/types/Order';
import { OrderState } from '../../common/types/OrderState';
import { OrderTriggerDirection } from '../../common/types/OrderTriggerDirection';
import { PriceMap } from '../types/PriceMap';
import TriggerResult from './TriggerResult';
import gasLimits from '../gas-limits.json';
import path from 'path';

/*
 * Oracle node that periodically checks triggerable orders in the smart contract.
 * An order is triggered when its' price condition is met.
 */
export default class TriggersOracleNode implements ITriggersOracleNode {
  private readonly _config: Config;

  constructor(config: Config) {
    this._config = config;
  }

  /*
   * This method is the entry point for the oracle node.
   * Checks all triggerable orders in the smart contract.
   * If any are triggered, a smart contract method is called (which executes the swap).
   * If none are triggered, no smart contract method is called (this allows us to save on gas).
   */
  async tryTriggerOrders() {
    const oracleContractAbiPath = path.resolve(__dirname, '..', 'oracle-smart-contract-abi.json');
    const oracleContractFactory = new OracleContractFactory(
      this._config.network,
      this._config.oracleContractAddress,
      this._config.apiKeyAlchemy,
      this._config.privateKey,
      oracleContractAbiPath,
    );

    const contract = oracleContractFactory.createContractReadOnly();
    const priceMap = await this.getPriceMap();
    const triggerResults = await this.getTriggerResults(contract, priceMap);
    const triggeredResults = triggerResults.filter(r => r.isTriggered);
    console.log(`${triggeredResults.length}/${triggerResults.length} orders will be triggered`);

    if (triggeredResults.length) {
      const contractWrite = oracleContractFactory.createContractWrite();
      await this.storePricesAndProcessTriggeredOrderIds(contractWrite, priceMap, triggeredResults);
    }
  }

  private async getPriceMap(): Promise<PriceMap> {
    const priceProxy = new CoinmarketcapPriceProxy(
      this._config.apiKeyCoinMarketCap,
      this._config.apiBaseUrlCoinMarketCap,
      this._config.network
    );

    return await priceProxy.tryGetPrices();
  }

  /*
   * @returns Array of calculated trigger results
   * @remarks
   * Only orders in "untriggered" {@link OrderState} are checked
   */
  private async getTriggerResults(contract: Contract, priceMap: PriceMap): Promise<TriggerResult[]> {
    const ordersCount = await contract.functions.ordersCount();
    const triggerResults: TriggerResult[] = [];

    for (let i = 0; i < ordersCount; i++) {
      const order: Order = await contract.functions.orders(i);
      console.log(`checking order #${order.id}`);
      if (order.orderState !== OrderState.UNTRIGGERED) {
        console.log(`skipped: already triggered`);
        continue;
      }

      const price = priceMap[order.tokenIn];
      if (!price) {
        console.log(`skipped: no price data available, tokenIn=${order.tokenIn}`);
        continue;
      }

      const isTriggered = this.checkTrigger(price, order);
      triggerResults.push(new TriggerResult(order.id, order.tokenIn, price.toString(), isTriggered));
    }

    return triggerResults;
  }

  private checkTrigger(price: number, order: Order): boolean {
    const triggerPrice = parseFloat(order.tokenInTriggerPrice);
    console.log(`checking order trigger result, price=${price}, dir=${order.direction}, triggerPrice=${triggerPrice}`);

    switch (order.direction) {
      case OrderTriggerDirection.BELOW:
        return price < triggerPrice;
      case OrderTriggerDirection.EQUAL:
        return price === triggerPrice;
      case OrderTriggerDirection.ABOVE:
        return price > triggerPrice;
      default:
        console.warn(`unrecognized order trigger direction: ${order.direction}`);
    }

    return false;
  }

  // Sends price and triggered order id's to smart contract
  private async storePricesAndProcessTriggeredOrderIds(
    contract: Contract,
    priceMap: PriceMap,
    triggeredResults: TriggerResult[],
  ): Promise<void> {
    const priceArray = Object.keys(priceMap).map(symbol => ({
      symbol,
      price: priceMap[symbol],
    }));

    const orderIds = triggeredResults.map(r => r.orderId);
    const tx = await contract.functions.storePricesAndProcessTriggeredOrderIds(priceArray, orderIds, {
      gasLimit: gasLimits.TRIGGER_ORDERS
    });

    console.log('sending new data to oracle contract...');
    const txReceipt = await tx.wait();
    if (txReceipt.status !== 1) {
      throw txReceipt;
    }
  }
}
