import { OrderState } from './OrderState';
import { OrderTriggerDirection } from './OrderTriggerDirection';

export type Order = {
  id: number;
  owner: string;
  orderState: OrderState;
  tokenIn: string;
  tokenOut: string;
  tokenInTriggerPrice: string;
  direction: OrderTriggerDirection;
  tokenInAmount: string;
  blockNumber: number;
};
