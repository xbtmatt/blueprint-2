import { red } from "kolorist";
import prompts, { PromptObject } from "prompts";
import { Network, AccountAddress } from "@aptos-labs/ts-sdk";
import fs from "fs";
import { getCodeGenConfig } from "./code-gen/config.js";

export type Selections = {
  configPath: string;
  namedModules: Array<AccountAddress>;
  additionalModules: Array<AccountAddress>;
  network: Network;
};

export function validateAndSetConfigPath(configPath: string) {
  if (configPath === "") {
    return true;
  }
  const exists = fs.existsSync(configPath);
  const isYaml = configPath.endsWith(".yaml");
  if (exists && isYaml) {
    return true;
  }
  const doesntExistMessage = exists ? "" : "File does not exist. ";
  const isYamlMessage = isYaml
    ? ""
    : `${doesntExistMessage.length > 0 ? "and " : ""}${configPath} is not a yaml file. `;
  return `Please enter a valid config.yaml file path. ${doesntExistMessage} ${isYamlMessage}`;
}

export function validateAddresses(value: string) {
  if (value === "") {
    return true;
  }
  const addresses = value.split(",");
  const valid = addresses.every((address) => {
    try {
      AccountAddress.fromStringRelaxed(address);
      return true;
    } catch (err) {
      return false;
    }
  });
  if (valid) {
    return true;
  }
  return "Please enter a valid comma separated list of addresses";
}

export function validateNetwork(value: string) {
  const valid = Object.values(Network).includes(value as Network);
  if (valid) {
    return true;
  }
  return "Please enter a valid network";
}

export function generateChoices(configPath: string) {
  const namedAddresses = getCodeGenConfig(configPath).namedAddresses;
  const choices = Object.entries(namedAddresses).map(([address, name]) => {
    const value = AccountAddress.fromRelaxed(address);
    return {
      title: name as string,
      value: value,
      description: value.toString(),
    };
  });
  return choices;
}

export async function userInputs() {
  let result: prompts.Answers<"configPath" | "namedModules" | "additionalModules" | "network">;

  try {
    result = await prompts(
      [
        {
          type: "text",
          name: "configPath",
          message: "config.yaml path (leave empty for defaults):",
          initial: "config.yaml",
          validate: (value: string) => validateAndSetConfigPath(value),
          hint: "asdf",
        },
        {
          type: "multiselect",
          name: "namedModules",
          message: "Addresses from config.yaml",
          choices: (prev) => generateChoices(prev),
        },
        {
          type: "text",
          name: "additionalModules",
          message: "What additional modules would you like to generate code for?",
          initial: "",
          separator: ",",
          hint: "- Comma separated list. Press enter to submit",
          validate: (value: string) => validateAddresses(value),
        },
        {
          type: "text",
          name: "network",
          message: "What network do you want to get the module ABIs from?",
          initial: "devnet",
          validate: (value: string) => validateNetwork(value),
        },
      ],
      {
        onCancel: () => {
          throw new Error(red("✖") + " Operation cancelled");
        },
      },
    );
  } catch (err: any) {
    console.log(err.message);
    process.exit(0);
  }

  const { configPath, namedModules, additionalModules, network } = result;
  return {
    configPath,
    namedModules,
    additionalModules,
    network,
  } as Selections;
}
