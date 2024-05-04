export const DEFAULT_ARGUMENT_BASE = "arg_";
export const R_PARENTHESIS = ")";

export const PRIMARY_SENDER_VAR_NAME = "primarySender";
export const SECONDARY_SENDERS_VAR_NAME = "secondarySenders";
export const FEE_PAYER_VAR_NAME = "feePayer";
export const MODULE_ADDRESS_VAR_NAME = "MODULE_ADDRESS";

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
