export type HolderType = "human" | "agent";
export type CardStatus = "active" | "frozen" | "cancelled";
export type CardKind = "virtual" | "physical";

export interface CardHolder {
  type: HolderType;
  id: string;
  name: string;
}

export interface Card {
  id: string;
  kind: CardKind;
  status: CardStatus;
  brand: string;
  last4: string;
  currency: string;
  /** Minor units (e.g. cents). Absent when the card has no cap. */
  spendLimit?: number;
  spendPeriod?: "day" | "week" | "month" | "total";
  holder: CardHolder;
  createdAt: string;
}

export interface Transaction {
  id: string;
  cardId: string;
  /** Minor units. Negative for refunds. */
  amount: number;
  currency: string;
  merchant: string;
  status: "pending" | "settled" | "declined" | "reversed";
  declineReason?: string;
  createdAt: string;
}

export interface Page<T> {
  data: T[];
  hasMore: boolean;
  nextCursor?: string;
}

export interface CreateCardInput {
  holderType: HolderType;
  holderId: string;
  kind: CardKind;
  currency: string;
  spendLimit?: number;
  spendPeriod?: "day" | "week" | "month" | "total";
  label?: string;
}

export interface ListCardsInput {
  holderType?: HolderType;
  status?: CardStatus;
  limit?: number;
  cursor?: string;
}

export interface ListTransactionsInput {
  cardId?: string;
  limit?: number;
  cursor?: string;
  /** ISO-8601 timestamp; only transactions at or after this point. */
  since?: string;
}
