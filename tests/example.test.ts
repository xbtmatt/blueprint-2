/* eslint-disable max-len */
import {
  Account,
  AptosConfig,
  Network,
  Aptos,
  AccountAddress,
  Ed25519PrivateKey,
  type UserTransactionResponse,
  type Uint8,
  type Uint16,
  type Uint32,
  type Uint64,
  type Uint128,
  type Uint256,
  type EntryFunctionPayloadResponse,
} from "@aptos-labs/ts-sdk";
import { PUBLISHER_ACCOUNT_PK, PUBLISHER_ACCOUNT_ADDRESS } from "./helper";
import {
  type EntryFunctionTransactionBuilder,
  type Option,
  type TypeTagInput,
  fundAccounts,
} from "../src";
import { TxArgsModule } from "../generated/args_test_suite";
// Upper bound values for uint8, uint16, uint64 and uint128
export const MAX_U8_NUMBER: Uint8 = 2 ** 8 - 1;
export const MAX_U16_NUMBER: Uint16 = 2 ** 16 - 1;
export const MAX_U32_NUMBER: Uint32 = 2 ** 32 - 1;
export const MAX_U64_BIG_INT: Uint64 = BigInt(2) ** BigInt(64) - BigInt(1);
export const MAX_U128_BIG_INT: Uint128 = BigInt(2) ** BigInt(128) - BigInt(1);
export const MAX_U256_BIG_INT: Uint256 = BigInt(2) ** BigInt(256) - BigInt(1);
jest.setTimeout(20000);
// This test uses lots of helper functions, explained here:
//  the `transactionArguments` array contains every possible argument type
//  the `rawTransactionHelper` and `rawTransactionMultiAgentHelper` functions are helpers to generate the transactions,
//    respectively for single signer transactions and for (multi signer & fee payer) transactions
// In any transaction with a `&signer` the move function asserts that the first argument is the senderAccount's address:
// `sender_address: address` or all of the `&signer` addresses: `signer_addresses: vector<address>`
describe("various transaction arguments", () => {
  const config = new AptosConfig({ network: Network.LOCAL });
  const aptos = new Aptos(config);
  const senderAccount = Account.fromPrivateKey({
    privateKey: new Ed25519PrivateKey(PUBLISHER_ACCOUNT_PK),
    legacy: true,
  });
  const secondarySignerAccounts = [
    Account.generate(),
    Account.generate(),
    Account.generate(),
    Account.generate(),
  ];
  const feePayerAccount = Account.generate();
  const moduleObjects: Array<AccountAddress> = [];
  let simpleTransactionArguments: any;
  const EXPECTED_VECTOR_U8 = new Uint8Array([
    0,
    1,
    2,
    MAX_U8_NUMBER - 2,
    MAX_U8_NUMBER - 1,
    MAX_U8_NUMBER,
  ]);
  const EXPECTED_VECTOR_STRING = ["expected_string", "abc", "def", "123", "456", "789"];
  beforeAll(async () => {
    await fundAccounts(aptos, [senderAccount, ...secondarySignerAccounts, feePayerAccount]);
    //  await publishArgumentTestModule(aptos, senderAccount);
    // when deploying, `init_module` creates 3 objects and stores them into the `SetupData` resource
    // within that resource is 3 fields: `empty_object_1`, `empty_object_2`, `empty_object_3`
    // we need to extract those objects and use them as arguments for the entry functions
    type SetupData = {
      empty_object_1: { inner: string };
      empty_object_2: { inner: string };
      empty_object_3: { inner: string };
    };
    const setupData = await aptos.getAccountResource<SetupData>({
      accountAddress: senderAccount.accountAddress.toString(),
      resourceType: `${senderAccount.accountAddress.toString()}::tx_args_module::SetupData`,
    });
    moduleObjects.push(AccountAddress.from(setupData.empty_object_1.inner));
    moduleObjects.push(AccountAddress.from(setupData.empty_object_2.inner));
    moduleObjects.push(AccountAddress.from(setupData.empty_object_3.inner));
    simpleTransactionArguments = {
      argBool: true,
      argU8: 1,
      argU16: 2,
      argU32: 3,
      argU64: 4,
      argU128: 5,
      argU256: 6,
      argAddress: senderAccount.accountAddress.toString(),
      argString: "expected_string",
      argObject: moduleObjects[0].toString(),
      vectorEmpty: new Uint8Array([]),
      vectorBool: [true, false, true],
      vectorU8: [0, 1, 2, MAX_U8_NUMBER - 2, MAX_U8_NUMBER - 1, MAX_U8_NUMBER],
      vectorU16: [0, 1, 2, MAX_U16_NUMBER - 2, MAX_U16_NUMBER - 1, MAX_U16_NUMBER],
      vectorU32: [0, 1, 2, MAX_U32_NUMBER - 2, MAX_U32_NUMBER - 1, MAX_U32_NUMBER],
      vectorU64: [
        0,
        1,
        2,
        MAX_U64_BIG_INT - BigInt(2),
        MAX_U64_BIG_INT - BigInt(1),
        MAX_U64_BIG_INT.toString(10),
      ],
      vectorU128: [
        0,
        1,
        2,
        MAX_U128_BIG_INT - BigInt(2),
        MAX_U128_BIG_INT - BigInt(1),
        MAX_U128_BIG_INT.toString(10),
      ],
      vectorU256: [
        0,
        1,
        2,
        MAX_U256_BIG_INT - BigInt(2),
        MAX_U256_BIG_INT - BigInt(1),
        MAX_U256_BIG_INT.toString(10),
      ],
      vectorAddress: ["0x0", "0xabc", "0xdef", "0x123", "0x456", "0x789"],
      vectorString: ["expected_string", "abc", "def", "123", "456", "789"],
      vectorObject: moduleObjects.map((obj) => obj.toString()),
      optionEmpty: new Uint8Array([]),
      optionBool: [true],
      optionU8: [1],
      optionU16: [2],
      optionU32: [3],
      optionU64: [4],
      optionU128: [5],
      optionU256: [6],
      optionAddress: [senderAccount.accountAddress.toString()],
      optionString: ["expected_string"],
      optionObject: [moduleObjects[0].toString()],
    };
    //  viewArgs = [
    //    true,
    //    1,
    //    2,
    //    3,
    //    "4",
    //    "5",
    //    "6",
    //    senderAccount.accountAddress.toString(),
    //    "expected_string",
    //    moduleObjects[0].toString(),
    //    new Uint8Array([1, 2, 3]),
    //    [true, false, true],
    //    new Uint8Array([0, 255, 1, 2]),
    //    [1, 2, 3, 4],
    //    [5, 6, 7, 8],
    //    ["9", "10", "11", "12"],
    //    ["13", "14", "15", "16"],
    //    ["17", "18", "19", "20"],
    //    [
    //      AccountAddress.ZERO,
    //      AccountAddress.ONE,
    //      AccountAddress.TWO,
    //      AccountAddress.THREE,
    //      AccountAddress.FOUR,
    //      senderAccount.accountAddress,
    //    ].map((a) => a.toString()),
    //    ["this", "is", "a", "string"],
    //  ];
    return true;
  });
  const tts = [
    "bool",
    "u8",
    "u16",
    "u32",
    "u64",
    "u128",
    "u256",
    "address",
    "0x1::string::String",
    `0x1::object::Object<${PUBLISHER_ACCOUNT_ADDRESS}::tx_args_module::EmptyResource>`,
    "vector<bool>",
    "vector<u8>",
    "vector<u16>",
    "vector<u32>",
    "vector<u64>",
    "vector<u128>",
    "vector<u256>",
    "vector<address>",
    "vector<0x1::string::String>",
    `vector<0x1::object::Object<${PUBLISHER_ACCOUNT_ADDRESS}::tx_args_module::EmptyResource>>`,
    "0x1::option::Option<bool>",
    "0x1::option::Option<u8>",
    "0x1::option::Option<u16>",
    "0x1::option::Option<u32>",
    "0x1::option::Option<u64>",
    "0x1::option::Option<u128>",
    "0x1::option::Option<u256>",
    "0x1::option::Option<address>",
    "0x1::option::Option<0x1::string::String>",
    `0x1::option::Option<0x1::object::Object<${PUBLISHER_ACCOUNT_ADDRESS}::tx_args_module::EmptyResource>>`,
    `vector<vector<0x1::option::Option<vector<0x1::option::Option<0x1::object::Object<${PUBLISHER_ACCOUNT_ADDRESS}::tx_args_module::EmptyResource>>>>>>`,
  ];
  describe("all builder paths", () => {
    describe("tests type_tags, a function with 31 complex type tags", () => {
      let baseBuilder: EntryFunctionTransactionBuilder;
      const typeTags = tts as [
        TypeTagInput,
        TypeTagInput,
        TypeTagInput,
        TypeTagInput,
        TypeTagInput,
        TypeTagInput,
        TypeTagInput,
        TypeTagInput,
        TypeTagInput,
        TypeTagInput,
        TypeTagInput,
        TypeTagInput,
        TypeTagInput,
        TypeTagInput,
        TypeTagInput,
        TypeTagInput,
        TypeTagInput,
        TypeTagInput,
        TypeTagInput,
        TypeTagInput,
        TypeTagInput,
        TypeTagInput,
        TypeTagInput,
        TypeTagInput,
        TypeTagInput,
        TypeTagInput,
        TypeTagInput,
        TypeTagInput,
        TypeTagInput,
        TypeTagInput,
        TypeTagInput,
      ];
      // We use the base builders to check the fully qualified function call name- not fee payer/secondary signers
      beforeAll(async () => {
        baseBuilder = await TxArgsModule.TypeTags.builder({
          aptosConfig: aptos.config,
          primarySender: senderAccount.accountAddress,
          typeTags: [
            "bool",
            "u8",
            "u16",
            "u32",
            "u64",
            "u128",
            "u256",
            "address",
            "0x1::string::String",
            `0x1::object::Object<${PUBLISHER_ACCOUNT_ADDRESS}::tx_args_module::EmptyResource>`,
            "vector<bool>",
            "vector<u8>",
            "vector<u16>",
            "vector<u32>",
            "vector<u64>",
            "vector<u128>",
            "vector<u256>",
            "vector<address>",
            "vector<0x1::string::String>",
            `vector<0x1::object::Object<${PUBLISHER_ACCOUNT_ADDRESS}::tx_args_module::EmptyResource>>`,
            "0x1::option::Option<bool>",
            "0x1::option::Option<u8>",
            "0x1::option::Option<u16>",
            "0x1::option::Option<u32>",
            "0x1::option::Option<u64>",
            "0x1::option::Option<u128>",
            "0x1::option::Option<u256>",
            "0x1::option::Option<address>",
            "0x1::option::Option<0x1::string::String>",
            `0x1::option::Option<0x1::object::Object<${PUBLISHER_ACCOUNT_ADDRESS}::tx_args_module::EmptyResource>>`,
            // eslint-disable-next-line max-len
            `vector<vector<0x1::option::Option<vector<0x1::option::Option<0x1::object::Object<${PUBLISHER_ACCOUNT_ADDRESS}::tx_args_module::EmptyResource>>>>>>`,
          ],
        });
      });
      it("builds with no fee payer", async () => {
        const builder = baseBuilder;
        const response = await builder.submit({
          primarySigner: senderAccount,
        });
        checkResponse({
          signers: {
            primary: senderAccount,
          },
          builder: baseBuilder,
          response,
        });
      });
      it("builds with a fee payer", async () => {
        const builder = await TxArgsModule.TypeTags.builder({
          aptosConfig: aptos.config,
          primarySender: senderAccount.accountAddress,
          typeTags,
          feePayer: feePayerAccount.accountAddress,
        });
        const response = await builder.submit({
          primarySigner: senderAccount,
          feePayer: feePayerAccount,
        });
        checkResponse({
          signers: {
            primary: senderAccount,
            feePayer: feePayerAccount,
          },
          builder: baseBuilder,
          response,
        });
      });
      it("combines build/submit and successfully submits", async () => {
        const response = await TxArgsModule.TypeTags.submit({
          aptosConfig: aptos.config,
          primarySender: senderAccount,
          typeTags,
        });
        checkResponse({
          signers: {
            primary: senderAccount,
          },
          builder: baseBuilder,
          response,
        });
      });
      it("combines build/submit and successfully submits with a fee payer", async () => {
        const response = await TxArgsModule.TypeTags.submit({
          aptosConfig: aptos.config,
          primarySender: senderAccount,
          typeTags,
          feePayer: feePayerAccount,
        });
        checkResponse({
          signers: {
            primary: senderAccount,
            feePayer: feePayerAccount,
          },
          builder: baseBuilder,
          response,
        });
      });
    });
    describe("tests public_arguments, a function with all argument types except `&signer`", () => {
      let baseBuilder: EntryFunctionTransactionBuilder;
      // We use the base builders to check the fully qualified function call name- not fee payer/secondary signers
      beforeAll(async () => {
        baseBuilder = await TxArgsModule.PublicArguments.builder({
          aptosConfig: aptos.config,
          account1: senderAccount.accountAddress,
          ...simpleTransactionArguments,
        });
      });
      it("builds with no fee payer", async () => {
        const builder = baseBuilder;
        const response = await builder.submit({
          primarySigner: senderAccount,
        });
        checkResponse({
          signers: {
            primary: senderAccount,
          },
          builder: baseBuilder,
          response,
        });
      });
      it("builds with a fee payer", async () => {
        const builder = await TxArgsModule.PublicArguments.builder({
          aptosConfig: aptos.config,
          account1: senderAccount.accountAddress,
          ...simpleTransactionArguments,
          feePayer: feePayerAccount.accountAddress,
        });
        const response = await builder.submit({
          primarySigner: senderAccount,
          feePayer: feePayerAccount,
        });
        checkResponse({
          signers: {
            primary: senderAccount,
            feePayer: feePayerAccount,
          },
          builder: baseBuilder,
          response,
        });
      });
      it("combines build/submit and successfully submits with a fee payer", async () => {
        const response = await TxArgsModule.PublicArguments.submit({
          aptosConfig: aptos.config,
          account1: senderAccount,
          ...simpleTransactionArguments,
          feePayer: feePayerAccount,
        });
        checkResponse({
          signers: {
            primary: senderAccount,
            feePayer: feePayerAccount,
          },
          builder: baseBuilder,
          response,
        });
      });
      it("combines build/submit and successfully submits", async () => {
        const response = await TxArgsModule.PublicArguments.submit({
          aptosConfig: aptos.config,
          account1: senderAccount,
          ...simpleTransactionArguments,
        });
        checkResponse({
          signers: {
            primary: senderAccount,
          },
          builder: baseBuilder,
          response,
        });
      });
    });
    describe("tests public_arguments_multiple_signers, a multi-agent function with all argument types except `&signer`", () => {
      let baseBuilder: EntryFunctionTransactionBuilder;
      // We use the base builders to check the fully qualified function call name- not fee payer/secondary signers
      beforeAll(async () => {
        baseBuilder = await TxArgsModule.PublicArgumentsMultipleSigners.builder({
          aptosConfig: aptos.config,
          account1: senderAccount.accountAddress,
          account2: secondarySignerAccounts[0].accountAddress,
          account3: secondarySignerAccounts[1].accountAddress,
          account4: secondarySignerAccounts[2].accountAddress,
          account5: secondarySignerAccounts[3].accountAddress,
          signerAddresses: [
            senderAccount.accountAddress,
            ...secondarySignerAccounts.map((s) => s.accountAddress),
          ],
          ...simpleTransactionArguments,
        });
      });
      it("builds with no fee payer", async () => {
        const builder = baseBuilder;
        const response = await builder.submit({
          primarySigner: senderAccount,
          secondarySigners: secondarySignerAccounts,
        });
        checkResponse({
          signers: {
            primary: senderAccount,
            secondary: secondarySignerAccounts,
          },
          builder: baseBuilder,
          response,
        });
      });
      it("builds with a fee payer", async () => {
        const builder = await TxArgsModule.PublicArgumentsMultipleSigners.builder({
          aptosConfig: aptos.config,
          account1: senderAccount.accountAddress,
          account2: secondarySignerAccounts[0].accountAddress,
          account3: secondarySignerAccounts[1].accountAddress,
          account4: secondarySignerAccounts[2].accountAddress,
          account5: secondarySignerAccounts[3].accountAddress,
          signerAddresses: [
            senderAccount.accountAddress,
            ...secondarySignerAccounts.map((s) => s.accountAddress),
          ],
          ...simpleTransactionArguments,
          feePayer: feePayerAccount.accountAddress,
        });
        const response = await builder.submit({
          primarySigner: senderAccount,
          secondarySigners: secondarySignerAccounts,
          feePayer: feePayerAccount,
        });
        checkResponse({
          signers: {
            primary: senderAccount,
            secondary: secondarySignerAccounts,
            feePayer: feePayerAccount,
          },
          builder: baseBuilder,
          response,
        });
      });
      it("combines build/submit and successfully submits", async () => {
        const response = await TxArgsModule.PublicArgumentsMultipleSigners.submit({
          aptosConfig: aptos.config,
          account1: senderAccount,
          account2: secondarySignerAccounts[0],
          account3: secondarySignerAccounts[1],
          account4: secondarySignerAccounts[2],
          account5: secondarySignerAccounts[3],
          signerAddresses: [
            senderAccount.accountAddress,
            ...secondarySignerAccounts.map((s) => s.accountAddress),
          ],
          ...simpleTransactionArguments,
        });
        checkResponse({
          signers: {
            primary: senderAccount,
            secondary: secondarySignerAccounts,
          },
          builder: baseBuilder,
          response,
        });
      });
      it("combines build/submit and successfully submits with a fee payer", async () => {
        const response = await TxArgsModule.PublicArgumentsMultipleSigners.submit({
          aptosConfig: aptos.config,
          account1: senderAccount,
          account2: secondarySignerAccounts[0],
          account3: secondarySignerAccounts[1],
          account4: secondarySignerAccounts[2],
          account5: secondarySignerAccounts[3],
          signerAddresses: [
            senderAccount.accountAddress,
            ...secondarySignerAccounts.map((s) => s.accountAddress),
          ],
          ...simpleTransactionArguments,
          feePayer: feePayerAccount,
        });
        checkResponse({
          signers: {
            primary: senderAccount,
            secondary: secondarySignerAccounts,
            feePayer: feePayerAccount,
          },
          builder: baseBuilder,
          response,
        });
      });
    });
    describe("tests complex_arguments, a function with complex, nested argument types", () => {
      let baseBuilder: EntryFunctionTransactionBuilder;
      const optionArray = [EXPECTED_VECTOR_STRING] as Option<Array<string>>;
      const deeplyNested3 = [optionArray, optionArray, optionArray];
      const deeplyNested4 = [deeplyNested3, deeplyNested3, deeplyNested3];
      beforeAll(async () => {
        baseBuilder = await TxArgsModule.ComplexArguments.builder({
          aptosConfig: aptos.config,
          primarySender: senderAccount.accountAddress,
          deeplyNested1: [EXPECTED_VECTOR_U8, EXPECTED_VECTOR_U8, EXPECTED_VECTOR_U8],
          deeplyNested2: [EXPECTED_VECTOR_STRING, EXPECTED_VECTOR_STRING, EXPECTED_VECTOR_STRING],
          deeplyNested3,
          deeplyNested4,
        });
      });
      it("builds with no fee payer", async () => {
        const builder = baseBuilder;
        const response = await builder.submit({
          primarySigner: senderAccount,
        });
        checkResponse({
          signers: {
            primary: senderAccount,
          },
          builder: baseBuilder,
          response,
        });
      });
      it("builds with a fee payer", async () => {
        const builder = await TxArgsModule.ComplexArguments.builder({
          aptosConfig: aptos.config,
          primarySender: senderAccount.accountAddress,
          deeplyNested1: [EXPECTED_VECTOR_U8, EXPECTED_VECTOR_U8, EXPECTED_VECTOR_U8],
          deeplyNested2: [EXPECTED_VECTOR_STRING, EXPECTED_VECTOR_STRING, EXPECTED_VECTOR_STRING],
          deeplyNested3,
          deeplyNested4,
          feePayer: feePayerAccount.accountAddress,
        });
        const response = await builder.submit({
          primarySigner: senderAccount,
          feePayer: feePayerAccount,
        });
        checkResponse({
          signers: {
            primary: senderAccount,
            feePayer: feePayerAccount,
          },
          builder: baseBuilder,
          response,
        });
      });
      it("combines build/submit and successfully submits", async () => {
        const response = await TxArgsModule.ComplexArguments.submit({
          aptosConfig: aptos.config,
          primarySender: senderAccount,
          deeplyNested1: [EXPECTED_VECTOR_U8, EXPECTED_VECTOR_U8, EXPECTED_VECTOR_U8],
          deeplyNested2: [EXPECTED_VECTOR_STRING, EXPECTED_VECTOR_STRING, EXPECTED_VECTOR_STRING],
          deeplyNested3,
          deeplyNested4,
        });
        checkResponse({
          signers: {
            primary: senderAccount,
          },
          builder: baseBuilder,
          response,
        });
      });
      it("combines build/submit and successfully submits with a fee payer", async () => {
        const response = await TxArgsModule.ComplexArguments.submit({
          aptosConfig: aptos.config,
          primarySender: senderAccount,
          deeplyNested1: [EXPECTED_VECTOR_U8, EXPECTED_VECTOR_U8, EXPECTED_VECTOR_U8],
          deeplyNested2: [EXPECTED_VECTOR_STRING, EXPECTED_VECTOR_STRING, EXPECTED_VECTOR_STRING],
          deeplyNested3,
          deeplyNested4,
          feePayer: feePayerAccount,
        });
        checkResponse({
          signers: {
            primary: senderAccount,
            feePayer: feePayerAccount,
          },
          builder: baseBuilder,
          response,
        });
      });
    });
    it("tests view_all_arguments, a view function that outputs all the arguments passed in", async () => {
      const viewAllArguments = await new TxArgsModule.ViewAllArguments({
        ...simpleTransactionArguments,
      }).submit({ aptos });
      /* eslint-disable no-console */
      console.log(viewAllArguments);
    });
  });
  // TODO: Fix, currently broken
  it.skip("tests view_complex_outputs, a view function with complex, nested output types", async () => {
    //    const viewComplexOutputs = await new TxArgsModule.ViewComplexOutputs().submit({
    //      aptos,
    //    });
    /*
       // The below does not work. Keeping it for reference.
       type OptionVec<T> = {
         vec: T;
       }
       type ViewComplexArgumentsPayloadMoveArguments = {
         deeply_nested_1: Array<HexInput>;
         deeply_nested_2: Array<Array<ObjectAddressStruct>>;
         deeply_nested_3: Array<OptionVec<Array<ObjectAddressStruct>>>;
         deeply_nested_4: Array<Array<Array<Array<ObjectAddressStruct>>>>;
       };
       const toObjectAddressStruct = (argA: ObjectAddress) => {
         return {
           inner: AccountAddress.from(argA).toString(),
         }
       }
       // in ViewComplexArguments constructor body:
     this.args = {
       deeply_nested_1: deeply_nested_1.map((argA) =>
         Hex.fromHexInput(argA).toString(),
       ),
       deeply_nested_2: deeply_nested_2.map((argA) =>
         argA.map((argB) => toObjectAddressStruct(argB)
       )),
       // deeply_nested_3: [
       //   { vec: [AccountAddress.ZERO], }
       // ],
       deeply_nested_3: deeply_nested_3.map((argA) => {
         return {
           vec: argA[0] ? argA[0].map((argB) => toObjectAddressStruct(argB)) : [],
         }
       }
       ),
       deeply_nested_4: [],
       // TODO: Fix Option output to be `vec: []`, currently it's trying to cast it to an array of one element I think
       // this is specifically for the response outputs
       console.log(JSON.stringify(viewComplexOutputs, null, 3));
       // console.log(viewComplexOutputs);
       const objectArray = [moduleObjects[0], moduleObjects[1], moduleObjects[2]].map(s => s.toString());
       const deeplyNested3 = [[objectArray], [], [objectArray]];
       const deeplyNested4 = [deeplyNested3, deeplyNested3, deeplyNested3];
       const complexArgsResponse = await new TxArgsModule.ViewComplexArguments(
         [EXPECTED_VECTOR_U8, EXPECTED_VECTOR_U8, EXPECTED_VECTOR_U8],
         [objectArray, objectArray, objectArray],
         deeplyNested3,
         deeplyNested4,
       ).submit({
         aptos,
       });
       console.log(JSON.stringify(complexArgsResponse, null, 3));
       */
  });
});
export function checkResponse(args: {
  signers: {
    primary: Account;
    secondary?: Array<Account>;
    feePayer?: Account;
  };
  builder: EntryFunctionTransactionBuilder;
  response: UserTransactionResponse;
}) {
  const { builder, response } = args;
  const { primary, secondary, feePayer } = args.signers;
  const secondarySenders = secondary ?? [];
  const withFeePayer = feePayer !== undefined;
  const multiAgent = secondarySenders.length > 0;
  if (withFeePayer) {
    expect(response.signature!.type).toEqual("fee_payer_signature");
  } else if (!multiAgent) {
    expect(response.signature!.type).toEqual("ed25519_signature");
  } else {
    expect(response.signature!.type).toEqual("multi_agent_signature");
  }
  expect(AccountAddress.from(response.sender).equals(primary.accountAddress)).toEqual(true);
  const payload = response.payload as EntryFunctionPayloadResponse;
  const split = payload.function.split("::");
  // normalize
  const moduleAddress = AccountAddress.from(split[0]);
  const moduleName = split[1];
  const functionName = split[2];
  const fullyQualifiedFunctionCall = `${moduleAddress}::${moduleName}::${functionName}`;
  expect(fullyQualifiedFunctionCall).toEqual(
    `${builder.payloadBuilder.moduleAddress}::${builder.payloadBuilder.moduleName}::${builder.payloadBuilder.functionName}`,
  );
  expect(response.success).toEqual(true);
}
