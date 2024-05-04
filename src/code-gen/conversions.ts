import { type TypeTag, TypeTagVector, TypeTagAddress } from "@aptos-labs/ts-sdk";
import { TypeTagEnum } from "src/types";
import { alphabetIndexToLetter } from "src/utils";
import { R_PARENTHESIS } from "./tokens";
import { toTypeTagEnum, toClassString } from "./typeTags";

export const returnTypeMapForView: { [key in TypeTagEnum]: string } = {
  Bool: "boolean",
  U8: "Uint8",
  U16: "Uint16",
  U32: "Uint32",
  U64: "Uint64String",
  U128: "Uint128String",
  U256: "Uint256String",
  AccountAddress: "AccountAddressString",
  String: "string",
  Vector: "Array",
  Option: "Option", // OneOrNone<T>
  Object: "ObjectAddressStruct",
  Signer: "Signer",
  Generic: "InputTypes",
  Struct: "Struct",
};

export const inputTypeMapForView: { [key in TypeTagEnum]: string } = {
  Bool: "boolean",
  U8: "Uint8",
  U16: "Uint16",
  U32: "Uint32",
  U64: "string",
  U128: "string",
  U256: "string",
  AccountAddress: "string",
  String: "string",
  Vector: "Array",
  Option: "Option", // OneOrNone<T>
  Object: "ObjectAddress",
  Signer: "Signer",
  Generic: "InputTypes",
  Struct: "Struct",
};

export const inputTypeMapForEntry: { [key in TypeTagEnum]: string } = {
  Bool: "boolean",
  U8: "Uint8",
  U16: "Uint16",
  U32: "Uint32",
  U64: "Uint64",
  U128: "Uint128",
  U256: "Uint256",
  AccountAddress: "AccountAddressInput",
  String: "string",
  Vector: "Array",
  Option: "Option", // OneOrNone<T>
  Object: "ObjectAddress",
  Signer: "Account",
  Generic: "EntryFunctionArgumentTypes",
  Struct: "Struct",
};

/* eslint no-fallthrough: ["error", { "commentPattern": "fall-through" }] */

export function toInputTypeString(
  typeTags: Array<TypeTag>,
  viewFunction: boolean,
  asClassField = false,
): string {
  const mapping = viewFunction ? inputTypeMapForView : inputTypeMapForEntry;
  const typeTag = typeTags[0];
  let typeTagEnum = toTypeTagEnum(typeTag);
  // if we're generating the class fields for a view function, we'll replace Option with Vector
  if (asClassField && viewFunction && typeTagEnum === TypeTagEnum.Option) {
    typeTagEnum = TypeTagEnum.Vector;
  }
  switch (typeTagEnum) {
    case TypeTagEnum.Vector:
      if (typeTags.length === 2 && typeTags[1].isU8()) {
        return "HexInput";
      }
    // fall-through
    case TypeTagEnum.Option:
      if (viewFunction && !asClassField && typeTags.length === 2 && typeTags[1].isU8()) {
        return "HexInput";
      }
      return [
        mapping[typeTagEnum],
        "<",
        toInputTypeString(typeTags.slice(1), viewFunction, asClassField),
        ">",
      ].join("");
    case TypeTagEnum.Bool:
    case TypeTagEnum.U8:
    case TypeTagEnum.U16:
    case TypeTagEnum.U32:
    case TypeTagEnum.String:
    case TypeTagEnum.Object:
    case TypeTagEnum.U64:
    case TypeTagEnum.U128:
    case TypeTagEnum.U256:
    case TypeTagEnum.AccountAddress:
    case TypeTagEnum.Generic:
    case TypeTagEnum.Signer:
      return mapping[typeTagEnum];
    default:
      throw new Error(`Unexpected TypeTagEnum: ${typeTagEnum}`);
  }
}

export function toViewFunctionReturnTypeString(typeTags: Array<TypeTag>): string {
  const mapping = returnTypeMapForView;
  const typeTag = typeTags[0];
  const typeTagEnum = toTypeTagEnum(typeTag);
  switch (typeTagEnum) {
    case TypeTagEnum.Vector:
      if (typeTags.length === 2 && typeTags[1].isU8()) {
        return "string";
      }
    // fall-through
    case TypeTagEnum.Option:
      return `${mapping[typeTagEnum]}<${toViewFunctionReturnTypeString(typeTags.slice(1))}>`;
    case TypeTagEnum.Bool:
    case TypeTagEnum.U8:
    case TypeTagEnum.U16:
    case TypeTagEnum.U32:
    case TypeTagEnum.String:
    case TypeTagEnum.Object:
    case TypeTagEnum.U64:
    case TypeTagEnum.U128:
    case TypeTagEnum.U256:
    case TypeTagEnum.AccountAddress:
    case TypeTagEnum.Signer:
      return mapping[typeTagEnum];
    case TypeTagEnum.Generic:
    case TypeTagEnum.Struct:
      return "MoveValue";
    default:
      throw new Error(`Unexpected TypeTagEnum: ${typeTagEnum}`);
  }
}

/**
 * The transformer function for converting the constructor input types to the class field types
 * @param typeTags the array of typeTags, aka the class types as strings
 * @returns a string representing the generated typescript code to
 *    convert the constructor input type to the class field type
 */
export function transformEntryFunctionInputTypes(
  fieldName: string,
  typeTags: Array<TypeTag>,
  depth: number,
  replaceOptionWithVector = true,
): string {
  // replace MoveObject with AccountAddress for the constructor input types
  const typeTag =
    typeTags[0].isStruct() && typeTags[0].isObject() ? new TypeTagAddress() : typeTags[0];
  const nameFromDepth = depth === 0 ? `${fieldName}` : `arg${alphabetIndexToLetter(depth)}`;
  const typeTagEnum = toTypeTagEnum(typeTag);
  const rParen = R_PARENTHESIS.repeat(depth);
  switch (typeTagEnum) {
    case TypeTagEnum.Vector:
      // If we're at the innermost type and it's a vector<u8>, we'll use the
      // MoveVector.U8(hex: HexInput) factory method.
      if (typeTags.length === 2 && typeTags[1].isU8()) {
        return `MoveVector.U8(${nameFromDepth})${rParen}`;
      }
    // fall-through
    case TypeTagEnum.Option: {
      // conditionally replace MoveOption with MoveVector for the constructor input types
      let newTypeTag = typeTag;
      let newTypeTagEnum = toTypeTagEnum(typeTag);
      const isOption = typeTag.isStruct() && typeTag.isOption();
      if (isOption) {
        newTypeTag = replaceOptionWithVector
          ? new TypeTagVector(typeTag.value.typeArgs[0])
          : typeTag;
        newTypeTagEnum = toTypeTagEnum(newTypeTag);
      }
      const innerNameFromDepth = `arg${alphabetIndexToLetter(depth + 1)}`;
      // since we're using `Option<T>` as input values, it may be an element of [] or [T]
      // so we need to the value to an Array if it's an option:
      // new MoveVector(Array.from(arg[LETTER]).map(arg[LETTER + 1] => ...)
      const normalizedNameFromDepth = normalizeOptionNameFromDepth(isOption, nameFromDepth);
      return `
        new ${toClassString(newTypeTagEnum)}(${normalizedNameFromDepth}.map(${innerNameFromDepth} =>
        ${transformEntryFunctionInputTypes(innerNameFromDepth, typeTags.slice(1), depth + 1)}
        `;
    }
    case TypeTagEnum.AccountAddress:
      return `${toClassString(typeTagEnum)}.from(${nameFromDepth})${rParen}`;
    case TypeTagEnum.Bool:
    case TypeTagEnum.U8:
    case TypeTagEnum.U16:
    case TypeTagEnum.U32:
    case TypeTagEnum.U64:
    case TypeTagEnum.U128:
    case TypeTagEnum.U256:
    case TypeTagEnum.String:
      return `new ${toClassString(typeTagEnum)}(${nameFromDepth})${rParen}`;
    case TypeTagEnum.Generic:
      return fieldName;
    default:
      throw new Error(`Unknown typeTag: ${typeTag}`);
  }
}

/**
 * The transformer function for converting constructor input types to view function JSON types.
 */
export function transformViewFunctionInputTypes(
  fieldName: string,
  typeTags: Array<TypeTag>,
  depth: number,
): string {
  // replace MoveObject with AccountAddress for the constructor input types
  const typeTag =
    typeTags[0].isStruct() && typeTags[0].isObject() ? new TypeTagAddress() : typeTags[0];
  const nameFromDepth = depth === 0 ? `${fieldName}` : `arg${alphabetIndexToLetter(depth)}`;
  const typeTagEnum = toTypeTagEnum(typeTag);
  const rParen = R_PARENTHESIS.repeat(depth);
  switch (typeTagEnum) {
    case TypeTagEnum.Vector:
    case TypeTagEnum.Option: {
      // If we're at the inner-most type and it's a vector<u8>, we'll convert it to a Uint8Array
      // and then a string.
      if (typeTags.length === 2 && typeTags[1].isU8()) {
        return `Hex.fromHexInput(${nameFromDepth}).toUint8Array()${rParen}`;
      }
      const innerNameFromDepth = `arg${alphabetIndexToLetter(depth + 1)}`;
      return (
        `${nameFromDepth}.map(${innerNameFromDepth} => ` +
        `${transformViewFunctionInputTypes(innerNameFromDepth, typeTags.slice(1), depth + 1)}`
      );
    }
    case TypeTagEnum.AccountAddress:
      return `${toClassString(typeTagEnum)}.from(${nameFromDepth}).toString()${rParen}`;
    case TypeTagEnum.Bool:
    case TypeTagEnum.U8:
    case TypeTagEnum.U16:
    case TypeTagEnum.U32:
    case TypeTagEnum.String:
      return `${nameFromDepth}${rParen}`;
    case TypeTagEnum.U64:
    case TypeTagEnum.U128:
    case TypeTagEnum.U256:
      return `BigInt(${nameFromDepth}).toString()${rParen}`;
    case TypeTagEnum.Generic:
      return inputTypeMapForView[typeTagEnum];
    default:
      throw new Error(`Unknown typeTag: ${typeTag}`);
  }
}

export function normalizeOptionNameFromDepth(isOption: boolean, nameFromDepth: string): string {
  return isOption ? `Array.from(${nameFromDepth})` : nameFromDepth;
}
