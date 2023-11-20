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
            AccountAddress.fromRelaxed("0x0a56e8b03118e51cf88140e5e18d1f764e0a1048c23e7c56bd01bd5b76993451"),
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
