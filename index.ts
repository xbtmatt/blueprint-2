#!/usr/bin/env node

import { lightBlue } from "kolorist";
import { CodeGenerator, getCodeGenConfig } from "./src/index.js";
import { Aptos, AptosConfig, Network, AccountAddress } from "@aptos-labs/ts-sdk";
import { Selections, userInputs } from "./src/workflow.js";

console.log(
    lightBlue(`
                                                                               ./&@@@@@%*                   /%@@@#,
            @@.               #@@@@@@@@@@@@@*   (@@@@@@@@@@@@@@@@@@@@%     *@@@@@@@@@@@@@@@@@           *@@@@/..,@@@@@
           @@@@/              #@@*        /@@@           /@@(            /((((((((((((((*   *((*       ,@@@         %
          @@/ @@&             #@@*         @@@,          /@@(                         (@               .@@@
        ,@@,   &@@            #@@*         @@@           /@@(          @@@@@@@@@@@@@@@@@@@@@@@@@@@      .@@@@&.
       (@@      /@@           #@@#////#%@@@@&            /@@(                                              ,@@@@@@&
      %@@        .@@,         #@@@&&&&&&/                /@@(                    @@,                             &@@@@.
     @@@@@@@@@@@@@@@@#        #@@*                       /@@(          @@@@@@@@@%@@@@@@@@@@@@@@@@&                  @@@%
    @@%             @@@       #@@*                       /@@(                                            ,          .@@@
  .@@&               @@@      #@@*                       /@@(              &@@/                        @@@@        .@@@,
 #@@%                 @@@     #@@*                       /@@(               .@@@@@@@@@@@@@@@             %@@@@@@@@@@@/
`)
);
console.log("Welcome to the Aptos Blueprint wizard 🔮");

async function main() {
    // const selections = await userInputs();
    const selections: Selections = {
        configPath: "./tests/config.yaml",
        additionalModules: [
            AccountAddress.fromRelaxed("0xabcde341afbc4d846a4453bf042dffe74a137c0f0b50c548a87f726f4b1d62ed"),
            AccountAddress.fromRelaxed("0x2cca48b8b0d7f77ef28bfd608883c599680c5b8db8192c5e3baaae1aee45114c"),
        ],
        frameworkModules: [ AccountAddress.ONE, AccountAddress.THREE, AccountAddress.FOUR ], 
        // frameworkModules: [],
        network: Network.LOCAL,
    }
    console.log(selections.configPath);
    const codeGeneratorConfig = getCodeGenConfig(selections.configPath);
    console.log(lightBlue(JSON.stringify(codeGeneratorConfig, null, 3)));
    const codeGenerator = new CodeGenerator(codeGeneratorConfig);
    const aptosConfig = new AptosConfig({ network: selections.network });
    const aptos = new Aptos(aptosConfig);
    await codeGenerator.generateCodeForModules(
        aptos,
        [...selections.frameworkModules, ...selections.additionalModules],
    );
}

main().catch((e) => {
    console.error(e);
});
