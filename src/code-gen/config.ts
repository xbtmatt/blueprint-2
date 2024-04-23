// Copyright © Aptos Foundation
// SPDX-License-Identifier: Apache-2.0

import { AccountAddress } from "@aptos-labs/ts-sdk";
import fs from "fs";
import yaml from "js-yaml";

export type NamedAddress = string;
export type AddressName = string;

export type Dictionary<T> = {
  [key: string]: T;
};

export type Config = Record<string, any>;

export type ConfigDictionary = {
  namedAddresses: Record<string, string>;
  namedTypeTags: Record<string, string>;
  structArgs: boolean;
  outputPath: string;
  functionComments: boolean;
  expandedStructs: boolean; // 0x1::string::String vs String, 0x1::option::Option vs Option, etc
  replaceNamedAddresses: boolean; // replace named addresses with their address values in types, e.g. Object<0xbeefcafe::some_resource::Resource> => Object<my_address::some_resource::Resource>
  entryFunctionsNamespace: string;
  viewFunctionsNamespace: string;
  separateViewAndEntryFunctionsByNamespace: boolean;
  sdkPath: string;
  sourceCodePath: Record<string, string>;
};

export function getCodeGenConfig(configFilePath?: string): ConfigDictionary {
  let loadedConfig: ConfigDictionary = {
    namedAddresses: {
      "0x1": "aptos_framework",
      "0x3": "aptos_token",
      "0x4": "aptos_token_objects",
    },
    namedTypeTags: {},
    structArgs: false,
    outputPath: "./generated/",
    functionComments: true,
    expandedStructs: false,
    replaceNamedAddresses: true,
    entryFunctionsNamespace: "EntryFuncs",
    viewFunctionsNamespace: "ViewFuncs",
    separateViewAndEntryFunctionsByNamespace: true,
    sdkPath: "@aptos-labs/ts-sdk",
    sourceCodePath: {},
  };
  if (configFilePath !== undefined && configFilePath.length > 0) {
    if (!fs.existsSync(configFilePath)) {
      throw new Error(`Config file not found at ${configFilePath}`);
    }
    const configFile = fs.readFileSync(configFilePath, "utf-8");
    loadedConfig = yaml.load(configFile) as any;
  }
  const config: ConfigDictionary = loadedConfig;
  const namedAddresses = config.namedAddresses;
  const sourceCodePath = config.sourceCodePath;
  if (namedAddresses !== undefined) {
    Object.keys(namedAddresses).forEach((key) => {
      const address = namedAddresses[key];
      delete namedAddresses[key];
      // normalize the address key
      const normalizedKey = AccountAddress.from(key).toString();
      namedAddresses[normalizedKey] = address;
    });
  }
  if (sourceCodePath !== undefined) {
    Object.keys(sourceCodePath).forEach((key) => {
      const address = sourceCodePath[key];
      delete sourceCodePath[key];
      // normalize the address key
      const normalizedKey = AccountAddress.from(key).toString();
      sourceCodePath[normalizedKey] = address;
    });
  }
  config.namedAddresses = namedAddresses;
  config.sourceCodePath = sourceCodePath;
  return config;
}
