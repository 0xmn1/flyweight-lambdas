import { PriceMap } from '../types/PriceMap';

// Represents a proxy to get token prices
export default interface IPriceProxy {
  // Get latest token prices from the price provider
  tryGetPrices(symbol: string): Promise<PriceMap>;
}
