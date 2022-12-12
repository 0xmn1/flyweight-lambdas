// Represents an oracle node to handle order triggerring
export default interface ITriggersOracleNode {
  tryTriggerOrders(): Promise<void>;
}
