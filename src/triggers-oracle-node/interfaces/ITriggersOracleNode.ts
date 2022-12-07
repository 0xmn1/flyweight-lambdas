export default interface ITriggersOracleNode {
  tryTriggerOrders(): Promise<void>;
}
