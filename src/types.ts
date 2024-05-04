import {
  AccountAddress,
  type AccountAddressInput,
  type MoveFunction,
  type MoveFunctionGenericTypeParam,
  type Uint128,
  type Uint16,
  type Uint256,
  type Uint32,
  type Uint64,
  type Uint8,
  Bool,
  MoveOption,
  MoveString,
  MoveVector,
  U128,
  U16,
  U256,
  U32,
  U64,
  U8,
  AccountAuthenticator,
  type TypeTag,
  TypeTagStruct,
} from "@aptos-labs/ts-sdk";

// If you change the "SimpleMapToKind" list of keys you need to change this name here.
export type Option<T> = [T] | [];

export type AbiFunctions = {
  moduleAddress: AccountAddress;
  moduleName: string;
  publicEntryFunctions: Array<MoveFunctionWithArgumentNamesAndGenericTypes>;
  privateEntryFunctions: Array<MoveFunctionWithArgumentNamesAndGenericTypes>;
  viewFunctions: Array<MoveFunctionWithArgumentNamesAndGenericTypes>;
};

export type ArgumentNamesWithTypesAndGenericTypes = {
  genericTypes: string | null;
  argumentNamesWithTypes: Array<ArgumentNamesWithTypes>;
};

export type ArgumentNamesWithTypes = {
  argName: string;
  typeTag: string;
};

export type ModuleFunctionArgNameMap = Record<
  string,
  Record<string, ArgumentNamesWithTypesAndGenericTypes>
>;

/* eslint-disable @typescript-eslint/no-shadow */
export enum TypeTagEnum {
  Bool = "Bool",
  U8 = "U8",
  U16 = "U16",
  U32 = "U32",
  U64 = "U64",
  U128 = "U128",
  U256 = "U256",
  AccountAddress = "AccountAddress",
  String = "String",
  Vector = "Vector",
  Option = "Option",
  Object = "Object",
  Struct = "Struct",
  Signer = "Signer",
  Generic = "Generic",
}
/* eslint-enable @typescript-eslint/no-shadow */

export type GenericTypeName =
  `T${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | ""}`;

export type ObjectAddress = AccountAddressInput;
export type InputTypes =
  | boolean
  | Uint8
  | Uint16
  | Uint32
  | Uint64
  | Uint128
  | Uint256
  | AccountAddressInput
  | string
  | ObjectAddress
  | Array<InputTypes>;
export type TypeTagInput = string | TypeTag;

export type MoveFunctionWithArgumentNamesAndGenericTypes = MoveFunction & {
  genericTypes: string | null;
  argNames: Array<string>;
};

export type ModuleMetadata = {
  name: string;
  source: string;
};

export type PackageMetadata = {
  name: string;
  modules: ModuleMetadata[];
};

export type PackageSourceCode = {
  name: string;
  source: string;
};

/**
 * Tracks information about the entry function argument
 *
 * @typeTagArray - a flattened array of each type argument, flattened inwards
 *   e.g. MoveOption<MoveVector<u64>>> would be [MoveOption, MoveVector, U64]
 *
 * @kindString - the string representation of the kind, aka its type
 *
 * @annotation - the original Move argument TypeTag string
 */
export type AnnotatedBCSArgument = {
  typeTagArray: Array<TypeTag>;
  classString: string;
  annotation: string;
};

export type EntryFunctionArgumentSignature = {
  signerArguments: Array<AnnotatedBCSArgument>;
  functionArguments: Array<AnnotatedBCSArgument>;
  genericsWithAbilities: Array<string>;
};

export const BCSClassesTypes = {
  Bool,
  U8,
  U16,
  U32,
  U64,
  U128,
  U256,
  AccountAddress,
  MoveString,
  MoveVector,
  MoveOption,
  TypeTagStruct,
  AccountAuthenticator,
};

export type ABIGeneratedCode = {
  address: string;
  name: string;
  code: string;
};

export type ABIGeneratedCodeMap = Record<string, ABIGeneratedCode>;

export type MoveObject = AccountAddress;

export type CodeGeneratorOptions = {
  moduleAddress: AccountAddress;
  moduleName: string;
  functionName: string;
  className: string;
  functionArgumentTypeTags: Array<TypeTag>;
  genericTypeTags: string | null; // as a string, not parsed yet
  genericTypeParams: Array<MoveFunctionGenericTypeParam>;
  viewFunction: boolean;
  returnValue: Array<string>;
  suppliedFieldNames?: Array<string>;
  visibility: "public" | "private";
  documentation?: {
    displayFunctionSignature?: boolean;
    fullStructNames?: boolean;
  };
  structArgs: boolean;
  passInModuleAddress: boolean;
};
