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
};

export function getCodeGenConfig(configFilePath?: string): ConfigDictionary {
  let loadedConfig: ConfigDictionary = {
    namedAddresses: {},
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
  };
  if (configFilePath !== undefined) {
    if (!fs.existsSync(configFilePath)) {
      throw new Error(`Config file not found at ${configFilePath}`);
    }
    const configFile = fs.readFileSync(configFilePath, "utf-8");
    loadedConfig = yaml.load(configFile) as any;
  }
  const config: ConfigDictionary = loadedConfig;
  const namedAddresses = config.namedAddresses;
  if (namedAddresses !== undefined) {
    Object.keys(namedAddresses).forEach((key) => {
      const address = namedAddresses[key];
      delete namedAddresses[key];
      // normalize the address key
      const normalizedKey = AccountAddress.fromRelaxed(key).toString();
      namedAddresses[normalizedKey] = address;
    });
  }
  config.namedAddresses = namedAddresses;
  return config;
}
