import { InputTransactionType } from "../code-gen/tokens.js";

export const FOR_GENERATION_DIRECTORY = "boilerplate";
export const PAYLOAD_BUILDERS_FILE_NAME = "payloadBuilders";
export const ABI_TYPES_FILE_NAME = "types";
export const ABI_TYPES_FILE = `"../${ABI_TYPES_FILE_NAME}.js"`;
export const ABI_PAYLOAD_BUILDER_FILE = `"../${PAYLOAD_BUILDERS_FILE_NAME}.js"`;

export const BOILERPLATE_COPYRIGHT =
  `` + `// Copyright © Aptos Foundation\n` + `// SPDX-License-Identifier: Apache-2.0\n`;
export const DEFAULT_SDK_PATH = "@aptos-labs/ts-sdk";
export const IMPORT_ACCOUNT_ADDRESS = `import { AccountAddress } from "${DEFAULT_SDK_PATH}";`;

export const getBoilerplateImports = (sdkPath?: string): string => {
  return `
    ${BOILERPLATE_COPYRIGHT}
    
    /* eslint-disable max-len */
    import { AccountAddress, AccountAuthenticator, MoveString,
      MoveVector, TypeTag, U128, U16, U256, U32, U64, U8, Bool,
      Account, Aptos, AptosConfig, EntryFunctionArgumentTypes,
      AccountAddressInput, Hex, HexInput, parseTypeTag, buildTransaction,
      InputGenerateTransactionOptions, RawTransaction, RawTransactionWithData,
      WaitForTransactionOptions, UserTransactionResponse, MoveValue
    } from "${sdkPath ?? DEFAULT_SDK_PATH}";
    import { InputTypes, Option, MoveObject, ObjectAddress, TypeTagInput, Uint8, Uint16, Uint32, Uint64, Uint128, Uint256,
              Uint64String, Uint128String, Uint256String, AccountAddressString, ObjectAddressStruct } from ${ABI_TYPES_FILE};
    import { ViewFunctionPayloadBuilder, EntryFunctionPayloadBuilder, EntryFunctionTransactionBuilder } from ${ABI_PAYLOAD_BUILDER_FILE};
    import { MODULE_ADDRESS } from "./index.js";
    
    `;
};
