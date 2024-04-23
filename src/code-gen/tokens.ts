export const DEFAULT_ARGUMENT_BASE = "arg_";
export const R_PARENTHESIS = ")";

export const PRIMARY_SENDER_FIELD_NAME = "primarySender";
export const SECONDARY_SENDERS_FIELD_NAME = "secondarySenders";
export const FEE_PAYER_FIELD_NAME = "feePayer";
export const MODULE_ADDRESS_FIELD_NAME = "MODULE_ADDRESS";

// private constructor(CONSTRUCTOR_ARGS_VARIABLE_NAME: { ... })
export const CONSTRUCTOR_ARGS_VARIABLE_NAME = "args";

export enum TransactionType {
  SingleSigner = "SingleSigner",
  MultiAgent = "MultiAgent",
  FeePayer = "FeePayer",
}

export enum InputTransactionType {
  SingleSigner = `Input${TransactionType.SingleSigner}Transaction`,
  MultiAgent = `Input${TransactionType.MultiAgent}Transaction`,
  FeePayer = `Input${TransactionType.FeePayer}Transaction`,
}
