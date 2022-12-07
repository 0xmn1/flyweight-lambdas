import CoinmarketcapPriceProxy from '../classes/CoinmarketcapPriceProxy';
import { Config } from '../utils/configFactory';
import { Contract } from 'ethers';
import ITriggersOracleNode from '../interfaces/ITriggersOracleNode';
import OracleContractFactory from '../utils/oracleContractFactory';
import { Order } from '../types/Order';
import { OrderState } from '../types/OrderState';
import { OrderTriggerDirection } from '../types/OrderTriggerDirection';
import { PriceMap } from '../types/PriceMap';
import TriggerResult from './TriggerResult';
import gasLimits from '../gas-limits.json';

export default class TriggersOracleNode implements ITriggersOracleNode {
  private readonly _config: Config;

  constructor(config: Config) {
    this._config = config;
  }

  async tryTriggerOrders() {
    const oracleContractFactory = new OracleContractFactory(
      this._config.network,
      this._config.oracleContractAddress,
      this._config.apiKeyAlchemy,
      this._config.privateKey
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
    const priceProxy = new CoinmarketcapPriceProxy(this._config.apiKeyCoinMarketCap, this._config.network);
    let prices: PriceMap | null = null;
    return await priceProxy.getPrices();
  }

  private async getTriggerResults(contract: Contract, priceMap: PriceMap): Promise<Array<TriggerResult>> {
    const ordersCount = await contract.functions.ordersCount();
    const triggerResults: Array<TriggerResult> = [];

    for (let i = 0; i < ordersCount; i++) {
      const order: Order = await contract.functions.orders(i);
      console.log(`checking order #${order.id}`);
      if (order.orderState !== OrderState.UNTRIGGERED) {
        console.log(`skipped: already triggered`);
        continue;
      }

      const price = priceMap[order.tokenIn];
      if (!price) {
        console.log(`skipped: no price data available`);
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

  private async storePricesAndProcessTriggeredOrderIds(
    contract: Contract,
    priceMap: PriceMap,
    triggeredResults: Array<TriggerResult>
  ): Promise<void> {
    const priceArray = Object.keys(priceMap).map(symbol => ({
      symbol,
      price: priceMap[symbol],
    }));

    const orderIds = triggeredResults.map(r => r.orderId);
    const tx = await contract.functions.storePricesAndProcessTriggeredOrderIds(priceArray, orderIds, {
      gasLimit: gasLimits.TRIGGER_ORDER
    });

    console.log('Sending new data to oracle contract...');
    const txReceipt = await tx.wait();
    if (txReceipt.status !== 1) {
      throw txReceipt;
    }
  }
}